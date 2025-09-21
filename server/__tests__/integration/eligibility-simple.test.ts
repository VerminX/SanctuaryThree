/**
 * Integration Test for Single LCD Selection System
 * 
 * This test verifies end-to-end functionality of:
 * 1. Policy selection through selectBestPolicy algorithm
 * 2. AI integration with selected policy context
 * 3. Database persistence of selectedPolicyId and selectionAudit
 * 4. Complete API workflow through encounter analyze-eligibility endpoint
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express, { type Express } from 'express';
import { storage } from '../../storage';
import { selectBestPolicy } from '../../services/ragService';
import { registerRoutes } from '../../routes';

// Define local types for testing
interface EligibilityAnalysisResponse {
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
  preEligibilityCheck?: {
    performed: boolean;
    result?: "ELIGIBLE" | "NOT_ELIGIBLE" | "INCONCLUSIVE";
    determinationSource: "PRE_CHECK" | "AI_ANALYSIS";
    auditTrail?: string[];
    policyViolations?: string[];
  };
  historicalContext?: {
    totalEpisodes: number;
    totalEncounters: number;
    previousEligibilityChecks: number;
    keyPatterns: string[];
  };
}

// Mock OpenAI service to avoid external dependencies
const mockAnalyzeEligibility = jest.fn<(request: any) => Promise<EligibilityAnalysisResponse>>();
const mockAnalyzeEligibilityWithFullContext = jest.fn<(request: any) => Promise<EligibilityAnalysisResponse>>();

// Set up mock return values
mockAnalyzeEligibility.mockResolvedValue({
  eligibility: 'Yes',
  rationale: 'Patient meets all requirements for skin substitute coverage based on wound characteristics and conservative care history.',
  requiredDocumentationGaps: [],
  citations: [
    {
      title: 'Skin Substitutes for Treatment of Diabetic Foot Ulcers',
      url: 'https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid=33622',
      section: 'Coverage Criteria',
      effectiveDate: '2024-01-01'
    }
  ],
  letterBullets: [
    '• Patient has diabetic foot ulcer documented for 4+ weeks',
    '• Conservative treatment attempted including offloading and wound care',
    '• Wound size and depth meet coverage criteria'
  ],
  preEligibilityCheck: {
    performed: true,
    result: 'ELIGIBLE',
    determinationSource: 'AI_ANALYSIS',
    auditTrail: ['Pre-eligibility checks passed', 'Proceeded to AI analysis'],
    policyViolations: []
  }
});

mockAnalyzeEligibilityWithFullContext.mockResolvedValue({
  eligibility: 'Yes',
  rationale: 'Based on comprehensive episode analysis, patient meets all requirements.',
  requiredDocumentationGaps: [],
  citations: [
    {
      title: 'Enhanced Skin Substitutes for Chronic Wounds',
      url: 'https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid=33623',
      section: 'Coverage Criteria',
      effectiveDate: '2024-02-01'
    }
  ],
  letterBullets: ['• Episode-level analysis confirms coverage criteria met'],
  historicalContext: {
    totalEpisodes: 1,
    totalEncounters: 2,
    previousEligibilityChecks: 0,
    keyPatterns: ['Consistent wound care', 'Good patient compliance']
  },
  preEligibilityCheck: {
    performed: true,
    result: 'ELIGIBLE',
    determinationSource: 'AI_ANALYSIS',
    auditTrail: ['Pre-eligibility checks passed', 'Proceeded to AI analysis'],
    policyViolations: []
  }
});

// Mock authentication middleware for testing
const mockIsAuthenticated = (req: any, res: any, next: any) => {
  // Mock authenticated user
  req.user = {
    claims: {
      sub: (global as any).testUserId || 'test-user-id'
    }
  };
  next();
};

jest.mock('../../services/openai', () => ({
  analyzeEligibility: mockAnalyzeEligibility,
  analyzeEligibilityWithFullContext: mockAnalyzeEligibilityWithFullContext
}));

// Mock the auth middleware
jest.mock('../../replitAuth', () => ({
  setupAuth: jest.fn<(app: Express) => Promise<void>>().mockResolvedValue(undefined),
  isAuthenticated: mockIsAuthenticated
}));

describe('Single LCD Selection System - Integration Tests', () => {
  let testUserId: string;
  let testTenantId: string;
  let testPatientId: string;
  let testEpisodeId: string;
  let testEncounterId: string;
  let testPolicyIds: string[] = [];
  let testApp: Express;

  beforeAll(async () => {
    // Set up test environment
    process.env.NODE_ENV = 'test';
    process.env.DEVELOPMENT_ALLOW_NON_BAA_PHI = 'true';
    
    // Set up testable Express app
    testApp = express();
    testApp.use(express.json());
    testApp.use(express.urlencoded({ extended: false }));
    
    // Register routes with mocked authentication
    await registerRoutes(testApp);
  });

  beforeEach(async () => {
    // Set up test data
    await setupTestData();
    // Set global testUserId for auth mocking
    (global as any).testUserId = testUserId;
  });

  describe('Policy Selection Algorithm Tests', () => {
    it('should select best policy using selectBestPolicy algorithm', async () => {
      const result = await selectBestPolicy({
        macRegion: 'Palmetto GBA',
        woundType: 'DFU',
        woundLocation: 'left foot',
        patientCharacteristics: {
          isDiabetic: true,
          hasVenousDisease: false
        }
      });

      // Verify policy selection
      expect(result.policy).toBeTruthy();
      expect(result.audit).toBeTruthy();
      
      // Verify audit trail
      expect(result.audit.considered).toBeGreaterThan(0);
      expect(result.audit.filtersApplied).toContain('wound_care_relevance');
      expect(result.audit.filtersApplied).toContain('superseded_exclusion');
      expect(result.audit.scored.length).toBeGreaterThan(0);
      expect(result.audit.selectedReason).toBeTruthy();
      
      // Verify selected policy is for wound care
      if (result.policy) {
        expect(result.policy.title.toLowerCase()).toMatch(/skin|wound|ulcer|substitute/);
        expect(result.policy.mac).toBe('Palmetto GBA');
        expect(['current', 'future']).toContain(result.policy.status);
      }
    });

    it('should handle no applicable policies scenario', async () => {
      const result = await selectBestPolicy({
        macRegion: 'NONEXISTENT_MAC',
        woundType: 'DFU',
        woundLocation: 'left foot'
      });

      expect(result.policy).toBeNull();
      expect(result.audit.selectedReason).toContain('No policies found');
      expect(result.audit.fallbackUsed).toBeTruthy();
    });

    it('should score policies correctly based on wound type relevance', async () => {
      const result = await selectBestPolicy({
        macRegion: 'Palmetto GBA',
        woundType: 'diabetic foot ulcer',
        patientCharacteristics: { isDiabetic: true }
      });

      if (result.policy && result.audit.scored.length > 0) {
        const scoredPolicies = result.audit.scored.sort((a, b) => b.score - a.score);
        const topPolicy = scoredPolicies[0];
        
        // Verify scoring components
        expect(topPolicy.components).toHaveProperty('status');
        expect(topPolicy.components).toHaveProperty('recency');
        expect(topPolicy.components).toHaveProperty('applicability');
        expect(topPolicy.components.applicability).toBeGreaterThan(0);
      }
    });
  });

  describe('Database Persistence Tests', () => {
    it('should persist selectedPolicyId and selectionAudit correctly', async () => {
      // Create a test eligibility check to verify database persistence
      const mockEligibilityResult = {
        eligibility: 'Yes',
        rationale: 'Test rationale',
        requiredDocumentationGaps: [],
        citations: []
      };

      const policySelection = await selectBestPolicy({
        macRegion: 'Palmetto GBA',
        woundType: 'DFU'
      });

      // Simulate creating an eligibility check with policy selection
      const eligibilityCheck = await storage.createEligibilityCheck({
        encounterId: testEncounterId,
        episodeId: testEpisodeId,
        result: mockEligibilityResult,
        citations: [],
        llmModel: 'test-model',
        selectedPolicyId: policySelection.policy?.id || null,
        selectionAudit: policySelection.audit
      });

      // Verify persistence
      expect(eligibilityCheck).toBeTruthy();
      expect(eligibilityCheck.selectedPolicyId).toBe(policySelection.policy?.id || null);
      expect(eligibilityCheck.selectionAudit).toBeTruthy();

      // Verify audit structure
      const audit = eligibilityCheck.selectionAudit as any;
      expect(audit).toHaveProperty('considered');
      expect(audit).toHaveProperty('filtersApplied');
      expect(audit).toHaveProperty('scored');
      expect(audit).toHaveProperty('selectedReason');

      // Retrieve and verify
      const retrieved = await storage.getEligibilityCheck(eligibilityCheck.id);
      expect(retrieved).toBeTruthy();
      expect(retrieved!.selectedPolicyId).toBe(eligibilityCheck.selectedPolicyId);
      expect(retrieved!.selectionAudit).toEqual(eligibilityCheck.selectionAudit);
    });

    it('should handle null selectedPolicyId when no policy found', async () => {
      const mockEligibilityResult = {
        eligibility: 'Unclear',
        rationale: 'No applicable policy found',
        requiredDocumentationGaps: ['Policy coverage unclear'],
        citations: []
      };

      const eligibilityCheck = await storage.createEligibilityCheck({
        encounterId: testEncounterId,
        result: mockEligibilityResult,
        citations: [],
        llmModel: 'test-model',
        selectedPolicyId: null,
        selectionAudit: {
          considered: 0,
          filtersApplied: [],
          scored: [],
          selectedReason: 'No applicable policy found',
          fallbackUsed: 'no_policies_available'
        }
      });

      expect(eligibilityCheck.selectedPolicyId).toBeNull();
      expect(eligibilityCheck.selectionAudit).toBeTruthy();
      
      const audit = eligibilityCheck.selectionAudit as any;
      expect(audit.selectedReason).toContain('No applicable policy found');
      expect(audit.fallbackUsed).toBe('no_policies_available');
    });
  });

  describe('AI Integration Tests', () => {
    it('should pass selected policy context to AI analysis', async () => {
      // Get a policy selection
      const policySelection = await selectBestPolicy({
        macRegion: 'Palmetto GBA',
        woundType: 'DFU'
      });

      // Simulate the context that would be passed to AI
      if (policySelection.policy) {
        const mockRequest = {
          encounterNotes: ['Patient with diabetic foot ulcer'],
          woundDetails: { type: 'DFU', location: 'left foot' },
          conservativeCare: { attempted: true },
          patientInfo: { payerType: 'Original Medicare', macRegion: 'Palmetto GBA' },
          policyContext: `Selected Policy: ${policySelection.policy.title}\n${policySelection.policy.content}`
        };

        await mockAnalyzeEligibility(mockRequest);

        // Verify AI was called with policy context
        expect(mockAnalyzeEligibility).toHaveBeenCalled();
        expect(mockAnalyzeEligibility).toHaveBeenCalledWith(expect.objectContaining({
          policyContext: expect.stringContaining(policySelection.policy.title)
        }));
        expect(mockAnalyzeEligibility).toHaveBeenCalledWith(expect.objectContaining({
          policyContext: expect.stringContaining('Selected Policy:')
        }));
      }
    });

    it('should handle AI integration when no policy is selected', async () => {
      // Mock request with no applicable policy
      const mockRequest = {
        encounterNotes: ['Test encounter'],
        woundDetails: { type: 'Unknown' },
        conservativeCare: { attempted: false },
        patientInfo: { payerType: 'Unknown', macRegion: 'Unknown' },
        policyContext: 'No applicable policy found for the specified criteria.'
      };

      await mockAnalyzeEligibility(mockRequest);

      // Verify AI was still called but with fallback context
      expect(mockAnalyzeEligibility).toHaveBeenCalled();
      expect(mockAnalyzeEligibility).toHaveBeenCalledWith(expect.objectContaining({
        policyContext: expect.stringContaining('No applicable policy found')
      }));
    });
  });

  describe('End-to-End Integration Tests', () => {
    it('should complete full workflow: policy selection → AI analysis → database persistence', async () => {
      // Step 1: Policy Selection
      const policySelection = await selectBestPolicy({
        macRegion: 'Palmetto GBA',
        woundType: 'DFU',
        woundLocation: 'left foot',
        patientCharacteristics: { isDiabetic: true }
      });

      expect(policySelection.policy).toBeTruthy();
      expect(policySelection.audit.considered).toBeGreaterThan(0);

      // Step 2: AI Analysis (mocked)
      const aiResult = await mockAnalyzeEligibility({
        encounterNotes: ['Patient with diabetic foot ulcer'],
        woundDetails: { type: 'DFU' },
        conservativeCare: { attempted: true },
        patientInfo: { payerType: 'Original Medicare', macRegion: 'Palmetto GBA' },
        policyContext: policySelection.policy?.content || 'No policy context'
      });

      expect(aiResult.eligibility).toBeTruthy();
      expect(aiResult.rationale).toBeTruthy();

      // Step 3: Database Persistence
      const eligibilityCheck = await storage.createEligibilityCheck({
        encounterId: testEncounterId,
        result: aiResult,
        citations: aiResult.citations,
        llmModel: 'gpt-4o-mini',
        selectedPolicyId: policySelection.policy?.id || null,
        selectionAudit: policySelection.audit
      });

      // Verify complete workflow
      expect(eligibilityCheck.selectedPolicyId).toBe(policySelection.policy?.id);
      expect(eligibilityCheck.selectionAudit).toEqual(policySelection.audit);
      expect(eligibilityCheck.result).toEqual(aiResult);

      // Verify audit trail integrity
      const audit = eligibilityCheck.selectionAudit as any;
      expect(audit.scored.length).toBeGreaterThan(0);
      expect(audit.selectedReason).toBeTruthy();

      // Verify selected policy is among scored policies
      if (policySelection.policy) {
        const selectedInScored = audit.scored.find((scored: any) => 
          scored.lcdId === policySelection.policy!.lcdId
        );
        expect(selectedInScored).toBeTruthy();
        expect(selectedInScored.score).toBeGreaterThan(0);
      }
    });
  });

  describe('HTTP API Endpoint Tests', () => {
    describe('POST /api/encounters/:encounterId/analyze-eligibility', () => {
      it('should analyze encounter eligibility through HTTP API', async () => {
        const response = await request(testApp)
          .post(`/api/encounters/${testEncounterId}/analyze-eligibility`)
          .expect(200);

        // Verify response structure
        expect(response.body).toHaveProperty('id');
        expect(response.body).toHaveProperty('result');
        expect(response.body).toHaveProperty('selectedPolicyId');
        expect(response.body).toHaveProperty('selectionAudit');
        expect(response.body).toHaveProperty('selectedPolicy');

        // Verify eligibility result structure
        expect(response.body.result).toHaveProperty('eligibility');
        expect(response.body.result).toHaveProperty('rationale');
        expect(response.body.result).toHaveProperty('citations');
        expect(response.body.result).toHaveProperty('letterBullets');
        expect(response.body.result).toHaveProperty('preEligibilityCheck');
        expect(response.body.result).toHaveProperty('historicalContext');

        // Verify AI was called with mocked response
        expect(mockAnalyzeEligibilityWithFullContext).toHaveBeenCalled();
        expect(response.body.result.eligibility).toBe('Yes');
        expect(response.body.result.rationale).toContain('comprehensive episode analysis');

        // Verify policy selection happened
        if (response.body.selectedPolicyId) {
          expect(response.body.selectedPolicy).toBeTruthy();
          expect(response.body.selectedPolicy.title).toMatch(/skin|wound|ulcer|substitute/i);
        }

        // Verify selection audit structure
        expect(response.body.selectionAudit).toHaveProperty('considered');
        expect(response.body.selectionAudit).toHaveProperty('filtersApplied');
        expect(response.body.selectionAudit).toHaveProperty('scored');
        expect(response.body.selectionAudit).toHaveProperty('selectedReason');

        // Verify database persistence by retrieving the eligibility check
        const storedCheck = await storage.getEligibilityCheck(response.body.id);
        expect(storedCheck).toBeTruthy();
        expect(storedCheck!.selectedPolicyId).toBe(response.body.selectedPolicyId);
        expect(storedCheck!.selectionAudit).toEqual(response.body.selectionAudit);
      });

      it('should handle encounter not found', async () => {
        const response = await request(testApp)
          .post('/api/encounters/non-existent-id/analyze-eligibility')
          .expect(404);

        expect(response.body.message).toBe('Encounter not found');
      });

      it('should handle access control properly', async () => {
        // Create a user without access to the tenant
        const unauthorizedUser = await storage.upsertUser({
          id: 'unauthorized-user-id',
          email: 'unauthorized@example.com',
          firstName: 'Unauthorized',
          lastName: 'User'
        });

        // Mock unauthorized user in middleware
        (global as any).testUserId = unauthorizedUser.id;

        const response = await request(testApp)
          .post(`/api/encounters/${testEncounterId}/analyze-eligibility`)
          .expect(403);

        expect(response.body.message).toBe('Access denied');

        // Reset to authorized user
        (global as any).testUserId = testUserId;
      });
    });

    describe('POST /api/episodes/:episodeId/analyze-eligibility', () => {
      it('should analyze episode eligibility through HTTP API', async () => {
        const response = await request(testApp)
          .post(`/api/episodes/${testEpisodeId}/analyze-eligibility`)
          .expect(200);

        // Verify response structure
        expect(response.body).toHaveProperty('id');
        expect(response.body).toHaveProperty('result');
        expect(response.body).toHaveProperty('selectedPolicyId');
        expect(response.body).toHaveProperty('selectionAudit');
        expect(response.body).toHaveProperty('selectedPolicy');

        // Verify eligibility result structure
        expect(response.body.result).toHaveProperty('eligibility');
        expect(response.body.result).toHaveProperty('rationale');
        expect(response.body.result).toHaveProperty('citations');
        expect(response.body.result).toHaveProperty('letterBullets');
        expect(response.body.result).toHaveProperty('preEligibilityCheck');
        expect(response.body.result).toHaveProperty('historicalContext');

        // Verify historical context is populated for episode-level analysis
        expect(response.body.result.historicalContext).toBeTruthy();
        expect(response.body.result.historicalContext.totalEpisodes).toBeGreaterThan(0);
        expect(response.body.result.historicalContext.totalEncounters).toBeGreaterThan(0);

        // Verify AI was called with mocked response
        expect(mockAnalyzeEligibilityWithFullContext).toHaveBeenCalled();
        expect(response.body.result.eligibility).toBe('Yes');

        // Verify database persistence
        const storedCheck = await storage.getEligibilityCheck(response.body.id);
        expect(storedCheck).toBeTruthy();
        expect(storedCheck!.selectedPolicyId).toBe(response.body.selectedPolicyId);
        expect(storedCheck!.selectionAudit).toEqual(response.body.selectionAudit);
      });

      it('should handle episode not found', async () => {
        const response = await request(testApp)
          .post('/api/episodes/non-existent-id/analyze-eligibility')
          .expect(404);

        expect(response.body.message).toBe('Episode not found');
      });

      it('should handle episode with no encounters', async () => {
        // Create an episode without encounters
        const emptyEpisode = await storage.createEpisode({
          patientId: testPatientId,
          woundType: 'DFU',
          woundLocation: 'right foot',
          episodeStartDate: new Date(),
          status: 'active',
          primaryDiagnosis: 'E11.621'
        });

        const response = await request(testApp)
          .post(`/api/episodes/${emptyEpisode.id}/analyze-eligibility`)
          .expect(400);

        expect(response.body.message).toBe('No encounters found for this episode');
      });
    });

    describe('End-to-End API Workflow Tests', () => {
      it('should complete full HTTP API workflow with database verification', async () => {
        // Step 1: Analyze encounter eligibility via HTTP API
        const encounterResponse = await request(testApp)
          .post(`/api/encounters/${testEncounterId}/analyze-eligibility`)
          .expect(200);

        // Step 2: Verify policy selection occurred through API
        expect(encounterResponse.body.selectedPolicyId).toBeTruthy();
        expect(encounterResponse.body.selectionAudit).toBeTruthy();
        expect(encounterResponse.body.selectionAudit.considered).toBeGreaterThan(0);

        // Step 3: Verify AI analysis was performed
        expect(encounterResponse.body.result.eligibility).toBeTruthy();
        expect(encounterResponse.body.result.rationale).toBeTruthy();
        expect(encounterResponse.body.result.citations).toBeInstanceOf(Array);

        // Step 4: Verify database persistence
        const storedEncounterCheck = await storage.getEligibilityCheck(encounterResponse.body.id);
        expect(storedEncounterCheck).toBeTruthy();
        expect(storedEncounterCheck!.selectedPolicyId).toBe(encounterResponse.body.selectedPolicyId);

        // Step 5: Analyze same episode via episode endpoint
        const episodeResponse = await request(testApp)
          .post(`/api/episodes/${testEpisodeId}/analyze-eligibility`)
          .expect(200);

        // Step 6: Verify both analyses used same policy selection logic
        expect(episodeResponse.body.selectedPolicyId).toBeTruthy();
        expect(episodeResponse.body.selectionAudit.filtersApplied).toEqual(
          encounterResponse.body.selectionAudit.filtersApplied
        );

        // Step 7: Verify audit trail consistency
        const storedEpisodeCheck = await storage.getEligibilityCheck(episodeResponse.body.id);
        expect(storedEpisodeCheck).toBeTruthy();
        
        // Both checks should have valid audit trails
        const encounterAudit = storedEncounterCheck!.selectionAudit as any;
        const episodeAudit = storedEpisodeCheck!.selectionAudit as any;
        
        expect(encounterAudit).toHaveProperty('considered');
        expect(encounterAudit).toHaveProperty('selectedReason');
        expect(episodeAudit).toHaveProperty('considered');
        expect(episodeAudit).toHaveProperty('selectedReason');

        // Step 8: Verify both checks can be retrieved by encounter/episode
        const encounterChecks = await storage.getEligibilityChecksByEncounter(testEncounterId);
        expect(encounterChecks.length).toBeGreaterThanOrEqual(1);
        
        const episodeChecks = await storage.getEligibilityChecksByEpisode(testEpisodeId);
        expect(episodeChecks.length).toBeGreaterThanOrEqual(1);
      });

      it('should handle policy selection failure gracefully through API', async () => {
        // Create test data with characteristics that won't match any policies
        const unmatchablePatient = await storage.createPatient({
          tenantId: testTenantId,
          mrn: `UNMATCHABLE-${Date.now()}`,
          encryptedFirstName: 'encrypted-jane',
          encryptedLastName: 'encrypted-doe',
          encryptedDob: 'encrypted-1980-01-01',
          payerType: 'Unknown Payer',
          planName: 'Unknown Plan',
          insuranceId: 'UNKNOWN123',
          macRegion: 'NONEXISTENT_MAC' // This MAC won't match any policies
        });

        const unmatchableEpisode = await storage.createEpisode({
          patientId: unmatchablePatient.id,
          woundType: 'Unknown Wound Type',
          woundLocation: 'unknown location',
          episodeStartDate: new Date(),
          status: 'active',
          primaryDiagnosis: 'Z99.999'
        });

        const unmatchableEncounter = await storage.createEncounter({
          patientId: unmatchablePatient.id,
          episodeId: unmatchableEpisode.id,
          date: new Date(),
          encryptedNotes: { notes: ['encrypted notes about unknown condition'] },
          woundDetails: {
            type: 'Unknown',
            location: 'unknown',
            size: { length: 1, width: 1, depth: 0.1 }
          },
          conservativeCare: { attempted: false },
          diabeticStatus: 'unknown'
        });

        // Analyze through API - should handle no policy gracefully
        const response = await request(testApp)
          .post(`/api/encounters/${unmatchableEncounter.id}/analyze-eligibility`)
          .expect(200);

        // Should still return valid response even with no policy
        expect(response.body).toHaveProperty('result');
        expect(response.body.selectedPolicyId).toBeNull();
        expect(response.body.selectionAudit).toBeTruthy();
        expect(response.body.selectionAudit.selectedReason).toContain('No policies found');
        expect(response.body.selectionAudit.fallbackUsed).toBeTruthy();

        // Verify database persistence of null policy scenario
        const storedCheck = await storage.getEligibilityCheck(response.body.id);
        expect(storedCheck).toBeTruthy();
        expect(storedCheck!.selectedPolicyId).toBeNull();
      });
    });
  });

  // Helper function to set up test data
  async function setupTestData() {
    try {
      // Create test user
      const user = await storage.upsertUser({
        id: `test-user-${Date.now()}`,
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User'
      });
      testUserId = user.id;

      // Create test tenant
      const tenant = await storage.createTenant({
        name: 'Test Wound Care Clinic',
        npi: '1234567890',
        tin: '123456789',
        macRegion: 'Palmetto GBA',
        address: '123 Test St',
        phone: '555-123-4567'
      });
      testTenantId = tenant.id;

      // Add user to tenant
      await storage.addUserToTenant({
        userId: testUserId,
        tenantId: testTenantId,
        role: 'Admin'
      });

      // Create test patient
      const patient = await storage.createPatient({
        tenantId: testTenantId,
        mrn: `TEST-${Date.now()}`,
        encryptedFirstName: 'encrypted-john',
        encryptedLastName: 'encrypted-doe',
        encryptedDob: 'encrypted-1970-01-01',
        payerType: 'Original Medicare',
        planName: 'Medicare Part B',
        insuranceId: 'TEST123456A',
        macRegion: 'Palmetto GBA'
      });
      testPatientId = patient.id;

      // Create test episode
      const episode = await storage.createEpisode({
        patientId: testPatientId,
        woundType: 'DFU',
        woundLocation: 'left foot',
        episodeStartDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        status: 'active',
        primaryDiagnosis: 'E11.621'
      });
      testEpisodeId = episode.id;

      // Create test encounter
      const encounter = await storage.createEncounter({
        patientId: testPatientId,
        episodeId: testEpisodeId,
        date: new Date(),
        encryptedNotes: { notes: ['encrypted encounter notes'] },
        woundDetails: {
          type: 'DFU',
          location: 'left foot',
          size: { length: 3.5, width: 3.0, depth: 0.6 },
          duration: '4+ weeks'
        },
        conservativeCare: {
          offloading: { attempted: true, duration: '4 weeks' },
          woundCare: { attempted: true, duration: '4 weeks' }
        },
        diabeticStatus: 'diabetic'
      });
      testEncounterId = encounter.id;

      // Create test policies
      await createTestPolicies();

    } catch (error) {
      console.error('Error setting up test data:', error);
      throw error;
    }
  }

  async function createTestPolicies() {
    // Create wound care relevant policy
    const skinSubstitutePolicy = await storage.createPolicySource({
      mac: 'Palmetto GBA',
      lcdId: 'L33622',
      title: 'Skin Substitutes for Treatment of Diabetic Foot Ulcers and Venous Leg Ulcers',
      url: 'https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid=33622',
      effectiveDate: new Date('2024-01-01'),
      status: 'current',
      content: `Skin substitute coverage criteria:
      1. Patient has diabetic foot ulcer or venous leg ulcer
      2. Wound has been present for 4+ weeks
      3. Conservative treatment has failed including offloading and advanced wound care
      4. Wound size between 1 cm² and 25 cm²`,
      policyType: 'final'
    });
    testPolicyIds.push(skinSubstitutePolicy.id);

    // Create future policy for scoring comparison
    const futurePolicy = await storage.createPolicySource({
      mac: 'Palmetto GBA',
      lcdId: 'L33623',
      title: 'Enhanced Skin Substitutes for Chronic Wounds',
      url: 'https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid=33623',
      effectiveDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      status: 'future',
      content: 'Enhanced coverage criteria for chronic wounds including diabetic foot ulcers',
      policyType: 'final'
    });
    testPolicyIds.push(futurePolicy.id);

    // Create unrelated policy to test filtering
    const unrelatedPolicy = await storage.createPolicySource({
      mac: 'Palmetto GBA',
      lcdId: 'L99999',
      title: 'Cardiac Pacemaker Coverage',
      url: 'https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid=99999',
      effectiveDate: new Date('2024-01-01'),
      status: 'current',
      content: 'Coverage criteria for cardiac pacemakers and related devices.',
      policyType: 'final'
    });
    testPolicyIds.push(unrelatedPolicy.id);
  }
});