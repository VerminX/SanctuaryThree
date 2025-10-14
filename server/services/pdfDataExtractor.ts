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
  const azureDeployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o-mini';
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
  
  // HIPAA SAFEGUARD: Increase limit for comprehensive extraction while preventing context overflow
  const maxTextLength = 60000; // ~15000 tokens at 4 chars/token average - sufficient for comprehensive multi-encounter docs
  const truncatedText = pdfText.length > maxTextLength 
    ? pdfText.substring(0, maxTextLength) + '\n\n[TEXT TRUNCATED FOR PROCESSING - INCREASE LIMIT IF NEEDED]'
    : pdfText;
  
  // ⚡ PERFORMANCE OPTIMIZATIONS (targeting 30-60% speed improvement):
  // 1. Simplified system prompt - concise focused instructions vs verbose rules
  // 2. Reduced JSON schema from 336 to ~140 lines - kept critical vascular measurements (ABI/TBI/TcPO2) but simplified complex nested structures
  // 3. Streamlined user message - quick hints vs redundant pre-extracted data lists
  // 4. Using gpt-4o-mini for speed (consider gpt-4o for very complex docs if needed)
  // Note: Temperature kept at 0.1-0.3 range for medical data consistency
  // OPTIMIZED: Use focused, simplified prompt for faster extraction
  const systemPrompt = `You are a medical document data extraction specialist. Extract structured patient and encounter data efficiently and accurately.

CORE TASK: Identify all encounters (different visit dates) and extract key clinical data for each.

CRITICAL FIELDS (extract these first):
1. PATIENT INFO: Name, DOB, MRN, insurance (primary & secondary with IDs)
2. ENCOUNTER BASICS: Date, wound type/location, primary diagnosis with ICD-10 code
3. WOUND MEASUREMENTS: Length × width × depth (convert to numbers, e.g., "2×3 cm" → length: 2, width: 3, unit: "cm")
4. TREATMENTS: Procedures performed, CPT/HCPCS codes, application numbers

ADDITIONAL FIELDS (if clearly documented):
- Clinical notes, assessment, treatment plan
- Conservative care details (offloading, wound care, debridement) with durations
- VASCULAR DATA:
  * Use "vascularStudies" for formal test results: ABI (rightABI/leftABI as numbers), TBI (rightTBI/leftTBI as numbers), TcPO2 (rightFoot/leftFoot as numbers), duplex/angiography summaries
  * Use "clinicalVascularAssessment" for exam findings: pulse exam (dorsalisPedis/posteriorTibial), edema, perfusion notes
- ICD-10 codes and problem list
- Diabetic status (diabetic/nondiabetic/prediabetic)

EFFICIENCY RULES:
- Extract complete data but avoid redundant processing
- Use null for truly missing data (don't infer)
- Dates in YYYY-MM-DD format
- Measurements as numbers (not strings)
- Focus on documented facts, not interpretations

ENCOUNTER DETECTION:
- Look for date patterns, visit numbers, "follow-up", chronological progressions
- Separate encounters by distinct dates/visits

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
  
  // Extract wound measurements
  const measurementPatterns = [
    /measuring\s+approximately\s+(\d+(?:\.\d+)?)\s*(?:cm|mm)?\s*[xX×]\s*(\d+(?:\.\d+)?)\s*(?:cm|mm)?/gi,
    /(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)\s*(?:cm|mm)?/gi,
    /size[:\s]+(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)/gi,
    /wound.*?(\d+(?:\.\d+)?)\s*(?:cm|mm)?\s*[xX×]\s*(\d+(?:\.\d+)?)\s*(?:cm|mm)?/gi
  ];
  
  const extractedMeasurements: Array<{length: string, width: string, full: string}> = [];
  for (const pattern of measurementPatterns) {
    const matches = Array.from(pdfText.matchAll(pattern));
    matches.forEach(match => {
      if (match[1] && match[2]) {
        extractedMeasurements.push({
          length: match[1],
          width: match[2],
          full: match[0]
        });
      }
    });
  }
  if (extractedMeasurements.length > 0) {
    // Log count only, not actual measurements
    console.log(`Found ${extractedMeasurements.length} wound measurement(s)`);
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
    const modelName = azureApiKey ? azureDeployment : "gpt-4o-mini";
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

QUICK HINTS:
- Found ${extractedCptCodes.length || 0} CPT/HCPCS codes, ${extractedICD10Codes.length || 0} ICD-10 codes
- Diabetic status detected: ${diabeticStatus || 'Check document'}
- Convert measurements to numbers (e.g., "2×3 cm" → length: 2, width: 3)
- Include both primary and secondary insurance if present

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

    const result = JSON.parse(response.choices[0].message.content || '{}');
    
    // DEBUGGING: Log what the AI extracted
    console.log('\n=== AI EXTRACTION RESULT ===');
    console.log('Number of encounters extracted:', result.encounterData?.length || 0);
    
    if (result.encounterData && Array.isArray(result.encounterData)) {
      result.encounterData.forEach((encounter: any, index: number) => {
        console.log(`\nEncounter ${index + 1}:`);
        console.log('  Date:', encounter.encounterDate);
        console.log('  Wound Details:', JSON.stringify(encounter.woundDetails, null, 2));
        
        // VASCULAR DATA DEBUGGING
        console.log('\n  VASCULAR DATA EXTRACTION CHECK:');
        console.log('    vascularStudies exists?', !!encounter.vascularStudies);
        if (encounter.vascularStudies) {
          console.log('    vascularStudies.abi:', encounter.vascularStudies.abi);
          console.log('    vascularStudies.tbi:', encounter.vascularStudies.tbi);
          console.log('    vascularStudies.tcpo2:', encounter.vascularStudies.tcpo2);
        }
        console.log('    clinicalVascularAssessment exists?', !!encounter.clinicalVascularAssessment);
        if (encounter.clinicalVascularAssessment) {
          console.log('    clinicalVascularAssessment.pulses:', encounter.clinicalVascularAssessment.pulses);
        }
        console.log('    conservativeCare.vascularAssessment exists?', !!encounter.conservativeCare?.vascularAssessment);
        if (encounter.conservativeCare?.vascularAssessment) {
          console.log('    conservativeCare.vascularAssessment:', encounter.conservativeCare.vascularAssessment);
        }
        
        if (encounter.woundDetails?.measurements) {
          const m = encounter.woundDetails.measurements;
          console.log('\n  Measurement Types:');
          console.log('    - length:', typeof m.length, 'value:', m.length);
          console.log('    - width:', typeof m.width, 'value:', m.width);
          console.log('    - depth:', typeof m.depth, 'value:', m.depth);
        }
      });
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