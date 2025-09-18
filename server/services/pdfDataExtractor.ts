// Dynamic import will be used in the function to avoid startup dependency

export interface ExtractedPatientData {
  // Patient demographic information
  mrn?: string;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string; // YYYY-MM-DD format
  payerType?: string; // Original Medicare, Medicare Advantage, Commercial, etc.
  planName?: string;
  macRegion?: string;
  
  // Additional patient info
  phoneNumber?: string;
  address?: string;
  insuranceId?: string;
}

export interface ExtractedEncounterData {
  // Encounter basic info
  encounterDate?: string; // YYYY-MM-DD format
  notes?: string[];
  
  // Wound details
  woundDetails?: {
    type?: string; // DFU, VLU, etc.
    location?: string;
    measurements?: {
      length?: number;
      width?: number;
      depth?: number;
      area?: number;
    };
    duration?: string; // How long wound has existed
    woundBed?: string;
    drainage?: string;
    periwoundSkin?: string;
  };
  
  // Conservative care documentation
  conservativeCare?: {
    offloading?: string[];
    woundCare?: string[];
    debridement?: string[];
    infectionControl?: string[];
    vascularAssessment?: string[];
    glycemicControl?: string[];
    duration?: string; // How long conservative care attempted
  };
  
  // Clinical status
  infectionStatus?: string;
  comorbidities?: string[];
  
  // Assessment and plan
  assessment?: string;
  plan?: string;
}

export interface PdfExtractionResult {
  patientData: ExtractedPatientData;
  encounterData: ExtractedEncounterData;
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
  
  // HIPAA SAFEGUARD: Limit text size to prevent context overflow and reduce PHI exposure
  const maxTextLength = 15000; // ~3000 tokens at 4 chars/token average
  const truncatedText = pdfText.length > maxTextLength 
    ? pdfText.substring(0, maxTextLength) + '\n\n[TEXT TRUNCATED FOR PROCESSING]'
    : pdfText;
  const systemPrompt = `You are a medical document data extraction specialist. Extract structured patient and encounter data from medical documents.

Instructions:
- Extract ONLY data that is explicitly stated in the document
- Use null/undefined for missing fields rather than making assumptions
- Provide a confidence score (0-1) based on data completeness and clarity
- Include warnings for any missing critical information
- For dates, use YYYY-MM-DD format
- For measurements, extract numeric values where possible
- Group related conservative care items appropriately

Return JSON in this exact format:
{
  "patientData": {
    "mrn": "string | null",
    "firstName": "string | null", 
    "lastName": "string | null",
    "dateOfBirth": "YYYY-MM-DD | null",
    "payerType": "string | null",
    "planName": "string | null", 
    "macRegion": "string | null",
    "phoneNumber": "string | null",
    "address": "string | null",
    "insuranceId": "string | null"
  },
  "encounterData": {
    "encounterDate": "YYYY-MM-DD | null",
    "notes": ["string"] | null,
    "woundDetails": {
      "type": "string | null",
      "location": "string | null", 
      "measurements": {
        "length": number | null,
        "width": number | null,
        "depth": number | null,
        "area": number | null
      },
      "duration": "string | null",
      "woundBed": "string | null",
      "drainage": "string | null",
      "periwoundSkin": "string | null"
    },
    "conservativeCare": {
      "offloading": ["string"] | null,
      "woundCare": ["string"] | null,
      "debridement": ["string"] | null,
      "infectionControl": ["string"] | null,
      "vascularAssessment": ["string"] | null,
      "glycemicControl": ["string"] | null,
      "duration": "string | null"
    },
    "infectionStatus": "string | null",
    "comorbidities": ["string"] | null,
    "assessment": "string | null",
    "plan": "string | null"
  },
  "confidence": number, // 0.0 to 1.0
  "warnings": ["string"]
}`;

  try {
    const modelName = azureApiKey ? azureDeployment : "gpt-4o-mini";
    const response = await openai.chat.completions.create({
      model: modelName,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user", 
          content: `Extract structured data from this medical document:\n\n${truncatedText}`,
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.1, // Low temperature for consistency
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    
    // Validate the response structure
    if (!result.patientData || !result.encounterData || typeof result.confidence !== 'number') {
      throw new Error('Invalid response format from AI data extraction');
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
} {
  const missingCriticalFields: string[] = [];
  
  // Check critical patient fields
  if (!result.patientData.firstName) missingCriticalFields.push('Patient First Name');
  if (!result.patientData.lastName) missingCriticalFields.push('Patient Last Name');  
  if (!result.patientData.dateOfBirth) missingCriticalFields.push('Date of Birth');
  if (!result.patientData.mrn) missingCriticalFields.push('Medical Record Number');
  
  // Check critical encounter fields
  if (!result.encounterData.encounterDate) missingCriticalFields.push('Encounter Date');
  if (!result.encounterData.woundDetails?.type) missingCriticalFields.push('Wound Type');
  if (!result.encounterData.woundDetails?.location) missingCriticalFields.push('Wound Location');
  
  const totalCriticalFields = 7;
  const foundCriticalFields = totalCriticalFields - missingCriticalFields.length;
  const completenessScore = foundCriticalFields / totalCriticalFields;
  
  return {
    isComplete: missingCriticalFields.length === 0,
    missingCriticalFields,
    score: completenessScore
  };
}