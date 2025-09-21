import { jest, describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import express, { type Express } from 'express';
import { storage } from '../../storage';
import { registerRoutes } from '../../routes';
import { performPreEligibilityChecks, DIABETIC_OUTCOMES_TRACKING } from '../../services/eligibilityValidator';

// Mock external dependencies for testing
const mockAnalyzeEligibility = jest.fn();
const mockAnalyzeEligibilityWithFullContext = jest.fn();

jest.mock('../../services/openai', () => ({
  analyzeEligibility: mockAnalyzeEligibility,
  analyzeEligibilityWithFullContext: mockAnalyzeEligibilityWithFullContext
}));

// Mock authentication middleware
const mockIsAuthenticated = (req: any, res: any, next: any) => {
  req.user = {
    claims: {
      sub: 'test-user-phase42'
    }
  };
  next();
};

jest.mock('../../middleware/auth', () => ({
  isAuthenticated: mockIsAuthenticated
}));

describe('Phase 4.2: Diabetic Classification Integration Tests', () => {
  let app: Express;
  let testTenantId: string;
  let testPatientId: string;
  let testEpisodeId: string;
  let testEncounterId: string;
  
  beforeAll(async () => {
    // Setup test application
    app = express();
    app.use(express.json());
    registerRoutes(app);
    
    // Setup test data
    testTenantId = `tenant-phase42-${Date.now()}`;
    testPatientId = `patient-phase42-${Date.now()}`;
    testEpisodeId = `episode-phase42-${Date.now()}`;
    testEncounterId = `encounter-phase42-${Date.now()}`;
    
    // Create test tenant
    await storage.createTenant({
      id: testTenantId,
      name: 'Phase 4.2 Test Clinic',
      email: 'test@phase42clinic.com',
      macRegion: 'Palmetto GBA',
      address: '123 Test St, Test City, SC 12345',
      phone: '555-0123',
      contactPersonName: 'Dr. Test Phase42',
      contactPersonEmail: 'dr.test@phase42clinic.com',
      isActive: true
    });
    
    // Create test patient (diabetic)
    await storage.createPatient({
      id: testPatientId,
      tenantId: testTenantId,
      firstName: 'Diabetic',
      lastName: 'TestPatient',
      dateOfBirth: '1960-05-15',
      gender: 'male',
      email: 'diabetic.patient@test.com',
      phone: '555-0456'
    });
    
    // Create test episode (diabetic foot ulcer)
    await storage.createEpisode({
      id: testEpisodeId,
      patientId: testPatientId,
      tenantId: testTenantId,
      woundType: 'Diabetic Foot Ulcer',
      woundLocation: 'right foot dorsal',
      startDate: new Date('2025-08-01'),
      primaryDiagnosis: 'E11.621', // Type 2 diabetes with diabetic foot ulcer
      secondaryDiagnoses: ['Z87.891'], // Personal history of nicotine dependence
      isActive: true,
      caseManagerId: 'test-case-manager'
    });
    
    // Create test encounter with diabetic-specific data
    await storage.createEncounter({
      id: testEncounterId,
      episodeId: testEpisodeId,
      patientId: testPatientId,
      tenantId: testTenantId,
      date: new Date('2025-09-15'),
      type: 'wound_assessment',
      diabeticStatus: 'diabetic',
      notes: [
        'Type 2 diabetic patient presents with non-healing diabetic foot ulcer on right foot dorsal surface',
        'Wound measures 3.2 x 2.8 cm with depth of 8mm, involving subcutaneous tissue',
        'Minimal purulent drainage noted, no malodor',
        'Patient reports decreased sensation in bilateral feet (neuropathy)',
        'HbA1c last measured at 8.7% (elevated)',
        'Previous ulceration history on left foot 2 years ago - healed',
        'Patient compliant with current diabetic medications',
        'Wound bed shows granulation tissue with some fibrin slough',
        'Periwound skin appears intact with mild erythema',
        'No obvious signs of osteomyelitis on clinical examination'
      ],
      woundDetails: {
        measurements: {
          length: 3.2,
          width: 2.8,
          depth: 8,
          unit: 'mm',
          area: 8.96,
          measurementMethod: 'ruler',
          measurementTimestamp: new Date('2025-09-15T10:30:00Z')
        },
        tissueInvolvement: ['dermis', 'subcutaneous'],
        woundBed: ['granulation_tissue', 'fibrin_slough'],
        drainage: 'minimal_purulent',
        infectionPresent: false,
        infectionSeverity: undefined,
        necroticTissue: false,
        boneTendonExposure: false,
        jointInvolvement: false,
        gangrenePresent: false,
        neuropathyPresent: true
      },
      procedureCodes: [
        { code: '97597', description: 'Debridement, open wound' },
        { code: '97602', description: 'Wound care management' }
      ]
    });

    // Setup mock AI responses for Phase 4.2 integration
    mockAnalyzeEligibility.mockResolvedValue({
      eligibility: 'Yes',
      rationale: 'Diabetic foot ulcer meets all Phase 4.2 classification criteria. Wagner Grade 2, UT Classification A2, High risk stratification. Patient demonstrates adequate conservative care failure.',
      requiredDocumentationGaps: [],
      citations: [
        {
          title: 'Diabetic Foot Ulcer Coverage Criteria with Phase 4.2 Classification',
          url: 'https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid=33622',
          section: 'Diabetic Classification Requirements',
          effectiveDate: '2024-06-01'
        }
      ],
      letterBullets: [
        '• Wagner Grade 2: Deep ulcer involving subcutaneous tissue without bone involvement',
        '• UT Classification A2: Non-ischemic, non-infected wound penetrating to tendon/capsule level',
        '• High risk stratification: Neuropathy present with previous ulceration history',
        '• HbA1c 8.7% indicates suboptimal glycemic control impacting healing velocity',
        '• Conservative care timeline meets 4+ week requirement per Medicare LCD'
      ],
      preEligibilityCheck: {
        performed: true,
        result: 'ELIGIBLE',
        determinationSource: 'PHASE_4_2_INTEGRATION',
        auditTrail: [
          'Performing Phase 4.2 diabetic-specific classifications...',
          'Wagner Grade Assessment: Grade 2 (Deep ulcer involving subcutaneous tissue)',
          'UT Classification: Stage A2 (Non-ischemic, non-infected wound to tendon level)',
          'Risk Level: high (75/100)',
          'Phase 4.2 diabetic assessments completed successfully'
        ],
        policyViolations: []
      }
    });

    mockAnalyzeEligibilityWithFullContext.mockResolvedValue({
      eligibility: 'Yes',
      rationale: 'Episode-level Phase 4.2 analysis confirms diabetic foot ulcer classification and eligibility.',
      requiredDocumentationGaps: [],
      citations: [
        {
          title: 'Phase 4.2 Enhanced Diabetic Classification System',
          url: 'https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid=33623',
          section: 'Integrated Diabetic Assessment Criteria',
          effectiveDate: '2024-08-01'
        }
      ],
      letterBullets: ['• Episode demonstrates consistent Phase 4.2 diabetic classification outcomes'],
      historicalContext: {
        totalEpisodes: 1,
        totalEncounters: 1,
        previousEligibilityChecks: 0,
        keyPatterns: ['Diabetic foot ulcer progression', 'Neuropathy complications', 'Previous ulceration risk']
      },
      preEligibilityCheck: {
        performed: true,
        result: 'ELIGIBLE',
        determinationSource: 'PHASE_4_2_INTEGRATION',
        auditTrail: [
          'Phase 4.2 diabetic classifications completed across episode timeline',
          'Consistent Wagner Grade 2 classification maintained',
          'UT Classification A2 appropriate for wound characteristics',
          'High risk stratification validated across encounters'
        ],
        policyViolations: []
      }
    });
  });

  afterAll(async () => {
    // Cleanup test data
    try {
      // await storage.deleteEncounter(testEncounterId); // Method not available
      await storage.deleteEpisode(testEpisodeId);
      // await storage.deletePatient(testPatientId); // Method not available
      // await storage.deleteTenant(testTenantId); // Method not available
    } catch (error) {
      console.warn('Cleanup warning:', error);
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Phase 4.2 Pre-Eligibility Integration', () => {
    test('should perform Phase 4.2 diabetic classifications in pre-eligibility checks', async () => {
      // Get episode and encounters
      const episode = await storage.getEpisode(testEpisodeId);
      const encounters = await storage.getEncountersByPatient(testPatientId);
      
      expect(episode).toBeTruthy();
      expect(encounters.length).toBeGreaterThan(0);
      
      // Run pre-eligibility checks directly
      const result = performPreEligibilityChecks(episode, encounters);
      
      // Verify Phase 4.2 integration
      expect(result.overallEligible).toBe(true);
      expect(result.auditTrail).toContain('Performing Phase 4.2 diabetic-specific classifications...');
      
      // Verify Phase 4.2 audit trail entries
      const phase42Entries = result.auditTrail.filter(entry => 
        entry.includes('Wagner Grade Assessment:') ||
        entry.includes('UT Classification:') ||
        entry.includes('Risk Level:') ||
        entry.includes('Phase 4.2 diabetic assessments completed')
      );
      
      expect(phase42Entries.length).toBeGreaterThanOrEqual(4);
      
      // Verify specific Phase 4.2 classifications were performed
      expect(result.auditTrail.some(entry => 
        entry.includes('Wagner Grade Assessment:') && entry.includes('Grade')
      )).toBe(true);
      
      expect(result.auditTrail.some(entry => 
        entry.includes('UT Classification:') && entry.includes('Stage')
      )).toBe(true);
      
      expect(result.auditTrail.some(entry => 
        entry.includes('Risk Level:') && entry.includes('(') && entry.includes('/100)')
      )).toBe(true);
    });

    test('should skip Phase 4.2 for non-diabetic patients', async () => {
      // Create non-diabetic encounter
      const nonDiabeticEncounterId = `encounter-nondiabetic-${Date.now()}`;
      
      await storage.createEncounter({
        id: nonDiabeticEncounterId,
        episodeId: testEpisodeId,
        patientId: testPatientId,
        tenantId: testTenantId,
        date: new Date('2025-09-16'),
        type: 'wound_assessment',
        diabeticStatus: 'nondiabetic',
        notes: ['Non-diabetic patient with venous leg ulcer'],
        woundDetails: {
          measurements: { length: 4, width: 3, unit: 'cm' }
        }
      });
      
      try {
        const episode = await storage.getEpisode(testEpisodeId);
        const encounters = [await storage.getEncounter(nonDiabeticEncounterId)];
        
        const result = performPreEligibilityChecks(episode, encounters);
        
        expect(result.auditTrail).toContain('Phase 4.2 diabetic classifications skipped - patient not diabetic');
        expect(result.auditTrail.some(entry => 
          entry.includes('Wagner Grade Assessment:')
        )).toBe(false);
        
      } finally {
        // await storage.deleteEncounter(nonDiabeticEncounterId); // Method not available
      }
    });
  });

  describe('Phase 4.2 API Endpoint Integration', () => {
    test('should integrate Phase 4.2 results in encounter eligibility analysis', async () => {
      const response = await request(app)
        .post(`/api/encounters/${testEncounterId}/analyze-eligibility`)
        .expect(200);
      
      expect(response.body).toHaveProperty('eligibility');
      expect(response.body).toHaveProperty('preEligibilityCheck');
      
      // Verify Phase 4.2 integration in pre-eligibility results
      const preEligibilityCheck = response.body.preEligibilityCheck;
      expect(preEligibilityCheck.performed).toBe(true);
      expect(preEligibilityCheck.result).toBe('ELIGIBLE');
      expect(preEligibilityCheck.determinationSource).toBe('PHASE_4_2_INTEGRATION');
      
      // Verify Phase 4.2 audit trail in response
      const auditTrail = preEligibilityCheck.auditTrail;
      expect(auditTrail).toContain('Performing Phase 4.2 diabetic-specific classifications...');
      expect(auditTrail.some((entry: string) => 
        entry.includes('Wagner Grade Assessment:')
      )).toBe(true);
      expect(auditTrail.some((entry: string) => 
        entry.includes('UT Classification:')
      )).toBe(true);
      expect(auditTrail.some((entry: string) => 
        entry.includes('Risk Level:')
      )).toBe(true);
      
      // Verify Phase 4.2 classifications appear in AI rationale
      expect(response.body.rationale).toContain('Wagner Grade');
      expect(response.body.rationale).toContain('UT Classification');
      expect(response.body.rationale).toContain('risk stratification');
      
      // Verify Phase 4.2 results in letter bullets
      const letterBullets = response.body.letterBullets;
      expect(letterBullets.some((bullet: string) => 
        bullet.includes('Wagner Grade')
      )).toBe(true);
      expect(letterBullets.some((bullet: string) => 
        bullet.includes('UT Classification')
      )).toBe(true);
    });

    test('should integrate Phase 4.2 results in episode eligibility analysis', async () => {
      const response = await request(app)
        .post(`/api/episodes/${testEpisodeId}/analyze-eligibility`)
        .expect(200);
      
      expect(response.body).toHaveProperty('eligibility');
      expect(response.body).toHaveProperty('preEligibilityCheck');
      expect(response.body).toHaveProperty('historicalContext');
      
      // Verify Phase 4.2 integration in episode-level analysis
      const preEligibilityCheck = response.body.preEligibilityCheck;
      expect(preEligibilityCheck.determinationSource).toBe('PHASE_4_2_INTEGRATION');
      
      // Verify historical context includes Phase 4.2 patterns
      const historicalContext = response.body.historicalContext;
      expect(historicalContext.keyPatterns).toContain('Diabetic foot ulcer progression');
      expect(historicalContext.keyPatterns).toContain('Neuropathy complications');
      
      // Verify episode-level Phase 4.2 audit trail
      expect(preEligibilityCheck.auditTrail.some((entry: string) => 
        entry.includes('Phase 4.2 diabetic classifications completed across episode timeline')
      )).toBe(true);
    });
  });

  describe('DIABETIC_OUTCOMES_TRACKING Integration', () => {
    test('should properly track diabetic wound outcomes', () => {
      const trackingParams = {
        patientId: testPatientId,
        episodeId: testEpisodeId,
        wagnerGrade: {
          wagnerGrade: { grade: 2, description: 'Deep ulcer', severity: 'moderate' },
          amputationRisk: 'moderate',
          riskFactors: ['Deep tissue involvement']
        },
        utClassification: {
          utClassification: { stage: 'A', grade: 2, description: 'Non-ischemic wound to tendon level' },
          healingPrediction: { likelyOutcome: 'guarded', expectedTimeWeeks: 8 }
        },
        riskAssessment: {
          overallRiskAssessment: { riskLevel: 'high', riskScore: 75 }
        },
        glycemicControl: {
          hba1c: 8.7,
          timeInRange: 60,
          glucoseVariability: 'high'
        },
        outcomeData: {
          healingTime: 70,
          healingAchieved: true,
          complications: ['mild_infection'],
          interventionsRequired: ['debridement', 'offloading', 'antibiotic_therapy'],
          amputationRequired: false
        },
        followUpPeriod: 180
      };

      const result = DIABETIC_OUTCOMES_TRACKING.trackWoundOutcome(trackingParams);

      // Verify tracking result structure
      expect(result).toHaveProperty('trackingId');
      expect(result.trackingId).toContain(`DIABETIC_OUTCOME_${testPatientId}`);
      
      expect(result).toHaveProperty('performanceMetrics');
      expect(result).toHaveProperty('qualityInsights');
      expect(result).toHaveProperty('hba1cAnalysis');
      expect(result).toHaveProperty('predictiveAnalytics');

      // Verify HbA1c analysis
      expect(result.hba1cAnalysis.category).toBe('suboptimal');
      expect(result.hba1cAnalysis.modifier).toBe(0.85);
      expect(result.hba1cAnalysis.healingImpact).toBe('impaired');

      // Verify quality insights
      expect(result.qualityInsights.improvementOpportunities).toContain(
        'Optimize glycemic control - HbA1c >8.0% significantly impairs healing'
      );

      // Verify predictive analytics
      expect(result.predictiveAnalytics.healingProbability).toBeGreaterThan(0);
      expect(result.predictiveAnalytics.amputationRisk).toBeLessThan(1);
      expect(result.predictiveAnalytics.expectedHealingTime).toBeGreaterThan(0);
      expect(result.predictiveAnalytics.riskFactors).toBeInstanceOf(Array);
      expect(result.predictiveAnalytics.mitigationStrategies).toBeInstanceOf(Array);
    });

    test('should calculate healing time predictions accurately', () => {
      // Test Wagner Grade 2, UT A2, Moderate Risk
      const expectedTime = DIABETIC_OUTCOMES_TRACKING.calculateExpectedHealingTime(
        2,  // Wagner Grade
        'A', // UT Stage
        2,   // UT Grade
        'moderate' // Risk Level
      );

      // Expected: 42 (Wagner 2) * 1.2 (UT A2) * 1.0 (moderate risk) = 50 days
      expect(expectedTime).toBe(50);

      // Test high-risk Wagner Grade 3
      const highRiskTime = DIABETIC_OUTCOMES_TRACKING.calculateExpectedHealingTime(
        3,   // Wagner Grade
        'D',  // UT Stage (infected + ischemic)
        3,    // UT Grade  
        'critical' // Risk Level
      );

      // Expected: 70 (Wagner 3) * 2.5 (UT D3) * 1.6 (critical risk) = 280 days
      expect(highRiskTime).toBe(280);
    });
  });

  describe('Phase 4.2 Error Handling', () => {
    test('should gracefully handle Phase 4.2 assessment errors', async () => {
      // Create encounter with incomplete wound data
      const incompleteEncounterId = `encounter-incomplete-${Date.now()}`;
      
      await storage.createEncounter({
        id: incompleteEncounterId,
        episodeId: testEpisodeId,
        patientId: testPatientId,
        tenantId: testTenantId,
        date: new Date('2025-09-17'),
        type: 'wound_assessment',
        diabeticStatus: 'diabetic',
        notes: ['Minimal wound data available'],
        woundDetails: {} // Empty wound details to trigger error handling
      });

      try {
        const episode = await storage.getEpisode(testEpisodeId);
        const encounters = [await storage.getEncounter(incompleteEncounterId)];
        
        const result = performPreEligibilityChecks(episode, encounters);
        
        // Verify system continues to work despite Phase 4.2 errors
        expect(result).toHaveProperty('overallEligible');
        expect(result).toHaveProperty('auditTrail');
        
        // Verify error is logged in audit trail
        expect(result.auditTrail.some(entry => 
          entry.includes('Phase 4.2 assessment error:')
        )).toBe(true);

      } finally {
        // await storage.deleteEncounter(incompleteEncounterId); // Method not available
      }
    });
  });

  describe('Phase 4.2 Evidence Base Integration', () => {
    test('should reference proper evidence in Phase 4.2 classifications', () => {
      // Test evidence base references in Phase 4.2 functions
      const woundData = {
        skinIntegrity: 'superficial_ulcer' as const,
        woundDepth: 5,
        tissueInvolvement: ['dermis'],
        boneTendonExposure: false,
        jointInvolvement: false,
        necroticTissue: false,
        gangrenePresent: false,
        anatomicalLocation: 'foot'
      };

      const infectionData = {
        infectionPresent: false,
        purulentDrainage: false,
        malodor: false,
        systemicSigns: false,
        abscessPresent: false
      };

      const vascularAssessment = {
        perfusionStatus: 'adequate' as const,
        revascularizationNeeded: false
      };

      const patientContext = {
        diabeticStatus: 'type2' as const,
        diabetesDuration: 10,
        neuropathyPresent: true,
        previousUlceration: false,
        previousAmputation: false,
        immunocompromised: false
      };

      // Direct function calls to verify evidence integration
      const wagnerResult = assessWagnerGrade(woundData, infectionData, vascularAssessment, patientContext);
      const utResult = assessUniversityOfTexasClassification(woundData, infectionData, vascularAssessment, patientContext);

      // Verify evidence base includes all required studies and guidelines
      expect(wagnerResult.evidenceBase.primaryStudies).toContain('WAGNER_GRADE_001');
      expect(wagnerResult.evidenceBase.primaryStudies).toContain('WAGNER_GRADE_002');
      expect(wagnerResult.evidenceBase.clinicalGuidelines).toContain('IWGDF_2023_DIABETIC');
      expect(wagnerResult.evidenceBase.clinicalGuidelines).toContain('ADA_2023_DIABETIC_FOOT');

      expect(utResult.evidenceBase.primaryStudies).toContain('UT_CLASS_001');
      expect(utResult.evidenceBase.primaryStudies).toContain('UT_CLASS_002');
      expect(utResult.evidenceBase.clinicalGuidelines).toContain('IWGDF_2023_DIABETIC');
      expect(utResult.evidenceBase.clinicalGuidelines).toContain('ADA_2023_DIABETIC_FOOT');
    });
  });
});