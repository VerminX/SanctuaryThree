// Medicare Eligibility Validator for Skin Substitute/CTP Coverage
// Implements strict deterministic checks per Medicare LCD L39806 requirements
// Enhanced with sophisticated area calculation algorithms and Medicare LCD compliance

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
  measurementPoints?: Array<{x: number; y: number}>; // For irregular wound calculation
  measurementMethod?: 'rectangular' | 'elliptical' | 'irregular' | 'digital_planimetry';
  measurementTimestamp?: Date;
  recordedBy?: string;
  validationStatus?: 'pending' | 'validated' | 'flagged';
}

// Enhanced interface with Medicare LCD compliance fields
export interface AreaReductionResult {
  percentReduction: number;
  meetsThreshold: boolean; // <50% reduction qualifies for CTP
  initialArea: number;
  currentArea: number;
  details: string;
  // Medicare LCD compliance fields
  medicareCompliance?: {
    meets20PercentReduction: boolean;
    daysSinceBaseline: number;
    baselineArea: number;
    weeklyReductionRate: number;
    projectedHealingWeeks?: number;
  };
  // Healing velocity metrics
  healingVelocity?: {
    areaReductionPerWeek: number; // cm²/week
    healingRate: 'rapid' | 'normal' | 'slow' | 'stalled';
    trendDirection: 'improving' | 'stable' | 'declining';
    confidenceScore: number; // 0-1, statistical confidence in trend
  };
  // Regulatory audit trail
  auditTrail?: {
    calculationMethod: string;
    measurementValidation: string;
    complianceChecks: string[];
    timestamp: Date;
  };
}

// New interface for Medicare LCD specific compliance results
export interface MedicareLCDComplianceResult {
  meets20PercentReduction: boolean;
  currentReductionPercentage: number;
  daysFromBaseline: number;
  fourWeekPeriodAnalysis: {
    startDate: Date;
    endDate: Date;
    baselineArea: number;
    currentArea: number;
    reductionPercentage: number;
    meetsLCDCriteria: boolean;
    phase: 'pre-ctp' | 'post-ctp';
  }[];
  overallCompliance: 'compliant' | 'non_compliant' | 'insufficient_data';
  nextEvaluationDate?: Date;
  auditTrail: string[];
  regulatoryNotes: string[];
  // Medicare LCD Policy Tracking
  policyMetadata: {
    policyId: string; // 'L39806'
    effectiveDate: string; // ISO date string
    lastUpdated: string; // ISO date string
    jurisdiction: string; // 'Palmetto GBA Jurisdiction J'
  };
  // Phase-specific compliance
  phaseAnalysis: {
    currentPhase: 'pre-ctp' | 'post-ctp';
    phaseSpecificThreshold: number; // 50 for pre-ctp, 20 for post-ctp
    meetsPhaseRequirement: boolean;
    phaseDescription: string;
  };
}

// Comprehensive wound healing analysis
export interface WoundHealingAnalysis {
  episodeId: string;
  analysisDate: Date;
  totalMeasurements: number;
  timeSpanDays: number;
  velocityMetrics: {
    averageWeeklyAreaReduction: number; // cm²/week
    peakWeeklyReduction: number;
    currentTrend: 'accelerating' | 'steady' | 'decelerating' | 'stalled';
    projectedHealingTime?: number; // weeks to complete healing
    healingEfficiency: number; // 0-1 score
  };
  measurementQuality: {
    consistencyScore: number; // 0-1
    outlierCount: number;
    validationRate: number; // percentage of validated measurements
    dataQualityGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  };
  clinicalInsights: {
    earlyWarnings: string[];
    recommendations: string[];
    interventionPoints: Date[];
  };
  medicareCompliance: MedicareLCDComplianceResult;
}

// Measurement validation and quality control
export interface MeasurementValidationResult {
  measurementId: string;
  isValid: boolean;
  qualityScore: number; // 0-1
  validationFlags: {
    isOutlier: boolean;
    needsClinicalReview: boolean;
    inconsistentWithTrend: boolean;
    measurementGaps: boolean;
    dimensionalInconsistency: boolean;
  };
  recommendations: string[];
  autoCorrections?: {
    suggestedLength?: number;
    suggestedWidth?: number;
    suggestedArea?: number;
    confidence: number;
  };
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
  // Enhanced with Medicare LCD specific tracking
  medicareLCDCompliance?: {
    meets4WeekRequirement: boolean;
    totalConservativeDays: number;
    adequateDocumentation: boolean;
  };
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
 * PHI Safety: Sanitize audit trail entries to remove sensitive information
 * Ensures HIPAA compliance by omitting PHI while preserving clinical/regulatory data
 */
function sanitizeAuditTrailForClient(auditTrail: string[]): string[] {
  return auditTrail.map(entry => {
    // Remove potential PHI patterns while preserving clinical data
    let sanitized = entry
      // Remove specific names (Dr. LastName, Nurse FirstName, etc.)
      .replace(/\b(Dr|Doctor|Nurse|PA|NP|MD|RN|LPN)\.?\s+[A-Z][a-z]+/gi, '[PROVIDER]')
      // Remove patient identifiers but keep episode IDs
      .replace(/\bpatient\s+[A-Z][a-z]+\s+[A-Z][a-z]+/gi, '[PATIENT]')
      // Remove specific complaints/symptoms (keep clinical measurements)
      .replace(/patient\s+(complained|reported|stated|mentioned).*/gi, '[PATIENT_FEEDBACK_REDACTED]')
      // Remove phone numbers
      .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE_REDACTED]')
      // Remove email addresses
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL_REDACTED]')
      // Remove SSN patterns
      .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN_REDACTED]')
      // Remove MRN patterns (preserve episode IDs which don't contain PHI)
      .replace(/\bMRN[:\s]+\w+/gi, '[MRN_REDACTED]');
    
    return sanitized;
  });
}

/**
 * Normalizes diabetic status to handle common variations and synonyms
 */
function normalizeDiabeticStatus(status: string | undefined): 'diabetic' | 'nondiabetic' | 'unknown' {
  if (!status || status.trim() === '' || status.toLowerCase().includes('unknown')) {
    return 'unknown';
  }

  const normalized = status.toLowerCase().trim();
  
  // Handle non-diabetic synonyms
  const nonDiabeticVariants = [
    'non-diabetic', 'non diabetic', 'not diabetic', 'no diabetes', 
    'without diabetes', 'no dx of diabetes', 'nondiabetic', 'non_diabetic'
  ];
  
  if (nonDiabeticVariants.includes(normalized)) {
    return 'nondiabetic';
  }
  
  // Handle diabetic synonyms
  const diabeticVariants = [
    'diabetic', 'diabetes', 'has diabetes', 'with diabetes', 
    'diabetic patient', 'diabetes mellitus', 'dm'
  ];
  
  if (diabeticVariants.includes(normalized)) {
    return 'diabetic';
  }
  
  // Default to unknown for unrecognized values
  return 'unknown';
}

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
  const normalizedDiabeticStatus = normalizeDiabeticStatus(diabeticStatus);
  
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
      // Additional validation for DFU - only deterministically reject if explicitly non-diabetic
      if (type === 'DFU' && 'requiresDiabetes' in patterns && patterns.requiresDiabetes) {
        if (normalizedDiabeticStatus === 'nondiabetic') {
          return {
            isValid: false,
            reason: `Wound identified as DFU but patient is confirmed non-diabetic (original: "${diabeticStatus}", normalized: "${normalizedDiabeticStatus}")`,
            policyViolation: 'DFU diagnosis requires diabetic patient. Non-diabetic patients are not eligible for DFU CTPs under Medicare LCD L39806.',
            details: { woundCategory: type, diabeticStatus: normalizedDiabeticStatus, originalStatus: diabeticStatus, identifiedBy: matchReason }
          };
        }
        // If diabetic status is missing/unknown, allow validation to pass - let AI analysis handle the ambiguity
        // This prevents false negatives when diabetic status is not documented but DFU is clinically indicated
      }
      
      return {
        isValid: true,
        reason: `Wound type ${type} meets Medicare LCD covered indication (identified by ${matchReason})`,
        details: { woundCategory: type, diabeticStatus: normalizedDiabeticStatus, originalStatus: diabeticStatus, identifiedBy: matchReason }
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
 * Advanced Area Calculation Methods
 * Supports multiple calculation algorithms for accurate wound assessment
 */

// Unit conversion utilities for consistent measurement handling
function convertToStandardUnit(value: number, fromUnit: string): number {
  const unit = fromUnit?.toLowerCase() || 'cm';
  switch (unit) {
    case 'mm':
    case 'millimeters':
      return value / 10; // Convert mm to cm
    case 'cm':
    case 'centimeters':
      return value; // Already in cm
    case 'in':
    case 'inch':
    case 'inches':
      return value * 2.54; // Convert inches to cm
    case 'm':
    case 'meters':
      return value * 100; // Convert meters to cm
    default:
      console.warn(`Unknown unit '${fromUnit}', assuming cm`);
      return value;
  }
}

// Calculate elliptical wound area: π × (length/2) × (width/2)
export function calculateEllipticalArea(length: number, width: number, unit: string = 'cm'): number {
  const normalizedLength = convertToStandardUnit(length, unit);
  const normalizedWidth = convertToStandardUnit(width, unit);
  return Math.PI * (normalizedLength / 2) * (normalizedWidth / 2);
}

// Calculate wound volume when depth is available
// NOTE: Volume calculations are informational only and NOT used for Medicare LCD determinations
// Medicare LCD L39806 coverage decisions are based solely on area measurements and reduction percentages
export function calculateWoundVolume(
  length: number, 
  width: number, 
  depth: number, 
  unit: string = 'cm',
  method: 'ellipsoid' | 'truncated_ellipsoid' = 'ellipsoid'
): number {
  // Normalize all dimensions to cm for consistent calculation
  const normalizedLength = convertToStandardUnit(length, unit);
  const normalizedWidth = convertToStandardUnit(width, unit);
  const normalizedDepth = convertToStandardUnit(depth, unit);
  
  if (method === 'ellipsoid') {
    // Volume = (4/3) × π × (a/2) × (b/2) × (c/2) where a=length, b=width, c=depth
    return (4/3) * Math.PI * (normalizedLength / 2) * (normalizedWidth / 2) * (normalizedDepth / 2);
  } else {
    // Truncated ellipsoid - more accurate for shallow wounds
    // Approximation: elliptical area × depth × correction factor
    const baseArea = calculateEllipticalArea(normalizedLength, normalizedWidth, 'cm');
    const correctionFactor = 0.524; // Empirically derived for wound shapes
    return baseArea * normalizedDepth * correctionFactor;
  }
}

// Validate polygon vertex ordering for consistent area calculation
function validatePolygonVertexOrdering(points: Array<{x: number; y: number}>): {
  isValid: boolean;
  isClockwise: boolean;
  recommendations: string[];
} {
  if (points.length < 3) {
    return {
      isValid: false,
      isClockwise: false,
      recommendations: ['Minimum 3 points required for polygon']
    };
  }
  
  // Calculate signed area to determine orientation
  let signedArea = 0;
  const n = points.length;
  
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    signedArea += (points[j].x - points[i].x) * (points[j].y + points[i].y);
  }
  
  const isClockwise = signedArea > 0;
  const recommendations: string[] = [];
  
  // Check for self-intersections (simplified check)
  const hasIntersections = checkForSelfIntersections(points);
  if (hasIntersections) {
    recommendations.push('Polygon appears to have self-intersections - verify measurement points');
  }
  
  // Check for very small or very large areas that might indicate errors
  const area = Math.abs(signedArea) / 2;
  if (area < 0.1) {
    recommendations.push('Calculated area is very small (<0.1 cm²) - verify measurement accuracy');
  } else if (area > 1000) {
    recommendations.push('Calculated area is very large (>1000 cm²) - verify measurement units and scale');
  }
  
  return {
    isValid: !hasIntersections,
    isClockwise,
    recommendations
  };
}

// Simple check for self-intersections in polygon
function checkForSelfIntersections(points: Array<{x: number; y: number}>): boolean {
  const n = points.length;
  
  for (let i = 0; i < n - 2; i++) {
    for (let j = i + 2; j < n; j++) {
      if (j === n - 1 && i === 0) continue; // Skip adjacent edges
      
      const line1 = { start: points[i], end: points[i + 1] };
      const line2 = { start: points[j], end: points[(j + 1) % n] };
      
      if (doLinesIntersect(line1, line2)) {
        return true;
      }
    }
  }
  
  return false;
}

// Check if two line segments intersect
function doLinesIntersect(
  line1: { start: {x: number; y: number}; end: {x: number; y: number} },
  line2: { start: {x: number; y: number}; end: {x: number; y: number} }
): boolean {
  const det = (line1.end.x - line1.start.x) * (line2.end.y - line2.start.y) - 
              (line2.end.x - line2.start.x) * (line1.end.y - line1.start.y);
  
  if (det === 0) return false; // Lines are parallel
  
  const lambda = ((line2.end.y - line2.start.y) * (line2.end.x - line1.start.x) + 
                  (line2.start.x - line2.end.x) * (line2.end.y - line1.start.y)) / det;
  const gamma = ((line1.start.y - line1.end.y) * (line2.end.x - line1.start.x) + 
                 (line1.end.x - line1.start.x) * (line2.end.y - line1.start.y)) / det;
  
  return (0 < lambda && lambda < 1) && (0 < gamma && gamma < 1);
}

// Irregular wound area approximation using multiple measurement points
export function calculateIrregularWoundArea(
  measurementPoints: Array<{x: number; y: number}>, 
  unit: string = 'cm'
): { area: number; validation: ReturnType<typeof validatePolygonVertexOrdering> } {
  if (measurementPoints.length < 3) {
    throw new Error('Irregular wound calculation requires at least 3 measurement points');
  }
  
  // Normalize coordinates to cm
  const normalizedPoints = measurementPoints.map(point => ({
    x: convertToStandardUnit(point.x, unit),
    y: convertToStandardUnit(point.y, unit)
  }));
  
  // Validate polygon vertex ordering
  const validation = validatePolygonVertexOrdering(normalizedPoints);
  
  // Shoelace formula (Surveyor's formula) for polygon area
  let area = 0;
  const n = normalizedPoints.length;
  
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += normalizedPoints[i].x * normalizedPoints[j].y;
    area -= normalizedPoints[j].x * normalizedPoints[i].y;
  }
  
  // Math.abs() prevents negative areas from incorrect vertex ordering
  const finalArea = Math.abs(area) / 2;
  
  return {
    area: finalArea,
    validation
  };
}

/**
 * Ensure Date fields serialize properly to ISO strings for API responses
 * This helper ensures consistent date serialization across all API endpoints
 */
export function ensureDateSerialization(obj: any): any {
  if (obj instanceof Date) {
    return obj.toISOString();
  }
  
  if (Array.isArray(obj)) {
    return obj.map(ensureDateSerialization);
  }
  
  if (obj && typeof obj === 'object') {
    const serialized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      serialized[key] = ensureDateSerialization(value);
    }
    return serialized;
  }
  
  return obj;
}

// Smart area calculation that chooses the best method based on available data
export function calculateSmartWoundArea(measurements: WoundMeasurements): number {
  if (measurements.area && measurements.area > 0) {
    return measurements.area;
  }
  
  if (!measurements.length || !measurements.width) {
    return 0;
  }
  
  // Use measurement points for irregular wounds if available
  if (measurements.measurementPoints && measurements.measurementPoints.length >= 3) {
    const result = calculateIrregularWoundArea(measurements.measurementPoints, measurements.unit);
    return result.area;
  }
  
  // Use elliptical calculation for better accuracy than rectangular
  if (measurements.measurementMethod === 'elliptical' || !measurements.measurementMethod) {
    return calculateEllipticalArea(measurements.length, measurements.width, measurements.unit);
  }
  
  // Fall back to rectangular calculation
  return measurements.length * measurements.width;
}

/**
 * Medicare LCD Phase-Specific Reduction Validation
 * CRITICAL: Validates Medicare LCD L39806 TWO-PHASE requirements:
 * - Pre-CTP Phase: <50% reduction required for initial CTP eligibility after ≥4 weeks SOC
 * - Post-CTP Phase: ≥20% reduction required for continued CTP use per 4-week intervals
 * 
 * @param episodeId Episode identifier for audit trail
 * @param measurementHistory Array of wound measurements with timestamps and calculated areas
 * @param phase Medicare LCD phase being evaluated: 'pre-ctp' (initial eligibility) or 'post-ctp' (continued use)
 * @param ctpStartDate Date of first CTP application (required for post-ctp phase validation)
 */
export async function validateMedicare20PercentReduction(
  episodeId: string,
  measurementHistory: any[] = [], // WoundMeasurement records from database
  phase: 'pre-ctp' | 'post-ctp' = 'pre-ctp',
  ctpStartDate?: Date
): Promise<MedicareLCDComplianceResult> {
  const auditTrail: string[] = [];
  const regulatoryNotes: string[] = [];
  
  // Medicare LCD L39806 Policy Metadata
  const policyMetadata = {
    policyId: 'L39806',
    effectiveDate: '2023-10-01', // Latest known effective date
    lastUpdated: new Date().toISOString(),
    jurisdiction: 'Palmetto GBA Jurisdiction J'
  };
  
  // Phase-specific thresholds and requirements
  const phaseConfig = {
    'pre-ctp': {
      threshold: 50, // <50% reduction required
      operator: '<' as const,
      description: 'Pre-CTP initial eligibility: wound must show <50% reduction after ≥4 weeks SOC to qualify for CTP',
      requirement: 'less than 50% area reduction'
    },
    'post-ctp': {
      threshold: 20, // ≥20% reduction required
      operator: '>=' as const,
      description: 'Post-CTP continued use: wound must show ≥20% reduction per 4-week interval to continue CTP therapy',
      requirement: 'at least 20% area reduction'
    }
  };
  
  const currentPhaseConfig = phaseConfig[phase];
  
  auditTrail.push(`Starting Medicare LCD ${phase.toUpperCase()} phase analysis for episode ${episodeId}`);
  auditTrail.push(`Phase requirement: ${currentPhaseConfig.description}`);
  auditTrail.push(`Policy: ${policyMetadata.policyId} (${policyMetadata.jurisdiction})`);
  
  if (phase === 'post-ctp' && !ctpStartDate) {
    auditTrail.push('ERROR: Post-CTP phase validation requires CTP start date');
    return {
      meets20PercentReduction: false,
      currentReductionPercentage: 0,
      daysFromBaseline: 0,
      fourWeekPeriodAnalysis: [],
      overallCompliance: 'insufficient_data',
      auditTrail,
      regulatoryNotes: ['Post-CTP phase validation requires CTP start date for baseline determination'],
      policyMetadata,
      phaseAnalysis: {
        currentPhase: phase,
        phaseSpecificThreshold: currentPhaseConfig.threshold,
        meetsPhaseRequirement: false,
        phaseDescription: currentPhaseConfig.description
      }
    };
  }
  
  if (!measurementHistory || measurementHistory.length < 2) {
    return {
      meets20PercentReduction: false,
      currentReductionPercentage: 0,
      daysFromBaseline: 0,
      fourWeekPeriodAnalysis: [],
      overallCompliance: 'insufficient_data',
      auditTrail: [...auditTrail, 'Insufficient measurement data for LCD analysis'],
      regulatoryNotes: [`Minimum 2 measurements required over 4-week period for ${phase} LCD compliance assessment`],
      policyMetadata,
      phaseAnalysis: {
        currentPhase: phase,
        phaseSpecificThreshold: currentPhaseConfig.threshold,
        meetsPhaseRequirement: false,
        phaseDescription: currentPhaseConfig.description
      }
    };
  }
  
  // Sort measurements chronologically with timezone-safe date handling
  const sortedMeasurements = measurementHistory
    .filter(m => m.calculatedArea && m.measurementTimestamp)
    .map(m => ({
      ...m,
      // Ensure consistent timezone handling by normalizing to UTC
      normalizedTimestamp: new Date(m.measurementTimestamp).toISOString()
    }))
    .sort((a, b) => new Date(a.measurementTimestamp).getTime() - new Date(b.measurementTimestamp).getTime());
  
  if (sortedMeasurements.length < 2) {
    return {
      meets20PercentReduction: false,
      currentReductionPercentage: 0,
      daysFromBaseline: 0,
      fourWeekPeriodAnalysis: [],
      overallCompliance: 'insufficient_data',
      auditTrail: [...auditTrail, 'No valid measurements with area calculations found'],
      regulatoryNotes: [`Valid area measurements required for ${phase} LCD analysis`],
      policyMetadata,
      phaseAnalysis: {
        currentPhase: phase,
        phaseSpecificThreshold: currentPhaseConfig.threshold,
        meetsPhaseRequirement: false,
        phaseDescription: currentPhaseConfig.description
      }
    };
  }
  
  // Determine baseline measurement based on phase
  let baselineMeasurement: any;
  let baselineTimestamp: number;
  
  if (phase === 'pre-ctp') {
    // Pre-CTP: Use first measurement as baseline (start of SOC)
    baselineMeasurement = sortedMeasurements[0];
    baselineTimestamp = new Date(baselineMeasurement.measurementTimestamp).getTime();
    auditTrail.push(`Pre-CTP baseline: First measurement (start of Standard of Care)`);
  } else {
    // Post-CTP: Use measurement closest to CTP start date as baseline
    if (!ctpStartDate) {
      throw new Error('CTP start date required for post-CTP phase validation');
    }
    
    const ctpTimestamp = ctpStartDate.getTime();
    baselineMeasurement = sortedMeasurements
      .filter(m => new Date(m.measurementTimestamp).getTime() <= ctpTimestamp)
      .sort((a, b) => 
        Math.abs(ctpTimestamp - new Date(a.measurementTimestamp).getTime()) - 
        Math.abs(ctpTimestamp - new Date(b.measurementTimestamp).getTime())
      )[0] || sortedMeasurements[0];
    
    baselineTimestamp = ctpTimestamp;
    auditTrail.push(`Post-CTP baseline: Measurement closest to CTP start date (${ctpStartDate.toISOString().split('T')[0]})`);
  }
  
  const currentMeasurement = sortedMeasurements[sortedMeasurements.length - 1];
  const baselineArea = parseFloat(baselineMeasurement.calculatedArea.toString());
  const currentArea = parseFloat(currentMeasurement.calculatedArea.toString());
  
  auditTrail.push(`Baseline area: ${baselineArea} cm² (${baselineMeasurement.measurementTimestamp})`);
  auditTrail.push(`Current area: ${currentArea} cm² (${currentMeasurement.measurementTimestamp})`);
  
  // Calculate days from baseline with timezone-safe math
  const daysFromBaseline = Math.floor(
    (new Date(currentMeasurement.measurementTimestamp).getTime() - baselineTimestamp) / (1000 * 60 * 60 * 24)
  );
  
  // Calculate current reduction percentage
  const currentReductionPercentage = baselineArea > 0 
    ? Math.round(((baselineArea - currentArea) / baselineArea) * 100)
    : 0;
  
  auditTrail.push(`Current reduction: ${currentReductionPercentage}% over ${daysFromBaseline} days`);
  auditTrail.push(`${phase.toUpperCase()} threshold: ${currentPhaseConfig.requirement}`);
  
  // Analyze 4-week periods (Medicare LCD requirement)
  const fourWeekPeriodAnalysis = [];
  
  // Check each 4-week period from baseline with improved day-28 selection logic
  for (let periodStart = 0; periodStart <= daysFromBaseline; periodStart += 28) {
    const periodStartDate = new Date(baselineTimestamp + (periodStart * 24 * 60 * 60 * 1000));
    const periodEndDate = new Date(baselineTimestamp + ((periodStart + 28) * 24 * 60 * 60 * 1000));
    
    // Enhanced day-28 selection: Find measurement closest to day 28 with ±7 day window preference
    const targetDay28 = periodEndDate.getTime();
    const candidateMeasurements = sortedMeasurements
      .filter(m => {
        const measurementTime = new Date(m.measurementTimestamp).getTime();
        const daysDiff = Math.abs((measurementTime - targetDay28) / (1000 * 60 * 60 * 24));
        
        // Prefer measurements within ±7 days of day 28, but allow up to day 35 if no closer measurement
        return measurementTime <= periodEndDate.getTime() + (7 * 24 * 60 * 60 * 1000);
      })
      .sort((a, b) => {
        const aDistance = Math.abs(new Date(a.measurementTimestamp).getTime() - targetDay28);
        const bDistance = Math.abs(new Date(b.measurementTimestamp).getTime() - targetDay28);
        return aDistance - bDistance;
      });
    
    const periodMeasurement = candidateMeasurements[0];
    
    if (periodMeasurement) {
      const periodArea = parseFloat(periodMeasurement.calculatedArea.toString());
      const periodReduction = baselineArea > 0 
        ? Math.round(((baselineArea - periodArea) / baselineArea) * 100)
        : 0;
      
      // Apply phase-specific criteria
      let meetsLCDCriteria: boolean;
      if (phase === 'pre-ctp') {
        // Pre-CTP: Requires <50% reduction (if ≥50%, conservative care was effective)
        meetsLCDCriteria = periodReduction < currentPhaseConfig.threshold;
      } else {
        // Post-CTP: Requires ≥20% reduction for continued therapy
        meetsLCDCriteria = periodReduction >= currentPhaseConfig.threshold;
      }
      
      const actualDays = Math.floor(
        (new Date(periodMeasurement.measurementTimestamp).getTime() - periodStartDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      
      fourWeekPeriodAnalysis.push({
        startDate: periodStartDate,
        endDate: periodEndDate,
        baselineArea,
        currentArea: periodArea,
        reductionPercentage: periodReduction,
        meetsLCDCriteria,
        phase
      });
      
      auditTrail.push(
        `4-week period ${Math.floor(periodStart/28) + 1} (${phase}): ${periodReduction}% reduction over ${actualDays} days ` +
        `${meetsLCDCriteria ? `(MEETS ${phase.toUpperCase()} LCD)` : `(FAILS ${phase.toUpperCase()} LCD)`}`
      );
      
      if (!meetsLCDCriteria && periodStart >= 28) {
        const failureReason = phase === 'pre-ctp' 
          ? `shows ${periodReduction}% reduction (Pre-CTP LCD requires <50% - wound responded too well to conservative care)`
          : `shows ${periodReduction}% reduction (Post-CTP LCD requires ≥20% for continued therapy)`;
        
        regulatoryNotes.push(
          `4-week period ending ${periodEndDate.toDateString()} ${failureReason}`
        );
      }
    }
  }
  
  // Phase-specific overall compliance assessment
  let meetsPhaseRequirement: boolean;
  let meets20PercentReduction: boolean; // Maintain backward compatibility
  const hasAdequateTimeframe = daysFromBaseline >= 28;
  
  if (phase === 'pre-ctp') {
    // Pre-CTP: Must show <50% reduction to qualify for CTP
    meetsPhaseRequirement = currentReductionPercentage < currentPhaseConfig.threshold;
    meets20PercentReduction = currentReductionPercentage >= 20; // Keep for compatibility
  } else {
    // Post-CTP: Must show ≥20% reduction to continue CTP
    meetsPhaseRequirement = currentReductionPercentage >= currentPhaseConfig.threshold;
    meets20PercentReduction = meetsPhaseRequirement;
  }
  
  let overallCompliance: 'compliant' | 'non_compliant' | 'insufficient_data';
  if (!hasAdequateTimeframe) {
    overallCompliance = 'insufficient_data';
    regulatoryNotes.push(`Minimum 4-week evaluation period not yet reached for definitive ${phase} LCD assessment`);
  } else if (meetsPhaseRequirement) {
    overallCompliance = 'compliant';
    if (phase === 'pre-ctp') {
      regulatoryNotes.push(
        `Pre-CTP: Wound demonstrates ${currentReductionPercentage}% reduction over ${daysFromBaseline} days ` +
        `(<50% requirement met - conservative care insufficient, CTP indicated)`
      );
    } else {
      regulatoryNotes.push(
        `Post-CTP: Wound demonstrates ${currentReductionPercentage}% reduction over ${daysFromBaseline} days ` +
        `(≥20% requirement met - continued CTP therapy justified)`
      );
    }
  } else {
    overallCompliance = 'non_compliant';
    if (phase === 'pre-ctp') {
      regulatoryNotes.push(
        `Pre-CTP: Wound shows ${currentReductionPercentage}% reduction over ${daysFromBaseline} days ` +
        `(≥50% indicates conservative care was effective - CTP not medically necessary)`
      );
    } else {
      regulatoryNotes.push(
        `Post-CTP: Wound shows only ${currentReductionPercentage}% reduction over ${daysFromBaseline} days ` +
        `(<20% indicates CTP therapy not effective - discontinue treatment)`
      );
    }
  }
  
  // Calculate next evaluation date with timezone safety
  const nextEvaluationTimestamp = hasAdequateTimeframe 
    ? new Date(currentMeasurement.measurementTimestamp).getTime() + (28 * 24 * 60 * 60 * 1000)
    : baselineTimestamp + (28 * 24 * 60 * 60 * 1000);
  
  const nextEvaluationDate = new Date(nextEvaluationTimestamp);
  
  return {
    meets20PercentReduction,
    currentReductionPercentage,
    daysFromBaseline,
    fourWeekPeriodAnalysis,
    overallCompliance,
    nextEvaluationDate,
    auditTrail: sanitizeAuditTrailForClient(auditTrail), // PHI-safe audit trail
    regulatoryNotes: sanitizeAuditTrailForClient(regulatoryNotes), // PHI-safe notes
    policyMetadata,
    phaseAnalysis: {
      currentPhase: phase,
      phaseSpecificThreshold: currentPhaseConfig.threshold,
      meetsPhaseRequirement,
      phaseDescription: currentPhaseConfig.description
    }
  };
}

/**
 * Wound Healing Velocity Calculations
 * Implements area reduction rate per week and healing trajectory prediction
 */
export function calculateHealingVelocity(
  measurementHistory: any[]
): WoundHealingAnalysis['velocityMetrics'] {
  if (!measurementHistory || measurementHistory.length < 2) {
    return {
      averageWeeklyAreaReduction: 0,
      peakWeeklyReduction: 0,
      currentTrend: 'stalled',
      healingEfficiency: 0
    };
  }
  
  // Sort measurements chronologically
  const sortedMeasurements = measurementHistory
    .filter(m => m.calculatedArea && m.measurementTimestamp)
    .sort((a, b) => new Date(a.measurementTimestamp).getTime() - new Date(b.measurementTimestamp).getTime());
  
  if (sortedMeasurements.length < 2) {
    return {
      averageWeeklyAreaReduction: 0,
      peakWeeklyReduction: 0,
      currentTrend: 'stalled',
      healingEfficiency: 0
    };
  }
  
  // Calculate weekly area reduction rates
  const weeklyReductions: number[] = [];
  const weeklyDates: Date[] = [];
  
  for (let i = 1; i < sortedMeasurements.length; i++) {
    const prevMeasurement = sortedMeasurements[i - 1];
    const currMeasurement = sortedMeasurements[i];
    
    const prevArea = parseFloat(prevMeasurement.calculatedArea.toString());
    const currArea = parseFloat(currMeasurement.calculatedArea.toString());
    
    const daysBetween = Math.max(1, Math.floor(
      (new Date(currMeasurement.measurementTimestamp).getTime() - 
       new Date(prevMeasurement.measurementTimestamp).getTime()) / (1000 * 60 * 60 * 24)
    ));
    
    // Convert to weekly rate (cm²/week)
    const weeklyReduction = ((prevArea - currArea) / daysBetween) * 7;
    weeklyReductions.push(weeklyReduction);
    weeklyDates.push(new Date(currMeasurement.measurementTimestamp));
  }
  
  // Calculate metrics
  const averageWeeklyAreaReduction = weeklyReductions.reduce((sum, rate) => sum + rate, 0) / weeklyReductions.length;
  const peakWeeklyReduction = Math.max(...weeklyReductions.filter(rate => rate > 0));
  
  // Determine current trend (look at last 3 measurements if available)
  let currentTrend: 'accelerating' | 'steady' | 'decelerating' | 'stalled' = 'stalled';
  if (weeklyReductions.length >= 2) {
    const recentReductions = weeklyReductions.slice(-Math.min(3, weeklyReductions.length));
    const trendSlope = recentReductions.length >= 2 
      ? (recentReductions[recentReductions.length - 1] - recentReductions[0]) / (recentReductions.length - 1)
      : 0;
    
    if (Math.abs(trendSlope) < 0.1) {
      currentTrend = averageWeeklyAreaReduction > 0.5 ? 'steady' : 'stalled';
    } else if (trendSlope > 0.1) {
      currentTrend = 'accelerating';
    } else {
      currentTrend = 'decelerating';
    }
  }
  
  // Calculate projected healing time
  const initialArea = parseFloat(sortedMeasurements[0].calculatedArea.toString());
  const currentArea = parseFloat(sortedMeasurements[sortedMeasurements.length - 1].calculatedArea.toString());
  const projectedHealingTime = averageWeeklyAreaReduction > 0.1 
    ? Math.ceil(currentArea / averageWeeklyAreaReduction)
    : undefined;
  
  // Calculate healing efficiency (0-1 score based on optimal healing trajectory)
  const totalTimeWeeks = Math.max(1, Math.floor(
    (new Date(sortedMeasurements[sortedMeasurements.length - 1].measurementTimestamp).getTime() - 
     new Date(sortedMeasurements[0].measurementTimestamp).getTime()) / (1000 * 60 * 60 * 24 * 7)
  ));
  
  const actualReduction = initialArea - currentArea;
  const optimalReductionRate = initialArea * 0.15; // Assume 15% per week is optimal
  const expectedReduction = Math.min(initialArea, optimalReductionRate * totalTimeWeeks);
  const healingEfficiency = expectedReduction > 0 
    ? Math.min(1, Math.max(0, actualReduction / expectedReduction))
    : 0;
  
  return {
    averageWeeklyAreaReduction: Math.round(averageWeeklyAreaReduction * 100) / 100,
    peakWeeklyReduction: Math.round(peakWeeklyReduction * 100) / 100,
    currentTrend,
    projectedHealingTime,
    healingEfficiency: Math.round(healingEfficiency * 100) / 100
  };
}

/**
 * Task 1.3: Calculate wound area reduction percentage (Enhanced)
 */
export function calculateWoundAreaReduction(
  initialMeasurements: WoundMeasurements,
  currentMeasurements: WoundMeasurements,
  options: {
    enhancedCalculation?: boolean;
    measurementHistory?: any[];
    episodeId?: string;
  } = {}
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
 * Integration with Measurement History Functions
 * Leverage the woundMeasurementHistory table for comprehensive analysis
 */

// Get comprehensive wound progression analysis for an episode
export async function getWoundProgressionAnalysis(
  episodeId: string,
  measurementHistory: any[] = [] // From woundMeasurementHistory table
): Promise<WoundHealingAnalysis> {
  const analysisDate = new Date();
  
  if (!measurementHistory || measurementHistory.length === 0) {
    return {
      episodeId,
      analysisDate,
      totalMeasurements: 0,
      timeSpanDays: 0,
      velocityMetrics: {
        averageWeeklyAreaReduction: 0,
        peakWeeklyReduction: 0,
        currentTrend: 'stalled',
        healingEfficiency: 0
      },
      measurementQuality: {
        consistencyScore: 0,
        outlierCount: 0,
        validationRate: 0,
        dataQualityGrade: 'F'
      },
      clinicalInsights: {
        earlyWarnings: ['No measurement data available'],
        recommendations: ['Begin systematic wound measurement tracking'],
        interventionPoints: []
      },
      medicareCompliance: {
        meets20PercentReduction: false,
        currentReductionPercentage: 0,
        daysFromBaseline: 0,
        fourWeekPeriodAnalysis: [],
        overallCompliance: 'insufficient_data',
        auditTrail: ['No measurement history available'],
        regulatoryNotes: ['Insufficient data for Medicare LCD compliance assessment'],
        policyMetadata: {
          policyId: 'L39806',
          effectiveDate: '2023-10-01',
          lastUpdated: new Date().toISOString(),
          jurisdiction: 'Palmetto GBA Jurisdiction J'
        },
        phaseAnalysis: {
          currentPhase: 'pre-ctp',
          phaseSpecificThreshold: 50,
          meetsPhaseRequirement: false,
          phaseDescription: 'Insufficient data for phase analysis'
        }
      }
    };
  }
  
  // Sort measurements chronologically
  const validMeasurements = measurementHistory
    .filter(m => m.calculatedArea && m.measurementTimestamp)
    .sort((a, b) => new Date(a.measurementTimestamp).getTime() - new Date(b.measurementTimestamp).getTime());
  
  const totalMeasurements = validMeasurements.length;
  const timeSpanDays = totalMeasurements >= 2 
    ? Math.floor((new Date(validMeasurements[totalMeasurements - 1].measurementTimestamp).getTime() - 
                 new Date(validMeasurements[0].measurementTimestamp).getTime()) / (1000 * 60 * 60 * 24))
    : 0;
  
  // Calculate velocity metrics
  const velocityMetrics = calculateHealingVelocity(validMeasurements);
  
  // Calculate measurement quality metrics
  const measurementQuality = calculateMeasurementQuality(validMeasurements);
  
  // Generate clinical insights
  const clinicalInsights = generateClinicalInsights(validMeasurements, velocityMetrics);
  
  // Get Medicare compliance assessment
  const medicareCompliance = await validateMedicare20PercentReduction(episodeId, validMeasurements);
  
  return {
    episodeId,
    analysisDate,
    totalMeasurements,
    timeSpanDays,
    velocityMetrics,
    measurementQuality,
    clinicalInsights,
    medicareCompliance
  };
}

// Calculate baseline to 4-week reduction specifically for Medicare LCD
export async function calculateBaselineTo4WeekReduction(
  episodeId: string,
  measurementHistory: any[] = []
): Promise<{ reduction: number; meetsLCD: boolean; details: string }> {
  const validMeasurements = measurementHistory
    .filter(m => m.calculatedArea && m.measurementTimestamp)
    .sort((a, b) => new Date(a.measurementTimestamp).getTime() - new Date(b.measurementTimestamp).getTime());
  
  if (validMeasurements.length < 2) {
    return {
      reduction: 0,
      meetsLCD: false,
      details: 'Insufficient measurements for 4-week analysis'
    };
  }
  
  const baselineMeasurement = validMeasurements[0];
  const baselineDate = new Date(baselineMeasurement.measurementTimestamp);
  const fourWeekDate = new Date(baselineDate.getTime() + (28 * 24 * 60 * 60 * 1000));
  
  // Find measurement closest to 4-week mark
  const fourWeekMeasurement = validMeasurements
    .filter(m => new Date(m.measurementTimestamp) >= fourWeekDate)
    .sort((a, b) => Math.abs(fourWeekDate.getTime() - new Date(a.measurementTimestamp).getTime()) - 
                    Math.abs(fourWeekDate.getTime() - new Date(b.measurementTimestamp).getTime()))[0] ||
    validMeasurements[validMeasurements.length - 1]; // Fall back to latest if no 4-week measurement
  
  const baselineArea = parseFloat(baselineMeasurement.calculatedArea.toString());
  const fourWeekArea = parseFloat(fourWeekMeasurement.calculatedArea.toString());
  const reduction = baselineArea > 0 ? Math.round(((baselineArea - fourWeekArea) / baselineArea) * 100) : 0;
  const meetsLCD = reduction >= 20;
  
  const actualDays = Math.floor(
    (new Date(fourWeekMeasurement.measurementTimestamp).getTime() - baselineDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  
  return {
    reduction,
    meetsLCD,
    details: `${reduction}% reduction over ${actualDays} days from baseline ${baselineArea}cm² to ${fourWeekArea}cm² ${meetsLCD ? '(meets Medicare LCD ≥20% requirement)' : '(fails Medicare LCD ≥20% requirement)'}`
  };
}

// Detect measurement anomalies for quality control
export function detectMeasurementAnomalies(
  measurements: any[]
): MeasurementValidationResult[] {
  const results: MeasurementValidationResult[] = [];
  
  if (!measurements || measurements.length < 3) {
    return results; // Need at least 3 measurements for anomaly detection
  }
  
  const sortedMeasurements = measurements
    .filter(m => m.calculatedArea && m.measurementTimestamp)
    .sort((a, b) => new Date(a.measurementTimestamp).getTime() - new Date(b.measurementTimestamp).getTime());
  
  // Enhanced statistical parameters with robust metrics for small samples
  const areas = sortedMeasurements.map(m => parseFloat(m.calculatedArea.toString()));
  const mean = areas.reduce((sum, area) => sum + area, 0) / areas.length;
  
  // Helper function to calculate median
  function calculateMedian(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 
      ? sorted[mid] 
      : (sorted[mid - 1] + sorted[mid]) / 2;
  }
  
  // Use MAD (Median Absolute Deviation) for small samples, standard deviation for larger samples
  let outlierThreshold: number;
  if (areas.length <= 5) {
    // Small sample: Use MAD which is more robust to outliers
    const median = calculateMedian(areas);
    const deviations = areas.map(area => Math.abs(area - median));
    const mad = calculateMedian(deviations);
    // Scale factor 1.4826 makes MAD consistent with standard deviation for normal distributions
    const madScaled = mad * 1.4826;
    outlierThreshold = madScaled * 2.5;
  } else {
    // Large sample: Use traditional standard deviation
    const stdDev = Math.sqrt(areas.reduce((sum, area) => sum + Math.pow(area - mean, 2), 0) / areas.length);
    outlierThreshold = stdDev * 2.5;
  }
  
  // Check each measurement
  for (let i = 0; i < sortedMeasurements.length; i++) {
    const measurement = sortedMeasurements[i];
    const area = parseFloat(measurement.calculatedArea.toString());
    const measurementId = measurement.id || `measurement_${i}`;
    
    const validationFlags = {
      isOutlier: Math.abs(area - mean) > outlierThreshold,
      needsClinicalReview: false,
      inconsistentWithTrend: false,
      measurementGaps: false,
      dimensionalInconsistency: false
    };
    
    const recommendations: string[] = [];
    let qualityScore = 1.0;
    
    // Check for outliers using robust threshold
    if (validationFlags.isOutlier) {
      qualityScore -= 0.3;
      const outlierMagnitude = Math.abs(area - mean) / (outlierThreshold / 2.5);
      if (outlierMagnitude > 3) {
        recommendations.push('Severe outlier detected - immediate clinical review required');
        validationFlags.needsClinicalReview = true;
      } else {
        recommendations.push('Measurement appears to be an outlier - verify accuracy and clinical context');
      }
    }
    
    // Check for trend inconsistency (sudden large changes)
    if (i > 0 && i < sortedMeasurements.length - 1) {
      const prevArea = parseFloat(sortedMeasurements[i - 1].calculatedArea.toString());
      const nextArea = parseFloat(sortedMeasurements[i + 1].calculatedArea.toString());
      
      const prevChange = Math.abs(area - prevArea) / prevArea;
      const nextChange = Math.abs(nextArea - area) / area;
      
      if (prevChange > 0.5 || nextChange > 0.5) {
        validationFlags.inconsistentWithTrend = true;
        qualityScore -= 0.2;
        recommendations.push('Large measurement change detected - verify clinical context');
      }
    }
    
    // Check for measurement gaps (>14 days between measurements)
    if (i > 0) {
      const daysBetween = Math.floor(
        (new Date(measurement.measurementTimestamp).getTime() - 
         new Date(sortedMeasurements[i - 1].measurementTimestamp).getTime()) / (1000 * 60 * 60 * 24)
      );
      
      if (daysBetween > 14) {
        validationFlags.measurementGaps = true;
        qualityScore -= 0.1;
        recommendations.push(`${daysBetween}-day gap since previous measurement - consider more frequent monitoring`);
      }
    }
    
    // Determine if clinical review needed
    validationFlags.needsClinicalReview = validationFlags.isOutlier || 
                                           validationFlags.inconsistentWithTrend;
    
    if (validationFlags.needsClinicalReview) {
      qualityScore -= 0.2;
      recommendations.push('Clinical review recommended due to measurement concerns');
    }
    
    results.push({
      measurementId,
      isValid: qualityScore >= 0.7,
      qualityScore: Math.round(qualityScore * 100) / 100,
      validationFlags,
      recommendations
    });
  }
  
  return results;
}

// Helper function to calculate measurement quality metrics
function calculateMeasurementQuality(measurements: any[]): WoundHealingAnalysis['measurementQuality'] {
  if (measurements.length === 0) {
    return {
      consistencyScore: 0,
      outlierCount: 0,
      validationRate: 0,
      dataQualityGrade: 'F'
    };
  }
  
  const validationResults = detectMeasurementAnomalies(measurements);
  const outlierCount = validationResults.filter(r => r.validationFlags.isOutlier).length;
  const validatedCount = measurements.filter(m => m.validationStatus === 'validated').length;
  const validationRate = Math.round((validatedCount / measurements.length) * 100);
  
  // Calculate consistency score based on trend smoothness
  const areas = measurements.map(m => parseFloat(m.calculatedArea.toString()));
  const mean = areas.reduce((sum, area) => sum + area, 0) / areas.length;
  const variance = areas.reduce((sum, area) => sum + Math.pow(area - mean, 2), 0) / areas.length;
  const coefficientOfVariation = Math.sqrt(variance) / mean;
  const consistencyScore = Math.max(0, Math.min(1, 1 - (coefficientOfVariation / 2)));
  
  // Determine overall grade
  const avgQualityScore = validationResults.reduce((sum, r) => sum + r.qualityScore, 0) / validationResults.length;
  const dataQualityGrade: 'A' | 'B' | 'C' | 'D' | 'F' = 
    avgQualityScore >= 0.9 ? 'A' :
    avgQualityScore >= 0.8 ? 'B' :
    avgQualityScore >= 0.7 ? 'C' :
    avgQualityScore >= 0.6 ? 'D' : 'F';
  
  return {
    consistencyScore: Math.round(consistencyScore * 100) / 100,
    outlierCount,
    validationRate,
    dataQualityGrade
  };
}

// Generate clinical insights based on measurement analysis
function generateClinicalInsights(
  measurements: any[],
  velocityMetrics: WoundHealingAnalysis['velocityMetrics']
): WoundHealingAnalysis['clinicalInsights'] {
  const earlyWarnings: string[] = [];
  const recommendations: string[] = [];
  const interventionPoints: Date[] = [];
  
  if (measurements.length === 0) {
    return { earlyWarnings, recommendations, interventionPoints };
  }
  
  // Analyze healing trend
  if (velocityMetrics.currentTrend === 'stalled') {
    earlyWarnings.push('Wound healing appears to have stalled');
    recommendations.push('Consider advanced wound care interventions or CTP therapy');
  } else if (velocityMetrics.currentTrend === 'decelerating') {
    earlyWarnings.push('Wound healing rate is declining');
    recommendations.push('Reassess current treatment plan and consider modifications');
  }
  
  // Analyze healing efficiency
  if (velocityMetrics.healingEfficiency < 0.3) {
    earlyWarnings.push('Poor healing efficiency detected');
    recommendations.push('Evaluate for underlying factors impeding healing (infection, vascular issues, etc.)');
  }
  
  return {
    earlyWarnings,
    recommendations,
    interventionPoints
  };
}

/**
 * Extract wound measurements from encounter data
 */
/**
 * Handle multiple same-day measurements deterministically
 * Returns the measurement with the highest quality score, or latest timestamp if tied
 */
function selectBestSameDayMeasurement(
  measurements: any[], 
  targetDate: Date
): any | null {
  // Get all measurements on the target date
  const sameDayMeasurements = measurements.filter(m => {
    const measurementDate = new Date(m.measurementTimestamp);
    return measurementDate.toDateString() === targetDate.toDateString();
  });
  
  if (sameDayMeasurements.length === 0) return null;
  if (sameDayMeasurements.length === 1) return sameDayMeasurements[0];
  
  // Multiple measurements on same day - apply deterministic selection
  const scoredMeasurements = sameDayMeasurements.map(m => {
    let qualityScore = 1.0;
    
    // Prefer validated measurements
    if (m.validationStatus === 'validated') qualityScore += 0.3;
    else if (m.validationStatus === 'flagged') qualityScore -= 0.2;
    
    // Prefer measurements with more complete data
    if (m.measurementPoints && m.measurementPoints.length >= 3) qualityScore += 0.2;
    if (m.depth && !isNaN(parseFloat(m.depth))) qualityScore += 0.1;
    if (m.recordedBy) qualityScore += 0.1;
    
    // Prefer measurements with clear method documentation
    if (m.measurementMethod && m.measurementMethod !== 'unknown') qualityScore += 0.1;
    
    return { measurement: m, score: qualityScore };
  });
  
  // Sort by quality score (descending), then by timestamp (latest first)
  scoredMeasurements.sort((a, b) => {
    if (Math.abs(a.score - b.score) < 0.01) {
      // Scores are essentially equal, use latest timestamp
      return new Date(b.measurement.measurementTimestamp).getTime() - 
             new Date(a.measurement.measurementTimestamp).getTime();
    }
    return b.score - a.score;
  });
  
  return scoredMeasurements[0].measurement;
}

/**
 * Enhanced measurement extraction with auto-correction safeguards
 */
export function extractWoundMeasurements(
  woundDetails: any, 
  enableAutoCorrection: boolean = false
): WoundMeasurements | null {
  if (!woundDetails || !woundDetails.measurements) {
    return null;
  }
  
  const measurements = woundDetails.measurements;
  
  // Ensure we have numeric values with unit normalization
  const rawLength = typeof measurements.length === 'number' ? measurements.length : 
                    typeof measurements.length === 'string' ? parseFloat(measurements.length) : null;
  const rawWidth = typeof measurements.width === 'number' ? measurements.width :
                   typeof measurements.width === 'string' ? parseFloat(measurements.width) : null;
  const rawDepth = typeof measurements.depth === 'number' ? measurements.depth :
                   typeof measurements.depth === 'string' ? parseFloat(measurements.depth) : null;
  
  // Return null if essential measurements are missing or invalid
  if (rawLength === null || rawWidth === null || isNaN(rawLength) || isNaN(rawWidth)) {
    return null;
  }
  
  const sourceUnit = measurements.unit || 'cm';
  
  // Normalize to cm for consistency
  const length = convertToStandardUnit(rawLength, sourceUnit);
  const width = convertToStandardUnit(rawWidth, sourceUnit);
  const depth = rawDepth && !isNaN(rawDepth) ? convertToStandardUnit(rawDepth, sourceUnit) : undefined;
  
  // Auto-correction safeguards: validate reasonable dimensions
  const warnings: string[] = [];
  
  if (length > 50 || width > 50) {
    warnings.push('Unusually large wound dimensions detected - verify unit and measurement accuracy');
  }
  
  if (length < 0.1 || width < 0.1) {
    warnings.push('Unusually small wound dimensions detected - verify measurement precision');
  }
  
  if (depth && depth > length && depth > width) {
    warnings.push('Depth exceeds both length and width - verify measurement accuracy');
  }
  
  // Auto-correction: Only suggest, never modify stored data
  let autoCorrections: any = undefined;
  if (enableAutoCorrection && warnings.length > 0) {
    // Example auto-correction logic (suggestions only)
    const aspectRatio = Math.max(length, width) / Math.min(length, width);
    if (aspectRatio > 10) {
      // Suggest more reasonable dimensions if aspect ratio is extreme
      const avgDimension = (length + width) / 2;
      autoCorrections = {
        suggestedLength: Math.max(length, width) > avgDimension * 3 ? avgDimension * 2 : length,
        suggestedWidth: Math.min(length, width) < avgDimension / 3 ? avgDimension / 2 : width,
        confidence: 0.3, // Low confidence - require clinical review
        reason: 'Extreme aspect ratio detected - suggested more typical wound proportions'
      };
    }
  }
  
  const result: WoundMeasurements = {
    length,
    width,
    depth,
    area: measurements.area ? convertToStandardUnit(measurements.area, sourceUnit) : 
          calculateSmartWoundArea({ length, width, unit: 'cm', measurementMethod: measurements.measurementMethod }),
    unit: 'cm', // Always normalized to cm
    measurementPoints: measurements.measurementPoints,
    measurementMethod: measurements.measurementMethod || 'rectangular',
    measurementTimestamp: measurements.measurementTimestamp ? new Date(measurements.measurementTimestamp) : undefined,
    recordedBy: measurements.recordedBy,
    validationStatus: measurements.validationStatus || 'pending'
  };
  
  if (autoCorrections) {
    (result as any).autoCorrections = autoCorrections;
  }
  
  if (warnings.length > 0) {
    (result as any).validationWarnings = warnings;
  }
  
  return result;
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
  
  // Get patient diabetic status from encounters (prefer latest known status)
  const rawDiabeticStatus = encounters
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) // Sort by date descending
    .find(enc => enc.diabeticStatus)?.diabeticStatus;
  const diabeticStatus = normalizeDiabeticStatus(rawDiabeticStatus);
  auditTrail.push(`Patient diabetic status: ${diabeticStatus} (from latest encounter, original: "${rawDiabeticStatus || 'Not specified'}")`);
  
  // Task 1.1: Wound Type Validation
  auditTrail.push('Performing wound type validation...');
  const encounterNotes = encounters.flatMap(enc => enc.notes || []);
  const woundTypeCheck = validateWoundTypeForCoverage(
    episode.woundType,
    episode.primaryDiagnosis,
    encounterNotes,
    rawDiabeticStatus  // Pass raw value so function can normalize internally and preserve original in details
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
    auditTrail: sanitizeAuditTrailForClient(auditTrail) // PHI-safe audit trail for client exposure
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
  
  // Test Case 3: Enhanced Area Reduction Calculation
  console.log('\n=== Test Case 3: Enhanced Area Reduction Calculation ===');
  const initialMeasurement = { 
    length: 4, 
    width: 3, 
    unit: 'cm',
    measurementMethod: 'elliptical' as const,
    measurementTimestamp: new Date('2024-07-01')
  };
  const currentMeasurement = { 
    length: 2, 
    width: 2, 
    unit: 'cm',
    measurementMethod: 'elliptical' as const,
    measurementTimestamp: new Date('2024-07-30')
  };
  
  // Test basic calculation
  const basicResult = calculateWoundAreaReduction(initialMeasurement, currentMeasurement);
  console.log('Basic Area Reduction Result:', basicResult);
  
  // Test enhanced calculation
  const enhancedResult = calculateWoundAreaReduction(
    initialMeasurement, 
    currentMeasurement,
    { enhancedCalculation: true }
  );
  console.log('Enhanced Area Reduction Result:', enhancedResult);
  
  // Test Case 4: Advanced Area Calculation Methods
  console.log('\n=== Test Case 4: Advanced Area Calculation Methods ===');
  
  // Test elliptical calculation
  const ellipticalArea = calculateEllipticalArea(4, 3);
  console.log(`Elliptical area (4cm x 3cm): ${Math.round(ellipticalArea * 100) / 100} cm²`);
  
  // Test volume calculation
  const volume = calculateWoundVolume(4, 3, 0.5);
  console.log(`Wound volume (4cm x 3cm x 0.5cm): ${Math.round(volume * 100) / 100} cm³`);
  
  // Test irregular wound calculation
  const irregularPoints = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 3 },
    { x: 2, y: 4 },
    { x: 0, y: 3 }
  ];
  const irregularArea = calculateIrregularWoundArea(irregularPoints);
  if (typeof irregularArea === 'number') {
    console.log(`Irregular wound area: ${Math.round(irregularArea * 100) / 100} cm²`);
  } else if (irregularArea && typeof irregularArea === 'object' && 'area' in irregularArea) {
    console.log(`Irregular wound area: ${Math.round(irregularArea.area * 100) / 100} cm²`);
  }
  
  // Test Case 5: Measurement Quality Control
  console.log('\n=== Test Case 5: Measurement Quality Control ===');
  const sampleMeasurements = [
    {
      id: 'measurement_1',
      calculatedArea: 12.0,
      length: 4,
      width: 3,
      measurementTimestamp: '2024-07-01T10:00:00Z'
    },
    {
      id: 'measurement_2',
      calculatedArea: 10.5,
      length: 3.5,
      width: 3,
      measurementTimestamp: '2024-07-08T10:00:00Z'
    },
    {
      id: 'measurement_3',
      calculatedArea: 25.0, // Outlier - suspicious jump
      length: 5,
      width: 5,
      measurementTimestamp: '2024-07-15T10:00:00Z'
    },
    {
      id: 'measurement_4',
      calculatedArea: 8.0,
      length: 3,
      width: 2.5,
      measurementTimestamp: '2024-07-22T10:00:00Z'
    }
  ];
  
  const qualityResults = detectMeasurementAnomalies(sampleMeasurements);
  console.log('Measurement Quality Results:');
  qualityResults.forEach((result: MeasurementValidationResult) => {
    console.log(`  ${result.measurementId}: Quality Score ${result.qualityScore}, Valid: ${result.isValid}`);
    if (result.validationFlags.isOutlier) {
      console.log(`    - WARNING: Outlier detected`);
    }
    result.recommendations.forEach((rec: string) => console.log(`    - ${rec}`));
  });
  
  console.log('\n=== Enhanced Eligibility Validator Tests Complete ===');
}

/**
 * Test Medicare LCD 20% Reduction Validation
 * This function tests the new Medicare LCD compliance functionality
 */
export async function testMedicareLCDCompliance(): Promise<void> {
  console.log('\n=== Testing Medicare LCD 20% Reduction Compliance ===');
  
  const sampleMeasurementHistory = [
    {
      id: 'hist_1',
      calculatedArea: 15.0,
      measurementTimestamp: '2024-07-01T10:00:00Z',
      daysSinceEpisodeStart: 0
    },
    {
      id: 'hist_2',
      calculatedArea: 13.5,
      measurementTimestamp: '2024-07-08T10:00:00Z',
      daysSinceEpisodeStart: 7
    },
    {
      id: 'hist_3',
      calculatedArea: 12.0,
      measurementTimestamp: '2024-07-15T10:00:00Z',
      daysSinceEpisodeStart: 14
    },
    {
      id: 'hist_4',
      calculatedArea: 11.5,
      measurementTimestamp: '2024-07-22T10:00:00Z',
      daysSinceEpisodeStart: 21
    },
    {
      id: 'hist_5',
      calculatedArea: 10.0, // 33% reduction from baseline - should meet LCD
      measurementTimestamp: '2024-07-29T10:00:00Z',
      daysSinceEpisodeStart: 28
    }
  ];
  
  try {
    // Test Medicare LCD compliance
    const lcdResult = await validateMedicare20PercentReduction('test-episode', sampleMeasurementHistory);
    console.log('Medicare LCD Compliance Result:');
    console.log(`  Meets 20% Reduction: ${lcdResult.meets20PercentReduction}`);
    console.log(`  Current Reduction: ${lcdResult.currentReductionPercentage}%`);
    console.log(`  Days from Baseline: ${lcdResult.daysFromBaseline}`);
    console.log(`  Overall Compliance: ${lcdResult.overallCompliance}`);
    console.log(`  4-Week Periods Analyzed: ${lcdResult.fourWeekPeriodAnalysis.length}`);
    
    // Test healing velocity
    const velocityMetrics = calculateHealingVelocity(sampleMeasurementHistory);
    console.log('\nHealing Velocity Metrics:');
    console.log(`  Average Weekly Reduction: ${velocityMetrics.averageWeeklyAreaReduction} cm²/week`);
    console.log(`  Current Trend: ${velocityMetrics.currentTrend}`);
    console.log(`  Healing Efficiency: ${velocityMetrics.healingEfficiency}`);
    if (velocityMetrics.projectedHealingTime) {
      console.log(`  Projected Healing Time: ${velocityMetrics.projectedHealingTime} weeks`);
    }
    
    // Test comprehensive wound analysis
    const progressionAnalysis = await getWoundProgressionAnalysis('test-episode', sampleMeasurementHistory);
    console.log('\nWound Progression Analysis:');
    console.log(`  Total Measurements: ${progressionAnalysis.totalMeasurements}`);
    console.log(`  Time Span: ${progressionAnalysis.timeSpanDays} days`);
    console.log(`  Data Quality Grade: ${progressionAnalysis.measurementQuality.dataQualityGrade}`);
    console.log(`  Early Warnings: ${progressionAnalysis.clinicalInsights.earlyWarnings.length}`);
    console.log(`  Recommendations: ${progressionAnalysis.clinicalInsights.recommendations.length}`);
    
  } catch (error) {
    console.error('Medicare LCD testing failed:', error);
  }
  
  console.log('\n=== Medicare LCD Testing Complete ===');
}