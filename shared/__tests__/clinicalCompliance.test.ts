import { describe, expect, test } from '@jest/globals';
import { getISOWeek, getISOWeekYear } from 'date-fns';
import {
  assessMedicareCompliance,
  classifyWound,
  parseWoundDetails,
  parseConservativeCare,
  statusToTrafficLight,
  type DocumentedException,
  type WoundClassification,
  type MedicareComplianceResult
} from '../clinicalCompliance';
import { type Episode, type Encounter } from '../schema';

// Test helper to create mock episodes and encounters
const createMockEpisode = (overrides: Partial<Episode> = {}): Episode => ({
  id: 'episode-1',
  createdAt: new Date(new Date('2024-01-01T00:00:00Z')),
  updatedAt: new Date(new Date('2024-01-01T00:00:00Z')),
  patientId: 'patient-1',
  woundType: 'DFU',
  woundLocation: 'foot',
  episodeStartDate: new Date(new Date('2024-01-01T00:00:00Z')),
  episodeEndDate: null,
  status: 'active',
  primaryDiagnosis: 'L97.409',
  secondaryDiagnoses: null,
  currentPhase: 'conservative',
  tenantId: 'tenant-1',
  ...overrides
});

const createMockEncounter = (overrides: Partial<Encounter> = {}): Encounter => ({
  id: 'encounter-1',
  createdAt: new Date('2024-01-07T00:00:00Z'),
  updatedAt: new Date('2024-01-07T00:00:00Z'),
  patientId: 'patient-1',
  episodeId: 'episode-1',
  date: new Date('2024-01-07T00:00:00Z'),
  encryptedNotes: null,
  woundDetails: {
    measurements: {
      length: 2.5,
      width: 1.8,
      depth: 0.5,
      area: 4.5
    },
    currentMeasurement: {
      length: 2.5,
      width: 1.8,
      depth: 0.5,
      area: 4.5
    }
  },
  conservativeCare: {
    interventions: []
  },
  diabeticStatus: null,
  infectionStatus: null,
  medicareCompliance: null,
  treatmentRecommendations: null,
  attachmentIds: null,
  attachmentMetadata: null,
  tenantId: 'tenant-1',
  ...overrides
});

describe('clinicalCompliance', () => {
  describe('ISO Week Calculation Edge Cases', () => {
    test('should handle year boundary transitions correctly', () => {
      // December 30, 2024 is a Monday - should be week 1 of 2025 per ISO standards
      const dec30_2024 = new Date('2024-12-30T00:00:00Z');
      const jan1_2025 = new Date('2025-01-01T00:00:00Z');
      const jan6_2025 = new Date('2025-01-06T00:00:00Z'); // Sunday

      // These should all be week 1 of 2025
      expect(getISOWeek(dec30_2024)).toBe(1);
      expect(getISOWeek(jan1_2025)).toBe(1);
      expect(getISOWeek(jan6_2025)).toBe(1);

      // Year should be 2025 for all of these
      expect(getISOWeekYear(dec30_2024)).toBe(2025);
      expect(getISOWeekYear(jan1_2025)).toBe(2025);
      expect(getISOWeekYear(jan6_2025)).toBe(2025);
    });

    test('should handle week 53 scenarios', () => {
      // 2020 had 53 weeks - Dec 28, 2020 should be week 53
      const dec28_2020 = new Date('2020-12-28T00:00:00Z');
      expect(getISOWeek(dec28_2020)).toBe(53);
      expect(getISOWeekYear(dec28_2020)).toBe(2020);
    });

    test('should use Thursday rule for ISO week-year calculation', () => {
      // January 1, 2021 was a Friday - belongs to week 53 of 2020
      const jan1_2021 = new Date('2021-01-01T00:00:00Z');
      expect(getISOWeekYear(jan1_2021)).toBe(2020);
      expect(getISOWeek(jan1_2021)).toBe(53);

      // January 4, 2021 was a Monday - first week of 2021
      const jan4_2021 = new Date('2021-01-04T00:00:00Z');
      expect(getISOWeekYear(jan4_2021)).toBe(2021);
      expect(getISOWeek(jan4_2021)).toBe(1);
    });
  });

  describe('Weekly Assessment Logic with Exception Handling', () => {
    test('should identify missing weeks without exceptions as non-compliant', () => {
      const episode = createMockEpisode({
        episodeStartDate: new Date('2024-01-01T00:00:00Z')
      });

      // Only encounters for weeks 1 and 3, missing week 2
      const encounters = [
        createMockEncounter({ date: new Date('2024-01-01T00:00:00Z') }), // Week 1
        createMockEncounter({ date: '2024-01-15T00:00:00Z' })  // Week 3
      ];

      const result = assessMedicareCompliance(episode, encounters, []);
      
      expect(result.weeklyAssessments.statusWithExceptions).toBe('non-compliant');
      expect(result.weeklyAssessments.missing).toBeGreaterThan(0);
      expect(result.weeklyAssessments.coverage).toBeLessThan(100);
    });

    test('should treat documented exceptions as compliant-with-exception', () => {
      const episode = createMockEpisode({
        episodeStartDate: new Date('2024-01-01T00:00:00Z')
      });

      const encounters = [
        createMockEncounter({ date: new Date('2024-01-01T00:00:00Z') }), // Week 1
        createMockEncounter({ date: '2024-01-15T00:00:00Z' })  // Week 3
      ];

      const exceptions: DocumentedException[] = [
        {
          id: 'exc-1',
          week: '2024-W02',
          type: 'holiday',
          reason: 'Patient unavailable due to New Year holiday week',
          documentedBy: 'clinician',
          documentedDate: new Date('2024-01-08T00:00:00Z'),
          isValidException: true
        }
      ];

      const result = assessMedicareCompliance(episode, encounters, exceptions);
      
      expect(result.weeklyAssessments.statusWithExceptions).toBe('compliant-with-exception');
      expect(result.weeklyAssessments.exceptions).toHaveLength(1);
      expect(result.trafficLight).toBe('yellow');
    });

    test('should handle multiple exception types correctly', () => {
      const episode = createMockEpisode({
        episodeStartDate: new Date('2024-01-01T00:00:00Z')
      });

      const encounters = [
        createMockEncounter({ date: new Date('2024-01-01T00:00:00Z') }) // Only Week 1
      ];

      const exceptions: DocumentedException[] = [
        {
          id: 'exc-1',
          week: '2024-W02',
          type: 'inpatient-stay',
          reason: 'Patient admitted to hospital for cardiac event',
          documentedBy: 'clinician',
          documentedDate: new Date('2024-01-08T00:00:00Z'),
          isValidException: true
        },
        {
          id: 'exc-2',
          week: '2024-W03',
          type: 'medical-emergency',
          reason: 'Emergency room visit prevented scheduled appointment',
          documentedBy: 'clinician',
          documentedDate: new Date('2024-01-15T00:00:00Z'),
          isValidException: true
        }
      ];

      const result = assessMedicareCompliance(episode, encounters, exceptions);
      
      expect(result.weeklyAssessments.statusWithExceptions).toBe('compliant-with-exception');
      expect(result.weeklyAssessments.exceptions).toHaveLength(2);
      expect(statusToTrafficLight(result.weeklyAssessments.statusWithExceptions)).toBe('yellow');
    });

    test('should reject invalid exceptions', () => {
      const episode = createMockEpisode({
        episodeStartDate: new Date('2024-01-01T00:00:00Z')
      });

      const encounters = [
        createMockEncounter({ date: new Date('2024-01-01T00:00:00Z') })
      ];

      const exceptions: DocumentedException[] = [
        {
          id: 'exc-1',
          week: '2024-W02',
          type: 'holiday',
          reason: 'No documentation provided',
          documentedBy: 'clinician',
          documentedDate: new Date('2024-01-08T00:00:00Z'),
          isValidException: false // Invalid exception
        }
      ];

      const result = assessMedicareCompliance(episode, encounters, exceptions);
      
      expect(result.weeklyAssessments.statusWithExceptions).toBe('non-compliant');
      expect(result.weeklyAssessments.exceptions).toHaveLength(0); // Invalid exceptions ignored
    });
  });

  describe('Wound Classification with ICD-10 Integration', () => {
    test('should correctly classify DFU from ICD-10 codes', () => {
      const dfuCodes = [
        'E11.621', // Type 2 diabetes with foot ulcer
        'L97.409', // Non-pressure chronic ulcer of unspecified heel and midfoot
        'E10.622'  // Type 1 diabetes with other skin ulcer
      ];

      dfuCodes.forEach(code => {
        const episode = createMockEpisode({ primaryDiagnosis: code });
        const result = classifyWound(episode);
        
        expect(result.isDFU).toBe(true);
        expect(result.requiresOffloading).toBe(true);
        expect(result.evidenceSource).toBe('icd10-primary');
      });
    });

    test('should correctly classify VLU from ICD-10 codes', () => {
      const vluCodes = [
        'I87.2',   // Venous insufficiency
        'L97.209', // Non-pressure chronic ulcer of unspecified calf
        'I83.009'  // Varicose veins of unspecified lower extremity with ulcer
      ];

      vluCodes.forEach(code => {
        const episode = createMockEpisode({ primaryDiagnosis: code, woundType: 'VLU' });
        const result = classifyWound(episode);
        
        expect(result.isVLU).toBe(true);
        expect(result.requiresCompression).toBe(true);
        expect(result.evidenceSource).toBe('icd10-primary');
      });
    });

    test('should fall back to pattern matching for wound types', () => {
      const episode = createMockEpisode({
        primaryDiagnosis: 'Z99.999', // Non-specific code
        woundType: 'diabetic foot ulcer'
      });

      const result = classifyWound(episode);
      
      expect(result.isDFU).toBe(true);
      expect(result.requiresOffloading).toBe(true);
      expect(result.evidenceSource).toBe('wound-type-field'); // Lower confidence for pattern matching
    });

    test('should handle mixed/complex wound types', () => {
      const episode = createMockEpisode({
        primaryDiagnosis: 'L97.409',
        woundType: 'Mixed arterial/venous ulcer'
      });

      const result = classifyWound(episode);
      
      // Should detect both characteristics
      expect(result.isDFU).toBe(true); // From ICD-10
      expect(result.isVLU).toBe(true);  // From wound type description
    });
  });

  describe('20% Reduction Calculations', () => {
    test('should calculate reduction percentage correctly', () => {
      const episode = createMockEpisode({
        episodeStartDate: new Date('2024-01-01T00:00:00Z')
      });

      const encounters = [
        createMockEncounter({
          date: new Date('2024-01-01T00:00:00Z'),
          woundDetails: {
            measurements: { area: 10.0 },
            currentMeasurement: { area: 10.0 }
          }
        }),
        createMockEncounter({
          date: '2024-01-29T00:00:00Z', // ~28 days later
          woundDetails: {
            measurements: { area: 7.5 },
            currentMeasurement: { area: 7.5 }
          }
        })
      ];

      const result = assessMedicareCompliance(episode, encounters, []);
      
      expect(result.woundReduction.baseline).toBe(10.0);
      expect(result.woundReduction.current).toBe(7.5);
      expect(result.woundReduction.percentage).toBe(25.0); // 25% reduction
      expect(result.woundReduction.meetsThreshold).toBe(true); // >20% threshold
    });

    test('should handle missing baseline measurements', () => {
      const episode = createMockEpisode();
      const encounters: Encounter[] = [];

      const result = assessMedicareCompliance(episode, encounters, []);
      
      expect(result.woundReduction.baseline).toBe(0);
      expect(result.woundReduction.current).toBe(0);
      expect(result.woundReduction.percentage).toBe(0);
      expect(result.woundReduction.meetsThreshold).toBe(false);
    });

    test('should handle 28-day evaluation window correctly', () => {
      const episode = createMockEpisode({
        episodeStartDate: new Date('2024-01-01T00:00:00Z')
      });
      
      const encounters = [
        createMockEncounter({
          date: new Date('2024-01-01T00:00:00Z'),
          woundDetails: { currentMeasurement: { area: 10.0 } }
        })
      ];

      const result = assessMedicareCompliance(episode, encounters, []);
      
      expect(result.woundReduction.isIn28DayWindow).toBe(true);
      expect(result.woundReduction.daysSinceBaseline).toBeGreaterThan(0);
    });
  });

  describe('Full Medicare Compliance Integration', () => {
    test('should provide consistent compliance assessment across all components', () => {
      const episode = createMockEpisode({
        episodeStartDate: new Date('2024-01-01T00:00:00Z'),
        primaryDiagnosis: 'E11.621', // DFU
        woundType: 'Diabetic foot ulcer'
      });

      const encounters = [
        // Weekly measurements with good reduction
        createMockEncounter({
          date: new Date('2024-01-01T00:00:00Z'),
          woundDetails: { currentMeasurement: { area: 10.0 } },
          conservativeCare: {
            interventions: [{
              id: '1',
              type: 'offloading_device',
              name: 'Total Contact Cast',
              startDate: new Date('2024-01-01T00:00:00Z'),
              medicare: { compliant: true }
            }]
          }
        }),
        createMockEncounter({
          date: '2024-01-08T00:00:00Z',
          woundDetails: { currentMeasurement: { area: 9.0 } }
        }),
        createMockEncounter({
          date: '2024-01-15T00:00:00Z',
          woundDetails: { currentMeasurement: { area: 8.0 } }
        }),
        createMockEncounter({
          date: '2024-01-29T00:00:00Z',
          woundDetails: { currentMeasurement: { area: 7.0 } } // 30% reduction
        })
      ];

      const result = assessMedicareCompliance(episode, encounters, []);
      
      // Should be compliant across all dimensions
      expect(result.overallStatus).toBe('compliant');
      expect(result.trafficLight).toBe('green');
      expect(result.weeklyAssessments.statusWithExceptions).toBe('compliant');
      expect(result.woundReduction.meetsThreshold).toBe(true);
      expect(result.standardOfCare.offloading).toBe(true);
      expect(result.criticalGaps).toHaveLength(0);
    });

    test('should identify critical gaps correctly', () => {
      const episode = createMockEpisode({
        episodeStartDate: new Date('2024-01-01T00:00:00Z'),
        primaryDiagnosis: 'E11.621', // DFU - requires offloading
        woundType: 'Diabetic foot ulcer'
      });

      const encounters = [
        createMockEncounter({
          date: new Date('2024-01-01T00:00:00Z'),
          woundDetails: { currentMeasurement: { area: 10.0 } },
          conservativeCare: {
            interventions: [] // No offloading intervention
          }
        })
      ];

      const result = assessMedicareCompliance(episode, encounters, []);
      
      expect(result.overallStatus).toBe('non-compliant');
      expect(result.trafficLight).toBe('red');
      expect(result.standardOfCare.offloading).toBe(false);
      expect(result.criticalGaps).toContain(
        expect.stringContaining('Offloading')
      );
    });

    test('should handle exceptions and show yellow status appropriately', () => {
      const episode = createMockEpisode({
        episodeStartDate: new Date('2024-01-01T00:00:00Z')
      });

      const encounters = [
        createMockEncounter({
          date: new Date('2024-01-01T00:00:00Z'),
          woundDetails: { currentMeasurement: { area: 10.0 } }
        })
        // Missing week 2 encounters
      ];

      const exceptions: DocumentedException[] = [
        {
          id: 'exc-1',
          week: '2024-W02',
          type: 'holiday',
          reason: 'Patient unavailable during holiday week',
          documentedBy: 'clinician',
          documentedDate: new Date('2024-01-08T00:00:00Z'),
          isValidException: true
        }
      ];

      const result = assessMedicareCompliance(episode, encounters, exceptions);
      
      expect(result.weeklyAssessments.statusWithExceptions).toBe('compliant-with-exception');
      expect(statusToTrafficLight(result.weeklyAssessments.statusWithExceptions)).toBe('yellow');
    });
  });

  describe('Data Parsing Robustness', () => {
    test('should handle malformed wound details gracefully', () => {
      const malformedData = {
        invalidField: 'test',
        measurements: 'not an object'
      };

      const result = parseWoundDetails(malformedData);
      expect(result).toBeNull();
    });

    test('should parse valid wound details correctly', () => {
      const validData = {
        measurements: {
          length: 2.5,
          width: 1.8,
          area: 4.5
        },
        currentMeasurement: {
          area: 4.5
        }
      };

      const result = parseWoundDetails(validData);
      expect(result).not.toBeNull();
      expect(result?.currentMeasurement?.area).toBe(4.5);
    });

    test('should handle malformed conservative care data gracefully', () => {
      const malformedData = {
        interventions: 'not an array'
      };

      const result = parseConservativeCare(malformedData);
      expect(result).toBeNull();
    });
  });

  describe('Traffic Light Status Mapping', () => {
    test('should map compliance statuses to traffic light colors correctly', () => {
      expect(statusToTrafficLight('compliant')).toBe('green');
      expect(statusToTrafficLight('compliant-with-exception')).toBe('yellow');
      expect(statusToTrafficLight('non-compliant')).toBe('red');
    });
  });
});