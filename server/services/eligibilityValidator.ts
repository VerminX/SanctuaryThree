import { z } from "zod";
import { getProblemICD10Mappings } from "@shared/config/rules";

// Helper function to map diagnosis descriptions to ICD-10 codes
function mapProblemToICD10(description: string): string | null {
  const descriptionLower = description.toLowerCase();

  // Map common problem descriptions to ICD-10 codes
  const mappings = getProblemICD10Mappings();
  
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
  
  return null;
}

// Common types and interfaces
export interface DiagnosisValidationResult {
  isValid: boolean;
  validationScore: number;
  errorMessages: string[];
  warningMessages: string[];
  auditTrail: string[];
  timestamp: string;
  effectiveDiagnosis?: string; // The mapped ICD-10 code if the original was a text description
}

export interface ClinicalNecessityResult {
  necessityScore: number;
  necessityLevel: 'low' | 'moderate' | 'high' | 'critical';
  justification: string;
  riskFactors: string[];
  auditTrail: string[];
  timestamp: string;
}

export interface WoundTypeMappingResult {
  woundType: string;
  confidence: number;
  alternativeTypes: string[];
  mappingRationale: string;
  auditTrail: string[];
  timestamp: string;
}

export interface DiagnosisRecommendationsResult {
  recommendations: Array<{
    category: 'coding' | 'clinical' | 'documentation' | 'treatment' | 'billing';
    priority: 'critical' | 'high' | 'medium' | 'low';
    recommendation: string;
    rationale: string;
    actionRequired: string;
    timeframe: string;
  }>;
  codingImprovements: {
    suggestedCodes: string[];
    sequencingChanges: string[];
    specificityEnhancements: string[];
  };
  clinicalActions: {
    assessmentsNeeded: string[];
    consultationsRecommended: string[];
    additionalTesting: string[];
  };
  documentationNeeds: {
    missingElements: string[];
    clarificationNeeded: string[];
    evidenceRequired: string[];
  };
  overallScore: number;
  implementationPlan: string[];
  auditTrail: string[];
  timestamp: string;
}

/**
 * CRITICAL FUNCTION 1: Validate Diagnosis Codes
 * Validates diagnosis codes against ICD-10 standards and Medicare requirements
 * Now with resilience for text descriptions - attempts to map them to ICD-10 codes
 */
export function validateDiagnosisCodes(
  primaryDiagnosis: string,
  secondaryDiagnoses: string[]
): DiagnosisValidationResult {
  const timestamp = new Date().toISOString();
  const auditTrail: string[] = [`Diagnosis code validation initiated at ${timestamp}`];
  const errorMessages: string[] = [];
  const warningMessages: string[] = [];
  
  let validationScore = 100;
  let isValid = true;
  let effectiveDiagnosis = primaryDiagnosis;

  // Validate primary diagnosis format
  if (!primaryDiagnosis || primaryDiagnosis.length < 3) {
    errorMessages.push('Primary diagnosis code is required and must be at least 3 characters');
    validationScore -= 30;
    isValid = false;
  } else {
    auditTrail.push(`Primary diagnosis ${primaryDiagnosis} format validated`);
  }

  // Validate ICD-10 pattern
  const icd10Pattern = /^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$/;
  if (primaryDiagnosis && !icd10Pattern.test(primaryDiagnosis)) {
    // Attempt to map the description to an ICD-10 code
    const mappedCode = mapProblemToICD10(primaryDiagnosis);
    
    if (mappedCode) {
      effectiveDiagnosis = mappedCode;
      warningMessages.push(`Primary diagnosis was a text description. Mapped to ICD-10 code: ${mappedCode}`);
      auditTrail.push(`Mapped diagnosis description "${primaryDiagnosis}" to ICD-10 code ${mappedCode}`);
      validationScore -= 10; // Minor penalty for needing mapping
    } else {
      errorMessages.push(`Primary diagnosis does not match ICD-10 format and could not be mapped to a valid code. Please provide a valid ICD-10 code (e.g., E11.621 for diabetic foot ulcer).`);
      validationScore -= 20;
      isValid = false;
      auditTrail.push(`Could not map diagnosis "${primaryDiagnosis}" to ICD-10 code`);
    }
  }

  // Validate secondary diagnoses
  if (secondaryDiagnoses && secondaryDiagnoses.length > 0) {
    secondaryDiagnoses.forEach((code, index) => {
      if (!icd10Pattern.test(code)) {
        errorMessages.push(`Secondary diagnosis ${index + 1} (${code}) does not match ICD-10 format`);
        validationScore -= 10;
      }
    });
    auditTrail.push(`Validated ${secondaryDiagnoses.length} secondary diagnoses`);
  }

  // Check for wound-specific codes using the effective diagnosis (which might be mapped)
  const woundCodePrefixes = ['L89', 'L97', 'L98', 'E10.6', 'E11.6', 'E13.6', 'I87'];
  const hasWoundCode = woundCodePrefixes.some(prefix => effectiveDiagnosis.startsWith(prefix));
  
  if (!hasWoundCode) {
    warningMessages.push('Primary diagnosis may not be wound-related');
    validationScore -= 5;
  } else {
    auditTrail.push(`Primary diagnosis identified as wound-related (using ${effectiveDiagnosis})`);
  }

  auditTrail.push(`Diagnosis validation completed: ${isValid ? 'VALID' : 'INVALID'} (score: ${validationScore})`);

  return {
    isValid,
    validationScore,
    errorMessages,
    warningMessages,
    auditTrail,
    timestamp,
    effectiveDiagnosis: effectiveDiagnosis !== primaryDiagnosis ? effectiveDiagnosis : undefined
  };
}

/**
 * CRITICAL FUNCTION 2: Assess Clinical Necessity
 * Assesses if the proposed treatment is medically necessary based on wound characteristics and history
 */
export function assessClinicalNecessity(
  diagnoses: string[],
  woundCharacteristics: any,
  treatmentHistory: any,
  patientCondition: any
): ClinicalNecessityResult {
  const timestamp = new Date().toISOString();
  const auditTrail: string[] = [`Clinical necessity assessment initiated at ${timestamp}`];
  const riskFactors: string[] = [];
  
  let necessityScore = 50; // Base score
  let necessityLevel: 'low' | 'moderate' | 'high' | 'critical' = 'low';

  // Assess wound characteristics
  if (woundCharacteristics?.baselineArea && woundCharacteristics.baselineArea > 20) {
    necessityScore += 20;
    riskFactors.push('Large wound area (>20 cm²)');
  }

  if (woundCharacteristics?.depth === 'full_thickness') {
    necessityScore += 15;
    riskFactors.push('Full-thickness wound');
  }

  if (woundCharacteristics?.infectionPresent) {
    necessityScore += 25;
    riskFactors.push('Active infection present');
  }

  // Assess patient condition
  if (patientCondition?.vascularAssessment === 'compromised') {
    necessityScore += 20;
    riskFactors.push('Compromised vascular status');
  }

  // Check for diabetic diagnoses
  const hasDiabetes = diagnoses.some(code => code.startsWith('E10') || code.startsWith('E11') || code.startsWith('E13'));
  if (hasDiabetes) {
    necessityScore += 15;
    riskFactors.push('Diabetic patient with wound complications');
  }

  // Assess treatment history
  if (treatmentHistory?.failed_conservative_care) {
    necessityScore += 30;
    riskFactors.push('Failed conservative care attempts');
  }

  // Determine necessity level
  if (necessityScore >= 90) necessityLevel = 'critical';
  else if (necessityScore >= 70) necessityLevel = 'high';
  else if (necessityScore >= 50) necessityLevel = 'moderate';
  else necessityLevel = 'low';

  const justification = `Clinical necessity determined based on ${riskFactors.length} risk factors. ${necessityLevel.toUpperCase()} priority treatment indicated.`;

  auditTrail.push(`Assessed ${riskFactors.length} risk factors`);
  auditTrail.push(`Clinical necessity assessment completed: ${necessityLevel} (score: ${necessityScore})`);

  return {
    necessityScore,
    necessityLevel,
    justification,
    riskFactors,
    auditTrail,
    timestamp
  };
}

/**
 * CRITICAL FUNCTION 3: Map ICD-10 to Wound Type
 * Maps ICD-10 codes to specific wound types for treatment planning
 */
export async function mapICD10ToWoundType(primaryDiagnosis: string): Promise<WoundTypeMappingResult> {
  const timestamp = new Date().toISOString();
  const auditTrail: string[] = [`ICD-10 to wound type mapping initiated for ${primaryDiagnosis} at ${timestamp}`];
  const alternativeTypes: string[] = [];
  
  let woundType = 'unknown';
  let confidence = 0;
  let mappingRationale = '';

  // Define ICD-10 to wound type mappings
  const woundMappings: Record<string, { type: string; confidence: number; rationale: string; alternatives?: string[] }> = {
    'L89': { 
      type: 'pressure_ulcer', 
      confidence: 95, 
      rationale: 'Direct ICD-10 mapping for pressure ulcers',
      alternatives: ['decubitus_ulcer', 'bedsore']
    },
    'L97': { 
      type: 'leg_ulcer', 
      confidence: 90, 
      rationale: 'ICD-10 mapping for lower limb ulcers',
      alternatives: ['venous_ulcer', 'arterial_ulcer']
    },
    'L98': { 
      type: 'chronic_ulcer', 
      confidence: 85, 
      rationale: 'ICD-10 mapping for other chronic skin ulcers',
      alternatives: ['non_healing_wound', 'chronic_wound']
    },
    'E10.6': { 
      type: 'diabetic_foot_ulcer', 
      confidence: 95, 
      rationale: 'Type 1 diabetes with diabetic complications affecting lower limbs',
      alternatives: ['neuropathic_ulcer', 'ischemic_ulcer']
    },
    'E11.6': { 
      type: 'diabetic_foot_ulcer', 
      confidence: 95, 
      rationale: 'Type 2 diabetes with diabetic complications affecting lower limbs',
      alternatives: ['neuropathic_ulcer', 'ischemic_ulcer']
    },
    'E13.6': { 
      type: 'diabetic_foot_ulcer', 
      confidence: 95, 
      rationale: 'Other specified diabetes with diabetic complications affecting lower limbs',
      alternatives: ['neuropathic_ulcer', 'ischemic_ulcer']
    }
  };

  // Find exact match first
  const exactMatch = woundMappings[primaryDiagnosis];
  if (exactMatch) {
    woundType = exactMatch.type;
    confidence = exactMatch.confidence;
    mappingRationale = exactMatch.rationale;
    if (exactMatch.alternatives) {
      alternativeTypes.push(...exactMatch.alternatives);
    }
    auditTrail.push(`Exact ICD-10 match found: ${primaryDiagnosis} → ${woundType}`);
  } else {
    // Try partial matches based on prefixes
    const prefix3 = primaryDiagnosis.substring(0, 3);
    const prefix4 = primaryDiagnosis.substring(0, 4);
    
    const partialMatch = woundMappings[prefix4] || woundMappings[prefix3];
    if (partialMatch) {
      woundType = partialMatch.type;
      confidence = partialMatch.confidence - 10; // Reduce confidence for partial matches
      mappingRationale = `Partial match based on prefix: ${partialMatch.rationale}`;
      if (partialMatch.alternatives) {
        alternativeTypes.push(...partialMatch.alternatives);
      }
      auditTrail.push(`Partial ICD-10 match found: ${primaryDiagnosis} → ${woundType} (reduced confidence)`);
    } else {
      // Default mapping for unknown codes
      woundType = 'chronic_wound';
      confidence = 30;
      mappingRationale = 'Default mapping applied - diagnosis code not specifically wound-related';
      alternativeTypes.push('acute_wound', 'surgical_wound', 'traumatic_wound');
      auditTrail.push(`No direct mapping found for ${primaryDiagnosis}, using default wound type`);
    }
  }

  auditTrail.push(`Wound type mapping completed: ${woundType} (confidence: ${confidence}%)`);

  return {
    woundType,
    confidence,
    alternativeTypes,
    mappingRationale,
    auditTrail,
    timestamp
  };
}

/**
 * CRITICAL FUNCTION 4: Generate Diagnosis Recommendations
 * Generates comprehensive recommendations based on all validation results
 */
export function generateDiagnosisRecommendations(
  diagnosisValidationResult: DiagnosisValidationResult,
  clinicalNecessityResult: ClinicalNecessityResult,
  complexityResult: any,
  woundTypeMappingResult: WoundTypeMappingResult
): DiagnosisRecommendationsResult {
  const timestamp = new Date().toISOString();
  const auditTrail: string[] = [`Diagnosis recommendations generation initiated at ${timestamp}`];
  
  const recommendations: DiagnosisRecommendationsResult['recommendations'] = [];
  const codingImprovements = { suggestedCodes: [] as string[], sequencingChanges: [] as string[], specificityEnhancements: [] as string[] };
  const clinicalActions = { assessmentsNeeded: [] as string[], consultationsRecommended: [] as string[], additionalTesting: [] as string[] };
  const documentationNeeds = { missingElements: [] as string[], clarificationNeeded: [] as string[], evidenceRequired: [] as string[] };
  const implementationPlan: string[] = [];

  // Process diagnosis validation issues
  if (!diagnosisValidationResult.isValid) {
    recommendations.push({
      category: 'coding',
      priority: 'critical',
      recommendation: 'Correct invalid diagnosis codes before proceeding',
      rationale: 'Invalid ICD-10 codes will cause claim denials and compliance issues',
      actionRequired: 'Review and correct all diagnosis codes',
      timeframe: 'Immediate'
    });
    implementationPlan.push('1. Review invalid diagnosis codes');
    implementationPlan.push('2. Correct formatting and structure');
  }

  // Process clinical necessity recommendations
  if (clinicalNecessityResult.necessityLevel === 'critical') {
    recommendations.push({
      category: 'clinical',
      priority: 'high',
      recommendation: 'Expedite advanced wound care interventions',
      rationale: 'Critical necessity level indicates high risk of complications',
      actionRequired: 'Consider cellular therapy products or surgical interventions',
      timeframe: 'Within 48 hours'
    });
    clinicalActions.consultationsRecommended.push('Wound care specialist');
    clinicalActions.consultationsRecommended.push('Vascular surgeon (if indicated)');
  } else if (clinicalNecessityResult.necessityLevel === 'high') {
    recommendations.push({
      category: 'treatment',
      priority: 'medium',
      recommendation: 'Consider advanced wound care therapies',
      rationale: 'High necessity score indicates standard care may be insufficient',
      actionRequired: 'Evaluate for cellular therapy products',
      timeframe: 'Within 1 week'
    });
  }

  // Process complexity recommendations
  if (complexityResult?.complexityLevel === 'critical' || complexityResult?.complexityLevel === 'high') {
    recommendations.push({
      category: 'clinical',
      priority: 'high',
      recommendation: 'Implement multidisciplinary care coordination',
      rationale: 'High complexity requires specialized expertise',
      actionRequired: 'Coordinate with endocrinology, vascular, and wound care specialists',
      timeframe: 'Within 72 hours'
    });
    clinicalActions.consultationsRecommended.push('Endocrinologist');
    clinicalActions.consultationsRecommended.push('Podiatrist');
  }

  // Process wound type mapping recommendations
  if (woundTypeMappingResult.confidence < 70) {
    recommendations.push({
      category: 'documentation',
      priority: 'medium',
      recommendation: 'Improve wound type classification documentation',
      rationale: 'Low mapping confidence may lead to inappropriate treatment selection',
      actionRequired: 'Document specific wound characteristics and etiology',
      timeframe: 'Next encounter'
    });
    documentationNeeds.clarificationNeeded.push('Wound etiology and classification');
  }

  // Generate coding improvements
  if (diagnosisValidationResult.errorMessages.length > 0) {
    codingImprovements.suggestedCodes.push('Review ICD-10-CM coding guidelines');
    codingImprovements.specificityEnhancements.push('Use more specific diagnosis codes when available');
  }

  // Calculate overall score
  const overallScore = Math.round(
    (diagnosisValidationResult.validationScore * 0.3 +
     clinicalNecessityResult.necessityScore * 0.4 +
     (complexityResult?.complexityScore || 50) * 0.2 +
     woundTypeMappingResult.confidence * 0.1)
  );

  // Add general recommendations based on overall score
  if (overallScore < 60) {
    recommendations.push({
      category: 'documentation',
      priority: 'high',
      recommendation: 'Comprehensive clinical documentation review required',
      rationale: 'Low overall validation score indicates multiple deficiencies',
      actionRequired: 'Systematic review of all clinical documentation and coding',
      timeframe: 'Before next billing cycle'
    });
  }

  auditTrail.push(`Generated ${recommendations.length} recommendations`);
  auditTrail.push(`Overall validation score: ${overallScore}`);

  return {
    recommendations,
    codingImprovements,
    clinicalActions,
    documentationNeeds,
    overallScore,
    implementationPlan,
    auditTrail,
    timestamp
  };
}

/**
 * CONCRETE IMPLEMENTATION: Analyze Diagnosis Complexity
 * Performs comprehensive complexity analysis based on diagnosis patterns and comorbidities
 */
export function analyzeDiagnosisComplexity(
  primaryDiagnosis: string,
  secondaryDiagnoses: string[],
  patientHistory: any,
  woundCharacteristics: any
): any {
  const timestamp = new Date().toISOString();
  const auditTrail: string[] = [`Diagnosis complexity analysis initiated at ${timestamp}`];
  
  let complexityScore = 0;
  const complexityFactors: string[] = [];

  // Primary diagnosis complexity
  const primaryCategory = primaryDiagnosis.substring(0, 3);
  if (['E10', 'E11', 'E13'].includes(primaryCategory)) {
    complexityScore += 20;
    complexityFactors.push('Diabetic wound complexity');
  }

  // Secondary diagnoses complexity
  const uniqueCategories = new Set(secondaryDiagnoses.map(code => code.substring(0, 3)));
  complexityScore += Math.min(uniqueCategories.size * 5, 25);
  if (uniqueCategories.size > 2) {
    complexityFactors.push('Multiple comorbidity categories');
  }

  // Patient history complexity
  if (patientHistory?.treatmentFailures > 0) {
    complexityScore += 15;
    complexityFactors.push('Previous treatment failures');
  }

  // Wound characteristics complexity
  if (woundCharacteristics?.wagnerGrade >= 3) {
    complexityScore += 20;
    complexityFactors.push('High Wagner grade');
  }

  // Determine complexity level
  let complexityLevel: 'low' | 'moderate' | 'high' | 'critical';
  if (complexityScore >= 75) complexityLevel = 'critical';
  else if (complexityScore >= 50) complexityLevel = 'high';
  else if (complexityScore >= 25) complexityLevel = 'moderate';
  else complexityLevel = 'low';

  auditTrail.push(`Complexity analysis completed: ${complexityLevel} (score: ${complexityScore})`);

  return {
    complexityScore,
    complexityLevel,
    complexityFactors,
    careCoordination: {
      specialistsRequired: complexityScore >= 50 ? ['Endocrinologist', 'Wound specialist'] : ['Wound specialist'],
      multidisciplinaryTeam: complexityScore >= 60,
      careComplexity: complexityLevel
    },
    auditTrail,
    timestamp
  };
}

// Additional helper functions that may be needed
export function validateWoundTypeForCoverage(woundType: string, treatmentType: string): boolean {
  const coverageMatrix: Record<string, string[]> = {
    'diabetic_foot_ulcer': ['cellular_therapy', 'negative_pressure', 'offloading'],
    'venous_leg_ulcer': ['compression_therapy', 'cellular_therapy', 'surgical_intervention'],
    'pressure_ulcer': ['pressure_relief', 'negative_pressure', 'cellular_therapy'],
    'arterial_ulcer': ['revascularization', 'cellular_therapy', 'surgical_intervention']
  };
  
  return coverageMatrix[woundType]?.includes(treatmentType) || false;
}

export function calculateWoundSeverityScore(characteristics: any): number {
  let score = 0;
  
  if (characteristics?.area > 20) score += 25;
  if (characteristics?.depth === 'bone_exposed') score += 30;
  if (characteristics?.infection) score += 20;
  if (characteristics?.necrotic_tissue > 50) score += 15;
  if (characteristics?.exudate_level === 'heavy') score += 10;
  
  return Math.min(score, 100);
}

// Interface for the pre-eligibility check result
export interface PreEligibilityCheckResult {
  overallEligible: boolean;
  failureReasons: string[];
  auditTrail: string[];
  policyViolations: string[];
  validationResults?: {
    diagnosisValidation: DiagnosisValidationResult;
    clinicalNecessity: ClinicalNecessityResult;
    complexityAnalysis: any;
    woundTypeMapping: WoundTypeMappingResult;
  };
}

/**
 * MAIN FUNCTION: Perform Pre-Eligibility Checks
 * Comprehensive pre-eligibility validation before AI analysis
 * Integrates all existing validation functions into a single comprehensive check
 */
export async function performPreEligibilityChecks(
  episodeData: {
    id: string;
    woundType: string;
    woundLocation: string;
    primaryDiagnosis: string;
    episodeStartDate: Date;
    status: string;
  },
  validatorEncounters: Array<{
    id: string;
    date: string;
    primaryDiagnosis: string;
    woundDetails: any;
    conservativeCare: any;
    clinicalVascularAssessment?: any;
    vascularStudies?: any;
    allText: string;
    diabeticStatus: string | null;
  }>
): Promise<PreEligibilityCheckResult> {
  const timestamp = new Date().toISOString();
  const auditTrail: string[] = [`Pre-eligibility checks initiated at ${timestamp}`];
  const failureReasons: string[] = [];
  const policyViolations: string[] = [];
  
  auditTrail.push(`Analyzing episode ${episodeData.id} with ${validatorEncounters.length} encounters`);

  try {
    // Extract secondary diagnoses from encounters
    const secondaryDiagnoses: string[] = [];
    validatorEncounters.forEach(encounter => {
      if (encounter.woundDetails?.secondaryDiagnoses) {
        secondaryDiagnoses.push(...encounter.woundDetails.secondaryDiagnoses);
      }
    });

    auditTrail.push(`Found ${secondaryDiagnoses.length} secondary diagnoses across encounters`);

    // STEP 1: Validate diagnosis codes
    const diagnosisValidation = validateDiagnosisCodes(
      episodeData.primaryDiagnosis,
      secondaryDiagnoses
    );
    auditTrail.push(...diagnosisValidation.auditTrail);

    if (!diagnosisValidation.isValid) {
      failureReasons.push(...diagnosisValidation.errorMessages);
      policyViolations.push('Invalid ICD-10 diagnosis codes detected');
    }

    // Use the mapped ICD-10 code if available, otherwise use original
    const effectivePrimaryDiagnosis = diagnosisValidation.effectiveDiagnosis || episodeData.primaryDiagnosis;
    if (diagnosisValidation.effectiveDiagnosis) {
      auditTrail.push(`Using mapped ICD-10 code ${diagnosisValidation.effectiveDiagnosis} for analysis`);
    }

    // STEP 2: Assess clinical necessity across all encounters
    const allDiagnoses = [effectivePrimaryDiagnosis, ...secondaryDiagnoses].filter(Boolean);
    
    // Aggregate wound characteristics from the most recent encounter
    const latestEncounter = validatorEncounters[validatorEncounters.length - 1];
    const woundCharacteristics = latestEncounter?.woundDetails || {};
    
    // Aggregate treatment history
    const treatmentHistory = {
      failed_conservative_care: validatorEncounters.some(enc => 
        enc.conservativeCare?.failedPriorTreatments === true ||
        enc.conservativeCare?.previousTreatments?.length > 0
      ),
      conservativeCareAttempts: validatorEncounters.reduce((total, enc) => {
        return total + (enc.conservativeCare?.treatments?.length || 0);
      }, 0)
    };

    // Patient condition assessment
    const patientCondition = {
      vascularAssessment: latestEncounter?.woundDetails?.vascularStatus || 'unknown',
      diabeticStatus: validatorEncounters.some(enc => enc.diabeticStatus === 'diabetic') ? 'diabetic' : 'nondiabetic'
    };

    const clinicalNecessity = assessClinicalNecessity(
      allDiagnoses,
      woundCharacteristics,
      treatmentHistory,
      patientCondition
    );
    auditTrail.push(...clinicalNecessity.auditTrail);

    // Check for critical policy violations based on clinical necessity
    if (clinicalNecessity.necessityLevel === 'low') {
      policyViolations.push('Clinical necessity score too low for advanced therapy coverage');
      failureReasons.push('Insufficient clinical justification for cellular therapy products');
    }

    // STEP 3: Analyze diagnosis complexity
    const complexityAnalysis = analyzeDiagnosisComplexity(
      effectivePrimaryDiagnosis,
      secondaryDiagnoses,
      { treatmentFailures: treatmentHistory.conservativeCareAttempts },
      woundCharacteristics
    );
    auditTrail.push(...complexityAnalysis.auditTrail);

    // STEP 4: Map wound type
    const woundTypeMapping = await mapICD10ToWoundType(effectivePrimaryDiagnosis);
    auditTrail.push(...woundTypeMapping.auditTrail);

    if (woundTypeMapping.confidence < 50) {
      failureReasons.push('Low confidence in wound type classification');
      policyViolations.push('Uncertain wound type may not qualify for coverage');
    }

    // STEP 5: Medicare-specific policy checks
    auditTrail.push('Performing Medicare LCD L39806 compliance checks');

    // Check for diabetic foot ulcer specific requirements
    const isDiabeticFootUlcer = woundTypeMapping.woundType === 'diabetic_foot_ulcer' ||
                               effectivePrimaryDiagnosis.startsWith('E1') ||
                               patientCondition.diabeticStatus === 'diabetic';

    if (isDiabeticFootUlcer) {
      auditTrail.push('Identified as diabetic foot ulcer - applying DFU-specific criteria');
      
      // Check for Wagner grade requirements
      const wagnerGrade = woundCharacteristics?.wagnerGrade || 0;
      if (wagnerGrade < 1) {
        policyViolations.push('Wagner Grade 1 or higher required for DFU CTP coverage');
        failureReasons.push('Insufficient wound severity documentation (Wagner Grade)');
      }

      // Check for adequate conservative care duration
      const conservativeCareWeeks = treatmentHistory.conservativeCareAttempts;
      if (conservativeCareWeeks < 4) {
        policyViolations.push('Minimum 4 weeks of conservative care required before CTP');
        failureReasons.push('Insufficient conservative care duration documented');
      }
    }

    // STEP 6: Documentation completeness check
    const hasWoundMeasurements = validatorEncounters.some(enc => {
      const measurements = enc.woundDetails?.measurements;
      return measurements && (
        (typeof measurements.length === 'number' && measurements.length > 0) ||
        (typeof measurements.width === 'number' && measurements.width > 0) ||
        (typeof measurements.area === 'number' && measurements.area > 0)
      );
    });

    if (!hasWoundMeasurements) {
      policyViolations.push('Wound measurements required for coverage determination');
      failureReasons.push('Missing wound size documentation');
    }

    // Check for vascular assessment documentation across all possible locations
    const hasVascularAssessment = validatorEncounters.some(enc => {
      // Check conservative care vascular assessment (dorsalisPedis, posteriorTibial, capillaryRefill, edema, varicosities)
      const hasConservativeCareVascular = enc.conservativeCare?.vascularAssessment && (
        enc.conservativeCare.vascularAssessment.dorsalisPedis ||
        enc.conservativeCare.vascularAssessment.posteriorTibial ||
        enc.conservativeCare.vascularAssessment.capillaryRefill ||
        enc.conservativeCare.vascularAssessment.edema !== undefined ||
        enc.conservativeCare.vascularAssessment.varicosities !== undefined
      );
      
      // Check clinical vascular assessment (pulseExamination, perfusionAssessment, venousAssessment)
      const hasClinicalVascular = enc.clinicalVascularAssessment && (
        enc.clinicalVascularAssessment.pulseExamination ||
        enc.clinicalVascularAssessment.perfusionAssessment ||
        enc.clinicalVascularAssessment.venousAssessment
      );
      
      // Check formal vascular studies (ABI, TBI, TcPO2, arterialDuplex, etc.)
      const hasVascularStudies = enc.vascularStudies && (
        enc.vascularStudies.abi ||
        enc.vascularStudies.tbi ||
        enc.vascularStudies.tcpo2 ||
        enc.vascularStudies.arterialDuplex ||
        enc.vascularStudies.pvr ||
        enc.vascularStudies.angiography
      );
      
      // Legacy: Check woundDetails for backward compatibility
      const hasLegacyVascular = enc.woundDetails?.vascularStatus && enc.woundDetails.vascularStatus !== 'unknown';
      
      return hasConservativeCareVascular || hasClinicalVascular || hasVascularStudies || hasLegacyVascular;
    });

    if (!hasVascularAssessment) {
      policyViolations.push('Vascular assessment required for wound therapy coverage');
      failureReasons.push('Missing vascular assessment documentation');
    }

    // STEP 7: Overall eligibility determination
    const overallEligible = failureReasons.length === 0 && 
                           diagnosisValidation.isValid && 
                           clinicalNecessity.necessityLevel !== 'low' &&
                           woundTypeMapping.confidence >= 50;

    auditTrail.push(`Pre-eligibility determination: ${overallEligible ? 'ELIGIBLE' : 'NOT ELIGIBLE'}`);
    auditTrail.push(`Total failure reasons: ${failureReasons.length}`);
    auditTrail.push(`Total policy violations: ${policyViolations.length}`);

    return {
      overallEligible,
      failureReasons,
      auditTrail,
      policyViolations,
      validationResults: {
        diagnosisValidation,
        clinicalNecessity,
        complexityAnalysis,
        woundTypeMapping
      }
    };

  } catch (error) {
    const errorMessage = `Pre-eligibility check failed: ${(error as Error).message}`;
    auditTrail.push(errorMessage);
    failureReasons.push(errorMessage);
    
    return {
      overallEligible: false,
      failureReasons,
      auditTrail,
      policyViolations,
    };
  }
}