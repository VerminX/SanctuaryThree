import { getISOWeek, getISOWeekYear, addDays, isSameISOWeek, parseISO, format } from 'date-fns';
import { Episode, Encounter, woundDetailsSchema, conservativeCareSchema } from './schema';
import { ICD10_DATABASE, getCodeByCode } from './icd10Database';
import { z } from 'zod';

// Type definitions
export type WoundDetails = z.infer<typeof woundDetailsSchema>;
export type ConservativeCare = z.infer<typeof conservativeCareSchema>;

export type ComplianceStatus = 'compliant' | 'compliant-with-exception' | 'at-risk' | 'non-compliant';
export type TrafficLightStatus = 'green' | 'yellow' | 'red';

// Exception types for documented clinical reasons
export interface DocumentedException {
  id: string;
  week: string; // ISO week identifier (e.g., "2024-W01")
  type: 'holiday' | 'inpatient-stay' | 'medical-emergency' | 'patient-unavailable' | 'other';
  reason: string;
  documentedBy: string;
  documentedDate: Date;
  isValidException: boolean;
}

// Enhanced wound type classification using ICD-10 codes
export interface WoundClassification {
  isDFU: boolean;
  isVLU: boolean;
  isPU: boolean; // Pressure ulcer
  isArterial: boolean;
  category: 'diabetic-foot' | 'venous-leg' | 'pressure' | 'arterial' | 'other';
  requiresOffloading: boolean;
  requiresCompression: boolean;
  icd10Codes: string[];
  evidenceSource: 'icd10-primary' | 'icd10-secondary' | 'wound-type-field' | 'clinical-assessment';
}

// Medicare compliance result interface
export interface MedicareComplianceResult {
  overallStatus: ComplianceStatus;
  trafficLight: TrafficLightStatus;
  score: number;
  conservativeCareDays: number;
  weeklyAssessments: {
    required: number;
    documented: number;
    missing: number;
    coverage: number;
    missingWeeks: string[];
    exceptions: DocumentedException[];
    statusWithExceptions: ComplianceStatus;
  };
  woundReduction: {
    baseline: number;
    current: number;
    percentage: number;
    meetsThreshold: boolean;
    daysSinceBaseline: number;
    isIn28DayWindow: boolean;
  };
  standardOfCare: {
    offloading: boolean | null; // null if not required
    compression: boolean | null; // null if not required
    infectionControl: boolean;
    patientEducation: boolean;
  };
  criticalGaps: string[];
  recommendations: string[];
  daysToDeadline: number;
}

// Centralized parsing functions
export function parseWoundDetails(woundDetailsJson: any): WoundDetails | null {
  try {
    if (!woundDetailsJson) return null;
    return woundDetailsSchema.parse(woundDetailsJson);
  } catch (error) {
    console.warn('Failed to parse wound details:', error);
    return null;
  }
}

export function parseConservativeCare(conservativeCareJson: any): ConservativeCare | null {
  try {
    if (!conservativeCareJson) return null;
    return conservativeCareSchema.parse(conservativeCareJson);
  } catch (error) {
    console.warn('Failed to parse conservative care:', error);
    return null;
  }
}

// Fixed ISO Week calculation using date-fns
export function getISOWeekIdentifier(date: Date): string {
  try {
    const weekNumber = getISOWeek(date);
    const weekYear = getISOWeekYear(date);
    return `${weekYear}-W${weekNumber.toString().padStart(2, '0')}`;
  } catch (error) {
    console.error('Error calculating ISO week:', error);
    // Fallback to basic calculation if date-fns fails
    return `${date.getFullYear()}-W${Math.ceil(date.getDate() / 7).toString().padStart(2, '0')}`;
  }
}

// Get all expected ISO weeks between two dates
export function getExpectedISOWeeks(startDate: Date, endDate: Date): string[] {
  const weeks: Set<string> = new Set();
  let current = new Date(startDate);
  
  // Start from the beginning of the ISO week containing the start date
  const startOfFirstWeek = addDays(current, -(current.getDay() === 0 ? 6 : current.getDay() - 1));
  current = startOfFirstWeek;
  
  while (current <= endDate) {
    weeks.add(getISOWeekIdentifier(current));
    current = addDays(current, 7); // Move to next week
  }
  
  return Array.from(weeks).sort();
}

// Enhanced wound classification using ICD-10 codes and wound type field
export function classifyWound(
  episode: Episode,
  icd10Code?: string
): WoundClassification {
  // Use provided ICD-10 code or fall back to episode's primary diagnosis
  const codeToAnalyze = icd10Code || episode.primaryDiagnosis || '';
  
  let classification: WoundClassification = {
    isDFU: false,
    isVLU: false,
    isPU: false,
    isArterial: false,
    category: 'other',
    requiresOffloading: false,
    requiresCompression: false,
    icd10Codes: [],
    evidenceSource: 'clinical-assessment'
  };

  // First, try direct ICD-10 code matching with enhanced mapping rules
  if (codeToAnalyze) {
    classification.icd10Codes.push(codeToAnalyze);
    
    // Enhanced ICD-10 mapping rules as specified
    if (codeToAnalyze.startsWith('E10.6') || codeToAnalyze.startsWith('E11.6') || codeToAnalyze.startsWith('E13.6')) {
      // Diabetic foot ulcers
      classification.isDFU = true;
      classification.category = 'diabetic-foot';
      classification.requiresOffloading = true;
      classification.evidenceSource = 'icd10-primary';
    } else if (codeToAnalyze.startsWith('I83.0') || codeToAnalyze.startsWith('I83.2') || codeToAnalyze.startsWith('I87')) {
      // Venous leg ulcers
      classification.isVLU = true;
      classification.category = 'venous-leg';
      classification.requiresCompression = true;
      classification.evidenceSource = 'icd10-primary';
    } else if (codeToAnalyze.startsWith('L89')) {
      // Pressure ulcers
      classification.isPU = true;
      classification.category = 'pressure';
      classification.evidenceSource = 'icd10-primary';
    } else if (codeToAnalyze.startsWith('L97')) {
      // Non-pressure chronic ulcers - determine specific type from location if available
      const location = episode.woundLocation?.toLowerCase() || '';
      if (location.includes('foot') || location.includes('toe') || location.includes('heel')) {
        // Likely DFU if on foot
        classification.isDFU = true;
        classification.category = 'diabetic-foot';
        classification.requiresOffloading = true;
      } else if (location.includes('leg') || location.includes('ankle') || location.includes('calf')) {
        // Likely VLU if on leg
        classification.isVLU = true;
        classification.category = 'venous-leg';
        classification.requiresCompression = true;
      } else {
        classification.category = 'chronic_wound';
      }
      classification.evidenceSource = 'icd10-primary';
    } else if (codeToAnalyze.startsWith('L98.4')) {
      // Non-healing surgical wounds
      classification.category = 'chronic_wound';
      classification.evidenceSource = 'icd10-primary';
    } else {
      // Try database lookup for other codes
      const databaseCode = getCodeByCode(codeToAnalyze);
      if (databaseCode) {
        classification.evidenceSource = 'icd10-primary';
        
        switch (databaseCode.category) {
          case 'Diabetic Foot Ulcer':
            classification.isDFU = true;
            classification.category = 'diabetic-foot';
            classification.requiresOffloading = true;
            break;
          case 'Venous Leg Ulcer':
            classification.isVLU = true;
            classification.category = 'venous-leg';
            classification.requiresCompression = true;
            break;
          case 'Pressure Ulcer':
            classification.isPU = true;
            classification.category = 'pressure';
            break;
          case 'Arterial Ulcer':
            classification.isArterial = true;
            classification.category = 'arterial';
            break;
        }
      }
    }
  }

  // If no ICD-10 match, fall back to wound type field with improved parsing
  if (classification.category === 'other' && episode.woundType) {
    classification.evidenceSource = 'wound-type-field';
    const woundType = episode.woundType.toLowerCase();
    const location = episode.woundLocation?.toLowerCase() || '';
    
    // Handle "full-thickness ulceration" terminology with location context
    if (woundType.includes('full-thickness') || woundType.includes('full thickness')) {
      if (woundType.includes('ulcer') || woundType.includes('wound')) {
        // Full-thickness ulceration with location context
        if (location.includes('foot') || location.includes('toe') || location.includes('heel') ||
            woundType.includes('foot') || woundType.includes('toe') || woundType.includes('heel')) {
          classification.isDFU = true;
          classification.category = 'diabetic-foot';
          classification.requiresOffloading = true;
        } else if (location.includes('leg') || location.includes('ankle') || location.includes('calf') ||
                   woundType.includes('leg') || woundType.includes('ankle') || woundType.includes('calf')) {
          classification.isVLU = true;
          classification.category = 'venous-leg';
          classification.requiresCompression = true;
        } else {
          // Full-thickness ulceration without clear location - default to chronic wound
          classification.category = 'chronic_wound';
        }
      }
    }
    
    // Continue with pattern matching if not already classified
    if (classification.category === 'other') {
      // More sophisticated pattern matching for wound types
      const dfuPatterns = [
        /\bdfu\b/, /diabetic.*foot/, /foot.*diabetic/, /diabetic.*ulcer.*foot/,
        /plantar.*ulcer/, /toe.*ulcer.*diabet/, /heel.*ulcer.*diabet/,
        /diabetic.*ulcer/, /neuropathic.*ulcer/
      ];
      
      const vluPatterns = [
        /\bvlu\b/, /venous.*leg/, /leg.*venous/, /venous.*ulcer.*leg/,
        /stasis.*ulcer/, /chronic.*venous/, /lower.*leg.*ulcer/,
        /venous.*insufficiency/, /venous.*stasis/
      ];
      
      const puPatterns = [
        /pressure.*ulcer/, /decubitus/, /bed.*sore/, /pressure.*sore/,
        /stage.*[1-4]/, /sacral.*ulcer/, /heel.*pressure/
      ];
      
      const arterialPatterns = [
        /arterial.*ulcer/, /ischemic.*ulcer/, /\bpad\b.*ulcer/,
        /peripheral.*arterial/, /arterial.*insufficiency/
      ];
      
      if (dfuPatterns.some(pattern => pattern.test(woundType))) {
        classification.isDFU = true;
        classification.category = 'diabetic-foot';
        classification.requiresOffloading = true;
      } else if (vluPatterns.some(pattern => pattern.test(woundType))) {
        classification.isVLU = true;
        classification.category = 'venous-leg';
        classification.requiresCompression = true;
      } else if (puPatterns.some(pattern => pattern.test(woundType))) {
        classification.isPU = true;
        classification.category = 'pressure';
      } else if (arterialPatterns.some(pattern => pattern.test(woundType))) {
        classification.isArterial = true;
        classification.category = 'arterial';
      } else {
        // Default to chronic wound for unmatched types
        classification.category = 'chronic_wound';
      }
    }
  }
  
  return classification;
}

// Calculate weekly assessment compliance with exception handling
export function assessWeeklyCompliance(
  encounters: Encounter[],
  episodeStartDate: Date,
  currentDate: Date,
  documentedExceptions: DocumentedException[] = []
): {
  requiredWeeks: string[];
  documentedWeeks: string[];
  missingWeeks: string[];
  coverage: number;
  status: ComplianceStatus;
  trafficLight: TrafficLightStatus;
  validExceptions: DocumentedException[];
} {
  const expectedWeeks = getExpectedISOWeeks(episodeStartDate, currentDate);
  const documentedWeeks: Set<string> = new Set();
  
  // Track which weeks have measurements
  encounters.forEach(encounter => {
    const woundDetails = parseWoundDetails(encounter.woundDetails);
    if (woundDetails?.measurements || woundDetails?.currentMeasurement) {
      const week = getISOWeekIdentifier(new Date(encounter.date));
      documentedWeeks.add(week);
    }
  });
  
  const documentedWeeksList = Array.from(documentedWeeks);
  const missingWeeks = expectedWeeks.filter(week => !documentedWeeks.has(week));
  
  // Process exceptions - only count valid, documented exceptions
  const validExceptions = documentedExceptions.filter(exception => {
    return exception.isValidException && 
           missingWeeks.includes(exception.week) &&
           ['holiday', 'inpatient-stay', 'medical-emergency', 'patient-unavailable'].includes(exception.type);
  });
  
  // Calculate compliance with exceptions considered
  const exceptedWeeks = validExceptions.map(ex => ex.week);
  const missingWithoutExceptions = missingWeeks.filter(week => !exceptedWeeks.includes(week));
  
  const coverage = expectedWeeks.length > 0 
    ? (documentedWeeksList.length / expectedWeeks.length) * 100 
    : 100;
    
  const effectiveCoverage = expectedWeeks.length > 0
    ? ((documentedWeeksList.length + validExceptions.length) / expectedWeeks.length) * 100
    : 100;
  
  // Determine compliance status with exception handling
  let status: ComplianceStatus;
  let trafficLight: TrafficLightStatus;
  
  if (missingWithoutExceptions.length === 0) {
    if (validExceptions.length === 0) {
      status = 'compliant';
      trafficLight = 'green';
    } else {
      status = 'compliant-with-exception';
      trafficLight = 'yellow';
    }
  } else if (effectiveCoverage >= 85) {
    status = 'at-risk';
    trafficLight = 'yellow';
  } else {
    status = 'non-compliant';
    trafficLight = 'red';
  }
  
  return {
    requiredWeeks: expectedWeeks,
    documentedWeeks: documentedWeeksList,
    missingWeeks: missingWithoutExceptions,
    coverage: effectiveCoverage,
    status,
    trafficLight,
    validExceptions
  };
}

// Calculate 20% reduction compliance (centralized logic)
export function assessWoundReduction(encounters: Encounter[], episodeStartDate: Date): {
  baseline: number;
  current: number;
  percentage: number;
  meetsThreshold: boolean;
  daysSinceBaseline: number;
  isIn28DayWindow: boolean;
} {
  const sortedEncounters = encounters
    .map(encounter => ({
      id: encounter.id,
      date: new Date(encounter.date),
      woundDetails: parseWoundDetails(encounter.woundDetails)
    }))
    .filter(enc => enc.woundDetails?.measurements || enc.woundDetails?.currentMeasurement)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (sortedEncounters.length < 1) {
    return {
      baseline: 0,
      current: 0,
      percentage: 0,
      meetsThreshold: false,
      daysSinceBaseline: 0,
      isIn28DayWindow: true
    };
  }

  const today = new Date();
  const daysSinceBaseline = Math.ceil((today.getTime() - episodeStartDate.getTime()) / (1000 * 60 * 60 * 24));
  const isIn28DayWindow = daysSinceBaseline <= 28;

  // Get baseline measurement (first available)
  const baselineEncounter = sortedEncounters[0];
  const baselineMeasurements = baselineEncounter.woundDetails?.measurements || baselineEncounter.woundDetails?.currentMeasurement;
  const baseline = calculateWoundArea(baselineMeasurements);

  // Get current measurement (latest available)
  const currentEncounter = sortedEncounters[sortedEncounters.length - 1];
  const currentMeasurements = currentEncounter.woundDetails?.measurements || currentEncounter.woundDetails?.currentMeasurement;
  const current = calculateWoundArea(currentMeasurements);

  const percentage = baseline > 0 ? Math.max(0, ((baseline - current) / baseline) * 100) : 0;
  const meetsThreshold = percentage >= 20;

  return {
    baseline,
    current,
    percentage,
    meetsThreshold,
    daysSinceBaseline,
    isIn28DayWindow
  };
}

// Helper function to calculate wound area from measurements
function calculateWoundArea(measurements: any): number {
  if (!measurements) return 0;
  
  // Try to get area directly
  if (typeof measurements.area === 'number' && measurements.area > 0) {
    return measurements.area;
  }
  
  // Calculate from length and width
  const length = typeof measurements.length === 'number' ? measurements.length : null;
  const width = typeof measurements.width === 'number' ? measurements.width : null;
  
  if (length && width && length > 0 && width > 0) {
    return length * width;
  }
  
  return 0;
}

// Assess standard of care compliance based on wound classification
export function assessStandardOfCare(
  encounters: Encounter[],
  woundClassification: WoundClassification
): {
  offloading: boolean | null;
  compression: boolean | null;
  infectionControl: boolean;
  patientEducation: boolean;
} {
  const allInterventions = encounters
    .map(enc => parseConservativeCare(enc.conservativeCare))
    .filter((care): care is ConservativeCare => care !== null)
    .flatMap(care => care.interventions || []);

  // Offloading assessment (required for DFU)
  let offloading: boolean | null = null;
  if (woundClassification.requiresOffloading) {
    offloading = allInterventions.some(intervention =>
      intervention.type?.includes('offloading') ||
      intervention.name?.toLowerCase().includes('offloading') ||
      intervention.name?.toLowerCase().includes('tcc') ||
      intervention.name?.toLowerCase().includes('total contact cast') ||
      intervention.name?.toLowerCase().includes('boot')
    );
  }

  // Compression assessment (required for VLU)
  let compression: boolean | null = null;
  if (woundClassification.requiresCompression) {
    compression = allInterventions.some(intervention =>
      intervention.type === 'compression_therapy' ||
      intervention.name?.toLowerCase().includes('compression') ||
      intervention.name?.toLowerCase().includes('wrap') ||
      intervention.name?.toLowerCase().includes('bandage')
    );
  }

  // Infection control assessment (always required)
  const infectionControl = allInterventions.some(intervention =>
    intervention.type === 'infection_management' ||
    intervention.type?.includes('debridement') ||
    intervention.name?.toLowerCase().includes('antibiotic') ||
    intervention.name?.toLowerCase().includes('antiseptic')
  );

  // Patient education assessment (always beneficial)
  const patientEducation = allInterventions.some(intervention =>
    intervention.type === 'education' ||
    intervention.type === 'nutrition_counseling' ||
    intervention.name?.toLowerCase().includes('education') ||
    intervention.name?.toLowerCase().includes('teaching')
  );

  return {
    offloading,
    compression,
    infectionControl,
    patientEducation
  };
}

// Main centralized Medicare compliance assessment
export function assessMedicareCompliance(
  episode: Episode,
  encounters: Encounter[],
  documentedExceptions: DocumentedException[] = []
): MedicareComplianceResult {
  const episodeStartDate = new Date(episode.episodeStartDate);
  const currentDate = new Date();
  const treatmentDays = Math.ceil((currentDate.getTime() - episodeStartDate.getTime()) / (1000 * 60 * 60 * 24));

  // Classify wound using enhanced logic with ICD-10 code
  const woundClassification = classifyWound(episode, episode.primaryDiagnosis || undefined);

  // Assess weekly compliance with exceptions
  const weeklyCompliance = assessWeeklyCompliance(encounters, episodeStartDate, currentDate, documentedExceptions);

  // Assess wound reduction
  const reductionAssessment = assessWoundReduction(encounters, episodeStartDate);

  // Assess standard of care
  const standardOfCare = assessStandardOfCare(encounters, woundClassification);

  // Generate critical gaps and recommendations
  const criticalGaps: string[] = [];
  const recommendations: string[] = [];

  // Conservative care duration check
  if (treatmentDays < 30) {
    criticalGaps.push(`Conservative care insufficient: ${treatmentDays} days (30 required)`);
    recommendations.push('Continue conservative care to meet Medicare 30-day requirement');
  }

  // Weekly assessments with exception handling
  if (weeklyCompliance.status === 'non-compliant') {
    criticalGaps.push(`Missing ${weeklyCompliance.missingWeeks.length} weeks of measurements`);
    recommendations.push('Document wound assessments for all missing weeks');
  } else if (weeklyCompliance.status === 'compliant-with-exception') {
    recommendations.push('Review documented exceptions to ensure they meet Medicare guidelines');
  }

  // Standard of care gaps
  if (woundClassification.isDFU && standardOfCare.offloading === false) {
    criticalGaps.push('CRITICAL: Offloading not documented for diabetic foot ulcer');
    recommendations.push('IMMEDIATE: Implement appropriate offloading strategy');
  }

  if (woundClassification.isVLU && standardOfCare.compression === false) {
    criticalGaps.push('CRITICAL: Compression therapy not documented for venous leg ulcer');
    recommendations.push('IMMEDIATE: Initiate compression therapy per ABI results');
  }

  // 20% reduction assessment
  if (!reductionAssessment.isIn28DayWindow && !reductionAssessment.meetsThreshold) {
    criticalGaps.push('Failed to achieve 20% reduction by 28 days');
    recommendations.push('Consider advanced therapy options per Medicare LCD');
  }

  // Calculate overall compliance score
  let score = 0;
  
  // Conservative care (25%)
  score += treatmentDays >= 30 ? 25 : (treatmentDays / 30) * 25;
  
  // Weekly assessments (25%)
  score += (weeklyCompliance.coverage / 100) * 25;
  
  // Standard of care (25%)
  let standardScore = 0;
  let standardRequirements = 2; // infection control + education
  
  if (standardOfCare.infectionControl) standardScore++;
  if (standardOfCare.patientEducation) standardScore++;
  
  if (standardOfCare.offloading !== null) {
    standardRequirements++;
    if (standardOfCare.offloading) standardScore++;
  }
  
  if (standardOfCare.compression !== null) {
    standardRequirements++;
    if (standardOfCare.compression) standardScore++;
  }
  
  score += (standardScore / standardRequirements) * 25;
  
  // Wound reduction (25%)
  if (reductionAssessment.isIn28DayWindow) {
    // Prorated score during 28-day window
    const expectedProgress = (reductionAssessment.daysSinceBaseline / 28) * 20;
    score += Math.min(25, (reductionAssessment.percentage / expectedProgress) * 25);
  } else {
    score += reductionAssessment.meetsThreshold ? 25 : (reductionAssessment.percentage / 20) * 25;
  }

  // Determine overall status
  let overallStatus: ComplianceStatus;
  let trafficLight: TrafficLightStatus;

  if (criticalGaps.length === 0 && weeklyCompliance.status === 'compliant') {
    overallStatus = 'compliant';
    trafficLight = 'green';
  } else if (criticalGaps.length === 0 || weeklyCompliance.status === 'compliant-with-exception') {
    overallStatus = weeklyCompliance.status === 'compliant-with-exception' ? 'compliant-with-exception' : 'at-risk';
    trafficLight = 'yellow';
  } else {
    overallStatus = 'non-compliant';
    trafficLight = 'red';
  }

  return {
    overallStatus,
    trafficLight,
    score: Math.round(score),
    conservativeCareDays: treatmentDays,
    weeklyAssessments: {
      required: weeklyCompliance.requiredWeeks.length,
      documented: weeklyCompliance.documentedWeeks.length,
      missing: weeklyCompliance.missingWeeks.length,
      coverage: weeklyCompliance.coverage,
      missingWeeks: weeklyCompliance.missingWeeks,
      exceptions: weeklyCompliance.validExceptions,
      statusWithExceptions: weeklyCompliance.status
    },
    woundReduction: {
      baseline: reductionAssessment.baseline,
      current: reductionAssessment.current,
      percentage: reductionAssessment.percentage,
      meetsThreshold: reductionAssessment.meetsThreshold,
      daysSinceBaseline: reductionAssessment.daysSinceBaseline,
      isIn28DayWindow: reductionAssessment.isIn28DayWindow
    },
    standardOfCare,
    criticalGaps,
    recommendations,
    daysToDeadline: Math.max(0, 30 - treatmentDays)
  };
}

// Utility function to convert compliance status to traffic light
export function statusToTrafficLight(status: ComplianceStatus): TrafficLightStatus {
  switch (status) {
    case 'compliant':
      return 'green';
    case 'compliant-with-exception':
    case 'at-risk':
      return 'yellow';
    case 'non-compliant':
      return 'red';
    default:
      return 'red';
  }
}

// Export for backward compatibility and transition period
export {
  getISOWeek,
  getISOWeekYear,
  getISOWeekIdentifier as getISOWeek_fixed
};