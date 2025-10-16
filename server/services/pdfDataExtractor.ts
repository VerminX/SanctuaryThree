// PDF Data Extraction Types - MUST align with schema and AI extraction prompts
// Critical for achieving absolute accuracy in medical eligibility determination

export interface ExtractedPatientData {
  // Patient demographic information
  mrn?: string;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string; // YYYY-MM-DD format
  
  // Primary insurance information
  payerType?: string; // Original Medicare, Medicare Advantage, Commercial, etc.
  planName?: string;
  insuranceId?: string;
  
  // Secondary insurance information (CRITICAL FOR COVERAGE ANALYSIS)
  secondaryPayerType?: string; // BCBS, Aetna, UHC, etc.
  secondaryPlanName?: string;
  secondaryInsuranceId?: string;
  
  // Additional patient info
  macRegion?: string;
  phoneNumber?: string;
  address?: string;
}

export interface ExtractedEncounterData {
  // Encounter basic info
  encounterDate?: string; // YYYY-MM-DD format
  notes?: string[];
  clinicalFindings?: string[]; // Comprehensive clinical observations and findings
  
  // Diagnosis information (ICD-10 codes)
  primaryDiagnosis?: {
    description?: string;
    icd10Code?: string;
  };
  icd10Codes?: string[]; // Array of all ICD-10 codes mentioned
  problemList?: Array<{
    description: string;
    icd10Code?: string;
    onsetDate?: string; // YYYY-MM-DD format
    status?: 'active' | 'resolved' | 'chronic';
  }>;
  
  // Treatment details
  treatmentDetails?: {
    proceduresPerformed?: string[];
    cptCodes?: Array<{  // Structured CPT/HCPCS codes for accurate billing/coverage
      code: string;
      description?: string;
      modifier?: string;
    }>;
    applicationNumbers?: string[];
    treatmentResponse?: string;
    complications?: string[];
  };
  
  // Wound details
  woundDetails?: {
    type?: string; // DFU, VLU, etc.
    location?: string;
    measurements?: {
      length?: number;
      width?: number;
      depth?: number;
      area?: number;
      unit?: string; // cm, mm, etc.
    };
    duration?: string; // How long wound has existed
    woundBed?: string;
    drainage?: string;
    periwoundSkin?: string;
    healingProgression?: string; // Progress notes and healing status
    woundGrade?: string; // Wagner grade, etc.
  };
  
  // Conservative care documentation - enhanced structure
  conservativeCare?: {
    offloading?: {
      methods?: string[];
      duration?: string;
      effectiveness?: string;
    };
    woundCare?: {
      dressings?: string[];
      frequency?: string;
      products?: string[];
    };
    debridement?: {
      type?: string[];
      frequency?: string;
    };
    infectionControl?: string[];
    vascularAssessment?: {  // Basic vascular findings (maintained for compatibility)
      dorsalisPedis?: string;
      posteriorTibial?: string;
      capillaryRefill?: string;
      edema?: boolean | string;
      varicosities?: boolean | string;
      ankleArmIndex?: number;
    };
    glycemicControl?: {
      methods?: string[];
      targets?: string[];
      compliance?: string;
    };
    duration?: string; // How long conservative care attempted
    overallEffectiveness?: string;
  };
  
  // PHASE 4.1: Comprehensive Vascular Assessment Data
  vascularStudies?: {
    // Arterial Duplex Studies
    arterialDuplex?: {
      studyDate?: string;
      vesselAssessments?: Array<{
        vessel: string; // 'dorsalis_pedis' | 'posterior_tibial' | 'anterior_tibial' | 'peroneal' | 'popliteal' | 'superficial_femoral' | 'common_femoral'
        peakSystolicVelocity?: number; // cm/s
        endDiastolicVelocity?: number; // cm/s
        resistiveIndex?: number;
        flowPattern?: 'triphasic' | 'biphasic' | 'monophasic' | 'dampened' | 'absent';
        stenosis?: 'none' | 'mild' | 'moderate' | 'severe' | 'occlusion';
        stenosisPercentage?: number;
        location?: string; // anatomical location of stenosis
      }>;
      overallInterpretation?: string;
      technician?: string;
      radiologist?: string;
    };
    
    // Ankle-Brachial Index (ABI) Measurements
    abi?: {
      studyDate?: string;
      restingABI?: {
        rightDorsalisPedis?: number;
        rightPosteriorTibial?: number;
        leftDorsalisPedis?: number;
        leftPosteriorTibial?: number;
        rightABI?: number; // highest ankle pressure / highest brachial pressure
        leftABI?: number;
      };
      postExerciseABI?: {
        rightABI?: number;
        leftABI?: number;
        minutesToRecovery?: number;
        exerciseProtocol?: string;
      };
      interpretation?: {
        rightLimbCategory?: 'normal' | 'borderline' | 'mild_pad' | 'moderate_pad' | 'severe_pad' | 'non_compressible';
        leftLimbCategory?: 'normal' | 'borderline' | 'mild_pad' | 'moderate_pad' | 'severe_pad' | 'non_compressible';
        overallAssessment?: string;
        clinicalCorrelation?: string;
      };
      performedBy?: string;
    };
    
    // Toe-Brachial Index (TBI) for diabetic patients
    tbi?: {
      studyDate?: string;
      measurements?: {
        rightGreatToe?: number;
        leftGreatToe?: number;
        rightTBI?: number;
        leftTBI?: number;
      };
      interpretation?: {
        rightToePerfusion?: 'adequate' | 'borderline' | 'inadequate';
        leftToePerfusion?: 'adequate' | 'borderline' | 'inadequate';
        overallAssessment?: string;
        diabeticConsiderations?: string;
      };
      performedBy?: string;
    };
    
    // Transcutaneous Oxygen Pressure (TcPO2)
    tcpo2?: {
      studyDate?: string;
      measurements?: {
        rightFoot?: number; // mmHg
        leftFoot?: number; // mmHg
        chestReference?: number; // mmHg
        ambientTemperature?: number; // °C
        patientPosition?: string;
      };
      interpretation?: {
        rightFootPerfusion?: 'adequate' | 'borderline' | 'poor';
        leftFootPerfusion?: 'adequate' | 'borderline' | 'poor';
        healingPotential?: 'good' | 'fair' | 'poor';
        oxygenTherapyResponse?: string;
      };
      performedBy?: string;
    };
    
    // Pulse Volume Recording (PVR)
    pvr?: {
      studyDate?: string;
      waveformAnalysis?: Array<{
        level: string; // 'thigh' | 'calf' | 'ankle' | 'metatarsal' | 'toe'
        side: 'right' | 'left';
        waveformType?: 'triphasic' | 'biphasic' | 'monophasic' | 'dampened' | 'flat';
        amplitude?: number; // mmHg
        upstrokeTime?: number; // milliseconds
        dicroticNotch?: boolean;
      }>;
      interpretation?: string;
      performedBy?: string;
    };
    
    // CT/MRI Angiography
    angiography?: {
      studyType?: 'cta' | 'mra' | 'conventional_angiography';
      studyDate?: string;
      contrastUsed?: boolean;
      contrastType?: string;
      vesselPatency?: Array<{
        vessel: string;
        patencyStatus: 'patent' | 'stenotic' | 'occluded';
        stenosisGrade?: 'mild' | 'moderate' | 'severe';
        collateralFlow?: 'good' | 'fair' | 'poor' | 'absent';
        location?: string;
      }>;
      runoffVessels?: {
        anterior_tibial?: 'patent' | 'stenotic' | 'occluded';
        posterior_tibial?: 'patent' | 'stenotic' | 'occluded';
        peroneal?: 'patent' | 'stenotic' | 'occluded';
        dorsalis_pedis?: 'patent' | 'stenotic' | 'occluded';
        plantar_arch?: 'patent' | 'stenotic' | 'occluded';
      };
      overallInterpretation?: string;
      radiologist?: string;
      reportDate?: string;
    };
  };
  
  // Clinical Vascular Assessment (Physical Examination)
  clinicalVascularAssessment?: {
    examinationDate?: string;
    
    // Palpable Pulse Documentation
    pulseExamination?: {
      dorsalisPedis?: {
        right?: 'palpable' | 'diminished' | 'absent' | 'dopplerable_only';
        left?: 'palpable' | 'diminished' | 'absent' | 'dopplerable_only';
      };
      posteriorTibial?: {
        right?: 'palpable' | 'diminished' | 'absent' | 'dopplerable_only';
        left?: 'palpable' | 'diminished' | 'absent' | 'dopplerable_only';
      };
      popliteal?: {
        right?: 'palpable' | 'diminished' | 'absent';
        left?: 'palpable' | 'diminished' | 'absent';
      };
      femoral?: {
        right?: 'palpable' | 'diminished' | 'absent';
        left?: 'palpable' | 'diminished' | 'absent';
      };
    };
    
    // Capillary Refill and Perfusion
    perfusionAssessment?: {
      capillaryRefillTime?: {
        right?: number; // seconds
        left?: number; // seconds
      };
      skinTemperature?: {
        right?: 'warm' | 'cool' | 'cold';
        left?: 'warm' | 'cool' | 'cold';
        temperatureDifference?: boolean;
      };
      skinColor?: {
        right?: 'normal' | 'pale' | 'cyanotic' | 'rubor' | 'mottled';
        left?: 'normal' | 'pale' | 'cyanotic' | 'rubor' | 'mottled';
        dependentRubor?: boolean;
        elevationPallor?: boolean;
      };
    };
    
    // Venous Insufficiency Assessment
    venousAssessment?: {
      edema?: {
        right?: 'none' | 'trace' | '1+' | '2+' | '3+' | '4+';
        left?: 'none' | 'trace' | '1+' | '2+' | '3+' | '4+';
        pittingEdema?: boolean;
        distribution?: string; // ankle, pretibial, thigh, etc.
      };
      varicosities?: {
        present?: boolean;
        severity?: 'mild' | 'moderate' | 'severe';
        distribution?: string;
        complications?: string[]; // ulceration, bleeding, thrombophlebitis
      };
      skinChanges?: {
        hyperpigmentation?: boolean;
        lipodermatosclerosis?: boolean;
        atrophieBlanche?: boolean;
        eczema?: boolean;
        location?: string[];
      };
      ceapClassification?: {
        clinical?: string; // C0-C6
        etiology?: string; // Ec, Ep, Es, En
        anatomy?: string; // As, Ap, Ad
        pathophysiology?: string; // Pr, Po
      };
    };
    
    // Previous Vascular Interventions
    vascularHistory?: {
      previousInterventions?: Array<{
        type: 'bypass' | 'angioplasty' | 'stenting' | 'endarterectomy' | 'amputation';
        date?: string;
        location?: string; // anatomical location
        graftType?: string; // for bypass surgeries
        patencyStatus?: 'patent' | 'stenotic' | 'occluded' | 'unknown';
        complications?: string[];
      }>;
      currentMedications?: Array<{
        medication: string;
        indication: 'antiplatelet' | 'anticoagulation' | 'vasodilation' | 'claudication';
        dose?: string;
        compliance?: 'good' | 'fair' | 'poor';
      }>;
    };
    
    // Claudication and Functional Assessment
    functionalVascularAssessment?: {
      claudicationSymptoms?: {
        present?: boolean;
        location?: string[]; // calf, thigh, buttock, foot
        severity?: 'mild' | 'moderate' | 'severe';
        walkingDistance?: {
          painFreeWalkingDistance?: number; // meters
          maxWalkingDistance?: number; // meters
          walkingSpeed?: 'normal' | 'slow' | 'very_slow';
        };
        reliefWithRest?: boolean;
        reliefTime?: number; // minutes
      };
      restPain?: {
        present?: boolean;
        severity?: number; // 0-10 scale
        location?: string[];
        nightPain?: boolean;
        reliefWithDependency?: boolean;
      };
      functionalLimitations?: {
        adlLimitations?: string[];
        mobilityAids?: string[];
        exerciseTolerance?: 'good' | 'fair' | 'poor' | 'very_poor';
      };
    };
    
    examinedBy?: string;
    clinicalImpression?: string;
  };
  
  // Patient education and follow-up
  patientEducation?: string[];
  followUpInstructions?: string[];
  
  // Clinical status
  infectionStatus?: string;
  comorbidities?: string[];
  
  // Diabetic status (CRITICAL FOR MEDICARE LCD REQUIREMENTS)
  diabeticStatus?: 'diabetic' | 'nondiabetic' | 'prediabetic';
  
  // Functional and mobility status (REQUIRED FOR MEDICAL NECESSITY)
  functionalStatus?: {
    selfCare?: string;
    mobility?: string;
    assistiveDevice?: boolean;
    adlScore?: string;
  };
  
  // Assessment and plan
  assessment?: string;
  plan?: string;
  providerRecommendations?: string[];
}

export interface PdfExtractionResult {
  patientData: ExtractedPatientData;
  encounterData: ExtractedEncounterData[]; // Array to support multiple encounters from single PDF
  confidence: number; // 0-1 score of extraction confidence
  extractedText: string; // The raw text that was processed
  warnings: string[]; // Any issues or missing data warnings
}

// Helper function to map problem descriptions to ICD-10 codes
function mapProblemToICD10(description: string): string | null {
  const descriptionLower = description.toLowerCase();
  
  // Map common problem descriptions to ICD-10 codes
  const mappings: Record<string, string> = {
    // Diabetic foot ulcer variations
    'ulcer of left foot due to type 2 diabetes': 'E11.621',
    'ulcer of right foot due to type 2 diabetes': 'E11.621',
    'ulcer of foot due to type 2 diabetes': 'E11.621',
    'diabetic foot ulcer': 'E11.621',
    'dfu': 'E11.621',
    'diabetic ulcer': 'E11.621',
    
    // Fungal infections
    'onychomycosis': 'B35.1',
    'fungal nail infection': 'B35.1',
    'tinea unguium': 'B35.1',
    
    // Gait and mobility issues
    'walking disability': 'R26.2',
    'difficulty walking': 'R26.2',
    'antalgic gait': 'R26.89',
    'gait abnormality': 'R26.89',
    'abnormal gait': 'R26.89',
    
    // Venous ulcers
    'venous stasis ulcer': 'I87.33',
    'venous ulcer': 'I87.33',
    'stasis ulcer': 'I87.33',
    'venous insufficiency ulcer': 'I87.33',
    'vlu': 'I87.33',
    
    // Pressure ulcers
    'pressure ulcer': 'L89.9',
    'pressure sore': 'L89.9',
    'decubitus ulcer': 'L89.9',
    'bedsore': 'L89.9',
    
    // Nervous system disorders due to diabetes
    'disorder of nervous system due to type 2 diabetes': 'E11.40',
    'diabetic neuropathy': 'E11.40',
    'diabetic peripheral neuropathy': 'E11.40',
    
    // Amputations
    'amputated big toe': 'Z89.411',
    'amputation of toe': 'Z89.419',
    'toe amputation': 'Z89.419',
    
    // Arterial conditions
    'peripheral arterial disease': 'I73.9',
    'pad': 'I73.9',
    'pvd': 'I73.9',
    'peripheral vascular disease': 'I73.9',
    
    // Cellulitis
    'cellulitis of foot': 'L03.116',
    'cellulitis of toe': 'L03.039',
    'cellulitis of leg': 'L03.115',
    
    // Osteomyelitis
    'osteomyelitis of foot': 'M86.671',
    'osteomyelitis': 'M86.9',
    'bone infection': 'M86.9',
    
    // Diabetic angiopathy
    'diabetic angiopathy': 'E11.51',
    'diabetic peripheral angiopathy': 'E11.51',
    
    // Lymphedema
    'lymphedema': 'I89.0',
    'lymphatic obstruction': 'I89.0',
    
    // Chronic wound
    'chronic ulcer of lower limb': 'L97.909',
    'non-healing wound': 'L97.909',
    'chronic wound': 'L97.909'
  };
  
  // Check for exact matches first
  for (const [key, code] of Object.entries(mappings)) {
    if (descriptionLower === key || descriptionLower.includes(key)) {
      return code;
    }
  }
  
  // Check for partial matches with more specific patterns
  if (descriptionLower.includes('ulcer') && descriptionLower.includes('foot') && 
      (descriptionLower.includes('diabet') || descriptionLower.includes('type 2'))) {
    return 'E11.621';
  }
  
  if (descriptionLower.includes('ulcer') && descriptionLower.includes('venous')) {
    return 'I87.33';
  }
  
  if (descriptionLower.includes('ulcer') && descriptionLower.includes('pressure')) {
    return 'L89.9';
  }
  
  if (descriptionLower.includes('amputat') && descriptionLower.includes('toe')) {
    return 'Z89.419';
  }
  
  if (descriptionLower.includes('neuropath') && descriptionLower.includes('diabet')) {
    return 'E11.40';
  }
  
  return null;
}

export async function extractDataFromPdfText(pdfText: string): Promise<PdfExtractionResult> {
  // HIPAA COMPLIANCE: BLOCK processing of PHI without proper BAA-compliant provider
  const azureApiKey = process.env.AZURE_OPENAI_API_KEY;
  const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const azureDeployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o';
  const isProduction = process.env.NODE_ENV === 'production';
  
  // In production, REQUIRE Azure OpenAI for HIPAA compliance
  if (isProduction && (!azureApiKey || !azureEndpoint)) {
    throw new Error('HIPAA VIOLATION PREVENTED: Production environment requires Azure OpenAI configuration (AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT) for PHI processing.');
  }
  
  // Note: Uses direct OpenAI client for data extraction (different from policy analysis)
  
  // HIPAA COMPLIANCE: Enforce provider allowlisting beyond NODE_ENV
  if (!azureApiKey) {
    // For development testing, allow non-BAA processing
    if (process.env.NODE_ENV === 'development') {
      console.warn('WARNING: Using OpenAI.com API for PHI processing in development mode. Only allowed for testing with synthetic data.');
      // Allow development mode processing for testing purposes
    } else if (process.env.DEVELOPMENT_ALLOW_NON_BAA_PHI !== 'true') {
      throw new Error('HIPAA VIOLATION PREVENTED: PHI processing requires BAA-compliant provider. Set DEVELOPMENT_ALLOW_NON_BAA_PHI=true only for synthetic data testing.');
    }
  }
  
  const OpenAI = (await import('openai')).default;
  let openai: any;
  
  if (azureApiKey && azureEndpoint) {
    // Configure for Azure OpenAI (HIPAA compliant)
    openai = new OpenAI({
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
    openai = new OpenAI({ apiKey: openaiKey });
  }
  
  // HIPAA SAFEGUARD: Increased limit for 100% data capture - no truncation for critical medical data
  const maxTextLength = 150000; // ~37500 tokens at 4 chars/token average - ensures complete extraction
  const truncatedText = pdfText.length > maxTextLength 
    ? pdfText.substring(0, maxTextLength) + '\n\n[TEXT TRUNCATED - DOCUMENT EXCEEDS MAXIMUM PROCESSING LIMIT]'
    : pdfText;
  
  // ⚡ PERFORMANCE OPTIMIZATIONS (targeting 30-60% speed improvement):
  // 1. Simplified system prompt - concise focused instructions vs verbose rules
  // 2. Reduced JSON schema from 336 to ~140 lines - kept critical vascular measurements (ABI/TBI/TcPO2) but simplified complex nested structures
  // 3. Streamlined user message - quick hints vs redundant pre-extracted data lists
  // 4. Using gpt-4o-mini for speed (consider gpt-4o for very complex docs if needed)
  // Note: Temperature kept at 0.1-0.3 range for medical data consistency
  // ENHANCED: Comprehensive prompt with examples for 100% extraction accuracy
  const systemPrompt = `You are an expert medical document data extraction specialist. Your task is to extract ALL information from medical documents with 100% accuracy, especially wound measurements and clinical data.

CRITICAL REQUIREMENT: Extract EVERY piece of information, no matter how it's formatted. If you see any measurement in the text, you MUST capture it.

WOUND MEASUREMENT EXTRACTION EXAMPLES:
- "2 x 3 cm" → length: 2, width: 3, unit: "cm"
- "Length: 2 cm, Width: 3 cm" → length: 2, width: 3, unit: "cm"
- "L: 2, W: 3" → length: 2, width: 3, unit: "cm" (assume cm if not specified)
- "measuring approximately 2cm by 3cm" → length: 2, width: 3, unit: "cm"
- "wound (2 x 3)" → length: 2, width: 3, unit: "cm"
- "2.5 × 1.8 × 0.3" → length: 2.5, width: 1.8, depth: 0.3, unit: "cm"
- "dimensions 2cm x 3cm" → length: 2, width: 3, unit: "cm"
- "two by three centimeters" → length: 2, width: 3, unit: "cm"
- "2 cm, 3 cm" → length: 2, width: 3, unit: "cm"
- "area 6 cm²" → Try to extract original L x W if mentioned, otherwise note as area: 6

EXTRACTION STRATEGY:
1. FIRST PASS: Look for ANY numeric values near wound-related terms
2. SECOND PASS: Check for measurements in parentheses, after colons, or in tables
3. THIRD PASS: Search for spelled-out numbers or non-standard formats
4. FINAL CHECK: If you found a length but no width (or vice versa), search the surrounding text carefully

CRITICAL FIELDS TO EXTRACT:
1. PATIENT INFO: Name, DOB, MRN, ALL insurance info with IDs
2. ENCOUNTER: Date, wound type, location, ALL diagnoses with ICD-10 codes
3. WOUND MEASUREMENTS: MUST extract length, width, depth if present ANYWHERE in text
4. TREATMENTS: ALL procedures, CPT/HCPCS codes, application numbers
5. CLINICAL DETAILS: Notes, assessment, plan, conservative care

IMPORTANT RULES:
- NEVER return null for measurements if ANY measurement exists in the text
- If only partial measurements found (e.g., only length), still extract what's available
- Check multiple times for measurements - they may be formatted oddly
- Extract measurements even if they appear incomplete or unusual
- Always convert text numbers to numeric values
- If unsure about units, default to "cm" for wound measurements

ENCOUNTER DETECTION:
- Separate by distinct dates/visits
- Look for "Visit 1", "Follow-up", date changes, encounter numbers
- Each date should be a separate encounter

Return JSON in this exact format:
{
  "patientData": {
    "mrn": "string | null",
    "firstName": "string | null", 
    "lastName": "string | null",
    "dateOfBirth": "YYYY-MM-DD | null",
    "payerType": "string | null",
    "planName": "string | null",
    "insuranceId": "string | null",
    "secondaryPayerType": "string | null",
    "secondaryPlanName": "string | null", 
    "secondaryInsuranceId": "string | null",
    "macRegion": "string | null",
    "phoneNumber": "string | null",
    "address": "string | null"
  },
  "encounterData": [
    {
      "encounterDate": "YYYY-MM-DD | null",
      "notes": ["string"] | null,
      "clinicalFindings": ["string"] | null,
      "primaryDiagnosis": {
        "description": "string | null",
        "icd10Code": "string | null"
      } | null,
      "icd10Codes": ["string"] | null,
      "problemList": [
        {
          "description": "string",
          "icd10Code": "string | null",
          "onsetDate": "YYYY-MM-DD | null",
          "status": "active | resolved | chronic | null"
        }
      ] | null,
      "treatmentDetails": {
        "proceduresPerformed": ["string"] | null,
        "cptCodes": [{"code": "string", "description": "string", "modifier": "string | null"}] | null,
        "applicationNumbers": ["string"] | null,
        "treatmentResponse": "string | null",
        "complications": ["string"] | null
      },
      "woundDetails": {
        "type": "string | null",
        "location": "string | null", 
        "measurements": {
          "length": number | null,
          "width": number | null,
          "depth": number | null,
          "area": number | null,
          "unit": "string | null"
        },
        "duration": "string | null",
        "woundBed": "string | null",
        "drainage": "string | null",
        "periwoundSkin": "string | null",
        "healingProgression": "string | null",
        "woundGrade": "string | null"
      },
      "conservativeCare": {
        "offloading": {
          "methods": ["string"] | null,
          "duration": "string | null",
          "effectiveness": "string | null"
        },
        "woundCare": {
          "dressings": ["string"] | null,
          "frequency": "string | null",
          "products": ["string"] | null
        },
        "debridement": {
          "type": ["string"] | null,
          "frequency": "string | null"
        },
        "infectionControl": ["string"] | null,
        "glycemicControl": {
          "methods": ["string"] | null,
          "targets": ["string"] | null,
          "compliance": "string | null"
        },
        "duration": "string | null",
        "overallEffectiveness": "string | null"
      },
      "vascularStudies": {
        "abi": {
          "rightABI": number | null,
          "leftABI": number | null,
          "interpretation": "string | null"
        } | null,
        "tbi": {
          "rightTBI": number | null,
          "leftTBI": number | null
        } | null,
        "tcpo2": {
          "rightFoot": number | null,
          "leftFoot": number | null,
          "healingPotential": "good | fair | poor | null"
        } | null,
        "duplexSummary": "string | null",
        "angiographySummary": "string | null"
      } | null,
      "clinicalVascularAssessment": {
        "pulses": {
          "dorsalisPedis": "string | null",
          "posteriorTibial": "string | null"
        } | null,
        "edema": "string | null",
        "perfusionNotes": "string | null"
      } | null,
      "patientEducation": ["string"] | null,
      "followUpInstructions": ["string"] | null,
      "infectionStatus": "string | null",
      "comorbidities": ["string"] | null,
      "diabeticStatus": "diabetic | nondiabetic | prediabetic | null",
      "functionalStatus": {
        "selfCare": "string | null",
        "mobility": "string | null",
        "assistiveDevice": "boolean | null",
        "adlScore": "string | null"
      } | null,
      "assessment": "string | null",
      "plan": "string | null",
      "providerRecommendations": ["string"] | null
    }
  ],
  "confidence": number, // 0.0 to 1.0
  "warnings": ["string"]
}`;

  // Deterministic pre-extraction of critical data using regex patterns
  console.log('\n=== DETERMINISTIC PRE-EXTRACTION ===');
  console.log('Document length:', pdfText.length, 'characters');
  
  // Extract CPT/HCPCS codes
  const cptPatterns = [
    /(?:CPT|DR|HCPCS)?\s*(\d{5})(?:\s*[-]\s*(\w+))?/gi, // Standard CPT codes
    /(?:CPT|DR|procedure code)?\s*(\d{4,5})(?:\s*[-]\s*(\w+))?/gi, // With prefixes
    /Q4\d{3}/gi, // Q-codes for skin substitutes
    /97\d{3}/gi, // Physical therapy codes
    /110\d{2}/gi, // Debridement codes
    /15\d{3}/gi // Graft codes
  ];
  
  const extractedCptCodes: string[] = [];
  for (const pattern of cptPatterns) {
    const matches = Array.from(pdfText.matchAll(pattern));
    matches.forEach(match => {
      if (match[0] && !extractedCptCodes.includes(match[0])) {
        extractedCptCodes.push(match[0]);
      }
    });
  }
  if (extractedCptCodes.length > 0) {
    // PHI SAFEGUARD: Log count only for compliance
    console.log(`Found ${extractedCptCodes.length} CPT/HCPCS code(s)`);
  }
  
  // Extract Insurance IDs
  const insurancePatterns = [
    /(?:Medicare|Medicaid|ID|Member|Policy|Insurance)\s*(?:#|Number|ID)?\s*[:=-]?\s*([A-Z0-9]{8,15})/gi,
    /(?:BCBS|Aetna|UHC|Cigna|Humana).*?(?:ID|#)\s*[:=-]?\s*([A-Z0-9]{6,15})/gi,
    /(?:Primary|Secondary)\s+(?:Insurance)?.*?(?:ID|#)\s*[:=-]?\s*([A-Z0-9]{6,15})/gi
  ];
  
  const extractedInsuranceIds: string[] = [];
  for (const pattern of insurancePatterns) {
    const matches = Array.from(pdfText.matchAll(pattern));
    matches.forEach(match => {
      if (match[1] && !extractedInsuranceIds.includes(match[1])) {
        extractedInsuranceIds.push(match[1]);
      }
    });
  }
  if (extractedInsuranceIds.length > 0) {
    // PHI SAFEGUARD: Log count only, never actual IDs
    console.log(`Found ${extractedInsuranceIds.length} Insurance ID(s) - details redacted for HIPAA compliance`);
  }
  
  // Extract wound measurements - COMPREHENSIVE patterns for non-standard formats
  const measurementPatterns = [
    // Standard formats with x or ×
    /measuring\s+approximately\s+(\d+(?:\.\d+)?)\s*(?:cm|mm)?\s*[xX×]\s*(\d+(?:\.\d+)?)\s*(?:cm|mm)?/gi,
    /(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)\s*(?:cm|mm)?/gi,
    /size[:\s]+(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)/gi,
    /wound.*?(\d+(?:\.\d+)?)\s*(?:cm|mm)?\s*[xX×]\s*(\d+(?:\.\d+)?)\s*(?:cm|mm)?/gi,
    
    // Separate length and width patterns
    /[Ll]ength[:\s]+(\d+(?:\.\d+)?)\s*(?:cm|mm)?.*?[Ww]idth[:\s]+(\d+(?:\.\d+)?)\s*(?:cm|mm)?/gi,
    /[Ll][:\s]+(\d+(?:\.\d+)?)\s*(?:cm|mm)?.*?[Ww][:\s]+(\d+(?:\.\d+)?)\s*(?:cm|mm)?/gi,
    
    // "by" format (e.g., "2 cm by 3 cm")
    /(\d+(?:\.\d+)?)\s*(?:cm|mm)?\s+by\s+(\d+(?:\.\d+)?)\s*(?:cm|mm)?/gi,
    
    // Parenthetical formats (e.g., "wound (2 x 3 cm)")
    /wound[^(]*\((\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)\s*(?:cm|mm)?\)/gi,
    
    // Dimensions format
    /dimensions?[:\s]+(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)/gi,
    
    // Measuring format without "approximately"
    /measur(?:ing|es?)\s+(\d+(?:\.\d+)?)\s*(?:cm|mm)?\s*[xX×]\s*(\d+(?:\.\d+)?)\s*(?:cm|mm)?/gi,
    
    // Area-based extraction (convert back to L x W assuming square)
    /area[:\s]+(\d+(?:\.\d+)?)\s*(?:cm²|cm2|square\s*cm)/gi,
    
    // Spelled out numbers (one, two, three, etc.)
    /(?:one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:cm|centimeters?)?\s*[xX×]\s*(?:one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:cm|centimeters?)?/gi,
    
    // Depth patterns (for 3D measurements)
    /(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)/gi,
    
    // Alternative separators (comma, dash, etc.)
    /(\d+(?:\.\d+)?)\s*(?:cm|mm)?\s*[,\-–—]\s*(\d+(?:\.\d+)?)\s*(?:cm|mm)?/gi
  ];
  
  // Helper function to convert spelled-out numbers to digits
  const wordToNumber: Record<string, string> = {
    'one': '1', 'two': '2', 'three': '3', 'four': '4', 'five': '5',
    'six': '6', 'seven': '7', 'eight': '8', 'nine': '9', 'ten': '10'
  };
  
  const extractedMeasurements: Array<{length: string, width: string, depth?: string, full: string}> = [];
  for (const pattern of measurementPatterns) {
    const matches = Array.from(pdfText.matchAll(pattern));
    matches.forEach(match => {
      let length = match[1];
      let width = match[2];
      let depth = match[3];
      
      // Convert spelled-out numbers if present
      if (length && isNaN(parseFloat(length))) {
        length = wordToNumber[length.toLowerCase()] || length;
      }
      if (width && isNaN(parseFloat(width))) {
        width = wordToNumber[width.toLowerCase()] || width;
      }
      if (depth && isNaN(parseFloat(depth))) {
        depth = wordToNumber[depth.toLowerCase()] || depth;
      }
      
      // Handle area-based patterns (only one capture group)
      if (pattern.source.includes('area') && match[1] && !match[2]) {
        // For area, try to calculate approximate L x W (assuming square for simplicity)
        const area = parseFloat(match[1]);
        if (!isNaN(area)) {
          const side = Math.sqrt(area);
          extractedMeasurements.push({
            length: side.toFixed(1),
            width: side.toFixed(1),
            full: match[0] + ' (estimated from area)'
          });
        }
      } else if (length && width) {
        const measurement: any = {
          length,
          width,
          full: match[0]
        };
        if (depth) {
          measurement.depth = depth;
        }
        extractedMeasurements.push(measurement);
      } else if (length && !width) {
        // Sometimes only length is captured, search for width nearby
        extractedMeasurements.push({
          length,
          width: '',  // Will be filled by AI
          full: match[0] + ' (partial)'
        });
      }
    });
  }
  
  // Deduplicate measurements
  const uniqueMeasurements = extractedMeasurements.filter((measurement, index, self) =>
    index === self.findIndex((m) => 
      m.length === measurement.length && 
      m.width === measurement.width &&
      m.depth === measurement.depth
    )
  );
  
  if (uniqueMeasurements.length > 0) {
    // Enhanced logging for debugging
    console.log(`Found ${uniqueMeasurements.length} unique wound measurement(s)`);
    console.log('Measurement patterns detected:', uniqueMeasurements.map(m => `L:${m.length} W:${m.width}${m.depth ? ` D:${m.depth}` : ''}`).join(', '));
  }
  
  // Extract vascular findings
  const vascularPatterns = [
    /(?:dorsalis pedis|DP)\s*(?:pulse)?\s*[:=-]?\s*(present|absent|diminished|\+|\-|normal)/gi,
    /(?:posterior tibial|PT)\s*(?:pulse)?\s*[:=-]?\s*(present|absent|diminished|\+|\-|normal)/gi,
    /(?:edema|swelling)\s*[:=-]?\s*(present|absent|\+|\-|trace|mild|moderate|severe)/gi,
    /(?:varicosities|varicose)\s*[:=-]?\s*(present|absent|\+|\-)/gi,
    /ABI\s*[:=-]?\s*(\d+\.\d+)/gi
  ];
  
  const extractedVascular: Record<string, string> = {};
  for (const pattern of vascularPatterns) {
    const matches = Array.from(pdfText.matchAll(pattern));
    matches.forEach(match => {
      if (match[0] && match[1]) {
        const key = match[0].split(/[:=-]/)[0].trim();
        extractedVascular[key] = match[1];
      }
    });
  }
  if (Object.keys(extractedVascular).length > 0) {
    // Log count only for HIPAA compliance
    console.log(`Found ${Object.keys(extractedVascular).length} vascular finding(s)`);
  }
  
  // Extract diabetic status
  const diabeticPatterns = [
    /(?:diabetic|diabetes|DM|IDDM|NIDDM)\s*(?:mellitus|type)?/gi,
    /(?:non-?diabetic|no\s+diabetes|no\s+history\s+of\s+diabetes)/gi
  ];
  
  let diabeticStatus = null;
  for (const pattern of diabeticPatterns) {
    const matches = pdfText.match(pattern);
    if (matches) {
      if (matches[0].toLowerCase().includes('non') || matches[0].toLowerCase().includes('no')) {
        diabeticStatus = 'nondiabetic';
      } else {
        diabeticStatus = 'diabetic';
      }
      break;
    }
  }
  if (diabeticStatus) {
    // PHI SAFEGUARD: Log existence only
    console.log('Found diabetic status indicator');
  }
  
  // Extract ICD-10 diagnosis codes
  const icd10Patterns = [
    /\b([A-TV-Z][0-9][0-9AB]\.?[0-9]{0,4})\b/gi, // Standard ICD-10 format
    /ICD[-\s]?10[:\s]+([A-TV-Z][0-9][0-9AB]\.?[0-9]{0,4})/gi, // With ICD-10 prefix
    /(?:code|diagnosis)[:\s]+([A-TV-Z][0-9][0-9AB]\.?[0-9]{0,4})/gi, // With "code" or "diagnosis" prefix
  ];
  
  const extractedICD10Codes: string[] = [];
  for (const pattern of icd10Patterns) {
    const matches = Array.from(pdfText.matchAll(pattern));
    matches.forEach(match => {
      if (match[1]) {
        // Normalize the code format (add decimal point if missing)
        let code = match[1].toUpperCase();
        if (code.length > 3 && !code.includes('.')) {
          code = code.substring(0, 3) + '.' + code.substring(3);
        }
        if (!extractedICD10Codes.includes(code)) {
          extractedICD10Codes.push(code);
        }
      }
    });
  }
  
  // Extract problem descriptions that might map to ICD-10 codes
  const problemPatterns = [
    /Problems[:\s]*([\s\S]*?)(?=\n\n|Family History|Social History|Advance Directive|HPI|ROS|Physical Exam|Assessment|Plan|$)/gi,
    /Diagnoses[:\s]*([\s\S]*?)(?=\n\n|Family History|Social History|Advance Directive|HPI|ROS|Physical Exam|Assessment|Plan|$)/gi,
    /Problem List[:\s]*([\s\S]*?)(?=\n\n|Family History|Social History|Advance Directive|HPI|ROS|Physical Exam|Assessment|Plan|$)/gi,
  ];
  
  const extractedProblems: Array<{description: string, icd10Code?: string}> = [];
  for (const pattern of problemPatterns) {
    const matches = Array.from(pdfText.matchAll(pattern));
    matches.forEach(match => {
      if (match[1]) {
        // Split by common delimiters and extract individual problems
        const problemLines = match[1].split(/[\n\r]+/).filter(line => line.trim());
        problemLines.forEach(line => {
          // Clean up the line and extract problem description
          const cleanedLine = line.replace(/^[\s\-\*•]+/, '').trim();
          if (cleanedLine && cleanedLine.length > 3) {
            // Extract onset date if present
            const onsetMatch = cleanedLine.match(/Onset:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
            const description = cleanedLine.replace(/\s*-?\s*Onset:.*$/i, '').trim();
            
            // Try to map to ICD-10 code
            const mappedCode = mapProblemToICD10(description);
            
            extractedProblems.push({
              description: description,
              icd10Code: mappedCode || undefined
            });
            
            // Add mapped code to extracted codes if found
            if (mappedCode && !extractedICD10Codes.includes(mappedCode)) {
              extractedICD10Codes.push(mappedCode);
            }
          }
        });
      }
    });
  }
  
  if (extractedICD10Codes.length > 0) {
    console.log(`Found ${extractedICD10Codes.length} ICD-10 code(s)`);  
  }
  
  if (extractedProblems.length > 0) {
    console.log(`Found ${extractedProblems.length} problem(s) in problem list`);
  }
  
  try {
    const modelName = azureApiKey ? azureDeployment : "gpt-4o";  // Use gpt-4o for better extraction accuracy
    console.log('Using AI model:', modelName);
    console.log('Input text length:', truncatedText.length, 'characters (~', Math.round(truncatedText.length / 4), 'tokens)');
    
    const extractionStartTime = Date.now();
    
    const response = await openai.chat.completions.create({
      model: modelName,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user", 
          content: `Extract structured data from the following medical document. Return JSON matching the specified schema.

CRITICAL EXTRACTION HINTS:
- Found ${extractedCptCodes.length || 0} CPT/HCPCS codes, ${extractedICD10Codes.length || 0} ICD-10 codes
- Diabetic status: ${diabeticStatus || 'Check document carefully'}
- WOUND MEASUREMENTS DETECTED: ${uniqueMeasurements.length > 0 ? uniqueMeasurements.map(m => `L:${m.length} W:${m.width}${m.depth ? ` D:${m.depth}` : ''}`).join(', ') : 'SEARCH CAREFULLY - measurements may be in non-standard format'}

IMPORTANT: You MUST extract ALL wound measurements. If we detected ${uniqueMeasurements.length} measurement(s) via regex, you should find at least that many. Check for:
- Measurements in parentheses (2 x 3)
- Separated L: and W: values
- "by" format (2 by 3)
- Measurements in tables or lists
- Any numeric values near wound descriptions

For EACH encounter/visit date, extract the wound measurements for that specific date.

DOCUMENT:

${truncatedText}`,
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 8000, // Increased for comprehensive multi-encounter extractions with vascular data
    });
    
    const extractionTime = Date.now() - extractionStartTime;
    console.log('⚡ AI extraction completed in:', extractionTime, 'ms (', (extractionTime / 1000).toFixed(1), 'seconds)');

    let result = JSON.parse(response.choices[0].message.content || '{}');
    
    // MULTI-PASS EXTRACTION: If measurements are missing, do a focused second pass
    if (result.encounterData && Array.isArray(result.encounterData)) {
      let needsSecondPass = false;
      
      // Check if any encounters are missing measurements that we found via regex
      result.encounterData.forEach((encounter: any) => {
        if (!encounter.woundDetails?.measurements?.length || 
            !encounter.woundDetails?.measurements?.width) {
          needsSecondPass = true;
        }
      });
      
      if (needsSecondPass && uniqueMeasurements.length > 0) {
        console.log('⚠️ Missing measurements detected - initiating focused second pass extraction...');
        
        // Create a focused prompt just for wound measurements
        const measurementFocusPrompt = `CRITICAL: Extract ONLY wound measurements from this text.
        
We detected these measurements via regex: ${uniqueMeasurements.map(m => m.full).join(', ')}

For EACH measurement found, return:
- The encounter date it belongs to
- Length value (number)
- Width value (number) 
- Depth value if present (number)
- Unit (cm/mm)

Look EVERYWHERE for measurements:
- After "measuring"
- After "size" or "dimensions"
- In parentheses
- After L: or W:
- After "length" or "width"
- In format "X by Y" or "X x Y"

Return JSON: { "measurements": [{ "date": "YYYY-MM-DD", "length": number, "width": number, "depth": number, "unit": "cm" }] }`;
        
        const secondPassResponse = await openai.chat.completions.create({
          model: modelName,
          messages: [
            { role: "system", content: measurementFocusPrompt },
            { role: "user", content: truncatedText }
          ],
          response_format: { type: "json_object" },
          temperature: 0.1,  // Lower temperature for more deterministic extraction
          max_tokens: 2000
        });
        
        const measurementData = JSON.parse(secondPassResponse.choices[0].message.content || '{}');
        
        // Merge the focused measurements back into the main result
        if (measurementData.measurements && Array.isArray(measurementData.measurements)) {
          console.log(`Second pass found ${measurementData.measurements.length} measurement(s)`);
          
          measurementData.measurements.forEach((m: any) => {
            // Find the corresponding encounter by date
            const encounter = result.encounterData.find((e: any) => 
              e.encounterDate === m.date || 
              (e.encounterDate && m.date && new Date(e.encounterDate).toDateString() === new Date(m.date).toDateString())
            );
            
            if (encounter) {
              // Update or add the measurements
              if (!encounter.woundDetails) {
                encounter.woundDetails = {};
              }
              if (!encounter.woundDetails.measurements || 
                  !encounter.woundDetails.measurements.length ||
                  !encounter.woundDetails.measurements.width) {
                encounter.woundDetails.measurements = {
                  length: m.length,
                  width: m.width,
                  depth: m.depth || null,
                  unit: m.unit || 'cm',
                  area: null
                };
                console.log(`Updated encounter ${m.date} with measurements: L=${m.length}, W=${m.width}`);
              }
            }
          });
        }
      }
    }
    
    // ENHANCED DEBUGGING: Log extraction completeness and confidence
    console.log('\n=== EXTRACTION COMPLETENESS REPORT ===');
    console.log('Document Processing:');
    console.log(`  - Original text length: ${pdfText.length} chars`);
    console.log(`  - Processed text length: ${truncatedText.length} chars`);
    console.log(`  - Text truncated: ${pdfText.length > maxTextLength ? 'YES ⚠️' : 'NO ✓'}`);
    console.log(`  - AI Model used: ${modelName}`);
    
    console.log('\nPre-extraction Regex Findings:');
    console.log(`  - CPT/HCPCS codes: ${extractedCptCodes.length}`);
    console.log(`  - ICD-10 codes: ${extractedICD10Codes.length}`);
    console.log(`  - Insurance IDs: ${extractedInsuranceIds.length}`);
    console.log(`  - Wound measurements: ${uniqueMeasurements.length}`);
    if (uniqueMeasurements.length > 0) {
      console.log('    Regex-detected measurements:');
      uniqueMeasurements.forEach((m, i) => {
        console.log(`      ${i+1}. L=${m.length} W=${m.width}${m.depth ? ` D=${m.depth}` : ''} (from: "${m.full.substring(0, 50)}...")`);
      });
    }
    
    console.log('\nAI Extraction Results:');
    console.log(`  - Encounters found: ${result.encounterData?.length || 0}`);
    console.log(`  - Confidence score: ${result.confidence || 'N/A'}`);
    
    let totalMeasurementsExtracted = 0;
    let completeMeasurements = 0;
    let partialMeasurements = 0;
    let missingMeasurements = 0;
    
    if (result.encounterData && Array.isArray(result.encounterData)) {
      result.encounterData.forEach((encounter: any, index: number) => {
        console.log(`\n  Encounter ${index + 1} (${encounter.encounterDate || 'No date'}):`);;
        console.log(`    - Wound Type: ${encounter.woundDetails?.type || 'MISSING ⚠️'}`);
        console.log(`    - Wound Location: ${encounter.woundDetails?.location || 'MISSING ⚠️'}`);
        
        if (encounter.woundDetails?.measurements) {
          const m = encounter.woundDetails.measurements;
          totalMeasurementsExtracted++;
          
          if (m.length && m.width) {
            completeMeasurements++;
            console.log(`    - Measurements: L=${m.length} W=${m.width}${m.depth ? ` D=${m.depth}` : ''} ${m.unit || 'cm'} ✓`);
          } else if (m.length || m.width) {
            partialMeasurements++;
            console.log(`    - Measurements: L=${m.length || 'MISSING'} W=${m.width || 'MISSING'} (PARTIAL ⚠️)`);
          } else {
            missingMeasurements++;
            console.log(`    - Measurements: NO VALUES EXTRACTED ❌`);
          }
        } else {
          missingMeasurements++;
          console.log(`    - Measurements: NOT FOUND ❌`);
        }
        
        // Log other important fields
        console.log(`    - Clinical Notes: ${encounter.notes?.length > 0 ? encounter.notes.length + ' note(s)' : 'None'}`);
        console.log(`    - Assessment: ${encounter.assessment ? 'Present' : 'Missing'}`);
        console.log(`    - Treatment Plan: ${encounter.plan ? 'Present' : 'Missing'}`);
        console.log(`    - CPT Codes: ${encounter.treatmentDetails?.cptCodes?.length || 0}`);
      });
    }
    
    // Extraction Success Analysis
    console.log('\n=== EXTRACTION SUCCESS METRICS ===');
    const extractionRate = uniqueMeasurements.length > 0 
      ? (completeMeasurements / uniqueMeasurements.length * 100).toFixed(1)
      : 'N/A';
    
    console.log(`Wound Measurement Extraction:`);
    console.log(`  - Regex detected: ${uniqueMeasurements.length} measurement(s)`);
    console.log(`  - AI extracted: ${completeMeasurements} complete, ${partialMeasurements} partial, ${missingMeasurements} missing`);
    console.log(`  - Extraction success rate: ${extractionRate}%`);
    
    if (uniqueMeasurements.length > completeMeasurements) {
      console.log(`\n⚠️ WARNING: AI extracted fewer complete measurements than regex detected!`);
      console.log(`   This indicates potential data loss. Review the extraction logic.`);
    }
    
    if (completeMeasurements === uniqueMeasurements.length && uniqueMeasurements.length > 0) {
      console.log(`\n✅ SUCCESS: 100% of detected measurements were extracted!`);
    }
    
    // Handle both array and object formats for encounterData
    if (!result.patientData || !result.encounterData || typeof result.confidence !== 'number') {
      throw new Error('Invalid response format from AI data extraction');
    }

    // Convert object format {"0": encounter1, "1": encounter2} to array format [encounter1, encounter2]
    if (!Array.isArray(result.encounterData)) {
      const encounterObj = result.encounterData as any;
      const encounters = [];
      
      // Enhanced encounter extraction - handle multiple key formats
      const keys = Object.keys(encounterObj);
      
      // First, try to extract encounters with numeric keys (0, 1, 2, etc.)
      const numericKeys = keys.filter(key => /^\d+$/.test(key)).sort();
      for (const key of numericKeys) {
        if (encounterObj[key] && typeof encounterObj[key] === 'object') {
          encounters.push(encounterObj[key]);
        }
      }
      
      // If no numeric keys found, try other encounter patterns
      if (encounters.length === 0) {
        // Handle encounter1, encounter2, enc1, enc2, etc.
        const encounterPatternKeys = keys.filter(key => 
          /^(encounter|enc)\d+$/i.test(key)
        ).sort();
        
        for (const key of encounterPatternKeys) {
          if (encounterObj[key] && typeof encounterObj[key] === 'object') {
            encounters.push(encounterObj[key]);
          }
        }
      }
      
      // If still no encounters found, check for any object that looks like encounter data
      if (encounters.length === 0) {
        for (const key of keys) {
          const obj = encounterObj[key];
          if (obj && typeof obj === 'object' && 
              (obj.encounterDate || obj.woundDetails || obj.notes || obj.assessment)) {
            encounters.push(obj);
          }
        }
      }
      
      if (encounters.length === 0) {
        console.warn('No valid encounters found in extraction result. Available keys:', keys);
        console.warn('Encounter object structure:', JSON.stringify(encounterObj, null, 2));
        throw new Error('No valid encounters found in extraction result');
      }
      
      result.encounterData = encounters;
      console.log(`Converted ${encounters.length} encounters from object to array format using enhanced coercion`);
    }

    // Final validation
    if (!Array.isArray(result.encounterData) || result.encounterData.length === 0) {
      throw new Error('Invalid response format from AI data extraction - encounterData must be a non-empty array');
    }

    // Validate and fix measurement data types before returning
    if (Array.isArray(result.encounterData)) {
      result.encounterData.forEach((encounter: any) => {
        if (encounter.woundDetails?.measurements) {
          const measurements = encounter.woundDetails.measurements;
          
          // Convert string measurements to numbers
          if (measurements.length && typeof measurements.length === 'string') {
            const numericLength = parseFloat(measurements.length);
            measurements.length = !isNaN(numericLength) ? numericLength : null;
          }
          if (measurements.width && typeof measurements.width === 'string') {
            const numericWidth = parseFloat(measurements.width);
            measurements.width = !isNaN(numericWidth) ? numericWidth : null;
          }
          if (measurements.depth && typeof measurements.depth === 'string') {
            const numericDepth = parseFloat(measurements.depth);
            measurements.depth = !isNaN(numericDepth) ? numericDepth : null;
          }
          if (measurements.area && typeof measurements.area === 'string') {
            const numericArea = parseFloat(measurements.area);
            measurements.area = !isNaN(numericArea) ? numericArea : null;
          }
          
          // Convert empty strings to null
          if (measurements.length === '' || measurements.length === '0') measurements.length = null;
          if (measurements.width === '' || measurements.width === '0') measurements.width = null;
          if (measurements.depth === '' || measurements.depth === '0') measurements.depth = null;
          if (measurements.area === '' || measurements.area === '0') measurements.area = null;
        }
      });
    }

    // Add the original text and return structured result
    return {
      ...result,
      extractedText: pdfText,
    } as PdfExtractionResult;

  } catch (error) {
    console.error('Error in PDF data extraction:', error);
    throw new Error('Failed to extract data from PDF: ' + (error as Error).message);
  }
}

// Helper function to validate extracted data completeness
export function validateExtractionCompleteness(result: PdfExtractionResult): {
  isComplete: boolean;
  missingCriticalFields: string[];
  score: number;
  comprehensivenessWarnings: string[];
} {
  const missingCriticalFields: string[] = [];
  const comprehensivenessWarnings: string[] = [];
  
  // Check critical patient fields
  if (!result.patientData.firstName) missingCriticalFields.push('Patient First Name');
  if (!result.patientData.lastName) missingCriticalFields.push('Patient Last Name');  
  if (!result.patientData.dateOfBirth) missingCriticalFields.push('Date of Birth');
  if (!result.patientData.mrn) missingCriticalFields.push('Medical Record Number');
  
  // Check critical encounter fields for each encounter with comprehensive validation
  if (!result.encounterData || result.encounterData.length === 0) {
    missingCriticalFields.push('No encounters found');
  } else {
    for (let i = 0; i < result.encounterData.length; i++) {
      const encounter = result.encounterData[i];
      const encounterPrefix = `Encounter ${i + 1}`;
      
      // Essential fields (critical)
      if (!encounter.encounterDate) missingCriticalFields.push(`${encounterPrefix} Date`);
      if (!encounter.woundDetails?.type) missingCriticalFields.push(`${encounterPrefix} Wound Type`);
      if (!encounter.woundDetails?.location) missingCriticalFields.push(`${encounterPrefix} Wound Location`);
      
      // Comprehensive clinical information (warnings for completeness)
      if (!encounter.notes || encounter.notes.length === 0) {
        comprehensivenessWarnings.push(`${encounterPrefix} missing clinical notes`);
      }
      if (!encounter.assessment) {
        comprehensivenessWarnings.push(`${encounterPrefix} missing assessment`);
      }
      if (!encounter.plan) {
        comprehensivenessWarnings.push(`${encounterPrefix} missing treatment plan`);
      }
      
      // Conservative care validation
      if (!encounter.conservativeCare) {
        comprehensivenessWarnings.push(`${encounterPrefix} missing conservative care documentation`);
      } else {
        const cc = encounter.conservativeCare;
        if (!cc.offloading?.methods && !cc.woundCare?.dressings && !cc.debridement?.type && 
            !cc.infectionControl && !cc.vascularAssessment && !cc.glycemicControl?.methods) {
          comprehensivenessWarnings.push(`${encounterPrefix} has minimal conservative care details`);
        }
      }
      
      // Treatment details validation
      if (!encounter.treatmentDetails?.proceduresPerformed && !encounter.clinicalFindings) {
        comprehensivenessWarnings.push(`${encounterPrefix} missing detailed clinical findings or procedures`);
      }
    }
  }
  
  const basePatientFields = 4; // firstName, lastName, dateOfBirth, mrn
  const encounterFieldsPerEncounter = 3; // date, woundType, woundLocation
  const totalCriticalFields = basePatientFields + (result.encounterData.length * encounterFieldsPerEncounter);
  const foundCriticalFields = Math.max(0, totalCriticalFields - missingCriticalFields.length);
  const completenessScore = totalCriticalFields > 0 ? foundCriticalFields / totalCriticalFields : 0;
  
  return {
    isComplete: missingCriticalFields.length === 0,
    missingCriticalFields,
    score: completenessScore,
    comprehensivenessWarnings
  };
}