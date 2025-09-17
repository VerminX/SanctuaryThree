import OpenAI from "openai";
import { openAICircuitBreaker } from './apiCircuitBreaker';

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

/**
 * Resilient eligibility analysis with circuit breaker protection
 */
export async function analyzeEligibility(
  request: EligibilityAnalysisRequest, 
  correlationId?: string
): Promise<EligibilityAnalysisResponse> {
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

  // Execute OpenAI call with circuit breaker protection
  const apiCall = async () => {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: systemPrompt,
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 2000
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No content returned from OpenAI API");
    }

    try {
      const result = JSON.parse(content) as EligibilityAnalysisResponse;
      
      // Validate response structure
      if (!result.eligibility || !result.rationale || !Array.isArray(result.citations)) {
        throw new Error("Invalid response format from OpenAI API");
      }
      
      return result;
    } catch (parseError) {
      throw new Error(`Failed to parse OpenAI response: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
    }
  };

  // Use circuit breaker to execute the API call
  return await openAICircuitBreaker.execute(
    apiCall,
    'analyzeEligibility',
    correlationId
  );
}

/**
 * Resilient letter content generation with circuit breaker protection
 */
export async function generateLetterContent(
  eligibilityResult: EligibilityAnalysisResponse,
  patientInfo: any,
  correlationId?: string
): Promise<string> {
  const apiCall = async () => {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a medical documentation specialist. Generate a professional pre-determination letter based on the eligibility analysis provided.
          
Format: Standard business letter format
Tone: Professional, clinical, evidence-based
Length: 300-500 words

Patient Information:
${JSON.stringify(patientInfo, null, 2)}

Eligibility Analysis:
${JSON.stringify(eligibilityResult, null, 2)}

Create a comprehensive letter that includes:
1. Patient identification and clinical summary
2. Requested treatment rationale
3. Supporting documentation and citations
4. Clear eligibility determination
5. Next steps if applicable`
        }
      ],
      temperature: 0.2,
      max_tokens: 1000
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No content returned from OpenAI API for letter generation");
    }

    return content;
  };

  // Use circuit breaker to execute the API call
  return await openAICircuitBreaker.execute(
    apiCall,
    'generateLetterContent',
    correlationId
  );
}