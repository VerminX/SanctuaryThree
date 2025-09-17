// Test script for RAG validation system
import { validatePolicyRetrieval, validateAIAnalysis, validateCitationGeneration } from './services/ragValidation.js';

console.log('🚀 Starting RAG System Validation Test...\n');

async function runTests() {
  try {
    // Test Policy Retrieval
    console.log('📊 Testing Policy Retrieval...');
    const policyResults = await validatePolicyRetrieval();
    console.log(`✅ Policy Retrieval Test Complete: ${policyResults.length} test cases`);
    
    policyResults.forEach((result, idx) => {
      const status = result.success ? '✅' : '❌';
      console.log(`  ${status} ${result.testCase.name}: Found ${result.relevantPoliciesFound} policies`);
      if (result.errors) {
        console.log(`    Error: ${result.errors[0]}`);
      }
    });

    console.log('\n🤖 Testing AI Analysis...');
    const aiResults = await validateAIAnalysis();
    console.log(`✅ AI Analysis Test Complete: ${aiResults.length} test cases`);
    
    aiResults.forEach((result, idx) => {
      const status = result.success ? '✅' : '❌';
      console.log(`  ${status} ${result.testCase.name}: ${result.success ? result.response?.eligibility : 'Failed'}`);
      if (result.responseTime) {
        console.log(`    Response time: ${result.responseTime}ms`);
      }
      if (result.errors) {
        console.log(`    Error: ${result.errors[0]}`);
      }
    });

    console.log('\n📖 Testing Citation Validation...');
    const citationResults = await validateCitationGeneration();
    console.log(`✅ Citation Validation Test Complete: ${citationResults.length} test cases`);
    
    citationResults.forEach((result, idx) => {
      const status = result.success ? '✅' : '❌';
      console.log(`  ${status} ${result.testCase.name}: ${result.citationAccuracy?.toFixed(1) || 0}% accuracy`);
      console.log(`    RAG citations: ${result.ragCitations}, AI citations: ${result.aiCitations}`);
      if (result.errors) {
        console.log(`    Error: ${result.errors[0]}`);
      }
    });

    // Summary
    console.log('\n📊 Summary:');
    const totalPolicyTests = policyResults.length;
    const successfulPolicyTests = policyResults.filter(r => r.success).length;
    const totalAITests = aiResults.length;
    const successfulAITests = aiResults.filter(r => r.success).length;
    const totalCitationTests = citationResults.length;
    const successfulCitationTests = citationResults.filter(r => r.success).length;

    console.log(`Policy Retrieval: ${successfulPolicyTests}/${totalPolicyTests} (${((successfulPolicyTests/totalPolicyTests) * 100).toFixed(1)}%)`);
    console.log(`AI Analysis: ${successfulAITests}/${totalAITests} (${((successfulAITests/totalAITests) * 100).toFixed(1)}%)`);
    console.log(`Citation Validation: ${successfulCitationTests}/${totalCitationTests} (${((successfulCitationTests/totalCitationTests) * 100).toFixed(1)}%)`);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

runTests().then(() => {
  console.log('\n🎉 Validation tests completed successfully!');
  process.exit(0);
}).catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});