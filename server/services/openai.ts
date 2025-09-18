import OpenAI from "openai";

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
