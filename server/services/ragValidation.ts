import { storage } from '../storage';
import { buildRAGContext } from './ragService';
import { analyzeEligibility } from './openai';
import { PolicySource } from '@shared/schema';

// Test data structures
interface ValidationTestCase {
  id: string;
  name: string;
  description: string;
  macRegion: string;
  woundType: string;
  expectedPolicyCount?: number;
  expectedKeywords?: string[];
}

interface PolicyRetrievalResult {
  testCase: ValidationTestCase;
  success: boolean;
  policies: PolicySource[];
  relevantPoliciesFound: number;
  totalPoliciesChecked: number;
  citations: Array<{
    title: string;
    url: string;
    lcdId: string;
    effectiveDate: string;
    mac: string;
  }>;
  keywordMatches: string[];
  errors?: string[];
}

interface AIAnalysisResult {
  testCase: ValidationTestCase;
  success: boolean;
  response?: {
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
  };
  contextLength: number;
  responseTime: number;
  errors?: string[];
}

interface CitationValidationResult {
  testCase: ValidationTestCase;
  success: boolean;
  ragCitations: number;
  aiCitations: number;
  matchingCitations: number;
  validUrls: number;
  invalidUrls: string[];
  citationAccuracy: number;
  errors?: string[];
}

// Test cases based on real MAC regions and wound types
const RAG_TEST_CASES: ValidationTestCase[] = [
  {
    id: "noridian-dfu",
    name: "Noridian J-E Diabetic Foot Ulcer",
    description: "Test policy retrieval for diabetic foot ulcers in Noridian MAC J-E region",
    macRegion: "Noridian Healthcare Solutions (MAC J-E)",
    woundType: "diabetic foot ulcer",
    expectedKeywords: ["skin substitute", "ctp", "diabetic foot", "wound"]
  },
  {
    id: "cgs-vlu",
    name: "CGS J-H Venous Leg Ulcer", 
    description: "Test policy retrieval for venous leg ulcers in CGS MAC J-H region",
    macRegion: "CGS Administrators (MAC J-H)",
    woundType: "venous leg ulcer",
    expectedKeywords: ["cellular", "tissue", "wound", "ulcer"]
  },
  {
    id: "novitas-pressure",
    name: "Novitas J-L Pressure Ulcer",
    description: "Test policy retrieval for pressure ulcers in Novitas MAC J-L region",
    macRegion: "Novitas Solutions (MAC J-L)",
    woundType: "pressure ulcer",
    expectedKeywords: ["skin substitute", "wound", "debridement"]
  }
];

// Sample encounter data for AI analysis testing
const SAMPLE_ENCOUNTER_DATA = {
  encounterNotes: [
    "Patient presents with a 3x2cm diabetic foot ulcer on the plantar aspect of the right first toe.",
    "Wound has been present for 8 weeks with minimal healing despite standard wound care.",
    "Patient has failed conservative treatments including offloading, wound dressings, and debridement.",
    "HbA1c: 7.2%, adequate glycemic control. No signs of infection."
  ],
  woundDetails: {
    location: "Right first toe, plantar aspect",
    size: "3x2cm",
    depth: "Full thickness",
    duration: "8 weeks",
    woundType: "diabetic foot ulcer"
  },
  conservativeCare: {
    offloading: true,
    moistWoundTherapy: true,
    debridement: true,
    durationWeeks: 8,
    failedTreatments: ["standard dressings", "sharp debridement", "offloading boot"]
  },
  patientInfo: {
    payerType: "Medicare",
    macRegion: "Noridian Healthcare Solutions (MAC J-E)"
  }
};

/**
 * Validate policy retrieval accuracy with real CMS data
 */
export async function validatePolicyRetrieval(): Promise<PolicyRetrievalResult[]> {
  const results: PolicyRetrievalResult[] = [];

  for (const testCase of RAG_TEST_CASES) {
    console.log(`Testing policy retrieval for: ${testCase.name}`);
    
    try {
      // Build RAG context using the actual service
      const ragContext = await buildRAGContext(testCase.macRegion, testCase.woundType);
      
      // Get all policies for this MAC region to compare
      const allPolicies = await storage.getCurrentAndFuturePoliciesByMAC(testCase.macRegion, 90);
      
      // Check for expected keyword matches in content
      const keywordMatches: string[] = [];
      if (testCase.expectedKeywords) {
        for (const keyword of testCase.expectedKeywords) {
          if (ragContext.content.toLowerCase().includes(keyword.toLowerCase())) {
            keywordMatches.push(keyword);
          }
        }
      }

      const result: PolicyRetrievalResult = {
        testCase,
        success: ragContext.citations.length > 0 && ragContext.content.length > 0,
        policies: allPolicies,
        relevantPoliciesFound: ragContext.citations.length,
        totalPoliciesChecked: allPolicies.length,
        citations: ragContext.citations,
        keywordMatches,
        errors: ragContext.content.includes('Error retrieving') ? [ragContext.content] : undefined
      };

      results.push(result);
      console.log(`✓ Completed test: ${testCase.name} - Found ${result.relevantPoliciesFound} relevant policies`);

    } catch (error) {
      const result: PolicyRetrievalResult = {
        testCase,
        success: false,
        policies: [],
        relevantPoliciesFound: 0,
        totalPoliciesChecked: 0,
        citations: [],
        keywordMatches: [],
        errors: [(error as Error).message]
      };
      results.push(result);
      console.error(`✗ Failed test: ${testCase.name} - ${(error as Error).message}`);
    }
  }

  return results;
}

/**
 * Validate AI analysis accuracy and consistency
 */
export async function validateAIAnalysis(): Promise<AIAnalysisResult[]> {
  const results: AIAnalysisResult[] = [];

  for (const testCase of RAG_TEST_CASES) {
    console.log(`Testing AI analysis for: ${testCase.name}`);
    
    try {
      const startTime = Date.now();
      
      // Build policy context
      const ragContext = await buildRAGContext(testCase.macRegion, testCase.woundType);
      
      // Prepare request with test case specific patient info
      const analysisRequest = {
        ...SAMPLE_ENCOUNTER_DATA,
        patientInfo: {
          ...SAMPLE_ENCOUNTER_DATA.patientInfo,
          macRegion: testCase.macRegion
        },
        policyContext: ragContext.content
      };

      // Analyze eligibility
      const analysisResponse = await analyzeEligibility(analysisRequest);
      
      const responseTime = Date.now() - startTime;

      const result: AIAnalysisResult = {
        testCase,
        success: true,
        response: analysisResponse,
        contextLength: ragContext.content.length,
        responseTime,
        errors: undefined
      };

      results.push(result);
      console.log(`✓ Completed AI analysis: ${testCase.name} - Eligibility: ${analysisResponse.eligibility}`);

    } catch (error) {
      const result: AIAnalysisResult = {
        testCase,
        success: false,
        contextLength: 0,
        responseTime: 0,
        errors: [(error as Error).message]
      };
      results.push(result);
      console.error(`✗ Failed AI analysis: ${testCase.name} - ${(error as Error).message}`);
    }
  }

  return results;
}

/**
 * Validate citation accuracy and consistency between RAG and AI
 */
export async function validateCitationGeneration(): Promise<CitationValidationResult[]> {
  const results: CitationValidationResult[] = [];

  for (const testCase of RAG_TEST_CASES) {
    console.log(`Testing citation validation for: ${testCase.name}`);
    
    try {
      // Build RAG context
      const ragContext = await buildRAGContext(testCase.macRegion, testCase.woundType);
      
      // Prepare and run AI analysis
      const analysisRequest = {
        ...SAMPLE_ENCOUNTER_DATA,
        patientInfo: {
          ...SAMPLE_ENCOUNTER_DATA.patientInfo,
          macRegion: testCase.macRegion
        },
        policyContext: ragContext.content
      };

      const analysisResponse = await analyzeEligibility(analysisRequest);

      // Validate citations
      const ragCitations = ragContext.citations.length;
      const aiCitations = analysisResponse.citations.length;
      
      // Check for matching citations (by title or LCD ID)
      let matchingCitations = 0;
      const ragCitationTitles = ragContext.citations.map(c => c.title.toLowerCase());
      const ragCitationIds = ragContext.citations.map(c => c.lcdId);
      
      for (const aiCitation of analysisResponse.citations) {
        const titleMatch = ragCitationTitles.some(title => 
          title.includes(aiCitation.title.toLowerCase()) || 
          aiCitation.title.toLowerCase().includes(title)
        );
        const idMatch = ragCitationIds.some(id => aiCitation.title.includes(id));
        
        if (titleMatch || idMatch) {
          matchingCitations++;
        }
      }

      // Validate URL formats
      let validUrls = 0;
      const invalidUrls: string[] = [];
      
      for (const citation of ragContext.citations) {
        if (citation.url.startsWith('http') && citation.url.includes('cms.gov')) {
          validUrls++;
        } else {
          invalidUrls.push(citation.url);
        }
      }

      const citationAccuracy = ragCitations > 0 ? (matchingCitations / Math.max(ragCitations, aiCitations)) * 100 : 0;

      const result: CitationValidationResult = {
        testCase,
        success: ragCitations > 0 && aiCitations > 0 && citationAccuracy > 50,
        ragCitations,
        aiCitations,
        matchingCitations,
        validUrls,
        invalidUrls,
        citationAccuracy,
        errors: undefined
      };

      results.push(result);
      console.log(`✓ Completed citation validation: ${testCase.name} - Accuracy: ${citationAccuracy.toFixed(1)}%`);

    } catch (error) {
      const result: CitationValidationResult = {
        testCase,
        success: false,
        ragCitations: 0,
        aiCitations: 0,
        matchingCitations: 0,
        validUrls: 0,
        invalidUrls: [],
        citationAccuracy: 0,
        errors: [(error as Error).message]
      };
      results.push(result);
      console.error(`✗ Failed citation validation: ${testCase.name} - ${(error as Error).message}`);
    }
  }

  return results;
}

/**
 * Run comprehensive RAG system validation
 */
export async function runComprehensiveValidation() {
  console.log('🚀 Starting comprehensive RAG system validation...');
  
  const startTime = Date.now();
  
  // Run all validation tests
  const [policyResults, aiResults, citationResults] = await Promise.all([
    validatePolicyRetrieval(),
    validateAIAnalysis(),
    validateCitationGeneration()
  ]);

  const totalTime = Date.now() - startTime;

  // Calculate summary statistics
  const policySuccessRate = (policyResults.filter(r => r.success).length / policyResults.length) * 100;
  const aiSuccessRate = (aiResults.filter(r => r.success).length / aiResults.length) * 100;
  const citationSuccessRate = (citationResults.filter(r => r.success).length / citationResults.length) * 100;

  const averageResponseTime = aiResults.reduce((sum, r) => sum + r.responseTime, 0) / aiResults.length;
  const averageCitationAccuracy = citationResults.reduce((sum, r) => sum + r.citationAccuracy, 0) / citationResults.length;

  const summary = {
    testExecuted: new Date().toISOString(),
    totalExecutionTime: totalTime,
    testResults: {
      policyRetrieval: {
        totalTests: policyResults.length,
        successfulTests: policyResults.filter(r => r.success).length,
        successRate: policySuccessRate,
        totalPoliciesFound: policyResults.reduce((sum, r) => sum + r.relevantPoliciesFound, 0),
        results: policyResults
      },
      aiAnalysis: {
        totalTests: aiResults.length,
        successfulTests: aiResults.filter(r => r.success).length,
        successRate: aiSuccessRate,
        averageResponseTime,
        results: aiResults
      },
      citationValidation: {
        totalTests: citationResults.length,
        successfulTests: citationResults.filter(r => r.success).length,
        successRate: citationSuccessRate,
        averageCitationAccuracy,
        results: citationResults
      }
    },
    overallHealth: {
      systemOperational: policySuccessRate > 80 && aiSuccessRate > 80 && citationSuccessRate > 60,
      recommendations: generateRecommendations(policyResults, aiResults, citationResults)
    }
  };

  console.log('✅ RAG system validation completed');
  console.log(`📊 Policy Retrieval Success Rate: ${policySuccessRate.toFixed(1)}%`);
  console.log(`🤖 AI Analysis Success Rate: ${aiSuccessRate.toFixed(1)}%`);
  console.log(`📖 Citation Accuracy: ${averageCitationAccuracy.toFixed(1)}%`);
  console.log(`⏱️  Total Execution Time: ${totalTime}ms`);

  return summary;
}

/**
 * Generate recommendations based on validation results
 */
function generateRecommendations(
  policyResults: PolicyRetrievalResult[],
  aiResults: AIAnalysisResult[],
  citationResults: CitationValidationResult[]
): string[] {
  const recommendations: string[] = [];

  // Policy retrieval recommendations
  const failedPolicyTests = policyResults.filter(r => !r.success);
  if (failedPolicyTests.length > 0) {
    recommendations.push(`Policy retrieval failed for ${failedPolicyTests.length} test cases. Check CMS API connectivity and policy database sync.`);
  }

  // AI analysis recommendations
  const failedAITests = aiResults.filter(r => !r.success);
  if (failedAITests.length > 0) {
    recommendations.push(`AI analysis failed for ${failedAITests.length} test cases. Verify OpenAI API key and model availability.`);
  }

  // Citation accuracy recommendations
  const lowAccuracyCitations = citationResults.filter(r => r.citationAccuracy < 70);
  if (lowAccuracyCitations.length > 0) {
    recommendations.push(`Citation accuracy below 70% for ${lowAccuracyCitations.length} test cases. Review citation extraction logic.`);
  }

  // Performance recommendations
  const slowAITests = aiResults.filter(r => r.responseTime > 10000);
  if (slowAITests.length > 0) {
    recommendations.push(`AI analysis response time exceeds 10 seconds for ${slowAITests.length} test cases. Consider optimizing context size or model selection.`);
  }

  if (recommendations.length === 0) {
    recommendations.push('All RAG system components are operating within expected parameters.');
  }

  return recommendations;
}