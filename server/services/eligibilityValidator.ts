// Medicare Eligibility Validator for Skin Substitute/CTP Coverage
// Implements strict deterministic checks per Medicare LCD L39806 requirements

export interface ValidationResult {
  isValid: boolean;
  reason: string;
  details?: any;
  policyViolation?: string;
}

export interface WoundMeasurements {
  length?: number;
  width?: number;
  depth?: number;
  area?: number;
  unit?: string;
}

export interface AreaReductionResult {
  percentReduction: number;
  meetsThreshold: boolean;
  initialArea: number;
  currentArea: number;
  details: string;
}

export interface ConservativeCareTimelineResult extends ValidationResult {
  daysOfCare: number;
  firstEncounterDate: Date | null;
  firstCtpDate: Date | null;
  ctpApplications: Array<{
    date: Date;
    code?: string;
    description?: string;
  }>;
}

export interface PreEligibilityCheckResult {
  woundTypeCheck: ValidationResult;
  conservativeCareCheck: ConservativeCareTimelineResult;
  measurementCheck: ValidationResult;
  areaReductionCheck?: AreaReductionResult;
  overallEligible: boolean;
  failureReasons: string[];
  policyViolations: string[];
  auditTrail: string[];
}

// ICD-10 Code mappings for wound classification
const WOUND_TYPE_PATTERNS = {
  // Covered indications under Medicare LCD L39806
  DFU: {
    icd10Patterns: [
      /E10\.621/i, // Type 1 diabetes with foot ulcer
      /E11\.621/i, // Type 2 diabetes with foot ulcer  
      /E13\.621/i, // Other diabetes with foot ulcer
      /L97\.4[0-9][0-9]/i, // Non-pressure chronic ulcer of heel (diabetic foot)
      /L97\.5[0-9][0-9]/i, // Non-pressure chronic ulcer of foot (diabetic foot)
    ],
    keywords: [
      'diabetic foot ulcer',
      'diabetic foot',
      'neuropathic ulcer',
      'diabetic wound',
      'dfu'
    ],
    requiresDiabetes: true
  },
  VLU: {
    icd10Patterns: [
      /I83\.0[0-9]/i, // Varicose veins with ulcer
      /I83\.2[0-9]/i, // Varicose veins with inflammation and ulcer
      /I87\.2/i, // Venous insufficiency
      /I87\.0/i, // Postthrombotic syndrome with ulcer
    ],
    keywords: [
      'venous leg ulcer',
      'venous ulcer',
      'venous insufficiency ulcer',
      'stasis ulcer',
      'varicose ulcer',
      'vlu'
    ],
    requiresDiabetes: false
  },
  // Non-covered wound types (immediate disqualifiers)
  TRAUMATIC: {
    icd10Patterns: [
      /S[0-9][0-9]\.[0-9][0-9][0-9]/i, // Injury codes (S00-S99)
      /T[0-9][0-9]\.[0-9]/i, // Trauma/burn codes
    ],
    keywords: [
      'traumatic',
      'injury',
      'laceration',
      'trauma',
      'accident',
      'wound from injury'
    ]
  },
  SURGICAL: {
    icd10Patterns: [
      /T81\./i, // Complications of procedures
      /Z48\./i, // Encounter for surgical aftercare
    ],
    keywords: [
      'surgical wound',
      'post-operative',
      'surgical site',
      'dehiscence',
      'surgical complication'
    ]
  },
  PRESSURE: {
    icd10Patterns: [
      /L89\./i, // Pressure ulcer codes
    ],
    keywords: [
      'pressure ulcer',
      'pressure sore',
      'decubitus ulcer',
      'bed sore'
    ]
  },
  ARTERIAL: {
    icd10Patterns: [
      /I70\./i, // Atherosclerosis
      /L97\.1[0-9][0-9]/i, // When arterial (context dependent)
    ],
    keywords: [
      'arterial ulcer',
      'ischemic ulcer',
      'arterial insufficiency'
    ]
  }
};

// CPT/HCPCS codes that indicate CTP application
const CTP_PROCEDURE_CODES = {
  SKIN_GRAFTS: [
    '15271', '15272', '15273', '15274', '15275', '15276',
    '15100', '15101', '15120', '15121', '15200', '15201'
  ],
  CTP_HCPCS: [
    /Q4[0-9]{3}/i, // Q-codes for cellular/tissue products
    'Q4100', 'Q4101', 'Q4102', 'Q4103', 'Q4104', 'Q4105',
    'Q4106', 'Q4107', 'Q4108', 'Q4110', 'Q4111', 'Q4112'
  ],
  DEBRIDEMENT: [
    '11042', '11043', '11044', '11045', '11046', '11047',
    '97597', '97598', '97602'
  ]
};

// Product names that indicate CTP usage
const CTP_PRODUCT_PATTERNS = [
  /amnio[-\s]?tri[-\s]?core/i,
  /amniox/i,
  /grafix/i,
  /epifix/i,
  /clarix/i,
  /genesis/i,
  /dermagraft/i,
  /apligraf/i,
  /oasis/i,
  /integra/i,
  /matristem/i,
  /primatrix/i,
  /graftjacket/i,
  /alloderm/i,
  /strattice/i
];

/**
 * Task 1.1: Validates if wound type meets Medicare LCD covered indications
 * Checks for DFU/VLU explicitly and rejects non-covered wound types
 */
export function validateWoundTypeForCoverage(
  woundType: string,
  primaryDiagnosis?: string,
  encounterNotes: string[] = [],
  diabeticStatus?: string
): ValidationResult {
  const normalizedWoundType = woundType.toLowerCase();
  const allText = [woundType, primaryDiagnosis || '', ...encounterNotes].join(' ').toLowerCase();
  
  // Check for non-covered wound types first (immediate disqualifiers)
  const nonCoveredTypes = ['TRAUMATIC', 'SURGICAL', 'PRESSURE', 'ARTERIAL'];
  for (const type of nonCoveredTypes) {
    const patterns = WOUND_TYPE_PATTERNS[type as keyof typeof WOUND_TYPE_PATTERNS];
    
    // Check ICD-10 codes
    if (primaryDiagnosis) {
      for (const pattern of patterns.icd10Patterns) {
        if (pattern.test(primaryDiagnosis)) {
          return {
            isValid: false,
            reason: `Wound type not covered: ${type.toLowerCase()} wound identified by diagnosis code ${primaryDiagnosis}`,
            policyViolation: 'Medicare LCD L39806 covers only DFU and VLU. Traumatic, surgical, pressure, and arterial ulcers are not covered.',
            details: { woundCategory: type, diagnosisCode: primaryDiagnosis }
          };
        }
      }
    }
    
    // Check keywords in text
    for (const keyword of patterns.keywords) {
      if (allText.includes(keyword)) {
        return {
          isValid: false,
          reason: `Wound type not covered: ${type.toLowerCase()} wound identified by keyword "${keyword}"`,
          policyViolation: 'Medicare LCD L39806 covers only DFU and VLU. Traumatic, surgical, pressure, and arterial ulcers are not covered.',
          details: { woundCategory: type, identifyingKeyword: keyword }
        };
      }
    }
  }
  
  // Check for covered wound types - prioritize VLU when venous evidence exists
  // First check for VLU evidence (venous-related codes/keywords)
  const hasVenousEvidence = primaryDiagnosis && (
    /I83\./i.test(primaryDiagnosis) || /I87\./i.test(primaryDiagnosis)
  ) || allText.includes('venous') || allText.includes('varicose') || allText.includes('stasis');
  
  const coveredTypes = hasVenousEvidence ? ['VLU', 'DFU'] : ['DFU', 'VLU'];
  for (const type of coveredTypes) {
    const patterns = WOUND_TYPE_PATTERNS[type as keyof typeof WOUND_TYPE_PATTERNS];
    let matchFound = false;
    let matchReason = '';
    
    // Check ICD-10 codes
    if (primaryDiagnosis) {
      for (const pattern of patterns.icd10Patterns) {
        if (pattern.test(primaryDiagnosis)) {
          matchFound = true;
          matchReason = `ICD-10 code ${primaryDiagnosis}`;
          break;
        }
      }
    }
    
    // Check keywords if no ICD match
    if (!matchFound) {
      for (const keyword of patterns.keywords) {
        if (allText.includes(keyword)) {
          matchFound = true;
          matchReason = `keyword "${keyword}"`;
          break;
        }
      }
    }
    
    if (matchFound) {
      // Additional validation for DFU - must have diabetic status
      if (type === 'DFU' && 'requiresDiabetes' in patterns && patterns.requiresDiabetes) {
        if (!diabeticStatus || diabeticStatus === 'nondiabetic') {
          return {
            isValid: false,
            reason: `Wound identified as DFU but patient is not diabetic (status: ${diabeticStatus || 'unknown'})`,
            policyViolation: 'DFU diagnosis requires confirmed diabetic status',
            details: { woundCategory: type, diabeticStatus, identifiedBy: matchReason }
          };
        }
      }
      
      return {
        isValid: true,
        reason: `Wound type ${type} meets Medicare LCD covered indication (identified by ${matchReason})`,
        details: { woundCategory: type, diabeticStatus, identifiedBy: matchReason }
      };
    }
  }
  
  // If we reach here, wound type is unclear/unspecified
  return {
    isValid: false,
    reason: `Wound type "${woundType}" cannot be definitively classified as DFU or VLU`,
    policyViolation: 'Medicare LCD L39806 requires clear identification of wound as DFU or VLU for coverage',
    details: { 
      woundType, 
      primaryDiagnosis, 
      suggestion: 'Review clinical documentation to confirm wound etiology and add appropriate ICD-10 codes' 
    }
  };
}

/**
 * Task 1.2: Validates 4-week minimum conservative care before CTP application
 */
export function validateConservativeCareTimeline(
  encounters: any[],
  minDaysRequired: number = 28
): ConservativeCareTimelineResult {
  if (!encounters || encounters.length === 0) {
    return {
      isValid: false,
      reason: 'No encounters found to validate conservative care timeline',
      daysOfCare: 0,
      firstEncounterDate: null,
      firstCtpDate: null,
      ctpApplications: []
    };
  }
  
  // Sort encounters chronologically with date validation
  const invalidDateEncounters = encounters.filter(enc => {
    const date = new Date(enc.date);
    return isNaN(date.getTime());
  });
  
  if (invalidDateEncounters.length > 0) {
    return {
      isValid: false,
      reason: `Invalid encounter dates found: ${invalidDateEncounters.map(enc => enc.date).join(', ')}`,
      policyViolation: 'Medicare LCD L39806 requires valid encounter dates to assess SOC timeline',
      daysOfCare: 0,
      firstEncounterDate: null,
      firstCtpDate: null,
      ctpApplications: []
    };
  }
  
  const sortedEncounters = encounters
    .map(enc => ({ ...enc, date: new Date(enc.date) }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  
  const firstEncounterDate = sortedEncounters[0].date;
  const ctpApplications: Array<{ date: Date; code?: string; description?: string }> = [];
  
  // Find all CTP applications
  for (const encounter of sortedEncounters) {
    let hasCtpApplication = false;
    
    // Check procedure codes
    if (encounter.procedureCodes && Array.isArray(encounter.procedureCodes)) {
      for (const proc of encounter.procedureCodes) {
        const code = proc.code || '';
        
        // Check for skin graft CPT codes
        if (CTP_PROCEDURE_CODES.SKIN_GRAFTS.includes(code)) {
          ctpApplications.push({
            date: encounter.date,
            code,
            description: proc.description || 'Skin graft application'
          });
          hasCtpApplication = true;
        }
        
        // Check for CTP HCPCS codes
        for (const pattern of CTP_PROCEDURE_CODES.CTP_HCPCS) {
          if (typeof pattern === 'string' && code === pattern) {
            ctpApplications.push({
              date: encounter.date,
              code,
              description: proc.description || 'CTP application'
            });
            hasCtpApplication = true;
          } else if (pattern instanceof RegExp && pattern.test(code)) {
            ctpApplications.push({
              date: encounter.date,
              code,
              description: proc.description || 'CTP application'
            });
            hasCtpApplication = true;
          }
        }
      }
    }
    
    // Check encounter notes for CTP product mentions
    if (!hasCtpApplication && encounter.notes && Array.isArray(encounter.notes)) {
      const allNotes = encounter.notes.join(' ').toLowerCase();
      
      for (const pattern of CTP_PRODUCT_PATTERNS) {
        if (pattern.test(allNotes)) {
          ctpApplications.push({
            date: encounter.date,
            description: `CTP application detected (product mention: ${pattern.source})`
          });
          hasCtpApplication = true;
          break;
        }
      }
      
      // Check for generic CTP/graft mentions
      if (!hasCtpApplication) {
        const ctpKeywords = [
          'graft application',
          'skin substitute',
          'cellular therapy',
          'tissue product',
          'amnio',
          'application #',
          'app #'
        ];
        
        for (const keyword of ctpKeywords) {
          if (allNotes.includes(keyword)) {
            ctpApplications.push({
              date: encounter.date,
              description: `CTP application detected (keyword: ${keyword})`
            });
            hasCtpApplication = true;
            break;
          }
        }
      }
    }
  }
  
  // If no CTP applications found, check if minimum conservative care period has been met
  if (ctpApplications.length === 0) {
    const totalDaysOfCare = Math.floor(
      (new Date().getTime() - firstEncounterDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    
    // If less than minimum required days, this is still not eligible for CTP
    const isValid = totalDaysOfCare >= minDaysRequired;
    
    return {
      isValid,
      reason: isValid 
        ? `No CTP applications detected. Conservative care duration: ${totalDaysOfCare} days (≥${minDaysRequired} required)`
        : `Not yet eligible for CTP: only ${totalDaysOfCare} days of conservative care documented (≥${minDaysRequired} required)`,
      policyViolation: isValid 
        ? undefined 
        : `Medicare LCD L39806 requires minimum ${minDaysRequired} days (4 weeks) of documented standard of care before CTP eligibility`,
      daysOfCare: totalDaysOfCare,
      firstEncounterDate,
      firstCtpDate: null,
      ctpApplications: []
    };
  }
  
  // Find first CTP application
  const firstCtpDate = ctpApplications
    .sort((a, b) => a.date.getTime() - b.date.getTime())[0].date;
  
  // Calculate days of conservative care before first CTP
  const daysOfCare = Math.floor(
    (firstCtpDate.getTime() - firstEncounterDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  
  const isValid = daysOfCare >= minDaysRequired;
  
  return {
    isValid,
    reason: isValid
      ? `Conservative care timeline meets requirements: ${daysOfCare} days before first CTP (≥${minDaysRequired} required)`
      : `Conservative care timeline insufficient: only ${daysOfCare} days before first CTP (≥${minDaysRequired} required)`,
    policyViolation: isValid 
      ? undefined 
      : `Medicare LCD L39806 requires minimum ${minDaysRequired} days (4 weeks) of documented standard of care with <50% area reduction before CTP application`,
    daysOfCare,
    firstEncounterDate,
    firstCtpDate,
    ctpApplications
  };
}

/**
 * Task 1.3: Calculate wound area reduction percentage
 */
export function calculateWoundAreaReduction(
  initialMeasurements: WoundMeasurements,
  currentMeasurements: WoundMeasurements
): AreaReductionResult {
  // Validate input measurements
  if (!initialMeasurements.length || !initialMeasurements.width) {
    return {
      percentReduction: 0,
      meetsThreshold: false,
      initialArea: 0,
      currentArea: 0,
      details: 'Cannot calculate area reduction: initial measurements missing length or width'
    };
  }
  
  if (!currentMeasurements.length || !currentMeasurements.width) {
    return {
      percentReduction: 0,
      meetsThreshold: false,
      initialArea: 0,
      currentArea: 0,
      details: 'Cannot calculate area reduction: current measurements missing length or width'
    };
  }
  
  // Calculate areas
  const initialArea = initialMeasurements.length * initialMeasurements.width;
  const currentArea = currentMeasurements.length * currentMeasurements.width;
  
  // Handle edge cases
  if (initialArea === 0) {
    return {
      percentReduction: 0,
      meetsThreshold: false,
      initialArea,
      currentArea,
      details: 'Cannot calculate area reduction: initial area is zero'
    };
  }
  
  // Calculate percentage reduction
  const percentReduction = Math.round(((initialArea - currentArea) / initialArea) * 100);
  const meetsThreshold = percentReduction < 50; // <50% reduction qualifies for CTP
  
  const units = initialMeasurements.unit || currentMeasurements.unit || 'cm';
  
  return {
    percentReduction,
    meetsThreshold,
    initialArea,
    currentArea,
    details: `Wound area reduced from ${initialArea}${units}² to ${currentArea}${units}² (${percentReduction}% reduction). ${meetsThreshold ? 'Qualifies' : 'Does not qualify'} for CTP (<50% reduction required).`
  };
}

/**
 * Extract wound measurements from encounter data
 */
export function extractWoundMeasurements(woundDetails: any): WoundMeasurements | null {
  if (!woundDetails || !woundDetails.measurements) {
    return null;
  }
  
  const measurements = woundDetails.measurements;
  
  // Ensure we have numeric values
  const length = typeof measurements.length === 'number' ? measurements.length : 
                 typeof measurements.length === 'string' ? parseFloat(measurements.length) : null;
  const width = typeof measurements.width === 'number' ? measurements.width :
                typeof measurements.width === 'string' ? parseFloat(measurements.width) : null;
  const depth = typeof measurements.depth === 'number' ? measurements.depth :
                typeof measurements.depth === 'string' ? parseFloat(measurements.depth) : null;
  
  // Return null if essential measurements are missing or invalid
  if (length === null || width === null || isNaN(length) || isNaN(width)) {
    return null;
  }
  
  return {
    length,
    width,
    depth: depth && !isNaN(depth) ? depth : undefined,
    area: measurements.area || (length * width),
    unit: measurements.unit || 'cm'
  };
}

/**
 * Task 1.4: Aggregate all pre-eligibility checks
 * Returns definitive results before AI analysis
 */
export function performPreEligibilityChecks(
  episode: any,
  encounters: any[]
): PreEligibilityCheckResult {
  const auditTrail: string[] = [];
  const failureReasons: string[] = [];
  const policyViolations: string[] = [];
  
  auditTrail.push(`Starting pre-eligibility checks for episode ${episode.id}`);
  auditTrail.push(`Episode: ${episode.woundType} at ${episode.woundLocation}`);
  auditTrail.push(`Primary diagnosis: ${episode.primaryDiagnosis || 'Not specified'}`);
  
  // Get patient diabetic status from encounters
  const diabeticStatus = encounters.find(enc => enc.diabeticStatus)?.diabeticStatus;
  auditTrail.push(`Patient diabetic status: ${diabeticStatus || 'Not specified'}`);
  
  // Task 1.1: Wound Type Validation
  auditTrail.push('Performing wound type validation...');
  const encounterNotes = encounters.flatMap(enc => enc.notes || []);
  const woundTypeCheck = validateWoundTypeForCoverage(
    episode.woundType,
    episode.primaryDiagnosis,
    encounterNotes,
    diabeticStatus
  );
  
  auditTrail.push(`Wound type check result: ${woundTypeCheck.isValid ? 'PASS' : 'FAIL'} - ${woundTypeCheck.reason}`);
  
  if (!woundTypeCheck.isValid) {
    failureReasons.push(woundTypeCheck.reason);
    if (woundTypeCheck.policyViolation) {
      policyViolations.push(woundTypeCheck.policyViolation);
    }
  }
  
  // Task 1.2: Conservative Care Timeline Validation
  auditTrail.push('Performing conservative care timeline validation...');
  const conservativeCareCheck = validateConservativeCareTimeline(encounters);
  
  auditTrail.push(`Conservative care check result: ${conservativeCareCheck.isValid ? 'PASS' : 'FAIL'} - ${conservativeCareCheck.reason}`);
  auditTrail.push(`CTP applications found: ${conservativeCareCheck.ctpApplications.length}`);
  
  if (!conservativeCareCheck.isValid) {
    failureReasons.push(conservativeCareCheck.reason);
    if (conservativeCareCheck.policyViolation) {
      policyViolations.push(conservativeCareCheck.policyViolation);
    }
  }
  
  // Task 1.3: Measurement Validation and Area Reduction
  auditTrail.push('Performing wound measurement validation...');
  const sortedEncounters = encounters
    .map(enc => {
      const date = new Date(enc.date);
      if (isNaN(date.getTime())) {
        auditTrail.push(`Warning: Invalid encounter date ${enc.date}, using current date for sorting`);
        return { ...enc, date: new Date() };
      }
      return { ...enc, date };
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  
  const initialEncounter = sortedEncounters[0];
  
  // Find encounter immediately before first CTP (for accurate area reduction assessment)
  let preCtpEncounter = sortedEncounters[sortedEncounters.length - 1]; // Default to latest if no CTP
  if (conservativeCareCheck.firstCtpDate) {
    // Find last encounter before first CTP date
    const encountersBeforeCtp = sortedEncounters.filter(enc => enc.date.getTime() < conservativeCareCheck.firstCtpDate!.getTime());
    if (encountersBeforeCtp.length > 0) {
      preCtpEncounter = encountersBeforeCtp[encountersBeforeCtp.length - 1];
    }
  }
  
  const initialMeasurements = extractWoundMeasurements(initialEncounter?.woundDetails);
  const preCtpMeasurements = extractWoundMeasurements(preCtpEncounter?.woundDetails);
  
  let measurementCheck: ValidationResult;
  let areaReductionCheck: AreaReductionResult | undefined;
  
  if (!initialMeasurements || !preCtpMeasurements) {
    measurementCheck = {
      isValid: false,
      reason: 'Missing wound measurements (length × width) required for area reduction calculation',
      policyViolation: 'Medicare LCD L39806 requires documented wound measurements to assess healing progress',
      details: { 
        initialMeasurements: !!initialMeasurements, 
        preCtpMeasurements: !!preCtpMeasurements,
        totalEncounters: encounters.length
      }
    };
    
    auditTrail.push('Measurement check result: FAIL - Missing measurements');
    failureReasons.push(measurementCheck.reason);
    if (measurementCheck.policyViolation) {
      policyViolations.push(measurementCheck.policyViolation);
    }
  } else {
    measurementCheck = {
      isValid: true,
      reason: `Wound measurements available: Initial ${initialMeasurements.length}×${initialMeasurements.width}${initialMeasurements.unit}, Pre-CTP ${preCtpMeasurements.length}×${preCtpMeasurements.width}${preCtpMeasurements.unit}`,
      details: { initialMeasurements, preCtpMeasurements }
    };
    
    // Calculate area reduction if we have measurements
    areaReductionCheck = calculateWoundAreaReduction(initialMeasurements, preCtpMeasurements);
    auditTrail.push(`Measurement check result: PASS - ${measurementCheck.reason}`);
    auditTrail.push(`Area reduction calculation: ${areaReductionCheck.details}`);
  }
  
  // Add area reduction as critical failure if measurements show ≥50% reduction after adequate SOC (conservative care was effective)
  let areaReductionCriticalFailure: ValidationResult | null = null;
  if (areaReductionCheck && measurementCheck.isValid && conservativeCareCheck.isValid && conservativeCareCheck.daysOfCare >= 28) {
    if (!areaReductionCheck.meetsThreshold) { // meetsThreshold = false when reduction is ≥50%
      areaReductionCriticalFailure = {
        isValid: false,
        reason: `Wound area reduction of ${areaReductionCheck.percentReduction}% after ${conservativeCareCheck.daysOfCare} days indicates conservative care was effective (≥50% reduction). CTP not medically necessary.`,
        policyViolation: 'Medicare LCD L39806 requires <50% area reduction after ≥4 weeks SOC to qualify for CTP. Effective conservative care precludes CTP coverage.',
        details: areaReductionCheck
      };
      
      failureReasons.push(areaReductionCriticalFailure.reason);
      policyViolations.push(areaReductionCriticalFailure.policyViolation!);
      auditTrail.push(`Area reduction critical failure: ${areaReductionCheck.percentReduction}% reduction after ${conservativeCareCheck.daysOfCare} days (≥50% disqualifies for CTP)`);
    }
  }
  
  // Overall eligibility determination - include area reduction critical failure
  const criticalFailures = [woundTypeCheck, conservativeCareCheck, measurementCheck, areaReductionCriticalFailure]
    .filter((check): check is ValidationResult => check !== null && !check.isValid);
  const overallEligible = criticalFailures.length === 0;
  
  auditTrail.push(`Overall pre-eligibility result: ${overallEligible ? 'ELIGIBLE for AI analysis' : 'NOT ELIGIBLE - definitive failure'}`);
  auditTrail.push(`Critical failures: ${criticalFailures.length}`);
  
  return {
    woundTypeCheck,
    conservativeCareCheck,
    measurementCheck,
    areaReductionCheck,
    overallEligible,
    failureReasons,
    policyViolations,
    auditTrail
  };
}

/**
 * Test function to validate the eligibility validator with sample data
 * This function helps ensure the validator works correctly for key scenarios
 */
export function testEligibilityValidator(): void {
  console.log('Testing Eligibility Validator...');
  
  // Test Case 1: Bobbie Lynch - Traumatic wound case (should fail immediately)
  console.log('\n=== Test Case 1: Bobbie Lynch Traumatic Wound ===');
  const bobbieEpisode = {
    id: 'test-episode-1',
    woundType: 'Full-thickness ulceration at Left lower anterior shin',
    woundLocation: 'left lower anterior shin',
    primaryDiagnosis: 'S81.802A'
  };
  
  const bobbieEncounters = [
    {
      date: '2024-08-16',
      notes: ['Pleasant 93-year-old nondiabetic female presents today for wound care'],
      diabeticStatus: 'nondiabetic',
      procedureCodes: [],
      woundDetails: {
        measurements: { length: 4, width: 3, unit: 'cm' }
      }
    },
    {
      date: '2024-08-22',
      notes: ['Application of Amnio Tri-Core graft'],
      diabeticStatus: 'nondiabetic',
      procedureCodes: [{ code: 'Q4100', description: 'Amnio Tri-Core application' }],
      woundDetails: {
        measurements: { length: 2, width: 3, unit: 'cm' }
      }
    }
  ];
  
  const bobbieResult = performPreEligibilityChecks(bobbieEpisode, bobbieEncounters);
  console.log('Bobbie Lynch Result:', {
    overallEligible: bobbieResult.overallEligible,
    woundTypeValid: bobbieResult.woundTypeCheck.isValid,
    woundTypeReason: bobbieResult.woundTypeCheck.reason,
    conservativeCareValid: bobbieResult.conservativeCareCheck.isValid,
    conservativeCareReason: bobbieResult.conservativeCareCheck.reason,
    failureReasons: bobbieResult.failureReasons
  });
  
  // Test Case 2: Valid DFU case (should pass)
  console.log('\n=== Test Case 2: Valid DFU Case ===');
  const dfuEpisode = {
    id: 'test-episode-2',
    woundType: 'Diabetic Foot Ulcer',
    woundLocation: 'right foot',
    primaryDiagnosis: 'E11.621'
  };
  
  const dfuEncounters = [
    {
      date: '2024-07-01',
      notes: ['Diabetic foot ulcer, standard wound care initiated'],
      diabeticStatus: 'diabetic',
      procedureCodes: [],
      woundDetails: {
        measurements: { length: 4, width: 3, unit: 'cm' } // 12 cm² initial area
      }
    },
    {
      date: '2024-07-30', // 29 days later - meets 4-week requirement
      notes: ['CTP application after failed conservative care'],
      diabeticStatus: 'diabetic',
      procedureCodes: [{ code: '15271', description: 'Skin graft application' }],
      woundDetails: {
        measurements: { length: 3.5, width: 2.8, unit: 'cm' } // 9.8 cm² - only 18% reduction (qualifies for CTP)
      }
    }
  ];
  
  const dfuResult = performPreEligibilityChecks(dfuEpisode, dfuEncounters);
  console.log('Valid DFU Result:', {
    overallEligible: dfuResult.overallEligible,
    woundTypeValid: dfuResult.woundTypeCheck.isValid,
    conservativeCareValid: dfuResult.conservativeCareCheck.isValid,
    conservativeCareReason: dfuResult.conservativeCareCheck.reason,
    areaReduction: dfuResult.areaReductionCheck?.percentReduction,
    meetsThreshold: dfuResult.areaReductionCheck?.meetsThreshold
  });
  
  // Test Case 3: Area reduction calculation
  console.log('\n=== Test Case 3: Area Reduction Calculation ===');
  const initialMeasurement = { length: 4, width: 3, unit: 'cm' };
  const currentMeasurement = { length: 2, width: 2, unit: 'cm' };
  const areaResult = calculateWoundAreaReduction(initialMeasurement, currentMeasurement);
  console.log('Area Reduction Result:', areaResult);
  
  console.log('\n=== Eligibility Validator Tests Complete ===');
}