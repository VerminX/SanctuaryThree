/**
 * Comprehensive unit tests for selectBestPolicy function
 * Tests policy selection logic with various scenarios
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import type { PolicySource } from '../../../shared/schema';

// Mock the storage module
jest.mock('../../storage', () => ({
  storage: {
    getCurrentAndFuturePoliciesByMAC: jest.fn()
  }
}));

// Import after mocking
import { selectBestPolicy } from '../ragService';
import { storage } from '../../storage';
import { healthMonitor } from '../healthMonitoring';

// Type the mock after import
const mockStorage = storage as jest.Mocked<typeof storage>;

// Test data - comprehensive policy scenarios
const LONG_POLICY_CONTENT = 'This LCD section contains detailed coverage criteria, coding requirements, and Medicare references for clinical services. ';

const createMockPolicy = (overrides: Partial<PolicySource> = {}): PolicySource => {
  const baseContent = overrides.content ?? 'Default policy content';
  const shouldPreserveLength = typeof overrides.content === 'string'
    && overrides.content.length < 1000
    && overrides.content.toLowerCase().includes('short');
  const normalizedContent = shouldPreserveLength
    ? baseContent
    : `${baseContent} ${LONG_POLICY_CONTENT.repeat(20)}`;

  return {
    id: `policy-${Math.random().toString(36).substr(2, 9)}`,
    lcdId: `LCD${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
    title: 'Default Policy Title',
    mac: 'J',
    effectiveDate: new Date('2024-01-01'),
    effectiveThrough: null,
    postponedDate: null,
    proposedDate: null,
    supersededBy: null,
    versionNumber: null,
    sourceHash: null,
    lastVerified: null,
    changeHistory: null,
    policyType: 'final',
    status: 'current',
    url: 'https://example.com/policy',
    embeddedVector: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
    content: normalizedContent
  };
};

describe('selectBestPolicy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock current date to September 20, 2025
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-09-20'));
    healthMonitor.resetEligibilityTelemetry();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Wound Type Scenarios', () => {
    test('should select DFU-specific policy for diabetic foot ulcer', async () => {
      const policies: PolicySource[] = [
        createMockPolicy({
          lcdId: 'LCD001',
          title: 'Skin Substitutes for Diabetic Foot Ulcers',
          content: 'Coverage for diabetic foot ulcer treatment with cellular tissue products',
          status: 'current',
          effectiveDate: new Date('2024-06-01')
        }),
        createMockPolicy({
          lcdId: 'LCD002', 
          title: 'General Wound Care',
          content: 'General wound care coverage policies',
          status: 'current',
          effectiveDate: new Date('2024-05-01')
        })
      ];

      mockStorage.getCurrentAndFuturePoliciesByMAC.mockResolvedValue(policies);

      const result = await selectBestPolicy({
        macRegion: 'J',
        woundType: 'diabetic foot ulcer',
        patientCharacteristics: { isDiabetic: true }
      });

      expect(result.policy).toBeTruthy();
      expect(result.policy?.lcdId).toBe('LCD001');
      expect(result.audit.selectedReason).toContain('highest scoring policy');
      expect(result.audit.filtersApplied).toContain('wound_care_relevance');
    });

    test('should select VLU-specific policy for venous leg ulcer', async () => {
      const policies: PolicySource[] = [
        createMockPolicy({
          lcdId: 'LCD003',
          title: 'Venous Leg Ulcer Treatment',
          content: 'Coverage for venous ulcer treatment and cellular matrix products',
          status: 'current',
          effectiveDate: new Date('2024-07-01')
        }),
        createMockPolicy({
          lcdId: 'LCD004',
          title: 'General Skin Substitute Coverage', 
          content: 'General coverage for skin substitutes',
          status: 'current',
          effectiveDate: new Date('2024-06-01')
        })
      ];

      mockStorage.getCurrentAndFuturePoliciesByMAC.mockResolvedValue(policies);

      const result = await selectBestPolicy({
        macRegion: 'J',
        woundType: 'venous leg ulcer',
        woundLocation: 'lower leg',
        patientCharacteristics: { hasVenousDisease: true }
      });

      expect(result.policy).toBeTruthy();
      expect(result.policy?.lcdId).toBe('LCD003');
      expect(result.audit.scored.length).toBe(2);
    });

    test('should handle generic wound type when specific policy not available', async () => {
      const policies: PolicySource[] = [
        createMockPolicy({
          lcdId: 'LCD005',
          title: 'Cellular Tissue Products for Wounds',
          content: 'General wound coverage including ulcers and tissue repair',
          status: 'current',
          effectiveDate: new Date('2024-08-01')
        })
      ];

      mockStorage.getCurrentAndFuturePoliciesByMAC.mockResolvedValue(policies);

      const result = await selectBestPolicy({
        macRegion: 'J',
        woundType: 'pressure ulcer'
      });

      expect(result.policy).toBeTruthy();
      expect(result.policy?.lcdId).toBe('LCD005');
    });
  });

  describe('Policy Status Scenarios', () => {
    test('should select more recent policy when two current policies are equally relevant', async () => {
      const policies: PolicySource[] = [
        createMockPolicy({
          lcdId: 'LCD_OLDER',
          title: 'Diabetic Foot Ulcer Treatment',
          content: 'Coverage for diabetic foot ulcer treatment with cellular tissue products',
          status: 'current',
          effectiveDate: new Date('2025-07-20') // 60 days before test date (Sept 20, 2025)
        }),
        createMockPolicy({
          lcdId: 'LCD_NEWER',
          title: 'Diabetic Foot Ulcer Coverage',
          content: 'Coverage for diabetic foot ulcer treatment with cellular tissue products',
          status: 'current',
          effectiveDate: new Date('2025-08-20') // 30 days before test date, more recent than older policy
        })
      ];

      mockStorage.getCurrentAndFuturePoliciesByMAC.mockResolvedValue(policies);

      const result = await selectBestPolicy({
        macRegion: 'J',
        woundType: 'diabetic foot ulcer'
      });

      // More recent policy should be selected
      expect(result.policy?.lcdId).toBe('LCD_NEWER');
      expect(result.audit.selectedReason).toContain('highest scoring policy');
      
      // Verify recency scoring components
      const newerPolicyScore = result.audit.scored.find(s => s.lcdId === 'LCD_NEWER');
      const olderPolicyScore = result.audit.scored.find(s => s.lcdId === 'LCD_OLDER');
      
      expect(newerPolicyScore).toBeTruthy();
      expect(olderPolicyScore).toBeTruthy();
      
      // More recent policy should have higher recency score
      expect(newerPolicyScore!.components.recency).toBeGreaterThan(olderPolicyScore!.components.recency);
      
      // Both should have same status and applicability scores since they're equally relevant
      expect(newerPolicyScore!.components.status).toBe(olderPolicyScore!.components.status);
      expect(newerPolicyScore!.components.applicability).toBe(olderPolicyScore!.components.applicability);
      
      // Overall score should be higher for more recent policy due to recency component
      expect(newerPolicyScore!.score).toBeGreaterThan(olderPolicyScore!.score);
      
      // Audit trail should reflect recency-based decision
      expect(result.audit.filtersApplied).toContain('wound_care_relevance');
      expect(result.audit.scored).toHaveLength(2);
    });

    test('should prioritize current policies over future and proposed', async () => {
      const policies: PolicySource[] = [
        createMockPolicy({
          lcdId: 'LCD006',
          title: 'Diabetic Foot Ulcer Treatment',
          content: 'Coverage for diabetic foot ulcer cellular products',
          status: 'proposed',
          effectiveDate: new Date('2025-12-01')
        }),
        createMockPolicy({
          lcdId: 'LCD007',
          title: 'Diabetic Foot Ulcer Coverage',
          content: 'Current coverage for diabetic foot ulcer treatment',
          status: 'current',
          effectiveDate: new Date('2024-01-01')
        }),
        createMockPolicy({
          lcdId: 'LCD008',
          title: 'Future Diabetic Foot Policy',
          content: 'Future diabetic foot ulcer coverage policy',
          status: 'future',
          effectiveDate: new Date('2025-10-15')
        })
      ];

      mockStorage.getCurrentAndFuturePoliciesByMAC.mockResolvedValue(policies);

      const result = await selectBestPolicy({
        macRegion: 'J',
        woundType: 'diabetic foot ulcer'
      });

      expect(result.policy?.lcdId).toBe('LCD007'); // Current policy selected
      expect(result.audit.scored.find(s => s.lcdId === 'LCD007')?.components.status).toBe(100);
      expect(result.audit.scored.find(s => s.lcdId === 'LCD008')?.components.status).toBe(60);
      expect(result.audit.scored.find(s => s.lcdId === 'LCD006')?.components.status).toBe(20);
    });

    test('should select future policy within 90 days when no current available', async () => {
      const policies: PolicySource[] = [
        createMockPolicy({
          lcdId: 'LCD009',
          title: 'Future Wound Care Policy',
          content: 'Future wound care coverage for diabetic ulcers',
          status: 'future',
          effectiveDate: new Date('2025-10-15') // 25 days from test date
        }),
        createMockPolicy({
          lcdId: 'LCD010',
          title: 'Proposed Wound Policy',
          content: 'Proposed wound care coverage',
          status: 'proposed',
          effectiveDate: new Date('2026-01-01')
        })
      ];

      mockStorage.getCurrentAndFuturePoliciesByMAC.mockResolvedValue(policies);

      const result = await selectBestPolicy({
        macRegion: 'J',
        woundType: 'wound'
      });

      expect(result.policy?.lcdId).toBe('LCD009'); // Future policy within 90 days
    });
  });

  describe('Superseded Policy Handling', () => {
    test('should exclude superseded policies from selection', async () => {
      const policies: PolicySource[] = [
        createMockPolicy({
          lcdId: 'LCD015',
          title: 'Old Diabetic Policy',
          content: 'Old diabetic foot ulcer coverage',
          status: 'current',
          effectiveDate: new Date('2023-01-01'),
          supersededBy: 'LCD016'
        }),
        createMockPolicy({
          lcdId: 'LCD016',
          title: 'New Diabetic Policy',
          content: 'New diabetic foot ulcer coverage',
          status: 'current',
          effectiveDate: new Date('2024-01-01'),
          supersededBy: null
        })
      ];

      mockStorage.getCurrentAndFuturePoliciesByMAC.mockResolvedValue(policies);

      const result = await selectBestPolicy({
        macRegion: 'J',
        woundType: 'diabetic foot ulcer'
      });

      expect(result.policy?.lcdId).toBe('LCD016'); // Non-superseded policy
      expect(result.audit.filtersApplied).toContain('superseded_exclusion');
      expect(result.audit.scored).toHaveLength(1); // Only non-superseded policy scored
    });

    test('should handle case with only superseded policies available', async () => {
      const policies: PolicySource[] = [
        createMockPolicy({
          lcdId: 'LCD017',
          title: 'Superseded Wound Policy',
          content: 'Old wound care coverage',
          status: 'current',
          effectiveDate: new Date('2023-01-01'),
          supersededBy: 'LCD999'
        })
      ];

      mockStorage.getCurrentAndFuturePoliciesByMAC.mockResolvedValue(policies);

      const result = await selectBestPolicy({
        macRegion: 'J',
        woundType: 'wound'
      });

      expect(result.policy).toBeNull();
      expect(result.audit.fallbackUsed).toBe('no_policies_available');
    });
  });

  describe('Fallback Scenarios', () => {
    test('should return null when no policies found for MAC region', async () => {
      mockStorage.getCurrentAndFuturePoliciesByMAC.mockResolvedValue([]);

      const result = await selectBestPolicy({
        macRegion: 'X',
        woundType: 'diabetic foot ulcer'
      });

      expect(result.policy).toBeNull();
      expect(result.audit.selectedReason).toContain('No policies found for MAC region: X');
      expect(result.audit.fallbackUsed).toBe('no_policies_available');
      expect(result.audit.considered).toBe(0);
    });

    test('should record telemetry metrics when fallback path is used', async () => {
      mockStorage.getCurrentAndFuturePoliciesByMAC.mockResolvedValue([]);

      const result = await selectBestPolicy({
        macRegion: 'Palmetto GBA',
        woundType: 'dfu'
      });

      expect(result.audit.fallbackUsed).toBe('no_policies_available');

      const eligibilityMetrics = healthMonitor.getHealthStatus().eligibility;
      expect(eligibilityMetrics.policyFallbacks.total).toBe(1);
      expect(Object.values(eligibilityMetrics.policyFallbacks.byType).reduce((sum, value) => sum + value, 0)).toBe(1);
      expect(eligibilityMetrics.policyFallbacks.recentTimestamps.length).toBe(1);
      expect(
        Object.values(eligibilityMetrics.policyFallbacks.depthHistogram).reduce((sum, value) => sum + value, 0)
      ).toBe(1);

      const summary = healthMonitor.getEligibilityTelemetrySummary();
      expect(summary.policyFallbacks.total).toBe(1);
      expect(summary.policyFallbacks.lastHour).toBe(1);
    });

    test('should return null when no wound-care relevant policies found', async () => {
      const policies: PolicySource[] = [
        createMockPolicy({
          lcdId: 'LCD018',
          title: 'Cardiac Procedures',
          content: 'Coverage for cardiac interventions',
          status: 'current',
          effectiveDate: new Date('2024-01-01')
        })
      ];

      mockStorage.getCurrentAndFuturePoliciesByMAC.mockResolvedValue(policies);

      const result = await selectBestPolicy({
        macRegion: 'J',
        woundType: 'diabetic foot ulcer'
      });

      expect(result.policy).toBeNull();
      expect(result.audit.fallbackUsed).toBe('no_policies_available');
    });

    test('should select current wound-care policy for specific wound type with direct match', async () => {
      const policies: PolicySource[] = [
        createMockPolicy({
          lcdId: 'LCD019',
          title: 'General Wound Coverage',
          content: 'Basic wound care coverage for all types of ulcers and wounds',
          status: 'current',
          effectiveDate: new Date('2024-01-01')
        })
      ];

      mockStorage.getCurrentAndFuturePoliciesByMAC.mockResolvedValue(policies);

      const result = await selectBestPolicy({
        macRegion: 'J',
        woundType: 'rare genetic ulcer' // Specific type that should still match due to wound/ulcer keywords
      });

      expect(result.policy?.lcdId).toBe('LCD019');
      // Algorithm correctly finds direct match rather than using fallback
      expect(result.audit.fallbackUsed).toBeUndefined();
      expect(result.audit.selectedReason).toContain('highest scoring policy');
      expect(result.audit.scored).toHaveLength(1);
      expect(result.audit.scored[0].score).toBeGreaterThan(0);
    });
  });

  describe('Patient Characteristics', () => {
    test('should boost score for diabetic patients with diabetic-specific policies', async () => {
      const policies: PolicySource[] = [
        createMockPolicy({
          lcdId: 'LCD024',
          title: 'Diabetic Foot Ulcer Specialized Care',
          content: 'Specialized coverage for diabetic patients with foot ulcers',
          status: 'current',
          effectiveDate: new Date('2024-01-01')
        }),
        createMockPolicy({
          lcdId: 'LCD025',
          title: 'General Ulcer Care',
          content: 'General ulcer care coverage',
          status: 'current',
          effectiveDate: new Date('2024-01-01')
        })
      ];

      mockStorage.getCurrentAndFuturePoliciesByMAC.mockResolvedValue(policies);

      const result = await selectBestPolicy({
        macRegion: 'J',
        woundType: 'foot ulcer',
        patientCharacteristics: { isDiabetic: true }
      });

      expect(result.policy?.lcdId).toBe('LCD024'); // Diabetic-specific policy
      
      const diabeticPolicyScore = result.audit.scored.find(s => s.lcdId === 'LCD024');
      const generalPolicyScore = result.audit.scored.find(s => s.lcdId === 'LCD025');
      
      expect(diabeticPolicyScore?.components.applicability).toBeGreaterThan(
        generalPolicyScore?.components.applicability || 0
      );
    });

    test('should boost score for venous disease patients with venous-specific policies', async () => {
      const policies: PolicySource[] = [
        createMockPolicy({
          lcdId: 'LCD026',
          title: 'Venous Ulcer Treatment Coverage',
          content: 'Specialized coverage for patients with venous disease and ulcers',
          status: 'current',
          effectiveDate: new Date('2024-01-01')
        }),
        createMockPolicy({
          lcdId: 'LCD027',
          title: 'General Wound Treatment',
          content: 'General wound treatment coverage',
          status: 'current',
          effectiveDate: new Date('2024-01-01')
        })
      ];

      mockStorage.getCurrentAndFuturePoliciesByMAC.mockResolvedValue(policies);

      const result = await selectBestPolicy({
        macRegion: 'J',
        woundType: 'leg ulcer',
        patientCharacteristics: { hasVenousDisease: true }
      });

      expect(result.policy?.lcdId).toBe('LCD026'); // Venous-specific policy
    });
  });

  describe('Audit Trail Verification', () => {
    test('should track all policies considered in audit', async () => {
      const policies: PolicySource[] = [
        createMockPolicy({ lcdId: 'LCD030', content: 'wound care coverage' }),
        createMockPolicy({ lcdId: 'LCD031', content: 'wound treatment policies' }),
        createMockPolicy({ lcdId: 'LCD032', content: 'ulcer care coverage' })
      ];

      mockStorage.getCurrentAndFuturePoliciesByMAC.mockResolvedValue(policies);

      const result = await selectBestPolicy({
        macRegion: 'J',
        woundType: 'wound'
      });

      expect(result.audit.considered).toBe(3);
      expect(result.audit.filtersApplied).toContain('wound_care_relevance');
      expect(result.audit.filtersApplied).toContain('superseded_exclusion');
    });

    test('should record score components for each policy', async () => {
      const policies: PolicySource[] = [
        createMockPolicy({
          lcdId: 'LCD033',
          title: 'Diabetic Foot Treatment',
          content: 'Diabetic foot coverage',
          status: 'current',
          effectiveDate: new Date('2024-06-01')
        })
      ];

      mockStorage.getCurrentAndFuturePoliciesByMAC.mockResolvedValue(policies);

      const result = await selectBestPolicy({
        macRegion: 'J',
        woundType: 'diabetic foot ulcer',
        patientCharacteristics: { isDiabetic: true }
      });

      expect(result.audit.scored).toHaveLength(1);
      const scoreDetails = result.audit.scored[0];
      
      expect(scoreDetails.lcdId).toBe('LCD033');
      expect(scoreDetails.components).toHaveProperty('status');
      expect(scoreDetails.components).toHaveProperty('recency');
      expect(scoreDetails.components).toHaveProperty('applicability');
      expect(scoreDetails.components).toHaveProperty('superseded');
      expect(scoreDetails.score).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle storage errors gracefully', async () => {
      mockStorage.getCurrentAndFuturePoliciesByMAC.mockRejectedValue(
        new Error('Database connection failed')
      );

      const result = await selectBestPolicy({
        macRegion: 'J',
        woundType: 'diabetic foot ulcer'
      });

      expect(result.policy).toBeNull();
      expect(result.audit.selectedReason).toContain('Error during policy selection');
      expect(result.audit.fallbackUsed).toBe('error_occurred');
      expect(result.audit.considered).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty wound type', async () => {
      const policies: PolicySource[] = [
        createMockPolicy({
          lcdId: 'LCD036',
          title: 'Wound Care Coverage',
          content: 'General wound care',
          status: 'current'
        })
      ];

      mockStorage.getCurrentAndFuturePoliciesByMAC.mockResolvedValue(policies);

      const result = await selectBestPolicy({
        macRegion: 'J',
        woundType: ''
      });

      expect(result.audit.considered).toBe(1);
    });

    test('should handle multiple policies with identical scores', async () => {
      const policies: PolicySource[] = [
        createMockPolicy({
          lcdId: 'LCD037',
          title: 'Identical Policy A',
          content: 'Wound care coverage',
          status: 'current',
          effectiveDate: new Date('2024-01-01')
        }),
        createMockPolicy({
          lcdId: 'LCD038',
          title: 'Identical Policy B', 
          content: 'Wound care coverage',
          status: 'current',
          effectiveDate: new Date('2024-01-01')
        })
      ];

      mockStorage.getCurrentAndFuturePoliciesByMAC.mockResolvedValue(policies);

      const result = await selectBestPolicy({
        macRegion: 'J',
        woundType: 'wound'
      });

      // Should select based on lexical LCD ID ordering as tiebreaker
      expect(['LCD037', 'LCD038']).toContain(result.policy?.lcdId);
    });
  });

  describe('Placeholder Detection Filter', () => {
    test('should filter out policies with explicit placeholder text', async () => {
      const policies: PolicySource[] = [
        createMockPolicy({
          lcdId: 'LCD039',
          title: 'Skin Substitutes for Diabetic Foot Ulcers',
          content: 'This is a placeholder for the full LCD content. Real content will be available soon.',
          status: 'current',
          effectiveDate: new Date('2024-06-01')
        }),
        createMockPolicy({
          lcdId: 'LCD040',
          title: 'Cellular Tissue Products',
          content: 'This policy contains real LCD content about cellular tissue products for wound care. '.repeat(100), // >10K chars
          status: 'current',
          effectiveDate: new Date('2024-05-01')
        })
      ];

      mockStorage.getCurrentAndFuturePoliciesByMAC.mockResolvedValue(policies);

      const result = await selectBestPolicy({
        macRegion: 'J',
        woundType: 'diabetic foot ulcer'
      });

      expect(result.policy).toBeTruthy();
      expect(result.policy?.lcdId).toBe('LCD040'); // Should select non-placeholder policy
      expect(result.audit.filtersApplied).toContain('placeholder_exclusion');
    });

    test('should filter out policies with insufficient content (<1000 chars)', async () => {
      const policies: PolicySource[] = [
        createMockPolicy({
          lcdId: 'LCD041',
          title: 'Wound Care Coverage',
          content: 'Short content',
          status: 'current',
          effectiveDate: new Date('2024-06-01')
        }),
        createMockPolicy({
          lcdId: 'LCD042',
          title: 'Comprehensive Wound Care Policy',
          content: 'This is comprehensive wound care policy content. '.repeat(50), // >1000 chars
          status: 'current',
          effectiveDate: new Date('2024-05-01')
        })
      ];

      mockStorage.getCurrentAndFuturePoliciesByMAC.mockResolvedValue(policies);

      const result = await selectBestPolicy({
        macRegion: 'J',
        woundType: 'wound care'
      });

      expect(result.policy).toBeTruthy();
      expect(result.policy?.lcdId).toBe('LCD042');
      expect(result.audit.filtersApplied).toContain('placeholder_exclusion');
    });

    test('should return null when only placeholder policies exist', async () => {
      const policies: PolicySource[] = [
        createMockPolicy({
          lcdId: 'LCD043',
          title: 'Wound Care',
          content: 'This is a placeholder for the full LCD content.',
          status: 'current'
        }),
        createMockPolicy({
          lcdId: 'LCD044',
          title: 'Skin Substitutes',
          content: 'Short placeholder',
          status: 'current'
        })
      ];

      mockStorage.getCurrentAndFuturePoliciesByMAC.mockResolvedValue(policies);

      const result = await selectBestPolicy({
        macRegion: 'J',
        woundType: 'wound'
      });

      expect(result.policy).toBeNull();
      expect(result.audit.fallbackUsed).toBe('no_policies_available');
    });

    test('should prefer real content over higher-scoring placeholder', async () => {
      const policies: PolicySource[] = [
        createMockPolicy({
          lcdId: 'LCD045',
          title: 'Diabetic Foot Ulcer Treatment - Exact Match',
          content: 'This is a placeholder for the full LCD content.',
          status: 'current',
          effectiveDate: new Date('2024-08-01')
        }),
        createMockPolicy({
          lcdId: 'LCD046',
          title: 'General Wound Care',
          content: 'This policy provides comprehensive coverage for wound care and diabetic foot treatment. '.repeat(100),
          status: 'current',
          effectiveDate: new Date('2024-01-01')
        })
      ];

      mockStorage.getCurrentAndFuturePoliciesByMAC.mockResolvedValue(policies);

      const result = await selectBestPolicy({
        macRegion: 'J',
        woundType: 'diabetic foot ulcer'
      });

      expect(result.policy).toBeTruthy();
      expect(result.policy?.lcdId).toBe('LCD046'); // Should select real content even if less specific
      expect(result.audit.filtersApplied).toContain('placeholder_exclusion');
    });
  });
});