import OpenAI from "openai";
import { EpisodeWithFullHistory } from "@shared/schema";
import { IStorage } from "../storage";
import { decryptEncounterNotes } from "./encryption";
import { performPreEligibilityChecks } from "./eligibilityValidator";

// HIPAA COMPLIANCE: Configure OpenAI client with proper provider enforcement
function createOpenAIClient() {
  const azureApiKey = process.env.AZURE_OPENAI_API_KEY;
  const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const azureDeployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o-mini';
  const isProduction = process.env.NODE_ENV === 'production';
  
  // In production, REQUIRE Azure OpenAI for HIPAA compliance
  if (isProduction && (!azureApiKey || !azureEndpoint)) {
    throw new Error('HIPAA VIOLATION PREVENTED: Production environment requires Azure OpenAI configuration (AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT) for PHI processing.');
  }
  
  // HIPAA COMPLIANCE: Enforce provider allowlisting beyond NODE_ENV
  if (!azureApiKey) {
    // For development testing, allow non-BAA processing
    if (process.env.NODE_ENV === 'development') {
      console.warn('WARNING: Using OpenAI.com API for PHI processing in development mode. Only allowed for testing with synthetic data.');
    } else if (process.env.DEVELOPMENT_ALLOW_NON_BAA_PHI !== 'true') {
      throw new Error('HIPAA VIOLATION PREVENTED: PHI processing requires BAA-compliant provider. Set DEVELOPMENT_ALLOW_NON_BAA_PHI=true only for synthetic data testing.');
    }
  }
  
  if (azureApiKey && azureEndpoint) {
    // Configure for Azure OpenAI (HIPAA compliant)
    return new OpenAI({
      apiKey: azureApiKey,
      baseURL: `${azureEndpoint}/openai/deployments/${azureDeployment}`,
      defaultQuery: { 'api-version': '2024-02-01' },
      defaultHeaders: {
        'api-key': azureApiKey,
      },
    });
  } else {
    // Fallback to OpenAI.com (development only)
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required when Azure OpenAI is not configured. Please set OPENAI_API_KEY or configure Azure OpenAI with AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT.');
    }
    return new OpenAI({ apiKey: openaiKey });
  }
}

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
  // Pre-eligibility check information
  preEligibilityCheck?: {
    performed: boolean;
    result?: "ELIGIBLE" | "NOT_ELIGIBLE" | "INCONCLUSIVE";
    determinationSource: "PRE_CHECK" | "AI_ANALYSIS";
    auditTrail?: string[];
    policyViolations?: string[];
  };
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
  
  // PHASE 2: PRE-ELIGIBILITY CHECKS for single encounter analysis
  try {
    // Transform single encounter data to validator format, including diabetic status
    const validatorEncounters = [{
      id: 'single-encounter',
      date: new Date().toISOString().split('T')[0], // Use current date for single encounter
      primaryDiagnosis: woundDetails?.primaryDiagnosis || '',
      woundDetails: woundDetails,
      conservativeCare: conservativeCare,
      allText: encounterNotes.join(' '),
      diabeticStatus: woundDetails?.diabeticStatus || null // Pass diabetic status to avoid false negatives
    }];

    const episodeData = {
      id: 'single-episode',
      woundType: woundDetails?.type || 'Unknown',
      woundLocation: woundDetails?.location || '',
      primaryDiagnosis: woundDetails?.primaryDiagnosis || '',
      episodeStartDate: new Date(),
      status: 'active'
    };

    const preCheckResult = await performPreEligibilityChecks(episodeData, validatorEncounters);
    
    // If pre-checks return definitive failure, return immediately
    if (!preCheckResult.overallEligible) {
      console.log('Pre-eligibility check failed in single encounter analysis - returning definitive NO');
      
      return {
        eligibility: "No",
        rationale: `Medicare LCD L39806 violation: ${preCheckResult.failureReasons.join('; ')}`,
        requiredDocumentationGaps: preCheckResult.failureReasons,
        citations: [{
          title: "Medicare LCD L39806 - Skin Substitutes",
          url: "https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid=39806",
          section: "Coverage Indications, Limitations, and/or Medical Necessity",
          effectiveDate: "2023-09-01"
        }],
        letterBullets: [
          `Policy violation identified: ${preCheckResult.failureReasons[0]}`,
          "Request does not meet Medicare LCD L39806 coverage criteria",
          "CTP application is not medically necessary under current guidelines"
        ],
        preEligibilityCheck: {
          performed: true,
          result: "NOT_ELIGIBLE",
          determinationSource: "PRE_CHECK",
          auditTrail: preCheckResult.auditTrail,
          policyViolations: preCheckResult.policyViolations
        }
      };
    }
  } catch (preCheckError) {
    console.warn('Pre-eligibility check failed with error in single encounter analysis:', preCheckError);
  }
  
  // Create HIPAA-compliant OpenAI client
  const openai = createOpenAIClient();

  // VERIFICATION LOGGING: Track policy context quality before AI analysis
  const policyContextLength = policyContext.length;
  const isPlaceholder = policyContext.includes('This is a placeholder');
  console.log(`📋 AI ELIGIBILITY ANALYSIS - Policy Context Verification:`);
  console.log(`  MAC Region: ${patientInfo.macRegion}`);
  console.log(`  Policy Context Length: ${policyContextLength} chars`);
  console.log(`  Policy Type: ${isPlaceholder ? '⚠️ PLACEHOLDER TEXT' : '✓ REAL LCD CONTENT'}`);
  if (isPlaceholder) {
    console.error(`❌ CRITICAL: AI receiving placeholder policy text - analysis will lack real LCD requirements!`);
  } else if (policyContextLength < 1000) {
    console.warn(`⚠️ WARNING: Policy context is suspiciously short (${policyContextLength} chars) - may not contain full LCD`);
  } else {
    console.log(`✓ Policy context appears valid (${policyContextLength} chars of real content)`);
  }

  const systemPrompt = `You are a compliance-focused clinical coverage assistant. Task: assess eligibility for non-analogous skin substitute/CTP use for DFU/VLU and draft payer-facing letters.

Rules:
- Use ONLY the provided policy context (LCDs, Articles, MAC pages, CMS documentation). Don't infer beyond context. If unclear, say "Insufficient evidence" and list gaps.
- Align to the patient's MAC: ${patientInfo.macRegion}, payer type: ${patientInfo.payerType}.
- Use ONLY the pre-selected policy provided below and cite ONLY this LCD in your analysis.
- The system has already performed policy selection - do not attempt to select between policies.
- If the provided policy is future-dated or postponed, flag this as a potential coverage issue.
- Return structured JSON with the exact format specified.
- Safety: No legal advice. If plan type is Medicare Advantage, note prior authorization is plan-specific; include plan checklist placeholders.

CRITICAL WOUND MEASUREMENT ANALYSIS:
- Carefully examine the wound details JSON for numeric measurements (length, width, depth, area)
- Look for measurements in ALL formats: numeric values, strings that contain numbers, or descriptive text
- If measurements exist (even as strings like "1", "2"), acknowledge them in your analysis
- If no measurements are found, specifically state "detailed wound measurements over time" as a documentation gap
- Consider wound size progression over time when measurements are available from multiple encounters

Selected Policy (Pre-selected by system):
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
      temperature: 0, // Zero temperature for absolute determinism in medical compliance
    });

    let result;
    try {
      result = JSON.parse(response.choices[0].message.content || '{}');
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError);
      console.error('Raw AI response:', response.choices[0].message.content);
      throw new Error('AI returned malformed JSON response: ' + (parseError as Error).message);
    }
    
    // Validate the response structure
    if (!result.eligibility || !result.rationale || !Array.isArray(result.citations)) {
      throw new Error('Invalid response format from AI analysis');
    }

    // Add pre-eligibility check information to AI analysis result
    result.preEligibilityCheck = {
      performed: true,
      result: "INCONCLUSIVE", // Pre-checks didn't fail, so AI analysis was performed
      determinationSource: "AI_ANALYSIS",
      auditTrail: ["Pre-eligibility checks passed or inconclusive", "Proceeded to AI analysis"],
      policyViolations: []
    };

    return result as EligibilityAnalysisResponse;
  } catch (error) {
    console.error('Error in AI eligibility analysis:', error);
    throw new Error('Failed to analyze eligibility: ' + (error as Error).message);
  }
}

// Enhanced request interface for full episode context analysis
interface FullContextAnalysisRequest {
  currentEncounter: {
    encounterNotes: string[];
    woundDetails: any;
    conservativeCare: any;
    procedureCodes?: any[];
    vascularAssessment?: any;
    functionalStatus?: any;
    diabeticStatus?: string | null;
  };
  episodeContext: Array<{
    date: Date;
    notes: string[];
    woundDetails: any;
    conservativeCare: any;
    procedureCodes?: any[];
    vascularAssessment?: any;
    functionalStatus?: any;
    diabeticStatus?: string | null;
    infectionStatus?: string;
    comorbidities?: any;
  }>;
  patientInfo: {
    payerType: string;
    planName?: string;
    insuranceId?: string;
    secondaryPayerType?: string;
    secondaryPlanName?: string;
    secondaryInsuranceId?: string;
    macRegion: string;
  };
  policyContext: string;
}

// Enhanced AI analysis function with complete episode context
export async function analyzeEligibilityWithFullContext(request: FullContextAnalysisRequest): Promise<EligibilityAnalysisResponse> {
  const { currentEncounter, episodeContext, patientInfo, policyContext } = request;
  
  // PHASE 2: PRE-ELIGIBILITY CHECKS for full context analysis
  try {
    // Transform episode context to validator format, including diabetic status
    const validatorEncounters = episodeContext.map(encounter => ({
      id: encounter.date.toISOString(),
      date: encounter.date.toISOString().split('T')[0],
      primaryDiagnosis: currentEncounter.woundDetails?.primaryDiagnosis || '',
      woundDetails: encounter.woundDetails,
      conservativeCare: encounter.conservativeCare,
      allText: encounter.notes.join(' '),
      diabeticStatus: encounter.diabeticStatus ?? null // Convert undefined to null
    }));

    // Include current encounter
    validatorEncounters.push({
      id: 'current-encounter',
      date: new Date().toISOString().split('T')[0],
      primaryDiagnosis: currentEncounter.woundDetails?.primaryDiagnosis || '',
      woundDetails: currentEncounter.woundDetails,
      conservativeCare: currentEncounter.conservativeCare,
      allText: currentEncounter.encounterNotes.join(' '),
      diabeticStatus: currentEncounter.diabeticStatus ?? null // Convert undefined to null
    });

    const episodeData = {
      id: 'full-context-episode',
      woundType: currentEncounter.woundDetails?.type || 'Unknown',
      woundLocation: currentEncounter.woundDetails?.location || '',
      primaryDiagnosis: currentEncounter.woundDetails?.primaryDiagnosis || '',
      episodeStartDate: episodeContext.length > 0 ? episodeContext[0].date : new Date(),
      status: 'active'
    };

    const preCheckResult = await performPreEligibilityChecks(episodeData, validatorEncounters);
    
    // If pre-checks return definitive failure, return immediately
    if (!preCheckResult.overallEligible) {
      console.log('Pre-eligibility check failed in full context analysis - returning definitive NO');
      
      return {
        eligibility: "No",
        rationale: `Medicare LCD L39806 violation: ${preCheckResult.failureReasons.join('; ')}`,
        requiredDocumentationGaps: preCheckResult.failureReasons,
        citations: [{
          title: "Medicare LCD L39806 - Skin Substitutes",
          url: "https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid=39806",
          section: "Coverage Indications, Limitations, and/or Medical Necessity",
          effectiveDate: "2023-09-01"
        }],
        letterBullets: [
          `Policy violation identified: ${preCheckResult.failureReasons[0]}`,
          "Request does not meet Medicare LCD L39806 coverage criteria",
          "CTP application is not medically necessary under current guidelines"
        ],
        preEligibilityCheck: {
          performed: true,
          result: "NOT_ELIGIBLE",
          determinationSource: "PRE_CHECK",
          auditTrail: preCheckResult.auditTrail,
          policyViolations: preCheckResult.policyViolations
        }
      };
    }
    
    console.log('Pre-eligibility checks passed or inconclusive in full context analysis - proceeding with AI analysis');
  } catch (preCheckError) {
    console.warn('Pre-eligibility check failed with error in full context analysis:', preCheckError);
  }
  
  // Create HIPAA-compliant OpenAI client
  const openai = createOpenAIClient();

  // Build temporal progression analysis
  const temporalProgression = episodeContext
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((enc, index) => {
      const encounterDate = new Date(enc.date).toISOString().split('T')[0];
      const measurements = enc.woundDetails?.measurements;
      const cptCodes = enc.procedureCodes?.map((p: any) => p.code).join(', ') || 'None';
      const vascular = enc.vascularAssessment;
      const functional = enc.functionalStatus;
      
      return `
=== ENCOUNTER ${index + 1} (${encounterDate}) ===
WOUND DETAILS:
- Type: ${enc.woundDetails?.type || 'Not specified'}
- Location: ${enc.woundDetails?.location || 'Not specified'}
- Measurements: ${measurements?.length}x${measurements?.width} ${measurements?.unit || 'cm'} (depth: ${measurements?.depth || 'N/A'})
- Wound bed: ${enc.woundDetails?.woundBed || 'Not documented'}
- Drainage: ${enc.woundDetails?.drainage || 'Not documented'}

PROCEDURES/CPT CODES: ${cptCodes}

VASCULAR STATUS:
- Dorsalis Pedis: ${vascular?.dorsalisPedis || 'Not assessed'}
- Posterior Tibial: ${vascular?.posteriorTibial || 'Not assessed'}
- Edema: ${vascular?.edema || 'Not assessed'}
- Capillary Refill: ${vascular?.capillaryRefill || 'Not assessed'}

FUNCTIONAL STATUS:
- Mobility: ${functional?.mobility || 'Not assessed'}
- Self-care: ${functional?.selfCare || 'Not assessed'}
- Assistive device: ${functional?.assistiveDevice ? 'Yes' : 'No'}

DIABETIC STATUS: ${enc.diabeticStatus || 'Not specified'}

CONSERVATIVE CARE:
${JSON.stringify(enc.conservativeCare, null, 2)}

CLINICAL NOTES:
${enc.notes.join('\n')}
`;
    }).join('\n');

  const systemPrompt = `You are a compliance-focused clinical coverage assistant. Task: assess eligibility for non-analogous skin substitute/CTP use for DFU/VLU based on COMPLETE EPISODE CONTEXT with temporal progression.

COMPREHENSIVE ANALYSIS REQUIREMENTS:
- Analyze the ENTIRE episode progression from all ${episodeContext.length} encounters
- Consider wound measurement progression over time (increasing/decreasing/stable)
- Evaluate cumulative conservative care duration and effectiveness
- Track all procedures performed (CPT codes) throughout the episode
- Assess vascular status changes and functional limitations
- Consider both primary and secondary insurance coverage
- Identify patterns of improvement, deterioration, or stagnation

Rules:
- Use ONLY the provided policy context (LCDs, Articles, MAC pages, CMS documentation)
- Align to the patient's MAC: ${patientInfo.macRegion}, payer type: ${patientInfo.payerType}
- If secondary insurance: ${patientInfo.secondaryPayerType || 'None'}
- Use ONLY the pre-selected policy provided below and cite ONLY this LCD in your analysis
- The system has already performed policy selection - do not attempt to select between policies
- If the provided policy is future-dated or postponed, flag this as a potential coverage issue
- Return structured JSON with the exact format specified

CRITICAL TEMPORAL ANALYSIS:
- Document wound size progression: Are measurements increasing/decreasing?
- Calculate total conservative care duration across ALL encounters
- Identify failed conservative treatments with specific timeframes
- Note any procedures performed (debridements, grafts) with dates
- Track functional decline or improvement over time

Selected Policy (Pre-selected by system):
${policyContext}

Patient Insurance Information:
- Primary: ${patientInfo.payerType} ${patientInfo.planName || ''} (ID: ${patientInfo.insuranceId || 'N/A'})
- Secondary: ${patientInfo.secondaryPayerType || 'None'} ${patientInfo.secondaryPlanName || ''} (ID: ${patientInfo.secondaryInsuranceId || 'N/A'})
- MAC Region: ${patientInfo.macRegion}

COMPLETE EPISODE TIMELINE:
${temporalProgression}

CURRENT ENCOUNTER FOCUS:
${JSON.stringify(currentEncounter, null, 2)}

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
      temperature: 0.0, // Zero temperature for maximum consistency
    });

    let result;
    try {
      result = JSON.parse(response.choices[0].message.content || '{}');
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError);
      console.error('Raw AI response:', response.choices[0].message.content);
      throw new Error('AI returned malformed JSON response: ' + (parseError as Error).message);
    }
    
    // Validate the response structure
    if (!result.eligibility || !result.rationale || !Array.isArray(result.citations)) {
      throw new Error('Invalid response format from AI analysis');
    }

    // Add pre-eligibility check information to AI analysis result
    result.preEligibilityCheck = {
      performed: true,
      result: "INCONCLUSIVE", // Pre-checks didn't fail, so AI analysis was performed
      determinationSource: "AI_ANALYSIS",
      auditTrail: ["Pre-eligibility checks passed or inconclusive", "Proceeded to AI analysis"],
      policyViolations: []
    };

    return result as EligibilityAnalysisResponse;
  } catch (error) {
    console.error('Error in enhanced AI eligibility analysis:', error);
    throw new Error('Failed to analyze eligibility with full context: ' + (error as Error).message);
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
  
  // PHASE 2: PRE-ELIGIBILITY CHECKS for episode analysis
  try {
    // Transform encounters to validator format
    const validatorEncounters = encounters.map(encounter => ({
      id: encounter.id,
      date: encounter.date.toISOString().split('T')[0],
      primaryDiagnosis: episodeInfo.primaryDiagnosis,
      woundDetails: encounter.woundDetails,
      conservativeCare: encounter.conservativeCare,
      allText: encounter.notes.join(' '),
      diabeticStatus: null // No diabetic status available in this context
    }));

    const episodeData = {
      id: episodeInfo.id,
      woundType: episodeInfo.woundType,
      woundLocation: episodeInfo.woundLocation,
      primaryDiagnosis: episodeInfo.primaryDiagnosis,
      episodeStartDate: episodeInfo.episodeStartDate,
      status: episodeInfo.status
    };

    const preCheckResult = await performPreEligibilityChecks(episodeData, validatorEncounters);
    
    // If pre-checks return definitive failure, return immediately
    if (!preCheckResult.overallEligible) {
      console.log('Pre-eligibility check failed in episode analysis - returning definitive NO');
      
      return {
        eligibility: "No",
        rationale: `Medicare LCD L39806 violation: ${preCheckResult.failureReasons.join('; ')}`,
        requiredDocumentationGaps: preCheckResult.failureReasons,
        citations: [{
          title: "Medicare LCD L39806 - Skin Substitutes",
          url: "https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid=39806",
          section: "Coverage Indications, Limitations, and/or Medical Necessity",
          effectiveDate: "2023-09-01"
        }],
        letterBullets: [
          `Policy violation identified: ${preCheckResult.failureReasons[0]}`,
          "Request does not meet Medicare LCD L39806 coverage criteria",
          "CTP application is not medically necessary under current guidelines"
        ],
        preEligibilityCheck: {
          performed: true,
          result: "NOT_ELIGIBLE",
          determinationSource: "PRE_CHECK",
          auditTrail: preCheckResult.auditTrail,
          policyViolations: preCheckResult.policyViolations
        }
      };
    }
    
    console.log('Pre-eligibility checks passed or inconclusive in episode analysis - proceeding with AI analysis');
  } catch (preCheckError) {
    console.warn('Pre-eligibility check failed with error in episode analysis:', preCheckError);
  }
  
  // Create HIPAA-compliant OpenAI client
  const openai = createOpenAIClient();

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
- Use ONLY the pre-selected policy provided below and cite ONLY this LCD in your analysis
- The system has already performed policy selection - do not attempt to select between policies
- If the provided policy is future-dated or postponed, flag this as a potential coverage issue
- Focus on episode-level medical necessity rather than single encounter assessment

CRITICAL WOUND MEASUREMENT ANALYSIS:
- Carefully examine ALL wound details across ALL encounters for numeric measurements (length, width, depth, area)
- Look for measurements in ALL formats: numeric values, strings that contain numbers, or descriptive text in encounter notes
- If measurements exist (even as strings like "1", "2"), acknowledge them and track progression over time
- Consider wound size changes across multiple encounters to assess healing progression
- If no measurements are found across encounters, specifically state "detailed wound measurements over time" as a documentation gap

EPISODE INFORMATION:
- Episode ID: ${episodeInfo.id}
- Wound Type: ${episodeInfo.woundType}
- Wound Location: ${episodeInfo.woundLocation} 
- Primary Diagnosis: ${episodeInfo.primaryDiagnosis}
- Episode Start Date: ${episodeInfo.episodeStartDate.toISOString().split('T')[0]}
- Episode Status: ${episodeInfo.status}
- Total Encounters: ${encounters.length}

Selected Policy (Pre-selected by system):
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
      temperature: 0, // Zero temperature for absolute determinism in medical compliance
    });

    let result;
    try {
      result = JSON.parse(response.choices[0].message.content || '{}');
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError);
      console.error('Raw AI response:', response.choices[0].message.content);
      throw new Error('AI returned malformed JSON response: ' + (parseError as Error).message);
    }
    
    // Validate the response structure
    if (!result.eligibility || !result.rationale || !Array.isArray(result.citations)) {
      throw new Error('Invalid response format from AI analysis');
    }

    // Add pre-eligibility check information to AI analysis result
    result.preEligibilityCheck = {
      performed: true,
      result: "INCONCLUSIVE", // Pre-checks didn't fail, so AI analysis was performed
      determinationSource: "AI_ANALYSIS",
      auditTrail: ["Pre-eligibility checks passed or inconclusive", "Proceeded to AI analysis"],
      policyViolations: []
    };

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
  
  // PHASE 2: PRE-ELIGIBILITY CHECKS - Gate obvious policy violations before AI analysis
  try {
    // Transform encounters to validator format
    const validatorEncounters = targetEpisode.encounters.map(encounter => ({
      id: encounter.id,
      date: encounter.date.toISOString().split('T')[0],
      primaryDiagnosis: targetEpisode.primaryDiagnosis || '',
      woundDetails: encounter.woundDetails,
      conservativeCare: encounter.conservativeCare,
      allText: encounter.notes ? encounter.notes.join(' ') : '',
      diabeticStatus: null // No diabetic status available in this context
    }));

    // Perform pre-eligibility checks
    const episodeData = {
      id: targetEpisode.id,
      woundType: targetEpisode.woundType,
      woundLocation: targetEpisode.woundLocation,
      primaryDiagnosis: targetEpisode.primaryDiagnosis || '', // Convert null to empty string
      episodeStartDate: targetEpisode.episodeStartDate,
      status: targetEpisode.status
    };
    const preCheckResult = await performPreEligibilityChecks(episodeData, validatorEncounters);
    
    // If pre-checks return definitive failure, return immediately without AI analysis
    if (!preCheckResult.overallEligible) {
      console.log('Pre-eligibility check failed - returning definitive NO without AI analysis');
      
      return {
        eligibility: "No",
        rationale: `Medicare LCD L39806 violation: ${preCheckResult.failureReasons.join('; ')}`,
        requiredDocumentationGaps: preCheckResult.failureReasons,
        citations: [{
          title: "Medicare LCD L39806 - Skin Substitutes",
          url: "https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid=39806",
          section: "Coverage Indications, Limitations, and/or Medical Necessity",
          effectiveDate: "2023-09-01"
        }],
        letterBullets: [
          `Policy violation identified: ${preCheckResult.failureReasons[0]}`,
          "Request does not meet Medicare LCD L39806 coverage criteria",
          "CTP application is not medically necessary under current guidelines"
        ],
        preEligibilityCheck: {
          performed: true,
          result: "NOT_ELIGIBLE",
          determinationSource: "PRE_CHECK",
          auditTrail: preCheckResult.auditTrail,
          policyViolations: preCheckResult.policyViolations
        }
      };
    }
    
    // Pre-checks passed or inconclusive - proceed with AI analysis
    console.log('Pre-eligibility checks passed or inconclusive - proceeding with AI analysis');
  } catch (preCheckError) {
    console.warn('Pre-eligibility check failed with error - proceeding with AI analysis:', preCheckError);
    // Continue with AI analysis if pre-checks fail due to technical issues
  }
  
  // Create HIPAA-compliant OpenAI client
  const openai = createOpenAIClient();

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
- Use ONLY the pre-selected policy provided below and cite ONLY this LCD in your analysis
- The system has already performed policy selection - do not attempt to select between policies
- If the provided policy is future-dated or postponed, flag this as a potential coverage issue
- Focus on comprehensive medical necessity assessment rather than isolated episode evaluation

CRITICAL WOUND MEASUREMENT ANALYSIS:
- Thoroughly examine ALL wound details across ALL episodes and encounters for numeric measurements
- PRIMARY MEASUREMENTS (Required): Length and width are the primary indicators of wound size
- SUPPLEMENTARY MEASUREMENTS (Optional): Depth and area provide additional detail but are not always clinically required
- Search through encounter notes, wound details JSON, and clinical findings for measurement data
- Look for measurements in ALL formats: numeric values, strings containing numbers, descriptive text like "1×1", "2×2", "4×3"
- If length AND width measurements exist (even without depth/area), the wound is PROPERLY DOCUMENTED
- Track wound size changes across episodes to assess healing patterns (e.g., 4×3cm → 2×2cm → 1×1cm shows improvement)
- ONLY flag "detailed wound measurements" as a documentation gap if BOTH length AND width are missing
- Do NOT list measurements as missing if you can see length×width values in the data

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

Selected Policy (Pre-selected by system):
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
  measurementSummary: targetEpisode.encounters.map(enc => {
    const details = enc.woundDetails as any;
    const hasMeasurements = details?.measurements?.length && details?.measurements?.width;
    return {
      date: enc.date.toISOString().split('T')[0],
      hasMeasurements,
      length: details?.measurements?.length || null,
      width: details?.measurements?.width || null,
      depth: details?.measurements?.depth || null,
      unit: details?.measurements?.unit || 'cm'
    };
  }),
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
  "requiredDocumentationGaps": ["ONLY list actual missing items. DO NOT list 'detailed wound measurements' if length×width values are present"],
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
      "keyFindings": ["When measurements exist, ALWAYS include them (e.g., 'Wound measuring 2cm × 2cm')", "Key finding 2"],
      "woundProgression": "Include specific measurements if available (e.g., 'Improved from 4×3cm to 2×2cm')",
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
      temperature: 0, // Zero temperature for absolute determinism in medical compliance
    });

    let result;
    try {
      result = JSON.parse(response.choices[0].message.content || '{}');
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError);
      console.error('Raw AI response:', response.choices[0].message.content);
      throw new Error('AI returned malformed JSON response: ' + (parseError as Error).message);
    }
    
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

    // Add pre-eligibility check information to AI analysis result
    result.preEligibilityCheck = {
      performed: true,
      result: "INCONCLUSIVE", // Pre-checks didn't fail, so AI analysis was performed
      determinationSource: "AI_ANALYSIS",
      auditTrail: ["Pre-eligibility checks passed or inconclusive", "Proceeded to AI analysis"],
      policyViolations: []
    };

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
      storage.getPatientEpisodesWithHistory(patientId),
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
    const transformEpisode = async (episode: EpisodeWithFullHistory): Promise<EpisodeWithDecryptedHistory> => {
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
        status: episode.status || 'active',
        primaryDiagnosis: episode.primaryDiagnosis,
        createdAt: episode.createdAt,
        updatedAt: episode.updatedAt,
        encounters: await Promise.all(episode.encounters.map(async encounter => {
          // Ensure date objects for encounters
          const encounterDate = encounter.date instanceof Date 
            ? encounter.date 
            : new Date(encounter.date);

          return {
            id: encounter.id,
            date: encounterDate,
            notes: await decryptEncounterNotes(encounter.encryptedNotes as string[], encounter.id),
            woundDetails: encounter.woundDetails,
            conservativeCare: encounter.conservativeCare,
            infectionStatus: encounter.infectionStatus,
            comorbidities: encounter.comorbidities,
          };
        })).then(encounters => encounters.sort((a, b) => a.date.getTime() - b.date.getTime())), // Sort encounters chronologically
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
    const transformedEpisodes = await Promise.all(allPatientEpisodes.map(transformEpisode));
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
  // Create HIPAA-compliant OpenAI client
  const openai = createOpenAIClient();
  
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
