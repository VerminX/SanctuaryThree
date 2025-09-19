import { extractPdfData } from './server/services/pdfDataExtractor';
import { readFileSync } from 'fs';
import { analyzeEligibilityWithFullContext } from './server/services/openai';

async function testEndToEnd() {
  console.log('=== STARTING END-TO-END TEST WITH BOBBIE LYNCH MEDICAL RECORD ===\n');
  
  try {
    // Load the PDF
    const pdfPath = 'attached_assets/BLynch MED REC_1758284398804_1758295907124.pdf';
    console.log('📄 Loading PDF:', pdfPath);
    const pdfBuffer = readFileSync(pdfPath);
    
    // Extract data from PDF
    console.log('\n🔍 Extracting data from PDF...\n');
    const extractedData = await extractPdfData(pdfBuffer);
    
    console.log('✅ EXTRACTION RESULTS:');
    console.log('=====================================\n');
    
    // Patient Information
    console.log('PATIENT INFORMATION:');
    console.log('-------------------');
    console.log(`Name: ${extractedData.patient.firstName} ${extractedData.patient.lastName}`);
    console.log(`DOB: ${extractedData.patient.dateOfBirth}`);
    console.log(`MRN: ${extractedData.patient.mrn}`);
    
    // Primary Insurance
    console.log('\nPRIMARY INSURANCE:');
    console.log('------------------');
    console.log(`Type: ${extractedData.patient.payerType || 'Not captured'}`);
    console.log(`Plan: ${extractedData.patient.planName || 'Not captured'}`);
    console.log(`ID: ${extractedData.patient.insuranceId || 'Not captured'}`);
    
    // Secondary Insurance
    console.log('\nSECONDARY INSURANCE:');
    console.log('--------------------');
    console.log(`Type: ${extractedData.patient.secondaryPayerType || 'Not captured'}`);
    console.log(`Plan: ${extractedData.patient.secondaryPlanName || 'Not captured'}`);
    console.log(`ID: ${extractedData.patient.secondaryInsuranceId || 'Not captured'}`);
    
    // Encounters
    console.log(`\nTOTAL ENCOUNTERS: ${extractedData.encounters.length}`);
    console.log('==================\n');
    
    extractedData.encounters.forEach((enc, idx) => {
      console.log(`ENCOUNTER ${idx + 1} (${enc.encounterDate}):`);
      console.log('--------------------------------');
      
      // CPT Codes
      if (enc.treatmentDetails?.cptCodes && enc.treatmentDetails.cptCodes.length > 0) {
        console.log('CPT Codes:');
        enc.treatmentDetails.cptCodes.forEach((cpt: any) => {
          console.log(`  - ${cpt.code}: ${cpt.description || 'No description'}`);
        });
      }
      
      // Wound Details
      if (enc.woundDetails) {
        console.log('Wound Details:');
        console.log(`  - Type: ${enc.woundDetails.type || 'Not specified'}`);
        console.log(`  - Location: ${enc.woundDetails.location || 'Not specified'}`);
        if (enc.woundDetails.measurements) {
          const m = enc.woundDetails.measurements;
          console.log(`  - Size: ${m.length}cm x ${m.width}cm x ${m.depth || 0}cm`);
        }
      }
      
      // Vascular Assessment
      if (enc.conservativeCare?.vascularAssessment) {
        const vasc = enc.conservativeCare.vascularAssessment as any;
        console.log('Vascular Assessment:');
        console.log(`  - Dorsalis Pedis: ${vasc.dorsalisPedis || 'Not captured'}`);
        console.log(`  - Posterior Tibial: ${vasc.posteriorTibial || 'Not captured'}`);
        console.log(`  - Edema: ${vasc.edema || 'Not captured'}`);
      }
      
      // Diabetic Status
      if (enc.diabeticStatus) {
        console.log(`Diabetic Status: ${enc.diabeticStatus}`);
      }
      
      // Functional Status
      if (enc.functionalStatus) {
        console.log('Functional Status:');
        console.log(`  - Mobility: ${enc.functionalStatus.mobility || 'Not captured'}`);
        console.log(`  - Self-care: ${enc.functionalStatus.selfCare || 'Not captured'}`);
      }
      
      console.log('');
    });
    
    // Test AI Analysis with full context
    console.log('🤖 TESTING AI ELIGIBILITY ANALYSIS...\n');
    
    // Simulate complete episode context
    const episodeContext = {
      episodeId: 'test-episode-001',
      patientInfo: {
        firstName: extractedData.patient.firstName || 'Bobbie',
        lastName: extractedData.patient.lastName || 'Lynch',
        dateOfBirth: extractedData.patient.dateOfBirth || '1931-05-30',
        payerType: extractedData.patient.payerType || 'Medicare',
        planName: extractedData.patient.planName || 'Medicare-TN',
        insuranceId: extractedData.patient.insuranceId || 'REDACTED',
        secondaryPayerType: extractedData.patient.secondaryPayerType,
        secondaryPlanName: extractedData.patient.secondaryPlanName,
        secondaryInsuranceId: extractedData.patient.secondaryInsuranceId
      },
      encounters: extractedData.encounters.map((enc, idx) => ({
        id: `encounter-${idx + 1}`,
        encounterDate: enc.encounterDate || '2024-09-05',
        woundDetails: enc.woundDetails,
        conservativeCare: enc.conservativeCare,
        treatmentDetails: enc.treatmentDetails,
        procedureCodes: enc.treatmentDetails?.cptCodes?.map((c: any) => c.code) || [],
        vascularAssessment: enc.conservativeCare?.vascularAssessment,
        functionalStatus: enc.functionalStatus,
        diabeticStatus: enc.diabeticStatus
      })),
      policies: [
        {
          id: 'lcd-001',
          policyNumber: 'L33831',
          title: 'Application of Bioengineered Skin Substitutes',
          contractorName: 'CGS',
          effectiveDate: '2024-01-01'
        }
      ]
    };
    
    console.log('Analyzing with context:');
    console.log(`- Patient: ${episodeContext.patientInfo.firstName} ${episodeContext.patientInfo.lastName}`);
    console.log(`- Primary Insurance: ${episodeContext.patientInfo.payerType}`);
    console.log(`- Secondary Insurance: ${episodeContext.patientInfo.secondaryPayerType || 'None'}`);
    console.log(`- Encounters: ${episodeContext.encounters.length}`);
    console.log(`- Policies: ${episodeContext.policies.length}\n`);
    
    const analysis = await analyzeEligibilityWithFullContext(episodeContext);
    
    console.log('✅ ANALYSIS RESULTS:');
    console.log('====================\n');
    console.log(`Eligibility: ${analysis.eligible ? '✅ ELIGIBLE' : '❌ NOT ELIGIBLE'}`);
    console.log(`Confidence: ${analysis.confidence}%`);
    
    if (analysis.reasoning) {
      console.log('\nReasoning:');
      console.log(analysis.reasoning);
    }
    
    if (analysis.gaps && analysis.gaps.length > 0) {
      console.log('\nGaps Identified:');
      analysis.gaps.forEach((gap: any) => {
        console.log(`- ${gap}`);
      });
    }
    
    if (analysis.recommendations && analysis.recommendations.length > 0) {
      console.log('\nRecommendations:');
      analysis.recommendations.forEach((rec: any) => {
        console.log(`- ${rec}`);
      });
    }
    
    console.log('\n=== TEST COMPLETED SUCCESSFULLY ===');
    
  } catch (error) {
    console.error('❌ TEST FAILED:', error);
  }
}

// Run the test
testEndToEnd();