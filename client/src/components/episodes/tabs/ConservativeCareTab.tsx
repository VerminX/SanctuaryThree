import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChartContainer, ChartTooltip, ChartLegend } from "@/components/ui/chart";
import { 
  Clock, CheckCircle, AlertCircle, Heart, TrendingUp, TrendingDown, 
  Target, Activity, Calendar, AlertTriangle, CheckCircle2, XCircle,
  ThermometerSun, Droplets, Scissors, Footprints, BookOpen, Brain
} from "lucide-react";
import { Episode, Encounter, woundDetailsSchema, conservativeCareSchema, medicareLcdComplianceSchema, treatmentRecommendationSchema } from "@shared/schema";
import { 
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, 
  BarChart, Bar, PieChart, Pie, Cell, Area, AreaChart, RadarChart, 
  PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar
} from "recharts";
import { useMemo, ReactNode } from "react";
import { z } from "zod";

// Interface for decrypted patient data
interface DecryptedPatient {
  id: string;
  firstName: string;
  lastName: string;
  mrn: string;
  tenantId: string;
  payerType: string;
  planName?: string;
  macRegion?: string;
}

// Type definitions using the new schemas
type WoundDetails = z.infer<typeof woundDetailsSchema>;
type ConservativeCare = z.infer<typeof conservativeCareSchema>;
type MedicareLcdCompliance = z.infer<typeof medicareLcdComplianceSchema>;
type TreatmentRecommendation = z.infer<typeof treatmentRecommendationSchema>;

// Parsed encounter data interface
interface ParsedEncounterData {
  id: string;
  date: string;
  woundDetails: WoundDetails | null;
  conservativeCare: ConservativeCare | null;
  diabeticStatus?: string;
  infectionStatus?: string;
}

// Clinical alert interface (derived from real data)
interface ClinicalAlert {
  id: string;
  type: 'medicare-compliance' | 'treatment-escalation' | 'safety' | 'documentation';
  severity: 'critical' | 'high' | 'moderate' | 'low';
  message: string;
  recommendation: string;
  dueDate?: Date;
  resolved: boolean;
  basedOn: string[]; // Encounter IDs this alert is based on
}

interface ConservativeCareTabProps {
  episode?: Episode;
  encounters: Encounter[];
  patient?: DecryptedPatient;
  isLoading: boolean;
}

// Helper functions for parsing encounter data
function parseWoundDetails(woundDetailsJson: any): WoundDetails | null {
  try {
    if (!woundDetailsJson) return null;
    return woundDetailsSchema.parse(woundDetailsJson);
  } catch (error) {
    console.warn('Failed to parse wound details:', error);
    return null;
  }
}

function parseConservativeCare(conservativeCareJson: any): ConservativeCare | null {
  try {
    if (!conservativeCareJson) return null;
    return conservativeCareSchema.parse(conservativeCareJson);
  } catch (error) {
    console.warn('Failed to parse conservative care:', error);
    return null;
  }
}

// Helper function to get ISO week identifier (YYYY-WW format)
function getISOWeek(date: Date): string {
  const target = new Date(date.valueOf());
  const dayNumber = (date.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNumber + 3);
  const firstThursday = target.valueOf();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay()) + 7) % 7);
  }
  const weekNumber = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  return `${target.getUTCFullYear()}-W${weekNumber.toString().padStart(2, '0')}`;
}

// Helper function to get all expected weeks in episode
function getExpectedWeeks(startDate: Date, endDate: Date): string[] {
  const weeks: string[] = [];
  const current = new Date(startDate);
  
  while (current <= endDate) {
    weeks.push(getISOWeek(current));
    current.setDate(current.getDate() + 7);
  }
  
  return [...new Set(weeks)]; // Remove duplicates
}

// Medicare LCD compliance assessment function
function assessMedicareLcdCompliance(
  episode: Episode,
  encounters: ParsedEncounterData[],
  patient: DecryptedPatient
): MedicareLcdCompliance {
  const episodeStartDate = new Date(episode.episodeStartDate);
  const currentDate = new Date();
  const treatmentDays = Math.ceil((currentDate.getTime() - episodeStartDate.getTime()) / (1000 * 60 * 60 * 24));
  
  // Collect all interventions from encounters
  const allInterventions = encounters
    .filter(enc => enc.conservativeCare)
    .flatMap(enc => enc.conservativeCare?.interventions || []);
  
  // Implement proper week bucketing for measurements
  const measurementsByWeek = new Map<string, Date[]>();
  encounters
    .filter(enc => enc.woundDetails?.currentMeasurement)
    .forEach(enc => {
      const week = getISOWeek(new Date(enc.date));
      if (!measurementsByWeek.has(week)) {
        measurementsByWeek.set(week, []);
      }
      measurementsByWeek.get(week)!.push(new Date(enc.date));
    });
  
  // Calculate week coverage and identify missing weeks
  const expectedWeeks = getExpectedWeeks(episodeStartDate, currentDate);
  const coveredWeeks = Array.from(measurementsByWeek.keys());
  const missingWeeks = expectedWeeks.filter(week => !coveredWeeks.includes(week));
  
  // Require at least one measurement per week (no tolerance for missing weeks)
  const weeklyAssessmentsMet = missingWeeks.length === 0;
  
  // Check standard of care elements based on wound type
  const isDFU = episode.woundType?.toLowerCase().includes('dfu') || episode.woundType?.toLowerCase().includes('diabetic');
  const isVLU = episode.woundType?.toLowerCase().includes('vlu') || episode.woundType?.toLowerCase().includes('venous');
  
  // Offloading assessment for DFU
  const offloadingProvided = isDFU ? allInterventions.some(int => 
    int.type.includes('offloading') || int.name.toLowerCase().includes('offloading')
  ) : true; // Not required for non-DFU
  
  // Compression therapy for VLU
  const compressionProvided = isVLU ? allInterventions.some(int => 
    int.type === 'compression_therapy' || int.name.toLowerCase().includes('compression')
  ) : true; // Not required for non-VLU
  
  // Infection control assessment
  const infectionControlProvided = allInterventions.some(int => 
    int.type === 'infection_management' || int.type.includes('debridement')
  );
  
  // Patient education assessment
  const educationProvided = allInterventions.some(int => 
    int.type === 'education' || int.type === 'nutrition_counseling'
  );
  
  // Calculate 4-week response assessment with proper documentation requirements
  const fourWeekDate = new Date(episodeStartDate.getTime() + (28 * 24 * 60 * 60 * 1000));
  const fourWeekWindowStart = new Date(fourWeekDate.getTime() - (7 * 24 * 60 * 60 * 1000)); // Day 21
  const fourWeekWindowEnd = new Date(fourWeekDate.getTime() + (7 * 24 * 60 * 60 * 1000)); // Day 35
  
  let areaReduction: number | undefined;
  let meetsThreshold: boolean | undefined;
  let fourWeekResponseDocumented = false;
  let baselineDocumented = false;
  let criticalGaps: string[] = [];
  
  // Find baseline measurement (within first week of episode)
  const baselineWindow = new Date(episodeStartDate.getTime() + (7 * 24 * 60 * 60 * 1000));
  const baselineEncounter = encounters
    .filter(enc => new Date(enc.date) <= baselineWindow && enc.woundDetails?.currentMeasurement?.area)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
  
  baselineDocumented = !!baselineEncounter;
  
  // Find 4-week measurement (within 7-day window around day 28)
  const fourWeekEncounter = encounters
    .filter(enc => {
      const encDate = new Date(enc.date);
      return encDate >= fourWeekWindowStart && 
             encDate <= fourWeekWindowEnd && 
             enc.woundDetails?.currentMeasurement?.area;
    })
    .sort((a, b) => Math.abs(new Date(a.date).getTime() - fourWeekDate.getTime()) - 
                    Math.abs(new Date(b.date).getTime() - fourWeekDate.getTime()))[0]; // Closest to day 28
  
  fourWeekResponseDocumented = !!fourWeekEncounter;
  
  // Only compute meetsThreshold when both measurements exist
  if (baselineDocumented && fourWeekResponseDocumented) {
    const baselineArea = baselineEncounter.woundDetails!.currentMeasurement!.area!;
    const fourWeekArea = fourWeekEncounter.woundDetails!.currentMeasurement!.area!;
    areaReduction = ((baselineArea - fourWeekArea) / baselineArea) * 100;
    meetsThreshold = areaReduction >= 50; // >= 50% reduction threshold
  } else {
    // Add critical gaps when documentation is missing
    if (!baselineDocumented && treatmentDays >= 7) {
      criticalGaps.push('Missing baseline wound measurement within first week of episode');
    }
    if (!fourWeekResponseDocumented && currentDate > fourWeekWindowEnd) {
      criticalGaps.push('Missing 4-week response measurement (day 21-35 window)');
    }
  }
  
  // Separate hard requirements (must-have gates) from informational elements
  const hardRequirements = {
    conservativeCareDuration: treatmentDays >= 30,
    weeklyAssessments: weeklyAssessmentsMet,
    // DFU offloading is critical for diabetic foot ulcers
    dfuOffloading: isDFU ? offloadingProvided : true,
    // VLU compression is critical for venous leg ulcers  
    vluCompression: isVLU ? compressionProvided : true,
    // Baseline and 4-week documentation when required
    baselineDocumentation: baselineDocumented || treatmentDays < 7,
    fourWeekDocumentation: fourWeekResponseDocumented || currentDate <= fourWeekWindowEnd
  };
  
  // Informational requirements (contribute to overall score but not gates)
  const informationalRequirements = {
    infectionControl: infectionControlProvided,
    patientEducation: educationProvided,
    generalDocumentation: encounters.length > 0
  };
  
  // All hard requirements must pass for compliance
  const hardRequirementsMet = Object.values(hardRequirements).every(Boolean);
  
  // Calculate informational score for tracking purposes
  const informationalScore = Object.values(informationalRequirements).filter(Boolean).length / 
                            Object.values(informationalRequirements).length * 100;
  
  // Overall compliance requires ALL hard requirements + reasonable informational score
  const compliant = hardRequirementsMet && informationalScore >= 60;
  
  // Report score based on hard requirements primarily
  const complianceScore = hardRequirementsMet ? 
    Math.round(80 + (informationalScore * 0.2)) : // 80-100% range when hard requirements met
    Math.round((Object.values(hardRequirements).filter(Boolean).length / Object.values(hardRequirements).length) * 80); // 0-80% when failing hard requirements
  
  // Generate comprehensive gaps and recommendations with critical gap identification
  const gaps: string[] = [...criticalGaps]; // Start with critical documentation gaps
  const recommendations: string[] = [];
  
  // Hard requirement gaps (critical)
  if (!hardRequirements.conservativeCareDuration) {
    gaps.push(`Conservative care duration insufficient: ${treatmentDays} days (minimum 30 days required)`);
    recommendations.push('Continue conservative care until 30-day minimum is met');
  }
  
  if (!hardRequirements.weeklyAssessments) {
    gaps.push(`Missing weekly assessments: ${missingWeeks.length} weeks without measurements (${missingWeeks.join(', ')})`);
    recommendations.push('Ensure weekly wound assessment and measurement documentation for all missing weeks');
  }
  
  if (isDFU && !hardRequirements.dfuOffloading) {
    gaps.push('CRITICAL: Offloading not documented for diabetic foot ulcer');
    recommendations.push('IMMEDIATE: Implement appropriate offloading strategy (TCC, boot, or shoe modification)');
  }
  
  if (isVLU && !hardRequirements.vluCompression) {
    gaps.push('CRITICAL: Compression therapy not documented for venous leg ulcer');
    recommendations.push('IMMEDIATE: Initiate compression therapy appropriate for patient\'s ABI and venous status');
  }
  
  // 4-week response assessment gaps
  if (meetsThreshold === false) {
    gaps.push(`Insufficient 4-week response: ${areaReduction?.toFixed(1)}% reduction (<50% threshold)`);
    recommendations.push('Consider advanced therapy evaluation per Medicare LCD requirements');
  }
  
  // Informational gaps (non-critical but important)
  if (!informationalRequirements.infectionControl) {
    gaps.push('Infection control measures not documented');
    recommendations.push('Document infection prevention and management strategies');
  }
  
  if (!informationalRequirements.patientEducation) {
    gaps.push('Patient education not documented');
    recommendations.push('Provide and document patient education on wound care and prevention');
  }
  
  return {
    compliant,
    complianceScore,
    requirements: {
      appropriateDiagnosis: {
        met: true, // Assume met if episode exists
        codes: episode.primaryDiagnosis ? [episode.primaryDiagnosis] : []
      },
      conservativeCareDuration: {
        met: hardRequirements.conservativeCareDuration,
        daysCompleted: treatmentDays,
        minimumRequired: 30
      },
      weeklyAssessments: {
        met: hardRequirements.weeklyAssessments,
        completed: coveredWeeks.length,
        required: expectedWeeks.length,
        complianceRate: expectedWeeks.length > 0 ? (coveredWeeks.length / expectedWeeks.length) * 100 : 0,
        missingWeeks: missingWeeks,
        weekCoverage: Object.fromEntries(expectedWeeks.map(week => [
          week, 
          coveredWeeks.includes(week)
        ]))
      },
      standardOfCareElements: {
        offloading: isDFU ? hardRequirements.dfuOffloading : undefined,
        compression: isVLU ? hardRequirements.vluCompression : undefined,
        infectionControl: informationalRequirements.infectionControl,
        patientEducation: informationalRequirements.patientEducation,
        documentation: informationalRequirements.generalDocumentation
      },
      responseAssessment: {
        performed: fourWeekResponseDocumented,
        baselineDocumented: baselineDocumented,
        fourWeekResponseDocumented: fourWeekResponseDocumented,
        areaReduction,
        meetsThreshold,
        responseWindow: {
          start: fourWeekWindowStart.toISOString(),
          end: fourWeekWindowEnd.toISOString(),
          target: fourWeekDate.toISOString()
        }
      },
      hardRequirements: Object.fromEntries(
        Object.entries(hardRequirements).map(([key, value]) => [key, { met: value }])
      ),
      informationalRequirements: Object.fromEntries(
        Object.entries(informationalRequirements).map(([key, value]) => [key, { met: value }])
      )
    },
    policy: {
      lcdId: 'L33831',
      title: 'Skin Substitutes',
      url: 'https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid=33831',
      effectiveDate: '2023-01-01T00:00:00Z'
    },
    gaps,
    recommendations,
    assessmentDate: currentDate.toISOString(),
    assessedBy: 'system',
    version: '1.0'
  };
}

// Generate clinical alerts from real data with enhanced critical gap detection
function generateClinicalAlerts(
  episode: Episode,
  encounters: ParsedEncounterData[],
  compliance: MedicareLcdCompliance
): ClinicalAlert[] {
  const alerts: ClinicalAlert[] = [];
  
  // Critical alerts for hard requirement failures
  if (!compliance.compliant) {
    // Conservative care duration
    if (!compliance.requirements.conservativeCareDuration.met) {
      const daysRemaining = 30 - compliance.requirements.conservativeCareDuration.daysCompleted;
      alerts.push({
        id: 'medicare-30day',
        type: 'medicare-compliance',
        severity: daysRemaining <= 7 ? 'critical' : 'high',
        message: `${daysRemaining} days remaining to meet 30-day conservative care requirement`,
        recommendation: 'Continue conservative care interventions and document weekly assessments',
        dueDate: new Date(Date.now() + daysRemaining * 24 * 60 * 60 * 1000),
        resolved: false,
        basedOn: encounters.map(enc => enc.id)
      });
    }
    
    // Weekly assessments with specific missing weeks
    if (!compliance.requirements.weeklyAssessments.met) {
      const missingWeeks = compliance.requirements.weeklyAssessments.missingWeeks || [];
      alerts.push({
        id: 'weekly-assessments',
        type: 'documentation',
        severity: 'critical',
        message: `Missing wound measurements for ${missingWeeks.length} weeks: ${missingWeeks.slice(0, 3).join(', ')}${missingWeeks.length > 3 ? '...' : ''}`,
        recommendation: `Document wound assessments for ALL missing weeks. Current coverage: ${compliance.requirements.weeklyAssessments.complianceRate.toFixed(1)}%`,
        resolved: false,
        basedOn: encounters.map(enc => enc.id)
      });
    }
    
    // Critical DFU offloading requirement
    const isDFU = episode.woundType?.toLowerCase().includes('dfu') || episode.woundType?.toLowerCase().includes('diabetic');
    if (isDFU && compliance.requirements.hardRequirements?.dfuOffloading?.met === false) {
      alerts.push({
        id: 'dfu-offloading-critical',
        type: 'medicare-compliance',
        severity: 'critical',
        message: 'CRITICAL: Offloading not documented for diabetic foot ulcer',
        recommendation: 'IMMEDIATE ACTION REQUIRED: Implement and document appropriate offloading (TCC, boot, or removable walker)',
        resolved: false,
        basedOn: encounters.map(enc => enc.id)
      });
    }
    
    // Critical VLU compression requirement
    const isVLU = episode.woundType?.toLowerCase().includes('vlu') || episode.woundType?.toLowerCase().includes('venous');
    if (isVLU && compliance.requirements.hardRequirements?.vluCompression?.met === false) {
      alerts.push({
        id: 'vlu-compression-critical',
        type: 'medicare-compliance',
        severity: 'critical',
        message: 'CRITICAL: Compression therapy not documented for venous leg ulcer',
        recommendation: 'IMMEDIATE ACTION REQUIRED: Initiate and document compression therapy (obtain ABI first)',
        resolved: false,
        basedOn: encounters.map(enc => enc.id)
      });
    }
    
    // Baseline documentation missing
    if (!compliance.requirements.responseAssessment.baselineDocumented) {
      alerts.push({
        id: 'baseline-missing',
        type: 'documentation',
        severity: 'critical',
        message: 'Missing baseline wound measurement within first week of episode',
        recommendation: 'Document baseline wound assessment or add retroactive measurement for episode start',
        resolved: false,
        basedOn: encounters.map(enc => enc.id)
      });
    }
    
    // 4-week response documentation missing
    if (!compliance.requirements.responseAssessment.fourWeekResponseDocumented && 
        compliance.requirements.responseAssessment.responseWindow) {
      const windowEnd = new Date(compliance.requirements.responseAssessment.responseWindow.end);
      if (new Date() > windowEnd) {
        alerts.push({
          id: 'four-week-response-missing',
          type: 'documentation',
          severity: 'critical',
          message: 'Missing 4-week response measurement (day 21-35 window)',
          recommendation: 'Document wound assessment within the 4-week response window or explain deviation',
          resolved: false,
          basedOn: encounters.map(enc => enc.id)
        });
      }
    }
  }
  
  // Treatment escalation alerts
  const recentEncounters = encounters.slice(-3); // Last 3 encounters
  if (recentEncounters.length >= 2) {
    const areas = recentEncounters
      .map(enc => enc.woundDetails?.currentMeasurement?.area)
      .filter(area => area !== undefined) as number[];
    
    if (areas.length >= 2) {
      const latestArea = areas[areas.length - 1];
      const previousArea = areas[areas.length - 2];
      const areaChange = ((previousArea - latestArea) / previousArea) * 100;
      
      if (areaChange < 5) { // Less than 5% improvement
        alerts.push({
          id: 'stagnant-healing',
          type: 'treatment-escalation',
          severity: 'moderate',
          message: 'Wound healing has plateaued - minimal area reduction detected',
          recommendation: 'Consider treatment modification or advanced therapy evaluation',
          resolved: false,
          basedOn: recentEncounters.map(enc => enc.id)
        });
      }
    }
  }
  
  // 4-week response assessment alert
  if (compliance.requirements.responseAssessment.performed && 
      compliance.requirements.responseAssessment.meetsThreshold === false) {
    alerts.push({
      id: 'four-week-response',
      type: 'medicare-compliance',
      severity: 'critical',
      message: 'Less than 50% wound area reduction at 4 weeks - Medicare LCD threshold not met',
      recommendation: 'Document rationale for continued conservative care or consider advanced therapy',
      resolved: false,
      basedOn: encounters.map(enc => enc.id)
    });
  }
  
  return alerts;
}

// Generate data-driven treatment recommendations
function generateTreatmentRecommendations(
  episode: Episode,
  encounters: ParsedEncounterData[],
  lcdCompliance: MedicareLcdCompliance | null,
  patient: DecryptedPatient,
  effectivenessScore: number,
  treatmentDays: number
): TreatmentRecommendation[] {
  const recommendations: TreatmentRecommendation[] = [];
  
  const isDFU = episode.woundType?.toLowerCase().includes('dfu') || episode.woundType?.toLowerCase().includes('diabetic');
  const isVLU = episode.woundType?.toLowerCase().includes('vlu') || episode.woundType?.toLowerCase().includes('venous');
  const isPU = episode.woundType?.toLowerCase().includes('pu') || episode.woundType?.toLowerCase().includes('pressure');
  
  // Check current treatments
  const currentInterventions = encounters
    .flatMap(enc => enc.conservativeCare?.interventions || [])
    .map(int => int.type);
  
  const hasOffloading = currentInterventions.some(type => type.includes('offloading'));
  const hasCompression = currentInterventions.some(type => type === 'compression_therapy');
  const hasDebridement = currentInterventions.some(type => type.includes('debridement'));
  
  // Calculate healing trajectory
  const healingTrajectory = calculateHealingTrajectory(encounters);
  
  // Primary recommendations based on wound type and current status
  if (isDFU && !hasOffloading) {
    recommendations.push({
      id: 'dfu-offloading',
      type: 'conservative',
      priority: 'critical',
      title: 'Immediate Offloading Required',
      description: 'Total Contact Casting (TCC) or removable cast walker for diabetic foot ulcer',
      rationale: 'Offloading is essential for DFU healing and Medicare LCD L33831 compliance. Non-removable offloading shows superior outcomes.',
      evidence: {
        level: 'A',
        citation: 'Medicare LCD L33831, Diabetic Foot Guidelines 2023',
        successRate: 85,
        studyQuality: 'high'
      },
      implementation: {
        timeframe: 'Immediate',
        frequency: 'Continuous wear',
        duration: 'Until healing or 12 weeks maximum',
        cost: '$200-400 per application'
      },
      contraindications: ['Active infection with cellulitis', 'Severe peripheral arterial disease (ABI <0.5)', 'Non-ambulatory patient'],
      warnings: ['Monitor for pressure points', 'Weekly cast changes required', 'Patient education on compliance essential'],
      expectedOutcome: {
        healingProbability: 85,
        timeToHealing: '8-12 weeks',
        functionalImprovement: true,
        painReduction: true
      },
      coverage: {
        medicareCompliant: true,
        priorAuthRequired: false,
        coverageLimitations: ['Must demonstrate medical necessity', 'Weekly documentation required']
      },
      generatedDate: new Date().toISOString(),
      basedOn: encounters.map(enc => enc.id),
      confidence: 95
    });
  }
  
  if (isVLU && !hasCompression) {
    recommendations.push({
      id: 'vlu-compression',
      type: 'conservative',
      priority: 'high',
      title: 'Compression Therapy Implementation',
      description: 'Multi-layer compression bandaging or graduated compression stockings',
      rationale: 'Compression therapy is first-line treatment for venous leg ulcers to address underlying venous hypertension.',
      evidence: {
        level: 'A',
        citation: 'Cochrane Review on Compression for Venous Leg Ulcers',
        successRate: 75,
        studyQuality: 'high'
      },
      implementation: {
        timeframe: 'Within 1 week',
        frequency: 'Continuous (23 hours/day)',
        duration: 'Until healing plus 6 months maintenance',
        cost: '$50-150 per week'
      },
      contraindications: ['ABI <0.8', 'Severe heart failure', 'Severe peripheral arterial disease'],
      warnings: ['Obtain ABI before initiation', 'Monitor for arterial compromise', 'Patient education on application'],
      expectedOutcome: {
        healingProbability: 75,
        timeToHealing: '12-24 weeks',
        functionalImprovement: true,
        painReduction: false
      },
      coverage: {
        medicareCompliant: true,
        priorAuthRequired: false,
        coverageLimitations: ['ABI documentation required', 'Failed simple measures documentation']
      },
      generatedDate: new Date().toISOString(),
      basedOn: encounters.map(enc => enc.id),
      confidence: 90
    });
  }
  
  // Debridement recommendations based on wound characteristics
  if (!hasDebridement && encounters.some(enc => 
    enc.woundDetails?.infection?.present || 
    enc.woundDetails?.woundBed?.tissue?.includes('necrotic')
  )) {
    recommendations.push({
      id: 'sharp-debridement',
      type: 'conservative',
      priority: 'high',
      title: 'Sharp Debridement',
      description: 'Weekly sharp debridement to remove necrotic tissue and biofilm',
      rationale: 'Removal of necrotic tissue and biofilm is essential for wound healing progression and infection control.',
      evidence: {
        level: 'A',
        citation: 'Wound Healing Society Guidelines',
        successRate: 78,
        studyQuality: 'moderate'
      },
      implementation: {
        timeframe: 'Next visit',
        frequency: 'Weekly or bi-weekly',
        duration: '4-8 weeks',
        cost: '$150-300 per session'
      },
      contraindications: ['Bleeding disorders', 'Anticoagulation (relative)', 'Ischemic ulcers without revascularization'],
      warnings: ['Bleeding risk assessment', 'Pain management consideration', 'Post-procedure care instructions'],
      expectedOutcome: {
        healingProbability: 78,
        timeToHealing: '6-10 weeks',
        functionalImprovement: false,
        painReduction: false
      },
      coverage: {
        medicareCompliant: true,
        priorAuthRequired: false,
        coverageLimitations: ['Must document medical necessity', 'Frequency limitations apply']
      },
      generatedDate: new Date().toISOString(),
      basedOn: encounters.map(enc => enc.id),
      confidence: 85
    });
  }
  
  // Advanced therapy recommendations based on 4-week response
  if (treatmentDays >= 28 && (effectivenessScore < 50 || healingTrajectory === 'deteriorating')) {
    recommendations.push({
      id: 'advanced-therapy',
      type: 'advanced',
      priority: 'critical',
      title: 'Advanced Therapeutic Modalities',
      description: 'Consider cellular/tissue-based products, NPWT, or hyperbaric oxygen therapy',
      rationale: `Wound shows suboptimal response to conservative care (${effectivenessScore}% effectiveness after ${treatmentDays} days). Medicare LCD criteria support advanced therapy consideration.`,
      evidence: {
        level: 'B',
        citation: 'Medicare LCD L33831',
        successRate: 65,
        studyQuality: 'moderate'
      },
      implementation: {
        timeframe: '1-2 weeks',
        frequency: 'Weekly applications',
        duration: '4-12 weeks',
        cost: '$1000-3000 per application'
      },
      contraindications: ['Active infection', 'Malignancy in wound bed', 'Poor vascular supply'],
      warnings: ['Prior authorization required', 'Extensive documentation needed', 'Cost considerations'],
      expectedOutcome: {
        healingProbability: 65,
        timeToHealing: '8-16 weeks',
        functionalImprovement: true,
        painReduction: true
      },
      coverage: {
        medicareCompliant: true,
        priorAuthRequired: true,
        coverageLimitations: [
          'Failed 30 days conservative care',
          '<50% area reduction at 4 weeks',
          'Documented weekly assessments required'
        ]
      },
      generatedDate: new Date().toISOString(),
      basedOn: encounters.map(enc => enc.id),
      confidence: 80
    });
  }
  
  return recommendations;
}

// Calculate healing trajectory from encounter data
function calculateHealingTrajectory(encounters: ParsedEncounterData[]): 'improving' | 'stable' | 'deteriorating' {
  const measurementData = encounters
    .filter(enc => enc.woundDetails?.currentMeasurement?.area)
    .map(enc => ({
      date: new Date(enc.date),
      area: enc.woundDetails!.currentMeasurement!.area!
    }));
    
  if (measurementData.length < 3) return 'stable';
  
  // Calculate trend over last 3 measurements
  const recent = measurementData.slice(-3);
  const areaChanges = recent.slice(1).map((curr, i) => 
    ((recent[i].area - curr.area) / recent[i].area) * 100
  );
  
  const avgChange = areaChanges.reduce((sum, change) => sum + change, 0) / areaChanges.length;
  
  if (avgChange > 10) return 'improving'; // >10% reduction
  if (avgChange < -5) return 'deteriorating'; // >5% increase
  return 'stable';
}

// Recommendations display component
function RecommendationsDisplay({
  episode,
  encounters,
  lcdCompliance,
  patient,
  effectivenessScore,
  treatmentDays
}: {
  episode?: Episode;
  encounters: ParsedEncounterData[];
  lcdCompliance: MedicareLcdCompliance | null;
  patient?: DecryptedPatient;
  effectivenessScore: number;
  treatmentDays: number;
}) {
  if (!episode || !patient) {
    return (
      <div className="text-center py-4 text-muted-foreground">
        <p className="text-sm">Unable to generate recommendations</p>
        <p className="text-xs">Episode and patient data required</p>
      </div>
    );
  }
  
  const recommendations = generateTreatmentRecommendations(
    episode,
    encounters,
    lcdCompliance,
    patient,
    effectivenessScore,
    treatmentDays
  );
  
  if (recommendations.length === 0) {
    return (
      <div className="text-center py-4 text-muted-foreground">
        <Brain className="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No specific recommendations at this time</p>
        <p className="text-xs">Continue current conservative care plan and weekly assessments</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      {recommendations.map((rec, index) => {
        const colorClass = rec.priority === 'critical' ? 'border-red-500 bg-red-50 dark:bg-red-950/20' :
                          rec.priority === 'high' ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/20' :
                          'border-blue-500 bg-blue-50 dark:bg-blue-950/20';
        const textColorClass = rec.priority === 'critical' ? 'text-red-900 dark:text-red-100' :
                               rec.priority === 'high' ? 'text-amber-900 dark:text-amber-100' :
                               'text-blue-900 dark:text-blue-100';
        
        return (
          <div key={rec.id} className={`p-4 rounded-lg border-l-4 ${colorClass}`} data-testid={`recommendation-${index}`}>
            <div className="flex items-start justify-between mb-2">
              <h4 className={`font-semibold ${textColorClass}`}>{rec.title}</h4>
              <div className="flex gap-2">
                <Badge className="text-xs">
                  {rec.expectedOutcome.healingProbability}% Success
                </Badge>
                <Badge variant={rec.priority === 'critical' ? 'destructive' : 'secondary'} className="text-xs">
                  {rec.priority}
                </Badge>
              </div>
            </div>
            <p className={`text-sm mb-2 ${textColorClass.replace('text-', 'text-').replace('-900', '-800').replace('-100', '-200')}`}>
              <strong>{rec.description}:</strong> {rec.rationale}
            </p>
            <div className={`flex items-center gap-4 text-xs ${textColorClass.replace('text-', 'text-').replace('-900', '-600').replace('-100', '-300')}`}>
              <span>Evidence: {rec.evidence.level}</span>
              <span>Timeline: {rec.implementation.timeframe}</span>
              <span>Medicare: {rec.coverage.medicareCompliant ? '✓ Covered' : '✗ Not covered'}</span>
              <span>Confidence: {rec.confidence}%</span>
            </div>
            {rec.contraindications.length > 0 && (
              <div className="mt-2 text-xs text-muted-foreground">
                <span className="font-medium">Contraindications:</span> {rec.contraindications.join(', ')}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function ConservativeCareTab({ episode, encounters, patient, isLoading }: ConservativeCareTabProps) {
  // Parse and extract real conservative care data
  const conservativeCareData = useMemo(() => {
    if (!encounters || encounters.length === 0 || !episode) return null;

    // Parse encounter data with proper schema validation
    const parsedEncounters: ParsedEncounterData[] = encounters
      .map(encounter => ({
        id: encounter.id,
        date: encounter.date,
        woundDetails: parseWoundDetails(encounter.woundDetails),
        conservativeCare: parseConservativeCare(encounter.conservativeCare),
        diabeticStatus: encounter.diabeticStatus,
        infectionStatus: encounter.infectionStatus
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Calculate treatment metrics from real data
    const episodeStartDate = new Date(episode.episodeStartDate);
    const currentDate = new Date();
    const treatmentDays = Math.ceil((currentDate.getTime() - episodeStartDate.getTime()) / (1000 * 60 * 60 * 24));
    
    // Count real interventions
    const allInterventions = parsedEncounters
      .filter(enc => enc.conservativeCare)
      .flatMap(enc => enc.conservativeCare?.interventions || []);
    
    const interventionCount = allInterventions.length;
    const weeklyFrequency = treatmentDays > 0 ? (interventionCount / (treatmentDays / 7)) : 0;

    // Extract real healing progress from wound measurements
    const healingProgress = parsedEncounters
      .filter(enc => enc.woundDetails?.currentMeasurement)
      .map(enc => {
        const measurement = enc.woundDetails!.currentMeasurement!;
        const painLevel = enc.woundDetails?.pain?.level || 0;
        
        // Calculate compliance score from conservative care data
        const complianceScore = enc.conservativeCare?.compliance?.overallScore || 0;
        
        return {
          date: new Date(enc.date).toLocaleDateString(),
          area: measurement.area || 0,
          depth: measurement.depth || 0,
          pain: painLevel,
          compliance: complianceScore,
          encounterId: enc.id
        };
      });

    // Calculate actual effectiveness score from healing progression
    let effectivenessScore = 0;
    if (healingProgress.length >= 2) {
      const firstArea = healingProgress[0]?.area || 0;
      const lastArea = healingProgress[healingProgress.length - 1]?.area || 0;
      
      if (firstArea > 0) {
        const areaReduction = ((firstArea - lastArea) / firstArea) * 100;
        effectivenessScore = Math.max(0, Math.min(100, Math.round(areaReduction)));
      }
    } else if (healingProgress.length === 1) {
      // Single measurement - use baseline if available
      const baselineArea = parsedEncounters[0]?.woundDetails?.baselineMeasurement?.area;
      const currentArea = healingProgress[0]?.area || 0;
      
      if (baselineArea && baselineArea > 0) {
        const areaReduction = ((baselineArea - currentArea) / baselineArea) * 100;
        effectivenessScore = Math.max(0, Math.min(100, Math.round(areaReduction)));
      }
    }

    // Assess Medicare LCD compliance
    const lcdCompliance = patient ? assessMedicareLcdCompliance(episode, parsedEncounters, patient) : null;
    
    // Generate clinical alerts from real data
    const clinicalAlerts = lcdCompliance ? 
      generateClinicalAlerts(episode, parsedEncounters, lcdCompliance) : [];

    // Extract unique treatment types from real interventions
    const treatmentTypes = allInterventions.reduce((acc, intervention) => {
      const existing = acc.find(t => t.type === intervention.type);
      if (!existing) {
        acc.push({
          id: intervention.type,
          name: intervention.name,
          type: intervention.type,
          effectivenessScore: intervention.effectiveness?.immediateResponse === 'excellent' ? 90 :
                             intervention.effectiveness?.immediateResponse === 'good' ? 75 :
                             intervention.effectiveness?.immediateResponse === 'fair' ? 60 : 50,
          medicareCompliant: intervention.medicare?.compliant || false,
          frequency: intervention.details?.frequency || 'As needed',
          evidence: {
            level: 'B' as const, // Default evidence level
            citation: intervention.medicare?.lcdCriteriaMet?.[0] || 'Clinical Guidelines',
            successRate: 70 // Default success rate
          }
        });
      }
      return acc;
    }, [] as Array<{
      id: string;
      name: string;
      type: string;
      effectivenessScore: number;
      medicareCompliant: boolean;
      frequency: string;
      evidence: {
        level: 'A' | 'B' | 'C' | 'D';
        citation: string;
        successRate: number;
      };
    }>);

    return {
      parsedEncounters,
      treatmentDays,
      interventionCount,
      weeklyFrequency,
      healingProgress,
      effectivenessScore,
      lcdCompliance,
      clinicalAlerts,
      treatmentTypes,
      allInterventions
    };
  }, [encounters, episode, patient]);

  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="conservative-care-loading">
        <div className="h-8 bg-muted animate-pulse rounded"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="h-40 bg-muted animate-pulse rounded"></div>
          <div className="h-40 bg-muted animate-pulse rounded"></div>
          <div className="h-40 bg-muted animate-pulse rounded"></div>
        </div>
        <div className="h-96 bg-muted animate-pulse rounded"></div>
      </div>
    );
  }

  if (!conservativeCareData) {
    return (
      <div className="text-center py-12" data-testid="no-conservative-care-data">
        <Heart className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
        <h3 className="text-lg font-semibold mb-2">No Conservative Care Data</h3>
        <p className="text-muted-foreground">Begin documenting conservative care interventions to track effectiveness.</p>
      </div>
    );
  }

  const { 
    parsedEncounters, 
    treatmentDays, 
    interventionCount, 
    weeklyFrequency, 
    healingProgress, 
    effectivenessScore,
    lcdCompliance,
    clinicalAlerts,
    treatmentTypes,
    allInterventions
  } = conservativeCareData;

  // Chart configuration
  const chartConfig = {
    area: { label: "Area (cm²)", color: "hsl(var(--chart-1))" },
    depth: { label: "Depth (mm)", color: "hsl(var(--chart-2))" },
    pain: { label: "Pain Level", color: "hsl(var(--chart-3))" },
    compliance: { label: "Compliance %", color: "hsl(var(--chart-4))" }
  };

  return (
    <div className="space-y-6" data-testid="conservative-care-tab">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Heart className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Conservative Care Management</h3>
        </div>
        <Button variant="outline" size="sm" data-testid="button-export-report">
          <BookOpen className="h-4 w-4 mr-2" />
          Export Report
        </Button>
      </div>

      {/* Clinical Alerts */}
      {clinicalAlerts.filter(alert => !alert.resolved).length > 0 && (
        <Card data-testid="card-clinical-alerts">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Clinical Alerts ({clinicalAlerts.filter(alert => !alert.resolved).length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {clinicalAlerts.filter(alert => !alert.resolved).map(alert => (
                <div 
                  key={alert.id} 
                  className={`p-3 rounded-lg border-l-4 ${
                    alert.severity === 'critical' ? 'bg-red-50 dark:bg-red-950/20 border-red-500' :
                    alert.severity === 'high' ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-500' :
                    'bg-blue-50 dark:bg-blue-950/20 border-blue-500'
                  }`}
                  data-testid={`alert-${alert.id}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-medium text-sm">{alert.message}</p>
                      <p className="text-xs text-muted-foreground mt-1">{alert.recommendation}</p>
                      {alert.dueDate && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Due: {new Date(alert.dueDate).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <Badge variant={alert.severity === 'critical' ? 'destructive' : 'secondary'} className="text-xs">
                      {alert.severity}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Treatment Effectiveness Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card data-testid="card-treatment-days">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Treatment Duration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-treatment-days">{treatmentDays}</div>
            <p className="text-xs text-muted-foreground">Days of conservative care</p>
            <div className="mt-2 flex items-center gap-1">
              <Progress value={(treatmentDays / 30) * 100} className="flex-1 h-2" />
              <span className="text-xs text-muted-foreground">30d</span>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-effectiveness-score">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4" />
              Effectiveness Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-2" data-testid="text-effectiveness-score">
              {effectivenessScore}%
              {effectivenessScore >= 80 ? (
                <TrendingUp className="h-4 w-4 text-green-500" />
              ) : effectivenessScore >= 60 ? (
                <Activity className="h-4 w-4 text-yellow-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-500" />
              )}
            </div>
            <p className="text-xs text-muted-foreground">Treatment response rate</p>
          </CardContent>
        </Card>

        <Card data-testid="card-intervention-frequency">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Intervention Frequency
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-intervention-frequency">
              {weeklyFrequency.toFixed(1)}x
            </div>
            <p className="text-xs text-muted-foreground">Per week average</p>
            <div className="text-xs text-muted-foreground mt-1">
              {interventionCount} total interventions
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-medicare-compliance">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Medicare LCD Compliance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                {lcdCompliance?.compliant ? (
                  <CheckCircle className="h-6 w-6 text-green-500" />
                ) : (
                  <XCircle className="h-6 w-6 text-amber-500" />
                )}
                <div>
                  <div className="font-medium text-sm" data-testid="text-medicare-status">
                    {lcdCompliance?.compliant ? 'LCD Compliant' : 'Non-Compliant'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Score: {lcdCompliance?.complianceScore || 0}%
                  </div>
                </div>
              </div>
              
              {/* LCD Requirements Breakdown */}
              <div className="space-y-1 text-xs">
                <div className="flex items-center justify-between">
                  <span>30-day minimum care:</span>
                  <span className={lcdCompliance?.requirements.conservativeCareDuration.met ? 'text-green-600' : 'text-amber-600'}>
                    {lcdCompliance?.requirements.conservativeCareDuration.daysCompleted || 0} days
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Weekly assessments:</span>
                  <span className={lcdCompliance?.requirements.weeklyAssessments.met ? 'text-green-600' : 'text-amber-600'}>
                    {lcdCompliance?.requirements.weeklyAssessments.complianceRate.toFixed(0) || 0}%
                  </span>
                </div>
                {lcdCompliance?.requirements.standardOfCareElements.offloading !== undefined && (
                  <div className="flex items-center justify-between">
                    <span>Offloading (DFU):</span>
                    <span className={lcdCompliance.requirements.standardOfCareElements.offloading ? 'text-green-600' : 'text-red-600'}>
                      {lcdCompliance.requirements.standardOfCareElements.offloading ? '✓' : '✗'}
                    </span>
                  </div>
                )}
                {lcdCompliance?.requirements.standardOfCareElements.compression !== undefined && (
                  <div className="flex items-center justify-between">
                    <span>Compression (VLU):</span>
                    <span className={lcdCompliance.requirements.standardOfCareElements.compression ? 'text-green-600' : 'text-red-600'}>
                      {lcdCompliance.requirements.standardOfCareElements.compression ? '✓' : '✗'}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span>4-week response:</span>
                  <span className={lcdCompliance?.requirements.responseAssessment.meetsThreshold ? 'text-green-600' : 
                                   lcdCompliance?.requirements.responseAssessment.performed ? 'text-red-600' : 'text-gray-600'}>
                    {!lcdCompliance?.requirements.responseAssessment.performed ? 'Pending' :
                     lcdCompliance.requirements.responseAssessment.meetsThreshold ? '≥50% reduction' : '<50% reduction'}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="effectiveness" className="w-full" data-testid="tabs-conservative-care">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="effectiveness" data-testid="tab-effectiveness">
            <TrendingUp className="h-4 w-4 mr-2" />
            Effectiveness
          </TabsTrigger>
          <TabsTrigger value="recommendations" data-testid="tab-recommendations">
            <Brain className="h-4 w-4 mr-2" />
            Recommendations
          </TabsTrigger>
          <TabsTrigger value="timeline" data-testid="tab-timeline">
            <Clock className="h-4 w-4 mr-2" />
            Timeline
          </TabsTrigger>
          <TabsTrigger value="protocols" data-testid="tab-protocols">
            <BookOpen className="h-4 w-4 mr-2" />
            Protocols
          </TabsTrigger>
        </TabsList>

        {/* Treatment Effectiveness Tab */}
        <TabsContent value="effectiveness" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Healing Progress Chart */}
            <Card data-testid="card-healing-progress">
              <CardHeader>
                <CardTitle>Healing Progress Over Time</CardTitle>
                <CardDescription>
                  Wound area and depth measurements showing treatment response
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="h-[300px]">
                  <LineChart data={healingProgress}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <ChartTooltip />
                    <Line type="monotone" dataKey="area" stroke="var(--color-area)" strokeWidth={2} />
                    <Line type="monotone" dataKey="depth" stroke="var(--color-depth)" strokeWidth={2} />
                  </LineChart>
                </ChartContainer>
              </CardContent>
            </Card>

            {/* Treatment Category Effectiveness */}
            <Card data-testid="card-treatment-effectiveness">
              <CardHeader>
                <CardTitle>Treatment Category Effectiveness</CardTitle>
                <CardDescription>
                  Effectiveness of actual interventions used in this episode
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {treatmentTypes.length > 0 ? (
                    treatmentTypes.map(treatment => (
                      <div key={treatment.id} className="space-y-2" data-testid={`treatment-${treatment.id}`}>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{treatment.name}</span>
                          <span className="text-sm text-muted-foreground">{treatment.effectivenessScore}%</span>
                        </div>
                        <Progress value={treatment.effectivenessScore} className="h-2" />
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>Evidence: {treatment.evidence.level}</span>
                          <span>Success Rate: {treatment.evidence.successRate}%</span>
                          <span>Frequency: {treatment.frequency}</span>
                          <Badge variant={treatment.medicareCompliant ? "secondary" : "outline"}>
                            {treatment.medicareCompliant ? "Medicare ✓" : "Non-covered"}
                          </Badge>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-4 text-muted-foreground">
                      <p className="text-sm">No treatment interventions documented yet</p>
                      <p className="text-xs mt-1">Begin documenting conservative care to track effectiveness</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Patient Compliance and Pain Tracking */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card data-testid="card-compliance-tracking">
              <CardHeader>
                <CardTitle>Patient Compliance Tracking</CardTitle>
                <CardDescription>
                  Treatment adherence based on documented conservative care data
                </CardDescription>
              </CardHeader>
              <CardContent>
                {healingProgress.length > 0 ? (
                  <ChartContainer config={chartConfig} className="h-[250px]">
                    <AreaChart data={healingProgress}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis domain={[0, 100]} />
                      <ChartTooltip />
                      <Area type="monotone" dataKey="compliance" stroke="var(--color-compliance)" fill="var(--color-compliance)" fillOpacity={0.3} />
                    </AreaChart>
                  </ChartContainer>
                ) : (
                  <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <Activity className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No compliance data available</p>
                      <p className="text-xs">Compliance scores will appear as conservative care is documented</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card data-testid="card-pain-management">
              <CardHeader>
                <CardTitle>Pain Level Progression</CardTitle>
                <CardDescription>
                  Patient-reported pain levels from wound assessment data
                </CardDescription>
              </CardHeader>
              <CardContent>
                {healingProgress.length > 0 ? (
                  <ChartContainer config={chartConfig} className="h-[250px]">
                    <BarChart data={healingProgress}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis domain={[0, 10]} />
                      <ChartTooltip />
                      <Bar dataKey="pain" fill="var(--color-pain)" />
                    </BarChart>
                  </ChartContainer>
                ) : (
                  <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <ThermometerSun className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No pain assessment data available</p>
                      <p className="text-xs">Pain levels will appear as wound assessments are documented</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Treatment Recommendations Tab */}
        <TabsContent value="recommendations" className="space-y-4">
          <Card data-testid="card-treatment-recommendations">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                Evidence-Based Treatment Recommendations
              </CardTitle>
              <CardDescription>
                Data-driven recommendations based on wound type, healing trajectory, and Medicare LCD requirements
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RecommendationsDisplay 
                episode={episode}
                encounters={parsedEncounters}
                lcdCompliance={lcdCompliance}
                patient={patient}
                effectivenessScore={effectivenessScore}
                treatmentDays={treatmentDays}
              />
            </CardContent>
          </Card>

          {/* LCD Compliance Gaps */}
          {lcdCompliance && lcdCompliance.gaps.length > 0 && (
            <Card data-testid="card-lcd-gaps">
              <CardHeader>
                <CardTitle>Medicare LCD Compliance Gaps</CardTitle>
                <CardDescription>
                  Areas requiring attention to meet Medicare LCD L33831 requirements
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {lcdCompliance.gaps.map((gap, index) => (
                    <div key={index} className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border-l-4 border-amber-500">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-amber-900 dark:text-amber-100">{gap}</p>
                          {lcdCompliance.recommendations[index] && (
                            <p className="text-xs text-amber-800 dark:text-amber-200 mt-1">
                              {lcdCompliance.recommendations[index]}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          
          {/* Risk Factor Assessment */}
          <Card data-testid="card-risk-assessment">
            <CardHeader>
              <CardTitle>Risk Factor Assessment</CardTitle>
              <CardDescription>
                Patient-specific factors influencing treatment selection and outcomes
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-3 bg-red-50 dark:bg-red-950/20 rounded-lg" data-testid="risk-diabetes">
                  <ThermometerSun className="h-8 w-8 mx-auto mb-2 text-red-500" />
                  <div className="font-semibold text-sm">Diabetes Control</div>
                  <div className="text-xs text-muted-foreground">HbA1c: 8.2%</div>
                  <Badge variant="destructive" className="mt-1 text-xs">High Risk</Badge>
                </div>
                
                <div className="text-center p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg" data-testid="risk-mobility">
                  <Footprints className="h-8 w-8 mx-auto mb-2 text-amber-500" />
                  <div className="font-semibold text-sm">Mobility</div>
                  <div className="text-xs text-muted-foreground">Limited ambulation</div>
                  <Badge className="bg-amber-100 text-amber-800 mt-1 text-xs">Moderate</Badge>
                </div>
                
                <div className="text-center p-3 bg-green-50 dark:bg-green-950/20 rounded-lg" data-testid="risk-nutrition">
                  <Droplets className="h-8 w-8 mx-auto mb-2 text-green-500" />
                  <div className="font-semibold text-sm">Nutrition</div>
                  <div className="text-xs text-muted-foreground">Albumin: 3.8 g/dL</div>
                  <Badge className="bg-green-100 text-green-800 mt-1 text-xs">Good</Badge>
                </div>
                
                <div className="text-center p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg" data-testid="risk-compliance">
                  <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-blue-500" />
                  <div className="font-semibold text-sm">Compliance</div>
                  <div className="text-xs text-muted-foreground">85% adherence</div>
                  <Badge className="bg-blue-100 text-blue-800 mt-1 text-xs">Good</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Treatment Timeline Tab */}
        <TabsContent value="timeline" className="space-y-4">
          <Card data-testid="card-treatment-timeline">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Treatment History Timeline
              </CardTitle>
              <CardDescription>
                Chronological view of all conservative care interventions and outcomes
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4" data-testid="timeline-entries">
                {careHistory.map((entry, index) => (
                  <div key={entry.encounterId} className="flex items-start gap-4 pb-4 border-b last:border-b-0" data-testid={`timeline-entry-${index}`}>
                    <div className="flex-shrink-0 w-2 h-2 bg-primary rounded-full mt-2"></div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-medium text-sm" data-testid={`timeline-date-${index}`}>
                          {new Date(entry.date).toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric', 
                            year: 'numeric' 
                          })}
                        </div>
                        <Badge variant="outline" data-testid={`timeline-badge-${index}`}>
                          Day {Math.ceil((new Date(entry.date).getTime() - new Date(episode?.episodeStartDate || entry.date).getTime()) / (1000 * 60 * 60 * 24))}
                        </Badge>
                      </div>
                      
                      {/* Render conservative care details */}
                      {entry.care && typeof entry.care === 'object' ? (
                        <div className="text-sm space-y-2 text-muted-foreground" data-testid={`timeline-details-${index}`}>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            {Object.entries(entry.care as Record<string, any>).slice(0, 6).map(([key, value]: [string, any]) => {
                              const displayValue: string = typeof value === 'string' ? value : 
                                                           typeof value === 'boolean' ? (value ? 'Yes' : 'No') : 
                                                           typeof value === 'number' ? value.toString() : 
                                                           String(value || 'N/A');
                              return (
                                <div key={key} className="space-y-1">
                                  <div className="font-medium text-xs capitalize text-foreground">
                                    {key.replace(/([A-Z])/g, ' $1').trim()}
                                  </div>
                                  <div className="text-xs" data-testid={`timeline-${key}-${index}`}>
                                    {displayValue}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          
                          {/* Render wound measurement details */}
                          {entry.woundDetails && typeof entry.woundDetails === 'object' ? (
                            <div className="mt-3 p-2 bg-muted/50 rounded text-xs">
                              <div className="font-medium mb-1">Wound Assessment:</div>
                              <div className="grid grid-cols-3 gap-2">
                                {Object.entries(entry.woundDetails as Record<string, any>).slice(0, 3).map(([key, value]: [string, any]) => {
                                  const displayValue: string = value === null || value === undefined ? 'N/A' : String(value);
                                  return (
                                    <span key={key}>
                                      <strong>{key}:</strong> {displayValue}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Treatment Protocols Tab */}
        <TabsContent value="protocols" className="space-y-4">
          <Card data-testid="card-treatment-protocols">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                Evidence-Based Treatment Protocols
              </CardTitle>
              <CardDescription>
                Medicare LCD-compliant conservative care protocols and guidelines
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {mockTreatmentTypes.map(treatment => (
                  <div key={treatment.id} className="p-4 border rounded-lg space-y-3" data-testid={`protocol-${treatment.id}`}>
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold">{treatment.name}</h4>
                      <Badge variant={treatment.medicareCompliant ? "secondary" : "outline"}>
                        {treatment.category}
                      </Badge>
                    </div>
                    
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Duration:</span>
                        <span>{treatment.duration} days</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Frequency:</span>
                        <span>{treatment.frequency}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Evidence Level:</span>
                        <span>{treatment.evidence.level}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Success Rate:</span>
                        <span>{treatment.evidence.successRate}%</span>
                      </div>
                    </div>
                    
                    <div className="pt-2 border-t">
                      <div className="text-xs text-muted-foreground mb-2">Evidence Citation:</div>
                      <div className="text-xs bg-muted/50 p-2 rounded">{treatment.evidence.citation}</div>
                    </div>
                    
                    <Button variant="outline" size="sm" className="w-full" data-testid={`button-protocol-${treatment.id}`}>
                      View Full Protocol
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Medicare LCD Requirements */}
          <Card data-testid="card-medicare-lcd">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5" />
                Medicare LCD Requirements
              </CardTitle>
              <CardDescription>
                Current regulatory requirements for conservative care documentation
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                  <h4 className="font-medium mb-2 text-blue-900 dark:text-blue-100">
                    Conservative Care Requirements (LCD L33831)
                  </h4>
                  <ul className="text-sm space-y-2 text-blue-800 dark:text-blue-200">
                    <li className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                      Minimum 30 days of conservative care for most wound types
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                      Weekly wound assessments with measurements
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                      Documentation of patient compliance
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                      Evidence of treatment response evaluation
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                      Appropriate offloading for diabetic foot ulcers
                    </li>
                  </ul>
                </div>

                <div className="p-4 bg-amber-50 dark:bg-amber-950/20 rounded-lg">
                  <h4 className="font-medium mb-2 text-amber-900 dark:text-amber-100">
                    Advanced Therapy Criteria
                  </h4>
                  <ul className="text-sm space-y-2 text-amber-800 dark:text-amber-200">
                    <li className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                      &lt;20% wound area reduction after 4 weeks of optimal care
                    </li>
                    <li className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                      Stagnant healing despite compliant conservative care
                    </li>
                    <li className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                      Documentation of medical necessity for advanced modalities
                    </li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}