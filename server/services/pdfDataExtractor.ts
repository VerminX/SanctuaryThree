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
    vascularAssessment?: {  // Structured vascular findings for comprehensive assessment
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
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  
  // HIPAA SAFEGUARD: Increase limit for comprehensive extraction while preventing context overflow
  const maxTextLength = 60000; // ~15000 tokens at 4 chars/token average - sufficient for comprehensive multi-encounter docs
  const truncatedText = pdfText.length > maxTextLength 
    ? pdfText.substring(0, maxTextLength) + '\n\n[TEXT TRUNCATED FOR PROCESSING - INCREASE LIMIT IF NEEDED]'
    : pdfText;
  const systemPrompt = `You are a comprehensive medical document data extraction specialist. Extract ALL structured patient and encounter data with maximum completeness and clinical accuracy.

CRITICAL: If the document contains MULTIPLE ENCOUNTERS/VISITS (different dates), extract them as separate encounter objects in an array. Analyze the ENTIRE document to identify all encounters.

COMPLETENESS MANDATE:
- Extract ALL clinical information, notes, assessments, plans, and wound details for each encounter
- Capture comprehensive wound progression, treatment details, and patient responses
- Include ALL conservative care attempts, durations, and effectiveness details
- Extract specific treatment numbers (e.g., "graft application #1", "visit #3")
- Document complete assessment and plan information for each encounter
- Capture patient education, dietary changes, and lifestyle modifications
- Include detailed wound measurements, drainage descriptions, and healing progression
- Extract provider recommendations, follow-up instructions, and treatment modifications

ENCOUNTER IDENTIFICATION:
- Look for date patterns, visit numbers, follow-up references, or chronological treatment progressions
- Each distinct clinical encounter should have comprehensive notes, assessment, and plan
- If HPI contains multiple time references or treatment sequences, separate them appropriately

Instructions:
- Prioritize COMPLETENESS over brevity - capture all relevant clinical information
- For dates, use YYYY-MM-DD format or best approximation from document context
- Extract numeric measurements precisely with units when available
- Group conservative care by category with specific details and timeframes
- Include direct quotes from clinical notes when they provide important context

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
        "vascularAssessment": {
          "dorsalisPedis": "string | null",
          "posteriorTibial": "string | null",
          "capillaryRefill": "string | null",
          "edema": "boolean | null",
          "varicosities": "boolean | null",
          "ankleArmIndex": "number | null"
        } | null,
        "glycemicControl": {
          "methods": ["string"] | null,
          "targets": ["string"] | null,
          "compliance": "string | null"
        },
        "duration": "string | null",
        "overallEffectiveness": "string | null"
      },
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
  
  try {
    const modelName = azureApiKey ? azureDeployment : "gpt-4o-mini";
    console.log('Using AI model:', modelName);
    
    const response = await openai.chat.completions.create({
      model: modelName,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user", 
          content: `Extract ALL structured data from this medical document with maximum completeness. Analyze the ENTIRE document and capture every clinical detail, wound progression note, treatment response, conservative care attempt, and provider recommendation for each encounter.

PRE-EXTRACTED CRITICAL DATA (verify and incorporate):
- CPT/HCPCS Codes Found: ${extractedCptCodes.join(', ') || 'None found via regex'}
- Insurance IDs Found: ${extractedInsuranceIds.join(', ') || 'None found via regex'}
- Wound Measurements Found: ${extractedMeasurements.map(m => m.full).join(', ') || 'None found via regex'}
- Vascular Findings: ${JSON.stringify(extractedVascular) || 'None found via regex'}
- Diabetic Status: ${diabeticStatus || 'Not found via regex'}

CRITICAL EXTRACTION RULES:
1. MEASUREMENTS - Convert to NUMERIC values:
   - Parse "1×1 cm" as length: 1, width: 1, unit: "cm"
   - Common formats: "2×3", "1.5 x 2.0", "measuring approximately X cm x Y cm"
   - Ensure numeric fields or null - NEVER strings

2. INSURANCE - Extract ALL payers:
   - Primary: Medicare, Medicare Advantage, etc. with insurance ID
   - Secondary: BCBS, Aetna, UHC, etc. with insurance ID
   - Look for patterns like "Medicare-TN", "BCBS-TN - FEP"

3. CPT/HCPCS CODES - Extract procedure codes:
   - Look for patterns: "11042", "DR 11042", "CPT 97597", "Q4xxx"
   - Include modifiers if present (e.g., "-59", "-RT")
   - Capture procedure descriptions

4. VASCULAR ASSESSMENT - Extract specific findings:
   - Pulses: dorsalis pedis, posterior tibial (diminished/present/absent)
   - Capillary refill time
   - Presence of edema or varicosities
   - ABI values if mentioned

5. FUNCTIONAL/MOBILITY STATUS:
   - Self-care abilities
   - Mobility level (ambulatory, limited, wheelchair-bound)
   - Use of assistive devices
   - ADL scores if present

6. DIABETIC STATUS - Explicitly identify:
   - "diabetic", "nondiabetic", "prediabetic"
   - Look for mentions of DM, IDDM, NIDDM, or "no history of diabetes"

SPECIFIC REQUIREMENTS:
- Extract COMPLETE clinical notes, assessments, and plans for each encounter date
- Capture ALL wound measurements, healing progression details, and treatment responses
- Include ALL conservative care attempts with SPECIFIC DURATIONS (e.g., "4 weeks", "3 months")
- Document ALL provider recommendations, patient education, and follow-up instructions
- Extract CPT/HCPCS codes with descriptions and modifiers
- Include ALL comorbidities mentioned and their management
- Capture vascular exam findings in structured format
- Document mobility/functional status and ADL limitations
- Identify diabetic status explicitly (diabetic/nondiabetic/prediabetic)
- Extract both PRIMARY and SECONDARY insurance information

Document text to analyze:

${truncatedText}`,
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.1, // Low temperature for consistency
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    
    // DEBUGGING: Log what the AI extracted
    console.log('\n=== AI EXTRACTION RESULT ===');
    console.log('Number of encounters extracted:', result.encounterData?.length || 0);
    
    if (result.encounterData && Array.isArray(result.encounterData)) {
      result.encounterData.forEach((encounter: any, index: number) => {
        console.log(`\nEncounter ${index + 1}:`);
        console.log('  Date:', encounter.encounterDate);
        console.log('  Wound Details:', JSON.stringify(encounter.woundDetails, null, 2));
        if (encounter.woundDetails?.measurements) {
          const m = encounter.woundDetails.measurements;
          console.log('  Measurement Types:');
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