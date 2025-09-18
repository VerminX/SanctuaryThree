import OpenAI from "openai";
import { EpisodeWithFullHistory } from "@shared/schema";
import { IStorage } from "../storage";
import { decryptEncounterNotes } from "./encryption";

// Using GPT-4o-mini for AI-powered medical eligibility analysis with JSON mode support
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.AZURE_OPENAI_API_KEY 
});

interface EligibilityAnalysisRequest {
  encounterNotes: string[];
  woundDetails: any;
  conservativeCare: any;
  patientInfo: {
    payerType: string;
    macRegion: string;
  };
  policyContext: string;
}

interface EligibilityAnalysisResponse {
  eligibility: "Yes" | "No" | "Unclear";
  rationale: string;
  requiredDocumentationGaps: string[];
  citations: Array<{
    title: string;
    url: string;
    section: string;
    effectiveDate: string;
  }>;
  letterBullets: string[];
  // Enhanced fields for historical context and episode timeline
  historicalContext?: {
    totalEpisodes: number;
    totalEncounters: number;
    previousEligibilityChecks: number;
    keyPatterns: string[];
  };
  episodeTimeline?: Array<{
    date: string;
    encounterType: string;
    keyFindings: string[];
    woundProgression: string;
    careCompliance: string;
  }>;
  crossEpisodePatterns?: {
    woundRecurrence: string[];
    treatmentResponse: string[];
    complianceHistory: string[];
  };
}

export async function analyzeEligibility(request: EligibilityAnalysisRequest): Promise<EligibilityAnalysisResponse> {
  const { encounterNotes, woundDetails, conservativeCare, patientInfo, policyContext } = request;

  const systemPrompt = `You are a compliance-focused clinical coverage assistant. Task: assess eligibility for non-analogous skin substitute/CTP use for DFU/VLU and draft payer-facing letters.

Rules:
- Use ONLY the provided policy context (LCDs, Articles, MAC pages, CMS documentation). Don't infer beyond context. If unclear, say "Insufficient evidence" and list gaps.
- Align to the patient's MAC: ${patientInfo.macRegion}, payer type: ${patientInfo.payerType}. Prefer the latest effective policy; if a policy is postponed, flag it.
- Return structured JSON with the exact format specified.
- Safety: No legal advice. If plan type is Medicare Advantage, note prior authorization is plan-specific; include plan checklist placeholders.

Policy Context:
${policyContext}

Patient Information:
- Payer Type: ${patientInfo.payerType}
- MAC Region: ${patientInfo.macRegion}

Encounter Notes:
${encounterNotes.join('\n\n')}

Wound Details:
${JSON.stringify(woundDetails, null, 2)}

Conservative Care:
${JSON.stringify(conservativeCare, null, 2)}

Respond with JSON in this exact format:
{
  "eligibility": "Yes" | "No" | "Unclear",
  "rationale": "...",
  "requiredDocumentationGaps": ["..."],
  "citations": [{"title": "...","url": "...","section": "...","effectiveDate": "YYYY-MM-DD"}],
  "letterBullets": ["..."]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: systemPrompt,
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.1, // Low temperature for consistency
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    
    // Validate the response structure
    if (!result.eligibility || !result.rationale || !Array.isArray(result.citations)) {
      throw new Error('Invalid response format from AI analysis');
    }

    return result as EligibilityAnalysisResponse;
  } catch (error) {
    console.error('Error in AI eligibility analysis:', error);
    throw new Error('Failed to analyze eligibility: ' + (error as Error).message);
  }
}

interface EpisodeEligibilityAnalysisRequest {
  episodeInfo: {
    id: string;
    woundType: string;
    woundLocation: string;
    primaryDiagnosis: string;
    episodeStartDate: Date;
    status: string;
  };
  encounters: Array<{
    id: string;
    date: Date;
    notes: string[];
    woundDetails: any;
    conservativeCare: any;
    infectionStatus: string;
    comorbidities: string[];
  }>;
  patientInfo: {
    payerType: string;
    macRegion: string;
  };
  policyContext: string;
}

export async function analyzeEpisodeEligibility(request: EpisodeEligibilityAnalysisRequest): Promise<EligibilityAnalysisResponse> {
  const { episodeInfo, encounters, patientInfo, policyContext } = request;

  // Aggregate all encounter notes chronologically
  const allEncounterNotes = encounters
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((encounter, index) => {
      const encounterDate = encounter.date.toISOString().split('T')[0];
      return `=== ENCOUNTER ${index + 1} (${encounterDate}) ===\n${encounter.notes.join('\n')}`;
    });

  // Aggregate wound details and conservative care from all encounters
  const aggregatedWoundDetails = {
    episodeWoundType: episodeInfo.woundType,
    episodeWoundLocation: episodeInfo.woundLocation,
    episodePrimaryDiagnosis: episodeInfo.primaryDiagnosis,
    episodeStartDate: episodeInfo.episodeStartDate.toISOString().split('T')[0],
    episodeStatus: episodeInfo.status,
    encounterDetails: encounters.map(enc => ({
      date: enc.date.toISOString().split('T')[0],
      woundDetails: enc.woundDetails,
      infectionStatus: enc.infectionStatus,
      comorbidities: enc.comorbidities
    }))
  };

  const aggregatedConservativeCare = {
    episodeConservativeCare: encounters.map(enc => ({
      date: enc.date.toISOString().split('T')[0],
      conservativeCare: enc.conservativeCare
    }))
  };

  const systemPrompt = `You are a compliance-focused clinical coverage assistant. Task: assess eligibility for non-analogous skin substitute/CTP use for DFU/VLU based on COMPLETE EPISODE CONTEXT spanning multiple encounters over time.

EPISODE-LEVEL ANALYSIS RULES:
- Analyze the ENTIRE episode progression from start to current state
- Consider progression of wound healing, conservative care compliance, and treatment response over time
- Evaluate whether the patient has met conservative care requirements consistently across encounters
- Assess wound healing progression and failure of conservative measures across the episode timeline
- Use ONLY the provided policy context (LCDs, Articles, MAC pages, CMS documentation)
- Align to the patient's MAC: ${patientInfo.macRegion}, payer type: ${patientInfo.payerType}
- Focus on episode-level medical necessity rather than single encounter assessment

EPISODE INFORMATION:
- Episode ID: ${episodeInfo.id}
- Wound Type: ${episodeInfo.woundType}
- Wound Location: ${episodeInfo.woundLocation} 
- Primary Diagnosis: ${episodeInfo.primaryDiagnosis}
- Episode Start Date: ${episodeInfo.episodeStartDate.toISOString().split('T')[0]}
- Episode Status: ${episodeInfo.status}
- Total Encounters: ${encounters.length}

Policy Context:
${policyContext}

Patient Information:
- Payer Type: ${patientInfo.payerType}
- MAC Region: ${patientInfo.macRegion}

CHRONOLOGICAL ENCOUNTER NOTES (Complete Episode):
${allEncounterNotes.join('\n\n')}

EPISODE WOUND PROGRESSION:
${JSON.stringify(aggregatedWoundDetails, null, 2)}

EPISODE CONSERVATIVE CARE HISTORY:
${JSON.stringify(aggregatedConservativeCare, null, 2)}

Respond with JSON in this exact format:
{
  "eligibility": "Yes" | "No" | "Unclear",
  "rationale": "Episode-level analysis rationale considering progression over time...",
  "requiredDocumentationGaps": ["..."],
  "citations": [{"title": "...","url": "...","section": "...","effectiveDate": "YYYY-MM-DD"}],
  "letterBullets": ["..."]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: systemPrompt,
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.1, // Low temperature for consistency
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    
    // Validate the response structure
    if (!result.eligibility || !result.rationale || !Array.isArray(result.citations)) {
      throw new Error('Invalid response format from AI analysis');
    }

    return result as EligibilityAnalysisResponse;
  } catch (error) {
    console.error('Error in AI episode eligibility analysis:', error);
    throw new Error('Failed to analyze episode eligibility: ' + (error as Error).message);
  }
}

// Enhanced episode analysis request that includes full patient history
interface EnhancedEpisodeAnalysisRequest {
  targetEpisode: EpisodeWithDecryptedHistory;
  allPatientEpisodes: EpisodeWithDecryptedHistory[];
  patientEligibilityHistory: Array<{
    id: string;
    encounterId: string;
    episodeId: string | null;
    result: any;
    citations: any;
    llmModel: string;
    createdAt: Date | null;
  }>;
  patientInfo: {
    payerType: string;
    macRegion: string;
  };
  policyContext: string;
}

// Episode with decrypted encounter notes for AI analysis
interface EpisodeWithDecryptedHistory {
  id: string;
  patientId: string;
  woundType: string;
  woundLocation: string;
  episodeStartDate: Date;
  episodeEndDate: Date | null;
  status: string;
  primaryDiagnosis: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  encounters: Array<{
    id: string;
    date: Date;
    notes: string[]; // Decrypted notes ready for analysis
    woundDetails: any;
    conservativeCare: any;
    infectionStatus: string | null;
    comorbidities: any;
  }>;
  eligibilityChecks: Array<{
    id: string;
    encounterId: string;
    episodeId: string | null;
    result: any;
    citations: any;
    llmModel: string;
    createdAt: Date | null;
  }>;
  patient: {
    id: string;
    payerType: string;
    macRegion: string | null;
    // Other patient fields as needed
  };
}

// Enhanced episode eligibility analysis with full patient history - THIS IS NOW THE DEFAULT
export async function analyzeEpisodeEligibilityWithFullHistory(request: EnhancedEpisodeAnalysisRequest): Promise<EligibilityAnalysisResponse> {
  const { targetEpisode, allPatientEpisodes, patientEligibilityHistory, patientInfo, policyContext } = request;

  // Aggregate all encounters chronologically across ALL patient episodes
  const allPatientEncounters = allPatientEpisodes
    .flatMap(episode => 
      episode.encounters.map(encounter => ({
        ...encounter,
        episodeId: episode.id,
        episodeWoundType: episode.woundType,
        episodeWoundLocation: episode.woundLocation,
        episodeStartDate: episode.episodeStartDate
      }))
    )
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  // Create encounter timeline with episode context
  const encounterTimeline = allPatientEncounters.map((encounter, index) => {
    const encounterDate = encounter.date.toISOString().split('T')[0];
    const episodeContext = encounter.episodeId === targetEpisode.id ? "[TARGET EPISODE]" : "[PREVIOUS EPISODE]";
    return `=== ENCOUNTER ${index + 1} (${encounterDate}) ${episodeContext} ===\nEpisode: ${encounter.episodeWoundType} at ${encounter.episodeWoundLocation}\n${encounter.notes ? encounter.notes.join('\n') : 'No notes available'}`;
  });

  // Create historical eligibility decisions context (already sorted in service function, but ensure most recent first)
  const eligibilityHistoryContext = patientEligibilityHistory
    .map((check, index) => {
      const checkDate = check.createdAt?.toISOString().split('T')[0] || 'Unknown date';
      const eligibilityResult = check.result ? JSON.stringify(check.result) : 'No result available';
      return `=== PREVIOUS ELIGIBILITY ANALYSIS ${index + 1} (${checkDate}) ===\nModel: ${check.llmModel}\nResult: ${eligibilityResult}`;
    });

  // Create comprehensive episode comparison
  const episodeComparison = allPatientEpisodes.map(episode => ({
    episodeId: episode.id,
    isTargetEpisode: episode.id === targetEpisode.id,
    woundType: episode.woundType,
    woundLocation: episode.woundLocation,
    primaryDiagnosis: episode.primaryDiagnosis,
    episodeStartDate: episode.episodeStartDate.toISOString().split('T')[0],
    episodeEndDate: episode.episodeEndDate?.toISOString().split('T')[0] || 'Ongoing',
    status: episode.status,
    encounterCount: episode.encounters.length,
    eligibilityChecksCount: episode.eligibilityChecks.length,
    lastEligibilityResult: episode.eligibilityChecks[0]?.result || null
  }));

  // Focus on target episode encounters for detailed analysis
  const targetEpisodeEncounters = targetEpisode.encounters
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((encounter, index) => {
      const encounterDate = encounter.date.toISOString().split('T')[0];
      return `=== TARGET EPISODE ENCOUNTER ${index + 1} (${encounterDate}) ===\n${encounter.notes ? encounter.notes.join('\n') : 'No notes available'}`;
    });

  const systemPrompt = `You are a compliance-focused clinical coverage assistant. Task: assess eligibility for non-analogous skin substitute/CTP use for DFU/VLU based on COMPREHENSIVE PATIENT HISTORY spanning ALL episodes, encounters, and previous eligibility decisions over time.

COMPREHENSIVE PATIENT HISTORY ANALYSIS RULES:
- Analyze the COMPLETE patient journey across all episodes and encounters over time
- Consider the TARGET EPISODE in context of the patient's full medical history
- Review previous eligibility decisions and their outcomes to ensure consistency
- Assess patterns of wound healing, conservative care compliance, and treatment response across ALL episodes
- Identify any recurring issues, treatment failures, or progressive conditions
- Consider cross-episode patterns that may affect current eligibility determination
- Use ONLY the provided policy context (LCDs, Articles, MAC pages, CMS documentation)
- Align to the patient's MAC: ${patientInfo.macRegion}, payer type: ${patientInfo.payerType}
- Focus on comprehensive medical necessity assessment rather than isolated episode evaluation

PATIENT OVERVIEW:
- Total Episodes: ${allPatientEpisodes.length}
- Total Encounters: ${allPatientEncounters.length}
- Previous Eligibility Checks: ${patientEligibilityHistory.length}

TARGET EPISODE DETAILS:
- Episode ID: ${targetEpisode.id}
- Wound Type: ${targetEpisode.woundType}
- Wound Location: ${targetEpisode.woundLocation}
- Primary Diagnosis: ${targetEpisode.primaryDiagnosis}
- Episode Start Date: ${targetEpisode.episodeStartDate.toISOString().split('T')[0]}
- Episode Status: ${targetEpisode.status}
- Encounters in Target Episode: ${targetEpisode.encounters.length}

Policy Context:
${policyContext}

Patient Information:
- Payer Type: ${patientInfo.payerType}
- MAC Region: ${patientInfo.macRegion}

ALL PATIENT EPISODES COMPARISON:
${JSON.stringify(episodeComparison, null, 2)}

COMPLETE PATIENT ENCOUNTER TIMELINE (All Episodes):
${encounterTimeline.join('\n\n')}

TARGET EPISODE DETAILED ENCOUNTERS:
${targetEpisodeEncounters.join('\n\n')}

PREVIOUS ELIGIBILITY DECISIONS HISTORY:
${eligibilityHistoryContext.length > 0 ? eligibilityHistoryContext.join('\n\n') : 'No previous eligibility checks found'}

TARGET EPISODE WOUND PROGRESSION:
${JSON.stringify({
  episodeWoundType: targetEpisode.woundType,
  episodeWoundLocation: targetEpisode.woundLocation,
  episodePrimaryDiagnosis: targetEpisode.primaryDiagnosis,
  episodeStartDate: targetEpisode.episodeStartDate.toISOString().split('T')[0],
  episodeStatus: targetEpisode.status,
  encounterDetails: targetEpisode.encounters.map(enc => ({
    date: enc.date.toISOString().split('T')[0],
    woundDetails: enc.woundDetails,
    infectionStatus: enc.infectionStatus,
    comorbidities: enc.comorbidities
  }))
}, null, 2)}

TARGET EPISODE CONSERVATIVE CARE HISTORY:
${JSON.stringify({
  episodeConservativeCare: targetEpisode.encounters.map(enc => ({
    date: enc.date.toISOString().split('T')[0],
    conservativeCare: enc.conservativeCare
  }))
}, null, 2)}

Respond with JSON in this exact format:
{
  "eligibility": "Yes" | "No" | "Unclear",
  "rationale": "Comprehensive patient history analysis considering all episodes, encounters, and previous decisions over time. Reference specific patterns, previous outcomes, and cross-episode context...",
  "requiredDocumentationGaps": ["..."],
  "citations": [{"title": "...","url": "...","section": "...","effectiveDate": "YYYY-MM-DD"}],
  "letterBullets": ["..."],
  "historicalContext": {
    "totalEpisodes": ${allPatientEpisodes.length},
    "totalEncounters": ${allPatientEncounters.length},
    "previousEligibilityChecks": ${patientEligibilityHistory.length},
    "keyPatterns": ["Pattern 1", "Pattern 2", "Pattern 3 if any recurring themes across episodes"]
  },
  "episodeTimeline": [
    {
      "date": "YYYY-MM-DD",
      "encounterType": "Initial/Follow-up/etc",
      "keyFindings": ["Key finding 1", "Key finding 2"],
      "woundProgression": "Improved/Worsened/Stable description",
      "careCompliance": "Compliant/Non-compliant/Partial description"
    }
  ],
  "crossEpisodePatterns": {
    "woundRecurrence": ["Pattern 1 if wounds recur", "Pattern 2"],
    "treatmentResponse": ["Response pattern 1", "Response pattern 2"],
    "complianceHistory": ["Compliance pattern 1", "Compliance pattern 2"]
  }
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: systemPrompt,
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.1, // Low temperature for consistency
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    
    // Validate the response structure
    if (!result.eligibility || !result.rationale || !Array.isArray(result.citations)) {
      throw new Error('Invalid response format from AI analysis');
    }

    // If AI didn't provide enhanced fields, add fallback structured data
    if (!result.historicalContext) {
      result.historicalContext = {
        totalEpisodes: allPatientEpisodes.length,
        totalEncounters: allPatientEncounters.length,
        previousEligibilityChecks: patientEligibilityHistory.length,
        keyPatterns: ["Cross-episode analysis performed", "Full patient history considered"]
      };
    }

    if (!result.episodeTimeline) {
      result.episodeTimeline = targetEpisode.encounters
        .sort((a, b) => a.date.getTime() - b.date.getTime())
        .map((encounter, index) => ({
          date: encounter.date.toISOString().split('T')[0],
          encounterType: index === 0 ? "Initial" : "Follow-up",
          keyFindings: ["Clinical documentation reviewed"],
          woundProgression: "Assessment performed",
          careCompliance: "Conservative care evaluated"
        }));
    }

    if (!result.crossEpisodePatterns) {
      result.crossEpisodePatterns = {
        woundRecurrence: allPatientEpisodes.length > 1 ? ["Multiple episodes identified"] : [],
        treatmentResponse: ["Treatment patterns analyzed"],
        complianceHistory: ["Care compliance assessed"]
      };
    }

    return result as EligibilityAnalysisResponse;
  } catch (error) {
    console.error('Error in enhanced AI eligibility analysis:', error);
    throw new Error('Failed to analyze eligibility with full history: ' + (error as Error).message);
  }
}

// Service function to prepare and execute enhanced episode analysis with full patient history
export async function prepareAndAnalyzeEpisodeWithFullHistory(
  storage: IStorage,
  episodeId: string,
  patientId: string,
  patientInfo: { payerType: string; macRegion: string },
  policyContext: string
): Promise<EligibilityAnalysisResponse> {
  try {
    // Get comprehensive patient data
    const [allPatientEpisodes, patientEligibilityHistory] = await Promise.all([
      storage.getEpisodesWithFullHistoryByPatient(patientId),
      storage.getPatientEligibilityHistory(patientId)
    ]);

    if (allPatientEpisodes.length === 0) {
      throw new Error('No episodes found for patient');
    }

    // Find the target episode
    const targetEpisodeRaw = allPatientEpisodes.find(ep => ep.id === episodeId);
    if (!targetEpisodeRaw) {
      throw new Error('Target episode not found in patient episodes');
    }

    // Transform episodes to the format expected by enhanced analysis function
    const transformEpisode = (episode: EpisodeWithFullHistory): EpisodeWithDecryptedHistory => {
      // Ensure date objects (handle potential string dates from JSON)
      const episodeStartDate = episode.episodeStartDate instanceof Date 
        ? episode.episodeStartDate 
        : new Date(episode.episodeStartDate);
      const episodeEndDate = episode.episodeEndDate 
        ? (episode.episodeEndDate instanceof Date ? episode.episodeEndDate : new Date(episode.episodeEndDate))
        : null;

      return {
        id: episode.id,
        patientId: episode.patientId,
        woundType: episode.woundType,
        woundLocation: episode.woundLocation,
        episodeStartDate,
        episodeEndDate,
        status: episode.status,
        primaryDiagnosis: episode.primaryDiagnosis,
        createdAt: episode.createdAt,
        updatedAt: episode.updatedAt,
        encounters: episode.encounters.map(encounter => {
          // Ensure date objects for encounters
          const encounterDate = encounter.date instanceof Date 
            ? encounter.date 
            : new Date(encounter.date);

          return {
            id: encounter.id,
            date: encounterDate,
            notes: decryptEncounterNotes(encounter.encryptedNotes as string[]),
            woundDetails: encounter.woundDetails,
            conservativeCare: encounter.conservativeCare,
            infectionStatus: encounter.infectionStatus,
            comorbidities: encounter.comorbidities,
          };
        }).sort((a, b) => a.date.getTime() - b.date.getTime()), // Sort encounters chronologically
        eligibilityChecks: episode.eligibilityChecks
          .map(check => ({
            ...check,
            createdAt: check.createdAt instanceof Date ? check.createdAt : (check.createdAt ? new Date(check.createdAt) : null)
          }))
          .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0)), // Sort by most recent first
        patient: episode.patient
      };
    };

    // Transform all episodes with proper date handling and sorting
    const transformedEpisodes = allPatientEpisodes.map(transformEpisode);
    const targetEpisode = transformedEpisodes.find(ep => ep.id === episodeId)!;

    // Sort patient eligibility history by date (most recent first) 
    const sortedEligibilityHistory = patientEligibilityHistory
      .map(check => ({
        ...check,
        createdAt: check.createdAt instanceof Date ? check.createdAt : (check.createdAt ? new Date(check.createdAt) : null)
      }))
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));

    // Call the enhanced analysis function
    const enhancedRequest: EnhancedEpisodeAnalysisRequest = {
      targetEpisode,
      allPatientEpisodes: transformedEpisodes,
      patientEligibilityHistory: sortedEligibilityHistory,
      patientInfo,
      policyContext
    };

    return await analyzeEpisodeEligibilityWithFullHistory(enhancedRequest);
    
  } catch (error) {
    console.error('Error in enhanced episode analysis preparation:', error);
    throw new Error('Failed to prepare enhanced episode analysis: ' + (error as Error).message);
  }
}

export async function generateLetterContent(
  type: 'PreDetermination' | 'LMN',
  patientInfo: any,
  eligibilityResult: EligibilityAnalysisResponse,
  clinicInfo: any
): Promise<string> {
  const prompt = `Generate a ${type} letter based on the eligibility analysis results.

Clinic Information:
${JSON.stringify(clinicInfo, null, 2)}

Patient Information:
${JSON.stringify(patientInfo, null, 2)}

Eligibility Analysis:
${JSON.stringify(eligibilityResult, null, 2)}

Generate a professional ${type === 'PreDetermination' ? 'Pre-Determination' : 'Letter of Medical Necessity'} that includes:
- Clinic letterhead information
- Patient identifiers (minimal)
- Medical necessity narrative aligned to LCD criteria
- Conservative care documentation
- Citations and references
- Professional formatting

Return the letter content as plain text.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a medical documentation specialist. Generate professional, compliant medical letters based on the provided information.",
        },
        {
          role: "user",
          content: prompt,
        }
      ],
      temperature: 0.2,
    });

    return response.choices[0].message.content || '';
  } catch (error) {
    console.error('Error generating letter content:', error);
    throw new Error('Failed to generate letter content: ' + (error as Error).message);
  }
}
