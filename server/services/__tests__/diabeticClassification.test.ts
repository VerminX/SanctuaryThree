import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';

// Mock external dependencies
jest.mock('../../storage', () => ({
  storage: {
    createEligibilityAnalysis: jest.fn(),
    getPatientEncounters: jest.fn(),
    getEpisodeById: jest.fn()
  }
}));

// Import after mocking
import { 
  assessWagnerGrade,
  assessUniversityOfTexasClassification,
  assessDiabeticFootRisk,
  generateDiabeticFootRecommendations,
  DIABETIC_OUTCOMES_TRACKING,
  performPreEligibilityChecks
} from '../eligibilityValidator';

// Test fixtures for Phase 4.2 testing
const createWoundDataFixture = (overrides: any = {}) => ({
  skinIntegrity: 'superficial_ulcer' as const,
  woundDepth: 5,
  tissueInvolvement: ['dermis', 'subcutaneous'],
  boneTendonExposure: false,
  jointInvolvement: false,
  necroticTissue: false,
  gangrenePresent: false,
  gangreneExtent: undefined,
  anatomicalLocation: 'foot',
  ...overrides
});

const createInfectionDataFixture = (overrides: any = {}) => ({
  infectionPresent: false,
  infectionSeverity: undefined,
  purulentDrainage: false,
  malodor: false,
  systemicSigns: false,
  abscessPresent: false,
  ...overrides
});

const createVascularAssessmentFixture = (overrides: any = {}) => ({
  perfusionStatus: 'adequate' as const,
  revascularizationNeeded: false,
  ...overrides
});

const createPatientContextFixture = (overrides: any = {}) => ({
  diabeticStatus: 'type2' as const,
  diabetesDuration: 10,
  neuropathyPresent: true,
  previousUlceration: false,
  previousAmputation: false,
  immunocompromised: false,
  ...overrides
});

describe('Phase 4.2: Diabetic Classification System', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-09-21'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('assessWagnerGrade', () => {
    test('should classify Wagner Grade 0 for intact skin', () => {
      const woundData = createWoundDataFixture({
        skinIntegrity: 'intact',
        woundDepth: 0,
        tissueInvolvement: [],
        boneTendonExposure: false
      });
      
      const result = assessWagnerGrade(
        woundData,
        createInfectionDataFixture(),
        createVascularAssessmentFixture(),
        createPatientContextFixture()
      );

      expect(result.wagnerGrade.grade).toBe(0);
      expect(result.wagnerGrade.description).toContain('Pre-ulcerative lesions');
      expect(result.wagnerGrade.severity).toBe('minimal');
      expect(result.evidenceBase.primaryStudies).toContain('WAGNER_GRADE_001');
    });

    test('should classify Wagner Grade 1 for superficial ulcer', () => {
      const woundData = createWoundDataFixture({
        skinIntegrity: 'superficial_ulcer',
        woundDepth: 3,
        tissueInvolvement: ['epidermis', 'dermis'],
        boneTendonExposure: false
      });
      
      const result = assessWagnerGrade(
        woundData,
        createInfectionDataFixture(),
        createVascularAssessmentFixture(),
        createPatientContextFixture()
      );

      expect(result.wagnerGrade.grade).toBe(1);
      expect(result.wagnerGrade.description).toContain('Superficial ulcer');
      expect(result.wagnerGrade.severity).toBe('mild');
      expect(result.riskFactors).toContain('Superficial tissue involvement');
    });

    test('should classify Wagner Grade 2 for deep ulcer', () => {
      const woundData = createWoundDataFixture({
        skinIntegrity: 'deep_ulcer',
        woundDepth: 8,
        tissueInvolvement: ['dermis', 'subcutaneous', 'fascia'],
        boneTendonExposure: false
      });
      
      const result = assessWagnerGrade(
        woundData,
        createInfectionDataFixture(),
        createVascularAssessmentFixture(),
        createPatientContextFixture()
      );

      expect(result.wagnerGrade.grade).toBe(2);
      expect(result.wagnerGrade.description).toContain('Deep ulcer');
      expect(result.wagnerGrade.severity).toBe('moderate');
      expect(result.riskFactors).toContain('Deep tissue involvement');
    });

    test('should classify Wagner Grade 3 for deep ulcer with infection', () => {
      const woundData = createWoundDataFixture({
        skinIntegrity: 'complex_wound',
        woundDepth: 12,
        tissueInvolvement: ['bone', 'tendon'],
        boneTendonExposure: true
      });
      
      const infectionData = createInfectionDataFixture({
        infectionPresent: true,
        infectionSeverity: 'deep',
        abscessPresent: true
      });
      
      const result = assessWagnerGrade(
        woundData,
        infectionData,
        createVascularAssessmentFixture(),
        createPatientContextFixture()
      );

      expect(result.wagnerGrade.grade).toBe(3);
      expect(result.wagnerGrade.description).toContain('Deep ulcer with abscess or osteomyelitis');
      expect(result.wagnerGrade.severity).toBe('severe');
      expect(result.riskFactors).toContain('Bone/tendon exposure');
      expect(result.riskFactors).toContain('Deep infection or abscess');
    });

    test('should classify Wagner Grade 4 for partial foot gangrene', () => {
      const woundData = createWoundDataFixture({
        gangrenePresent: true,
        gangreneExtent: 'localized',
        tissueInvolvement: ['bone']
      });
      
      const result = assessWagnerGrade(
        woundData,
        createInfectionDataFixture(),
        createVascularAssessmentFixture(),
        createPatientContextFixture()
      );

      expect(result.wagnerGrade.grade).toBe(4);
      expect(result.wagnerGrade.description).toContain('Partial foot gangrene');
      expect(result.wagnerGrade.severity).toBe('critical');
      expect(result.riskFactors).toContain('Gangrene present');
      expect(result.amputationRisk).toBe('high');
    });

    test('should classify Wagner Grade 5 for extensive foot gangrene', () => {
      const woundData = createWoundDataFixture({
        gangrenePresent: true,
        gangreneExtent: 'extensive',
        tissueInvolvement: ['bone', 'muscle']
      });
      
      const result = assessWagnerGrade(
        woundData,
        createInfectionDataFixture(),
        createVascularAssessmentFixture(),
        createPatientContextFixture()
      );

      expect(result.wagnerGrade.grade).toBe(5);
      expect(result.wagnerGrade.description).toContain('Full foot gangrene');
      expect(result.wagnerGrade.severity).toBe('critical');
      expect(result.amputationRisk).toBe('very_high');
      expect(result.recommendations.immediate).toContain('Urgent surgical consultation');
    });

    test('should include proper evidence base and audit trail', () => {
      const result = assessWagnerGrade(
        createWoundDataFixture(),
        createInfectionDataFixture(),
        createVascularAssessmentFixture(),
        createPatientContextFixture()
      );

      expect(result.evidenceBase).toHaveProperty('primaryStudies');
      expect(result.evidenceBase.primaryStudies).toContain('WAGNER_GRADE_001');
      expect(result.evidenceBase.primaryStudies).toContain('WAGNER_GRADE_002');
      expect(result.evidenceBase).toHaveProperty('clinicalGuidelines');
      expect(result.evidenceBase.clinicalGuidelines).toContain('IWGDF_2023_DIABETIC');
      expect(result.auditTrail).toBeInstanceOf(Array);
      expect(result.auditTrail.length).toBeGreaterThan(0);
      expect(result.auditTrail[0]).toContain('Assessed Wagner Grade classification');
    });
  });

  describe('assessUniversityOfTexasClassification', () => {
    test('should classify UT A0 for superficial ulcer without infection/ischemia', () => {
      const result = assessUniversityOfTexasClassification(
        createWoundDataFixture({
          skinIntegrity: 'superficial_ulcer',
          boneTendonExposure: false,
          jointInvolvement: false
        }),
        createInfectionDataFixture({ infectionPresent: false }),
        createVascularAssessmentFixture({ perfusionStatus: 'adequate' }),
        createPatientContextFixture()
      );

      expect(result.utClassification.stage).toBe('A');
      expect(result.utClassification.grade).toBe(0);
      expect(result.utClassification.description).toContain('Pre- or post-ulcerative site');
      expect(result.healingPrediction.likelyOutcome).toBe('excellent');
      expect(result.healingPrediction.expectedTimeWeeks).toBeLessThan(6);
    });

    test('should classify UT A1 for superficial ulcer', () => {
      const result = assessUniversityOfTexasClassification(
        createWoundDataFixture({
          skinIntegrity: 'superficial_ulcer',
          woundDepth: 3,
          boneTendonExposure: false
        }),
        createInfectionDataFixture(),
        createVascularAssessmentFixture(),
        createPatientContextFixture()
      );

      expect(result.utClassification.stage).toBe('A');
      expect(result.utClassification.grade).toBe(1);
      expect(result.utClassification.description).toContain('Superficial wound');
      expect(result.healingPrediction.likelyOutcome).toBe('good');
    });

    test('should classify UT A2 for deep ulcer with tendon involvement', () => {
      const result = assessUniversityOfTexasClassification(
        createWoundDataFixture({
          skinIntegrity: 'deep_ulcer',
          woundDepth: 8,
          tissueInvolvement: ['tendon'],
          boneTendonExposure: true
        }),
        createInfectionDataFixture(),
        createVascularAssessmentFixture(),
        createPatientContextFixture()
      );

      expect(result.utClassification.stage).toBe('A');
      expect(result.utClassification.grade).toBe(2);
      expect(result.utClassification.description).toContain('Wound penetrating to tendon or capsule');
      expect(result.healingPrediction.likelyOutcome).toBe('guarded');
    });

    test('should classify UT A3 for wound with bone/joint involvement', () => {
      const result = assessUniversityOfTexasClassification(
        createWoundDataFixture({
          skinIntegrity: 'complex_wound',
          tissueInvolvement: ['bone', 'joint'],
          boneTendonExposure: true,
          jointInvolvement: true
        }),
        createInfectionDataFixture(),
        createVascularAssessmentFixture(),
        createPatientContextFixture()
      );

      expect(result.utClassification.stage).toBe('A');
      expect(result.utClassification.grade).toBe(3);
      expect(result.utClassification.description).toContain('Wound penetrating to bone or joint');
      expect(result.healingPrediction.likelyOutcome).toBe('poor');
    });

    test('should classify UT B stages for infected wounds', () => {
      const result = assessUniversityOfTexasClassification(
        createWoundDataFixture(),
        createInfectionDataFixture({
          infectionPresent: true,
          infectionSeverity: 'superficial'
        }),
        createVascularAssessmentFixture(),
        createPatientContextFixture()
      );

      expect(result.utClassification.stage).toBe('B');
      expect(result.treatmentComplexity).toBe('high');
      expect(result.healingPrediction.expectedTimeWeeks).toBeGreaterThan(4);
    });

    test('should classify UT C stages for ischemic wounds', () => {
      const result = assessUniversityOfTexasClassification(
        createWoundDataFixture(),
        createInfectionDataFixture(),
        createVascularAssessmentFixture({
          perfusionStatus: 'compromised'
        }),
        createPatientContextFixture()
      );

      expect(result.utClassification.stage).toBe('C');
      expect(result.treatmentComplexity).toBe('high');
      expect(result.healingPrediction.likelyOutcome).toBe('guarded');
    });

    test('should classify UT D stages for infected ischemic wounds', () => {
      const result = assessUniversityOfTexasClassification(
        createWoundDataFixture(),
        createInfectionDataFixture({
          infectionPresent: true,
          infectionSeverity: 'deep'
        }),
        createVascularAssessmentFixture({
          perfusionStatus: 'severely_compromised'
        }),
        createPatientContextFixture()
      );

      expect(result.utClassification.stage).toBe('D');
      expect(result.utClassification.description).toContain('infected ischemic');
      expect(result.treatmentComplexity).toBe('very_high');
      expect(result.healingPrediction.likelyOutcome).toBe('poor');
      expect(result.amputationRisk).toBe('high');
    });

    test('should include proper evidence base with UT-specific studies', () => {
      const result = assessUniversityOfTexasClassification(
        createWoundDataFixture(),
        createInfectionDataFixture(),
        createVascularAssessmentFixture(),
        createPatientContextFixture()
      );

      expect(result.evidenceBase.primaryStudies).toContain('UT_CLASS_001');
      expect(result.evidenceBase.primaryStudies).toContain('UT_CLASS_002');
      expect(result.evidenceBase.clinicalGuidelines).toContain('IWGDF_2023_DIABETIC');
      expect(result.auditTrail).toContain('Assessed University of Texas classification');
    });
  });

  describe('assessDiabeticFootRisk', () => {
    const createWoundHistoryFixture = () => ({
      currentWoundDetails: { depth: 5, area: 12 },
      woundHistory: [
        { depth: 3, area: 8, timestamp: new Date('2025-08-01') },
        { depth: 5, area: 12, timestamp: new Date('2025-09-01') }
      ],
      encounterHistory: [],
      patientDemographics: { age: 65, diabetesDuration: 15 }
    });

    test('should assess low risk for optimal glycemic control and no complications', () => {
      const result = assessDiabeticFootRisk(
        createWoundHistoryFixture(),
        createPatientContextFixture({
          diabetesDuration: 5,
          neuropathyPresent: false,
          previousUlceration: false,
          previousAmputation: false
        })
      );

      expect(result.overallRiskAssessment.riskLevel).toBe('low');
      expect(result.overallRiskAssessment.riskScore).toBeLessThan(30);
      expect(result.riskFactors.modifiable).toContain('Maintain optimal glycemic control');
      expect(result.riskFactors.nonModifiable).toContain('Diabetes duration: 5 years');
    });

    test('should assess moderate risk for neuropathy without ulceration history', () => {
      const result = assessDiabeticFootRisk(
        createWoundHistoryFixture(),
        createPatientContextFixture({
          diabetesDuration: 10,
          neuropathyPresent: true,
          previousUlceration: false,
          previousAmputation: false
        })
      );

      expect(result.overallRiskAssessment.riskLevel).toBe('moderate');
      expect(result.overallRiskAssessment.riskScore).toBeGreaterThanOrEqual(30);
      expect(result.overallRiskAssessment.riskScore).toBeLessThan(60);
      expect(result.riskFactors.modifiable).toContain('Neuropathy management');
      expect(result.riskFactors.nonModifiable).toContain('Peripheral neuropathy present');
    });

    test('should assess high risk for previous ulceration history', () => {
      const result = assessDiabeticFootRisk(
        createWoundHistoryFixture(),
        createPatientContextFixture({
          diabetesDuration: 15,
          neuropathyPresent: true,
          previousUlceration: true,
          previousAmputation: false
        })
      );

      expect(result.overallRiskAssessment.riskLevel).toBe('high');
      expect(result.overallRiskAssessment.riskScore).toBeGreaterThanOrEqual(60);
      expect(result.overallRiskAssessment.riskScore).toBeLessThan(80);
      expect(result.riskFactors.nonModifiable).toContain('Previous ulceration history');
      expect(result.preventionStrategies.immediate).toContain('Intensive foot monitoring');
    });

    test('should assess critical risk for previous amputation', () => {
      const result = assessDiabeticFootRisk(
        createWoundHistoryFixture(),
        createPatientContextFixture({
          diabetesDuration: 20,
          neuropathyPresent: true,
          previousUlceration: true,
          previousAmputation: true
        })
      );

      expect(result.overallRiskAssessment.riskLevel).toBe('critical');
      expect(result.overallRiskAssessment.riskScore).toBeGreaterThanOrEqual(80);
      expect(result.riskFactors.nonModifiable).toContain('Previous amputation');
      expect(result.preventionStrategies.immediate).toContain('Multidisciplinary diabetic foot team');
      expect(result.monitoringRecommendations.frequency).toBe('weekly');
    });

    test('should include proper evidence base and risk stratification studies', () => {
      const result = assessDiabeticFootRisk(
        createWoundHistoryFixture(),
        createPatientContextFixture()
      );

      expect(result.evidenceBase.primaryStudies).toContain('RISK_STRAT_001');
      expect(result.evidenceBase.primaryStudies).toContain('RISK_STRAT_002');
      expect(result.evidenceBase.primaryStudies).toContain('AMPUT_PREV_001');
      expect(result.evidenceBase.clinicalGuidelines).toContain('ADA_2023_DIABETIC_FOOT');
      expect(result.auditTrail).toContain('Assessed diabetic foot risk stratification');
    });
  });

  describe('generateDiabeticFootRecommendations', () => {
    test('should generate appropriate recommendations for low-risk Wagner Grade 1', () => {
      const wagnerResult = {
        wagnerGrade: { grade: 1, description: 'Superficial ulcer', severity: 'mild' },
        amputationRisk: 'low',
        riskFactors: ['Superficial tissue involvement']
      };

      const utResult = {
        utClassification: { stage: 'A', grade: 1, description: 'Superficial wound' },
        healingPrediction: { likelyOutcome: 'good', expectedTimeWeeks: 4 }
      };

      const riskResult = {
        overallRiskAssessment: { riskLevel: 'moderate', riskScore: 45 }
      };

      const result = generateDiabeticFootRecommendations(
        wagnerResult as any,
        utResult as any,
        riskResult as any,
        {
          clinicalContext: {
            currentTreatmentPlan: 'standard_wound_care',
            treatmentGoals: ['healing', 'infection_prevention'],
            limitationsConstraints: []
          },
          patientPreferences: {
            treatmentCompliance: 'high',
            mobilityGoals: 'maintain_ambulation'
          }
        }
      );

      expect(result.immediate.woundCare).toContain('Standard wound cleaning and dressing');
      expect(result.immediate.offloading).toContain('Appropriate diabetic footwear');
      expect(result.shortTerm.monitoring).toContain('Weekly wound assessment');
      expect(result.longTerm.prevention).toContain('Patient education on foot care');
      expect(result.evidenceBase.primaryStudies).toContain('WAGNER_GRADE_001');
      expect(result.evidenceBase.clinicalGuidelines).toContain('IWGDF_2023_DIABETIC');
    });

    test('should generate intensive recommendations for high-risk Wagner Grade 3', () => {
      const wagnerResult = {
        wagnerGrade: { grade: 3, description: 'Deep ulcer with abscess', severity: 'severe' },
        amputationRisk: 'high',
        riskFactors: ['Deep infection', 'Bone involvement']
      };

      const utResult = {
        utClassification: { stage: 'B', grade: 3, description: 'Infected wound with bone involvement' },
        healingPrediction: { likelyOutcome: 'poor', expectedTimeWeeks: 16 }
      };

      const riskResult = {
        overallRiskAssessment: { riskLevel: 'critical', riskScore: 85 }
      };

      const result = generateDiabeticFootRecommendations(
        wagnerResult as any,
        utResult as any,
        riskResult as any,
        {
          clinicalContext: {
            currentTreatmentPlan: 'intensive_care',
            treatmentGoals: ['healing', 'limb_salvage'],
            limitationsConstraints: ['infection_present']
          },
          patientPreferences: {
            treatmentCompliance: 'moderate',
            mobilityGoals: 'preserve_limb'
          }
        }
      );

      expect(result.immediate.woundCare).toContain('Surgical debridement');
      expect(result.immediate.antibiotics).toContain('IV broad-spectrum antibiotics');
      expect(result.immediate.offloading).toContain('Total contact casting');
      expect(result.shortTerm.monitoring).toContain('Daily wound assessment');
      expect(result.shortTerm.specialistReferral).toContain('Infectious disease consultation');
      expect(result.longTerm.surveillanceProtocol).toContain('Intensive diabetic foot monitoring');
    });

    test('should integrate glycemic control recommendations', () => {
      const result = generateDiabeticFootRecommendations(
        { wagnerGrade: { grade: 2, severity: 'moderate' } } as any,
        { utClassification: { stage: 'A', grade: 2 } } as any,
        { overallRiskAssessment: { riskLevel: 'high' } } as any,
        {
          clinicalContext: {
            currentTreatmentPlan: 'standard_wound_care',
            treatmentGoals: ['healing'],
            limitationsConstraints: ['poor_glycemic_control']
          },
          patientPreferences: {
            treatmentCompliance: 'moderate',
            mobilityGoals: 'maintain_ambulation'
          }
        }
      );

      expect(result.immediate.glycemicControl).toContain('Optimize diabetes management');
      expect(result.shortTerm.specialistReferral).toContain('Endocrinology consultation');
      expect(result.longTerm.prevention).toContain('HbA1c target <7.0%');
    });
  });

  describe('DIABETIC_OUTCOMES_TRACKING system', () => {
    test('should track wound outcomes with HbA1c correlation', () => {
      const trackingParams = {
        patientId: 'patient-123',
        episodeId: 'episode-456',
        wagnerGrade: { wagnerGrade: { grade: 2 } },
        utClassification: { utClassification: { stage: 'A', grade: 2 } },
        riskAssessment: { overallRiskAssessment: { riskLevel: 'moderate' } },
        glycemicControl: { hba1c: 8.5 },
        outcomeData: {
          healingTime: 84, // 12 weeks
          healingAchieved: true,
          complications: [],
          interventionsRequired: ['offloading', 'wound_care'],
          amputationRequired: false
        },
        followUpPeriod: 180
      };

      const result = DIABETIC_OUTCOMES_TRACKING.trackWoundOutcome(trackingParams as any);

      expect(result.trackingId).toContain('DIABETIC_OUTCOME_patient-123');
      expect(result.hba1cAnalysis.category).toBe('suboptimal');
      expect(result.hba1cAnalysis.modifier).toBe(0.85);
      expect(result.performanceMetrics.glycemicControlImpact).toBeDefined();
      expect(result.qualityInsights.improvementOpportunities).toContain('Optimize glycemic control');
    });

    test('should calculate expected healing times accurately', () => {
      const expectedTime = DIABETIC_OUTCOMES_TRACKING.calculateExpectedHealingTime(
        2, // Wagner Grade 2
        'A', // UT Stage A
        2,  // UT Grade 2
        'moderate' // Risk level
      );

      expect(expectedTime).toBe(50); // 42 * 1.2 * 1.0 = 50 days (rounded)
    });

    test('should generate predictive analytics', () => {
      const params = {
        wagnerGrade: { wagnerGrade: { grade: 1 } },
        utClassification: { utClassification: { stage: 'A', grade: 1 } },
        riskAssessment: { overallRiskAssessment: { riskLevel: 'low' } },
        glycemicControl: { hba1c: 7.2 }
      };

      const result = DIABETIC_OUTCOMES_TRACKING.generatePredictiveAnalytics(params as any, {});

      expect(result.healingProbability).toBeGreaterThan(0);
      expect(result.healingProbability).toBeLessThanOrEqual(1);
      expect(result.amputationRisk).toBeGreaterThanOrEqual(0);
      expect(result.expectedHealingTime).toBeGreaterThan(0);
      expect(result.riskFactors).toBeInstanceOf(Array);
      expect(result.mitigationStrategies).toBeInstanceOf(Array);
    });
  });

  describe('Integration with performPreEligibilityChecks', () => {
    test('should call Phase 4.2 assessments for diabetic patients', () => {
      const episode = {
        id: 'episode-123',
        woundType: 'diabetic foot ulcer',
        woundLocation: 'left foot',
        primaryDiagnosis: 'E11.621'
      };

      const encounters = [
        {
          id: 'encounter-1',
          date: '2025-09-15',
          diabeticStatus: 'diabetic',
          notes: ['Diabetic foot ulcer with superficial infection'],
          woundDetails: {
            depth: 8,
            measurements: { length: 3, width: 2.5, unit: 'cm' },
            tissueInvolvement: ['dermis', 'subcutaneous']
          }
        }
      ];

      const result = performPreEligibilityChecks(episode, encounters);

      // Verify Phase 4.2 integration
      expect(result.auditTrail).toContain('Performing Phase 4.2 diabetic-specific classifications...');
      expect(result.auditTrail.some((trail: string) => 
        trail.includes('Wagner Grade Assessment:')
      )).toBe(true);
      expect(result.auditTrail.some((trail: string) => 
        trail.includes('UT Classification:')
      )).toBe(true);
      expect(result.auditTrail.some((trail: string) => 
        trail.includes('Risk Level:')
      )).toBe(true);
    });

    test('should skip Phase 4.2 assessments for non-diabetic patients', () => {
      const episode = {
        id: 'episode-123',
        woundType: 'venous leg ulcer',
        woundLocation: 'lower leg',
        primaryDiagnosis: 'I83.009'
      };

      const encounters = [
        {
          id: 'encounter-1',
          date: '2025-09-15',
          diabeticStatus: 'nondiabetic',
          notes: ['Venous leg ulcer, standard care'],
          woundDetails: {
            measurements: { length: 4, width: 3, unit: 'cm' }
          }
        }
      ];

      const result = performPreEligibilityChecks(episode, encounters);

      expect(result.auditTrail).toContain('Phase 4.2 diabetic classifications skipped - patient not diabetic');
      expect(result.auditTrail.some((trail: string) => 
        trail.includes('Wagner Grade Assessment:')
      )).toBe(false);
    });
  });
});