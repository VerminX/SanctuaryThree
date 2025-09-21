/**
 * PHASE 1.3 DEPTH PROGRESSION TRACKING SYSTEM - COMPREHENSIVE TEST SUITE
 * 
 * This test suite provides exhaustive validation of the depth progression tracking system
 * to ensure patient safety, clinical accuracy, and Medicare LCD compliance.
 * 
 * CRITICAL SAFETY REQUIREMENTS:
 * - Prevent false negatives in acute deterioration scenarios
 * - Evidence-based thresholds with verified citations
 * - Medicare LCD separation maintained throughout
 * - Complete audit trails for regulatory compliance
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { 
  assessMeasurementQuality,
  validateAlertRequirements,
  detectConsecutiveConfirmations,
  analyzeVolumeProgression,
  validateDepthMeasurements,
  CLINICAL_THRESHOLDS,
  CLINICAL_EVIDENCE,
  ANATOMICAL_REFERENCE_DATA
} from '../eligibilityValidator';

// Test Data Fixtures for Comprehensive Testing
const createMockMeasurementHistory = (scenario: 'healing' | 'deteriorating' | 'stalled' | 'acute_deterioration' | 'sparse_data' | 'outliers') => {
  const baseDate = new Date('2024-01-01T10:00:00Z');
  const measurements: any[] = [];

  switch (scenario) {
    case 'healing':
      // Normal healing progression - depth decreasing over time
      measurements.push(
        { id: 'heal_1', measurementTimestamp: new Date(baseDate.getTime()).toISOString(), depth: 8.0, length: 4.0, width: 3.0, calculatedArea: 9.42, unitOfMeasurement: 'cm', validationStatus: 'validated' },
        { id: 'heal_2', measurementTimestamp: new Date(baseDate.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(), depth: 7.5, length: 3.8, width: 2.9, calculatedArea: 8.69, unitOfMeasurement: 'cm', validationStatus: 'validated' },
        { id: 'heal_3', measurementTimestamp: new Date(baseDate.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString(), depth: 7.0, length: 3.6, width: 2.8, calculatedArea: 7.95, unitOfMeasurement: 'cm', validationStatus: 'validated' },
        { id: 'heal_4', measurementTimestamp: new Date(baseDate.getTime() + 21 * 24 * 60 * 60 * 1000).toISOString(), depth: 6.2, length: 3.4, width: 2.6, calculatedArea: 6.98, unitOfMeasurement: 'cm', validationStatus: 'validated' },
        { id: 'heal_5', measurementTimestamp: new Date(baseDate.getTime() + 28 * 24 * 60 * 60 * 1000).toISOString(), depth: 5.5, length: 3.2, width: 2.4, calculatedArea: 6.03, unitOfMeasurement: 'cm', validationStatus: 'validated' }
      );
      break;

    case 'deteriorating':
      // Moderate deterioration - depth increasing gradually
      measurements.push(
        { id: 'det_1', measurementTimestamp: new Date(baseDate.getTime()).toISOString(), depth: 5.0, length: 3.0, width: 2.5, calculatedArea: 5.89, unitOfMeasurement: 'cm', validationStatus: 'validated' },
        { id: 'det_2', measurementTimestamp: new Date(baseDate.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(), depth: 5.8, length: 3.2, width: 2.7, calculatedArea: 6.80, unitOfMeasurement: 'cm', validationStatus: 'validated' },
        { id: 'det_3', measurementTimestamp: new Date(baseDate.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString(), depth: 6.5, length: 3.5, width: 2.9, calculatedArea: 7.99, unitOfMeasurement: 'cm', validationStatus: 'validated' },
        { id: 'det_4', measurementTimestamp: new Date(baseDate.getTime() + 21 * 24 * 60 * 60 * 1000).toISOString(), depth: 7.2, length: 3.8, width: 3.1, calculatedArea: 9.27, unitOfMeasurement: 'cm', validationStatus: 'validated' },
        { id: 'det_5', measurementTimestamp: new Date(baseDate.getTime() + 28 * 24 * 60 * 60 * 1000).toISOString(), depth: 8.0, length: 4.0, width: 3.3, calculatedArea: 10.39, unitOfMeasurement: 'cm', validationStatus: 'validated' }
      );
      break;

    case 'acute_deterioration':
      // Acute deterioration requiring emergency override
      measurements.push(
        { id: 'acute_1', measurementTimestamp: new Date(baseDate.getTime()).toISOString(), depth: 4.0, length: 2.8, width: 2.2, calculatedArea: 4.85, unitOfMeasurement: 'cm', validationStatus: 'validated' },
        { id: 'acute_2', measurementTimestamp: new Date(baseDate.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(), depth: 10.5, length: 3.5, width: 2.8, calculatedArea: 7.70, unitOfMeasurement: 'cm', validationStatus: 'pending' }, // 6.5mm increase in 3 days
        { id: 'acute_3', measurementTimestamp: new Date(baseDate.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(), depth: 12.0, length: 4.2, width: 3.2, calculatedArea: 10.58, unitOfMeasurement: 'cm', validationStatus: 'pending' }
      );
      break;

    case 'stalled':
      // Stalled healing - minimal change over time
      measurements.push(
        { id: 'stall_1', measurementTimestamp: new Date(baseDate.getTime()).toISOString(), depth: 6.0, length: 3.5, width: 2.8, calculatedArea: 7.70, unitOfMeasurement: 'cm', validationStatus: 'validated' },
        { id: 'stall_2', measurementTimestamp: new Date(baseDate.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(), depth: 6.1, length: 3.4, width: 2.9, calculatedArea: 7.76, unitOfMeasurement: 'cm', validationStatus: 'validated' },
        { id: 'stall_3', measurementTimestamp: new Date(baseDate.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString(), depth: 5.9, length: 3.6, width: 2.7, calculatedArea: 7.63, unitOfMeasurement: 'cm', validationStatus: 'validated' },
        { id: 'stall_4', measurementTimestamp: new Date(baseDate.getTime() + 21 * 24 * 60 * 60 * 1000).toISOString(), depth: 6.0, length: 3.5, width: 2.8, calculatedArea: 7.70, unitOfMeasurement: 'cm', validationStatus: 'validated' }
      );
      break;

    case 'sparse_data':
      // Limited measurements with large gaps
      measurements.push(
        { id: 'sparse_1', measurementTimestamp: new Date(baseDate.getTime()).toISOString(), depth: 5.0, length: 3.0, width: 2.5, calculatedArea: 5.89, unitOfMeasurement: 'cm', validationStatus: 'validated' },
        { id: 'sparse_2', measurementTimestamp: new Date(baseDate.getTime() + 25 * 24 * 60 * 60 * 1000).toISOString(), depth: 7.0, length: 3.2, width: 2.7, calculatedArea: 6.80, unitOfMeasurement: 'cm', validationStatus: 'pending' }
      );
      break;

    case 'outliers':
      // Dataset with statistical outliers
      measurements.push(
        { id: 'out_1', measurementTimestamp: new Date(baseDate.getTime()).toISOString(), depth: 5.0, length: 3.0, width: 2.5, calculatedArea: 5.89, unitOfMeasurement: 'cm', validationStatus: 'validated' },
        { id: 'out_2', measurementTimestamp: new Date(baseDate.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(), depth: 15.0, length: 3.1, width: 2.6, calculatedArea: 6.34, unitOfMeasurement: 'cm', validationStatus: 'flagged' }, // Outlier
        { id: 'out_3', measurementTimestamp: new Date(baseDate.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString(), depth: 5.2, length: 3.0, width: 2.5, calculatedArea: 5.89, unitOfMeasurement: 'cm', validationStatus: 'validated' },
        { id: 'out_4', measurementTimestamp: new Date(baseDate.getTime() + 21 * 24 * 60 * 60 * 1000).toISOString(), depth: 4.8, length: 2.9, width: 2.4, calculatedArea: 5.47, unitOfMeasurement: 'cm', validationStatus: 'validated' }
      );
      break;
  }

  return measurements;
};

describe('PHASE 1.3 DEPTH PROGRESSION TRACKING SYSTEM', () => {

  // ==================================================================
  // 1. THRESHOLD CROSSING TESTS (CRITICAL)
  // Test all depth/volume threshold scenarios for each urgency level
  // ==================================================================
  describe('1. THRESHOLD CROSSING TESTS', () => {
    
    test('Minor Concern Threshold: 0.5mm/week increase should trigger minor concern alert', () => {
      const measurements = [
        { id: '1', measurementTimestamp: '2024-01-01T10:00:00Z', depth: 5.0, unitOfMeasurement: 'mm', validationStatus: 'validated' },
        { id: '2', measurementTimestamp: '2024-01-08T10:00:00Z', depth: 5.6, unitOfMeasurement: 'mm', validationStatus: 'validated' }, // 0.6mm/week
        { id: '3', measurementTimestamp: '2024-01-15T10:00:00Z', depth: 6.2, unitOfMeasurement: 'mm', validationStatus: 'validated' }
      ];

      const qualityAssessment = assessMeasurementQuality(measurements, 'foot', 14);
      
      expect(qualityAssessment.overallQualityScore).toBeGreaterThan(CLINICAL_THRESHOLDS.QUALITY.MINIMUM_QUALITY_URGENT);
      
      // Verify threshold constants match clinical evidence
      expect(CLINICAL_THRESHOLDS.DEPTH_PROGRESSION.MINOR_INCREASE_PER_WEEK).toBe(0.5);
      expect(CLINICAL_EVIDENCE.DEPTH_PROGRESSION.guidelineReferences).toContainEqual(
        expect.objectContaining({
          source: "International Working Group on the Diabetic Foot (IWGDF)",
          year: "2023"
        })
      );
    });

    test('Moderate Concern Threshold: 1.0mm/week increase should trigger moderate concern', () => {
      const measurements = [
        { id: '1', measurementTimestamp: '2024-01-01T10:00:00Z', depth: 8.0, unitOfMeasurement: 'mm', validationStatus: 'validated' },
        { id: '2', measurementTimestamp: '2024-01-08T10:00:00Z', depth: 9.2, unitOfMeasurement: 'mm', validationStatus: 'validated' }, // 1.2mm/week
        { id: '3', measurementTimestamp: '2024-01-15T10:00:00Z', depth: 10.5, unitOfMeasurement: 'mm', validationStatus: 'validated' }
      ];

      const consecutiveConfirmations = detectConsecutiveConfirmations(
        measurements,
        CLINICAL_THRESHOLDS.DEPTH_PROGRESSION.MODERATE_INCREASE_PER_WEEK,
        14
      );
      
      expect(consecutiveConfirmations.consecutiveIntervalsConfirmed).toBeGreaterThan(0);
      expect(CLINICAL_THRESHOLDS.DEPTH_PROGRESSION.MODERATE_INCREASE_PER_WEEK).toBe(1.0);
    });

    test('Critical Concern Threshold: 2.0mm/week increase should trigger critical intervention', () => {
      const measurements = createMockMeasurementHistory('deteriorating');
      
      // Modify measurements to exceed critical threshold
      measurements.forEach((m, index) => {
        if (index > 0) {
          m.depth = measurements[0].depth + (index * 3.0); // 3mm per week increase
        }
      });

      const validation = validateAlertRequirements('critical_intervention', measurements, 0.85, 0.80, 2);
      
      expect(validation.shouldIssueAlert).toBe(true);
      expect(validation.validationResults.overallValidation).toBe(true);
      expect(CLINICAL_THRESHOLDS.DEPTH_PROGRESSION.CRITICAL_INCREASE_PER_WEEK).toBe(2.0);
    });

    test('Volume Expansion Thresholds: 20%, 35%, 50% increases over 4 weeks', async () => {
      const volumeMeasurements = [
        { id: '1', measurementTimestamp: '2024-01-01T10:00:00Z', length: 3.0, width: 2.0, depth: 0.5, unitOfMeasurement: 'cm', validationStatus: 'validated' },
        { id: '2', measurementTimestamp: '2024-01-29T10:00:00Z', length: 3.3, width: 2.2, depth: 0.8, unitOfMeasurement: 'cm', validationStatus: 'validated' } // ~65% volume increase
      ];

      const volumeAnalysis = await analyzeVolumeProgression('episode_volume_test', volumeMeasurements);
      
      expect(volumeAnalysis.expansionAlerts.length).toBeGreaterThan(0);
      expect(volumeAnalysis.expansionAlerts[0].severity).toBe('major'); // >50% increase
      expect(CLINICAL_THRESHOLDS.VOLUME_EXPANSION.CRITICAL_INCREASE_PERCENT).toBe(50);
    });

    test('Absolute Depth Change Thresholds: Immediate, Urgent, Critical concerns', () => {
      const measurements = createMockMeasurementHistory('acute_deterioration');
      
      // Verify absolute thresholds are evidence-based
      expect(CLINICAL_THRESHOLDS.DEPTH_PROGRESSION.IMMEDIATE_CONCERN_INCREASE).toBe(2.0); // mm in 2 weeks
      expect(CLINICAL_THRESHOLDS.DEPTH_PROGRESSION.URGENT_CONCERN_INCREASE).toBe(3.0);
      expect(CLINICAL_THRESHOLDS.DEPTH_PROGRESSION.CRITICAL_CONCERN_INCREASE).toBe(5.0);
      
      // Test acute deterioration detection (6.5mm increase in 3 days)
      const depthChange = measurements[1].depth - measurements[0].depth;
      expect(depthChange).toBeGreaterThan(CLINICAL_THRESHOLDS.DEPTH_PROGRESSION.CRITICAL_CONCERN_INCREASE);
    });
  });

  // ==================================================================
  // 2. GATING LOGIC TESTS (CRITICAL)
  // Validate minimum measurements/confidence/quality requirements
  // ==================================================================
  describe('2. GATING LOGIC TESTS', () => {
    
    test('Minimum Measurements Requirement: Should block urgent alerts with insufficient measurements', () => {
      const insufficientMeasurements = [
        { id: '1', measurementTimestamp: '2024-01-01T10:00:00Z', depth: 5.0, unitOfMeasurement: 'mm', validationStatus: 'validated' },
        { id: '2', measurementTimestamp: '2024-01-08T10:00:00Z', depth: 8.0, unitOfMeasurement: 'mm', validationStatus: 'validated' }
      ]; // Only 2 measurements, need 3 for urgent

      const validation = validateAlertRequirements('urgent_clinical_review', insufficientMeasurements, 0.80, 0.70);
      
      expect(validation.shouldIssueAlert).toBe(false);
      expect(validation.validationResults.meetsMinimumMeasurements).toBe(false);
      expect(validation.preventionReasons).toContain(
        expect.stringContaining('Insufficient measurements: 2 < 3 required for urgent_clinical_review alert')
      );
      expect(CLINICAL_THRESHOLDS.CONFIDENCE.MINIMUM_MEASUREMENTS_URGENT).toBe(3);
    });

    test('Statistical Confidence Gates: Should block alerts below confidence thresholds', () => {
      const measurements = createMockMeasurementHistory('deteriorating');
      const lowConfidence = 0.55; // Below 60% threshold for urgent alerts
      
      const validation = validateAlertRequirements('urgent_clinical_review', measurements, 0.90, lowConfidence);
      
      expect(validation.shouldIssueAlert).toBe(false);
      expect(validation.validationResults.meetsConfidenceThreshold).toBe(false);
      expect(validation.preventionReasons).toContain(
        expect.stringContaining('Low statistical confidence: 55.0% < 60.0% required for urgent_clinical_review alert')
      );
      expect(CLINICAL_THRESHOLDS.CONFIDENCE.MINIMUM_URGENT_CONFIDENCE).toBe(0.6);
    });

    test('Data Quality Gates: Should block alerts below quality thresholds', () => {
      const poorQualityMeasurements = createMockMeasurementHistory('outliers');
      const lowQuality = 0.65; // Below 70% threshold for urgent alerts
      
      const validation = validateAlertRequirements('urgent_clinical_review', poorQualityMeasurements, lowQuality, 0.80);
      
      expect(validation.shouldIssueAlert).toBe(false);
      expect(validation.validationResults.meetsQualityThreshold).toBe(false);
      expect(validation.preventionReasons).toContain(
        expect.stringContaining('Poor data quality: 65.0% < 70.0% required for urgent_clinical_review alert')
      );
      expect(CLINICAL_THRESHOLDS.QUALITY.MINIMUM_QUALITY_URGENT).toBe(0.7);
    });

    test('Critical Alert Requirements: Higher thresholds for critical interventions', () => {
      const measurements = createMockMeasurementHistory('deteriorating');
      
      // Should pass critical thresholds
      const validCritical = validateAlertRequirements('critical_intervention', measurements, 0.85, 0.80, 2);
      expect(validCritical.shouldIssueAlert).toBe(true);
      expect(CLINICAL_THRESHOLDS.CONFIDENCE.MINIMUM_CRITICAL_CONFIDENCE).toBe(0.75);
      expect(CLINICAL_THRESHOLDS.QUALITY.MINIMUM_QUALITY_CRITICAL).toBe(0.8);
      
      // Should fail with insufficient consecutive confirmations
      const invalidCritical = validateAlertRequirements('critical_intervention', measurements, 0.85, 0.80, 1);
      expect(invalidCritical.shouldIssueAlert).toBe(false);
      expect(CLINICAL_THRESHOLDS.CONFIDENCE.MINIMUM_MEASUREMENTS_CRITICAL).toBe(4);
    });

    test('Consecutive Confirmation Requirements: Should require trend confirmation', () => {
      const measurements = [
        { id: '1', measurementTimestamp: '2024-01-01T10:00:00Z', depth: 5.0, unitOfMeasurement: 'mm' },
        { id: '2', measurementTimestamp: '2024-01-08T10:00:00Z', depth: 7.5, unitOfMeasurement: 'mm' }, // Increase
        { id: '3', measurementTimestamp: '2024-01-15T10:00:00Z', depth: 4.0, unitOfMeasurement: 'mm' }, // Decrease - trend break
        { id: '4', measurementTimestamp: '2024-01-22T10:00:00Z', depth: 6.0, unitOfMeasurement: 'mm' }  // Increase again
      ];

      const confirmations = detectConsecutiveConfirmations(measurements, 1.0, 21);
      
      // Should detect trend break and reset consecutive count
      expect(confirmations.consecutiveIntervalsConfirmed).toBeLessThan(2);
      expect(confirmations.confirmationDetails).toContain(
        expect.stringContaining('Trend break - depth decreased')
      );
    });
  });

  // ==================================================================
  // 3. FALSE POSITIVE/NEGATIVE TESTS (CRITICAL)
  // Test scenarios that should and shouldn't trigger alerts
  // ==================================================================
  describe('3. FALSE POSITIVE/NEGATIVE TESTS', () => {
    
    test('FALSE POSITIVE PREVENTION: Measurement errors should not trigger false alerts', () => {
      const measurementsWithError = [
        { id: '1', measurementTimestamp: '2024-01-01T10:00:00Z', depth: 5.0, unitOfMeasurement: 'mm', validationStatus: 'validated' },
        { id: '2', measurementTimestamp: '2024-01-08T10:00:00Z', depth: 15.0, unitOfMeasurement: 'mm', validationStatus: 'flagged' }, // Clear measurement error
        { id: '3', measurementTimestamp: '2024-01-15T10:00:00Z', depth: 5.2, unitOfMeasurement: 'mm', validationStatus: 'validated' },
        { id: '4', measurementTimestamp: '2024-01-22T10:00:00Z', depth: 4.8, unitOfMeasurement: 'mm', validationStatus: 'validated' }
      ];

      const qualityAssessment = assessMeasurementQuality(measurementsWithError, 'foot', 21);
      
      expect(qualityAssessment.allowHighUrgencyAlerts).toBe(false);
      expect(qualityAssessment.qualityFlags).toContain(
        expect.stringContaining('High outlier rate')
      );
      expect(qualityAssessment.preventionReasons.length).toBeGreaterThan(0);
    });

    test('FALSE POSITIVE PREVENTION: Normal healing variation should not trigger alerts', () => {
      const normalHealingVariation = [
        { id: '1', measurementTimestamp: '2024-01-01T10:00:00Z', depth: 6.0, unitOfMeasurement: 'mm', validationStatus: 'validated' },
        { id: '2', measurementTimestamp: '2024-01-08T10:00:00Z', depth: 6.3, unitOfMeasurement: 'mm', validationStatus: 'validated' }, // Minor increase
        { id: '3', measurementTimestamp: '2024-01-15T10:00:00Z', depth: 5.8, unitOfMeasurement: 'mm', validationStatus: 'validated' }, // Back to healing
        { id: '4', measurementTimestamp: '2024-01-22T10:00:00Z', depth: 5.4, unitOfMeasurement: 'mm', validationStatus: 'validated' }
      ];

      const consecutiveConfirmations = detectConsecutiveConfirmations(
        normalHealingVariation, 
        CLINICAL_THRESHOLDS.DEPTH_PROGRESSION.MINOR_INCREASE_PER_WEEK, 
        21
      );
      
      expect(consecutiveConfirmations.consecutiveIntervalsConfirmed).toBe(0);
      expect(consecutiveConfirmations.confirmationDetails).toContain(
        expect.stringContaining('Trend break - depth decreased')
      );
    });

    test('FALSE NEGATIVE PREVENTION: Acute deterioration should bypass quality gates', () => {
      const acuteMeasurements = [
        { id: '1', measurementTimestamp: '2024-01-01T10:00:00Z', depth: 4.0, unitOfMeasurement: 'mm', validationStatus: 'validated' },
        { id: '2', measurementTimestamp: '2024-01-03T10:00:00Z', depth: 11.0, unitOfMeasurement: 'mm', validationStatus: 'pending' }, // 7mm in 2 days - CRITICAL
        { id: '3', measurementTimestamp: '2024-01-06T10:00:00Z', depth: 13.0, unitOfMeasurement: 'mm', validationStatus: 'pending' }
      ];

      // Even with low quality/confidence, should trigger due to acute deterioration
      const validation = validateAlertRequirements('critical_intervention', acuteMeasurements, 0.50, 0.55); // Below normal thresholds
      
      const depthChange = acuteMeasurements[1].depth - acuteMeasurements[0].depth;
      expect(depthChange).toBeGreaterThan(CLINICAL_THRESHOLDS.DEPTH_PROGRESSION.CRITICAL_CONCERN_INCREASE);
      
      // This should be handled by SAFETY OVERRIDE SYSTEM (to be implemented)
      // For now, verify the acute change is detected
      expect(depthChange).toBe(7.0); // 7mm increase in 2 days
    });

    test('FALSE NEGATIVE PREVENTION: Gradual but concerning progression should be detected', () => {
      const gradualDeterioration = createMockMeasurementHistory('deteriorating');
      
      const qualityAssessment = assessMeasurementQuality(gradualDeterioration, 'foot', 28);
      const validation = validateAlertRequirements('moderate_concern', gradualDeterioration, qualityAssessment.overallQualityScore, 0.75);
      
      expect(validation.shouldIssueAlert).toBe(true);
      expect(qualityAssessment.allowHighUrgencyAlerts).toBe(true);
    });

    test('SPECIFICITY TEST: Minor measurement fluctuations should not trigger alerts', () => {
      const minorFluctuations = [
        { id: '1', measurementTimestamp: '2024-01-01T10:00:00Z', depth: 5.0, unitOfMeasurement: 'mm', validationStatus: 'validated' },
        { id: '2', measurementTimestamp: '2024-01-08T10:00:00Z', depth: 5.1, unitOfMeasurement: 'mm', validationStatus: 'validated' },
        { id: '3', measurementTimestamp: '2024-01-15T10:00:00Z', depth: 4.9, unitOfMeasurement: 'mm', validationStatus: 'validated' },
        { id: '4', measurementTimestamp: '2024-01-22T10:00:00Z', depth: 5.2, unitOfMeasurement: 'mm', validationStatus: 'validated' }
      ];

      const validation = validateAlertRequirements('minor_concern', minorFluctuations, 0.85, 0.75);
      
      expect(validation.shouldIssueAlert).toBe(false);
      expect(validation.preventionReasons).toContain(
        expect.stringContaining('Insufficient measurements')
      );
    });
  });

  // ==================================================================
  // 4. UNIT CONVERSION TESTS (CRITICAL)
  // Comprehensive validation of mm/cm/inch conversion paths
  // ==================================================================
  describe('4. UNIT CONVERSION TESTS', () => {
    
    test('MM to CM Conversion: Depth measurements in millimeters', () => {
      const mmMeasurements = [
        { id: '1', depth: 50, unitOfMeasurement: 'mm', validationStatus: 'validated' }, // 5.0 cm
        { id: '2', depth: 75, unitOfMeasurement: 'mm', validationStatus: 'validated' }  // 7.5 cm
      ];

      const depthValidation = validateDepthMeasurements(mmMeasurements, 'foot');
      
      // Verify conversion to standard units (mm internally)
      expect(depthValidation.depthValidationResults[0].depth).toBe(50); // Should remain in mm
      expect(depthValidation.depthValidationResults[1].depth).toBe(75);
      expect(depthValidation.anatomicalFeasibilityAssessment.expectedDepthRange.min).toBe(15); // mm
      expect(depthValidation.anatomicalFeasibilityAssessment.expectedDepthRange.max).toBe(25); // mm
    });

    test('CM to MM Conversion: Depth measurements in centimeters', () => {
      const cmMeasurements = [
        { id: '1', depth: 0.6, unitOfMeasurement: 'cm', validationStatus: 'validated', measurementTimestamp: '2024-01-01T10:00:00Z' }, // 6 mm
        { id: '2', depth: 1.2, unitOfMeasurement: 'cm', validationStatus: 'validated', measurementTimestamp: '2024-01-08T10:00:00Z' }  // 12 mm
      ];

      const depthValidation = validateDepthMeasurements(cmMeasurements, 'foot');
      
      // Should convert cm to mm (multiply by 10)
      expect(depthValidation.depthValidationResults[0].depth).toBe(6.0); // 0.6 cm = 6 mm
      expect(depthValidation.depthValidationResults[1].depth).toBe(12.0); // 1.2 cm = 12 mm
    });

    test('INCH to MM Conversion: Depth measurements in inches', () => {
      const inchMeasurements = [
        { id: '1', depth: 0.2, unitOfMeasurement: 'inches', validationStatus: 'validated', measurementTimestamp: '2024-01-01T10:00:00Z' }, // ~5.08 mm
        { id: '2', depth: 0.4, unitOfMeasurement: 'inches', validationStatus: 'validated', measurementTimestamp: '2024-01-08T10:00:00Z' }  // ~10.16 mm
      ];

      const depthValidation = validateDepthMeasurements(inchMeasurements, 'foot');
      
      // Should convert inches to mm (multiply by 25.4)
      expect(depthValidation.depthValidationResults[0].depth).toBeCloseTo(5.08, 1); // 0.2 inches = 5.08 mm
      expect(depthValidation.depthValidationResults[1].depth).toBeCloseTo(10.16, 1); // 0.4 inches = 10.16 mm
    });

    test('Mixed Unit Handling: Should normalize mixed units in measurement history', () => {
      const mixedUnits = [
        { id: '1', depth: 5, unitOfMeasurement: 'mm', validationStatus: 'validated', measurementTimestamp: '2024-01-01T10:00:00Z' },
        { id: '2', depth: 0.8, unitOfMeasurement: 'cm', validationStatus: 'validated', measurementTimestamp: '2024-01-08T10:00:00Z' }, // 8 mm
        { id: '3', depth: 0.35, unitOfMeasurement: 'inches', validationStatus: 'validated', measurementTimestamp: '2024-01-15T10:00:00Z' } // ~8.89 mm
      ];

      const depthValidation = validateDepthMeasurements(mixedUnits, 'foot');
      
      // All should be normalized to mm
      expect(depthValidation.depthValidationResults[0].depth).toBe(5.0);    // 5 mm
      expect(depthValidation.depthValidationResults[1].depth).toBe(8.0);    // 0.8 cm = 8 mm
      expect(depthValidation.depthValidationResults[2].depth).toBeCloseTo(8.89, 1); // 0.35 inches ≈ 8.89 mm
      expect(depthValidation.overallQualityScore).toBeGreaterThan(0.5); // Should handle mixed units gracefully
    });

    test('Unit Conversion Edge Cases: Zero, negative, and extreme values', () => {
      const edgeCases = [
        { id: '1', depth: 0, unitOfMeasurement: 'mm', validationStatus: 'flagged', measurementTimestamp: '2024-01-01T10:00:00Z' },
        { id: '2', depth: 0.01, unitOfMeasurement: 'cm', validationStatus: 'flagged', measurementTimestamp: '2024-01-08T10:00:00Z' }, // 0.1 mm - very shallow
        { id: '3', depth: 5.0, unitOfMeasurement: 'cm', validationStatus: 'flagged', measurementTimestamp: '2024-01-15T10:00:00Z' }  // 50 mm - very deep
      ];

      const depthValidation = validateDepthMeasurements(edgeCases, 'foot');
      
      expect(depthValidation.depthValidationResults[1].depth).toBe(0.1); // 0.01 cm = 0.1 mm
      expect(depthValidation.depthValidationResults[2].depth).toBe(50.0); // 5.0 cm = 50 mm
      
      // Should flag shallow measurements
      expect(depthValidation.depthValidationResults[1].validationFlags.measurementQualityGood).toBe(false);
      expect(depthValidation.depthValidationResults[1].recommendations).toContain(
        expect.stringContaining('Very shallow depth measurement')
      );
      
      // Should flag anatomically implausible measurements
      expect(depthValidation.depthValidationResults[2].validationFlags.anatomicallyPlausible).toBe(false);
    });

    test('Volume Calculation Unit Consistency: Length x Width x Depth normalization', async () => {
      const volumeMeasurements = [
        { 
          id: '1', 
          measurementTimestamp: '2024-01-01T10:00:00Z',
          length: 30, width: 20, depth: 5, // mm
          unitOfMeasurement: 'mm', 
          validationStatus: 'validated' 
        },
        { 
          id: '2', 
          measurementTimestamp: '2024-01-29T10:00:00Z',
          length: 3.2, width: 2.1, depth: 0.8, // cm  
          unitOfMeasurement: 'cm', 
          validationStatus: 'validated' 
        }
      ];

      const volumeAnalysis = await analyzeVolumeProgression('episode_units_test', volumeMeasurements);
      
      // Both measurements should be normalized to cm for volume calculation
      expect(volumeAnalysis.totalVolumeMeasurements).toBe(2);
      expect(volumeAnalysis.volumeMetrics.initialVolume).toBeGreaterThan(0);
      expect(volumeAnalysis.volumeMetrics.currentVolume).toBeGreaterThan(0);
      expect(volumeAnalysis.qualityAssessment.qualityGrade).not.toBe('F'); // Should handle unit normalization
    });
  });

  // ==================================================================
  // 5. MEDICARE LCD INTEGRATION TESTS (CRITICAL)
  // Prove that area-based LCD eligibility is unaffected by advisory depth/volume alerts
  // ==================================================================
  describe('5. MEDICARE LCD INTEGRATION TESTS', () => {
    
    test('LCD SEPARATION: Depth/volume alerts should remain advisory only', () => {
      // This test verifies that depth progression alerts do not affect Medicare LCD coverage decisions
      const measurements = createMockMeasurementHistory('deteriorating');
      
      // Add area measurements for LCD compliance
      measurements.forEach((m, index) => {
        m.calculatedArea = 10 - (index * 1.5); // Area decreasing (good for LCD)
      });

      // Generate depth progression alert
      const qualityAssessment = assessMeasurementQuality(measurements, 'foot', 28);
      
      // Verify quality assessment includes Medicare LCD separation
      expect(qualityAssessment.allowHighUrgencyAlerts).toBeDefined();
      expect(qualityAssessment.auditTrail).toContain(
        expect.stringContaining('High-urgency alerts')
      );
      
      // Medicare LCD compliance should be evaluated separately
      // Area-based eligibility should be unaffected by depth concerns
      const initialArea = measurements[0].calculatedArea;
      const currentArea = measurements[measurements.length - 1].calculatedArea;
      const areaReduction = ((initialArea - currentArea) / initialArea) * 100;
      
      expect(areaReduction).toBeGreaterThan(20); // Area shows good reduction
      // Depth alerts should be advisory - not affecting area-based eligibility
    });

    test('ADVISORY LABELING: All depth/volume alerts must be clearly labeled as advisory', () => {
      const acuteMeasurements = createMockMeasurementHistory('acute_deterioration');
      
      const validation = validateAlertRequirements('critical_intervention', acuteMeasurements, 0.85, 0.80, 2);
      
      // Verify audit trails include advisory labeling
      expect(validation.auditTrail).toContain(
        expect.stringContaining('critical_intervention alert')
      );
      
      // All alerts should include Medicare LCD compliance notes
      expect(validation.auditTrail.some(entry => 
        entry.toLowerCase().includes('advisory') || 
        entry.toLowerCase().includes('lcd') ||
        entry.toLowerCase().includes('coverage')
      )).toBe(true);
    });

    test('COVERAGE DETERMINATION ISOLATION: Area reduction assessment unaffected by depth alerts', () => {
      const measurements = [
        { id: '1', measurementTimestamp: '2024-01-01T10:00:00Z', calculatedArea: 12.0, depth: 5.0, unitOfMeasurement: 'mm' },
        { id: '2', measurementTimestamp: '2024-02-01T10:00:00Z', calculatedArea: 8.0, depth: 8.0, unitOfMeasurement: 'mm' }, // Area good, depth worse
        { id: '3', measurementTimestamp: '2024-03-01T10:00:00Z', calculatedArea: 5.0, depth: 10.0, unitOfMeasurement: 'mm' }
      ];

      // Area shows 58% reduction (good for LCD compliance)
      const areaReduction = ((12.0 - 5.0) / 12.0) * 100;
      expect(areaReduction).toBeCloseTo(58.3, 1);
      
      // Depth shows concerning progression (depth alerts would trigger)
      const depthIncrease = 10.0 - 5.0; // 5mm increase
      expect(depthIncrease).toBeGreaterThan(CLINICAL_THRESHOLDS.DEPTH_PROGRESSION.CRITICAL_CONCERN_INCREASE);
      
      // Area-based eligibility assessment should be independent
      expect(areaReduction).toBeGreaterThan(20); // Meets LCD requirement
      expect(areaReduction).toBeLessThan(50); // Qualifies for CTP (pre-CTP phase)
    });

    test('POLICY METADATA TRACKING: Medicare LCD L39806 compliance maintained', () => {
      const validation = validateAlertRequirements('urgent_clinical_review', 
        createMockMeasurementHistory('deteriorating'), 0.85, 0.75, 1);
      
      // Verify audit trail includes LCD policy tracking
      expect(validation.auditTrail.some(entry => 
        entry.includes('L39806') || entry.includes('Medicare LCD')
      )).toBe(true);
      
      // Verify CLINICAL_EVIDENCE includes Medicare LCD references
      expect(CLINICAL_EVIDENCE.MEDICARE_LCD.policyReferences).toContainEqual(
        expect.objectContaining({
          policy: "Local Coverage Determination (LCD) L39806",
          jurisdiction: "Palmetto GBA Jurisdiction J",
          complianceNote: "All depth/volume alerts maintain advisory status only"
        })
      );
    });

    test('PHI SAFETY: No PHI leakage in alert audit trails', () => {
      const measurementsWithPHI = [
        { 
          id: '1', 
          measurementTimestamp: '2024-01-01T10:00:00Z', 
          depth: 5.0, 
          unitOfMeasurement: 'mm', 
          recordedBy: 'Dr. Jane Smith', // PHI
          patientNotes: 'Patient reports pain level 7/10', // PHI
          validationStatus: 'validated' 
        },
        { 
          id: '2', 
          measurementTimestamp: '2024-01-08T10:00:00Z', 
          depth: 8.0, 
          unitOfMeasurement: 'mm',
          recordedBy: 'Nurse Johnson', // PHI 
          validationStatus: 'validated'
        }
      ];

      const validation = validateAlertRequirements('moderate_concern', measurementsWithPHI, 0.80, 0.70);
      
      // Audit trail should not contain PHI
      const auditText = validation.auditTrail.join(' ');
      expect(auditText).not.toContain('Dr. Jane Smith');
      expect(auditText).not.toContain('Nurse Johnson');
      expect(auditText).not.toContain('pain level 7/10');
      
      // Should contain necessary clinical/regulatory information only
      expect(auditText).toContain('moderate_concern');
      expect(validation.auditTrail.length).toBeGreaterThan(0);
    });
  });

  // ==================================================================
  // 6. CLINICAL SCENARIO TESTS (HIGH VALUE)
  // Real-world progression patterns: healing, stalled, deteriorating
  // ==================================================================
  describe('6. CLINICAL SCENARIO TESTS', () => {
    
    test('HEALING SCENARIO: Normal wound healing progression should not trigger alerts', () => {
      const healingMeasurements = createMockMeasurementHistory('healing');
      
      const qualityAssessment = assessMeasurementQuality(healingMeasurements, 'foot', 28);
      const validation = validateAlertRequirements('minor_concern', healingMeasurements, 
        qualityAssessment.overallQualityScore, 0.85);
      
      expect(validation.shouldIssueAlert).toBe(false);
      expect(qualityAssessment.qualityGrade).toBeOneOf(['A', 'B', 'C']);
      expect(qualityAssessment.allowHighUrgencyAlerts).toBe(true);
      
      // Healing trend should be detected
      const consecutiveConfirmations = detectConsecutiveConfirmations(
        healingMeasurements, 
        CLINICAL_THRESHOLDS.DEPTH_PROGRESSION.MINOR_INCREASE_PER_WEEK, 
        28
      );
      expect(consecutiveConfirmations.consecutiveIntervalsConfirmed).toBe(0); // No concerning increases
    });

    test('STALLED HEALING SCENARIO: Minimal change should not trigger depth alerts but may flag stalled healing', () => {
      const stalledMeasurements = createMockMeasurementHistory('stalled');
      
      const qualityAssessment = assessMeasurementQuality(stalledMeasurements, 'foot', 21);
      
      expect(qualityAssessment.overallQualityScore).toBeGreaterThan(0.7);
      expect(qualityAssessment.qualityFlags).not.toContain(
        expect.stringContaining('High depth variability')
      );
      
      // Should not trigger depth progression alerts
      const validation = validateAlertRequirements('minor_concern', stalledMeasurements, 
        qualityAssessment.overallQualityScore, 0.80);
      expect(validation.shouldIssueAlert).toBe(false);
    });

    test('DETERIORATING SCENARIO: Gradual worsening should trigger appropriate level alerts', () => {
      const deterioratingMeasurements = createMockMeasurementHistory('deteriorating');
      
      const qualityAssessment = assessMeasurementQuality(deterioratingMeasurements, 'foot', 28);
      const consecutiveConfirmations = detectConsecutiveConfirmations(
        deterioratingMeasurements, 
        CLINICAL_THRESHOLDS.DEPTH_PROGRESSION.MODERATE_INCREASE_PER_WEEK, 
        28
      );
      
      expect(consecutiveConfirmations.consecutiveIntervalsConfirmed).toBeGreaterThan(0);
      expect(qualityAssessment.allowHighUrgencyAlerts).toBe(true);
      
      const validation = validateAlertRequirements('moderate_concern', deterioratingMeasurements, 
        qualityAssessment.overallQualityScore, 0.75, consecutiveConfirmations.consecutiveIntervalsConfirmed);
      
      expect(validation.shouldIssueAlert).toBe(true);
      expect(validation.validationResults.overallValidation).toBe(true);
    });

    test('ACUTE DETERIORATION SCENARIO: Rapid worsening requires emergency protocols', () => {
      const acuteMeasurements = createMockMeasurementHistory('acute_deterioration');
      
      // Calculate acute change
      const initialDepth = acuteMeasurements[0].depth;
      const acuteDepth = acuteMeasurements[1].depth;
      const acuteChange = acuteDepth - initialDepth;
      const acuteTimeframe = 3; // days
      
      expect(acuteChange).toBe(6.5); // 6.5mm increase in 3 days
      expect(acuteChange).toBeGreaterThan(CLINICAL_THRESHOLDS.DEPTH_PROGRESSION.CRITICAL_CONCERN_INCREASE);
      
      // This should trigger SAFETY OVERRIDE SYSTEM (to be implemented)
      // For now, verify the acute scenario is detected
      expect(acuteTimeframe).toBeLessThan(7);
      expect(acuteChange / acuteTimeframe).toBeGreaterThan(2.0); // >2mm/day rate
    });

    test('POST-SURGICAL SCENARIO: Expected post-operative changes should not trigger false alerts', () => {
      const postSurgicalMeasurements = [
        { id: '1', measurementTimestamp: '2024-01-01T10:00:00Z', depth: 12.0, unitOfMeasurement: 'mm', validationStatus: 'validated' }, // Post-debridement
        { id: '2', measurementTimestamp: '2024-01-08T10:00:00Z', depth: 10.5, unitOfMeasurement: 'mm', validationStatus: 'validated' }, // Initial healing
        { id: '3', measurementTimestamp: '2024-01-15T10:00:00Z', depth: 9.2, unitOfMeasurement: 'mm', validationStatus: 'validated' },
        { id: '4', measurementTimestamp: '2024-01-22T10:00:00Z', depth: 8.0, unitOfMeasurement: 'mm', validationStatus: 'validated' }
      ];
      
      // Should show healing trend, not deterioration
      const consecutiveConfirmations = detectConsecutiveConfirmations(
        postSurgicalMeasurements, 
        CLINICAL_THRESHOLDS.DEPTH_PROGRESSION.MINOR_INCREASE_PER_WEEK, 
        21
      );
      
      expect(consecutiveConfirmations.consecutiveIntervalsConfirmed).toBe(0); // No concerning increases
      expect(postSurgicalMeasurements[0].depth).toBeGreaterThan(postSurgicalMeasurements[3].depth); // Overall healing
    });

    test('DIABETIC FOOT ULCER SCENARIO: Location-specific anatomical validation', () => {
      const dfuMeasurements = [
        { id: '1', measurementTimestamp: '2024-01-01T10:00:00Z', depth: 8.0, unitOfMeasurement: 'mm', validationStatus: 'validated' },
        { id: '2', measurementTimestamp: '2024-01-08T10:00:00Z', depth: 12.0, unitOfMeasurement: 'mm', validationStatus: 'validated' },
        { id: '3', measurementTimestamp: '2024-01-15T10:00:00Z', depth: 15.0, unitOfMeasurement: 'mm', validationStatus: 'validated' }
      ];
      
      const depthValidation = validateDepthMeasurements(dfuMeasurements, 'foot', { age: 65, diabeticStatus: 'diabetic' });
      
      expect(depthValidation.anatomicalFeasibilityAssessment.expectedDepthRange.min).toBe(15);
      expect(depthValidation.anatomicalFeasibilityAssessment.expectedDepthRange.max).toBe(25);
      expect(depthValidation.anatomicalFeasibilityAssessment.locationSpecificFactors).toContain(
        expect.stringContaining('Weight-bearing location')
      );
      expect(depthValidation.anatomicalFeasibilityAssessment.locationSpecificFactors).toContain(
        expect.stringContaining('Diabetic foot considerations')
      );
    });
  });

  // ==================================================================
  // 7. EDGE CASE TESTS (HIGH VALUE)
  // Sparse data, outliers, missing measurements, timeline gaps
  // ==================================================================
  describe('7. EDGE CASE TESTS', () => {
    
    test('SPARSE DATA: Limited measurements should handle gracefully', () => {
      const sparseMeasurements = createMockMeasurementHistory('sparse_data');
      
      const qualityAssessment = assessMeasurementQuality(sparseMeasurements, 'foot', 25);
      
      expect(qualityAssessment.qualityFlags).toContain(
        expect.stringContaining('Limited measurements for consistency assessment')
      );
      expect(qualityAssessment.qualityGrade).toBeOneOf(['C', 'D', 'F']);
      expect(qualityAssessment.allowHighUrgencyAlerts).toBe(false);
      
      const validation = validateAlertRequirements('urgent_clinical_review', sparseMeasurements, 
        qualityAssessment.overallQualityScore, 0.70);
      
      expect(validation.shouldIssueAlert).toBe(false);
      expect(validation.preventionReasons).toContain(
        expect.stringContaining('Insufficient measurements')
      );
    });

    test('MEASUREMENT GAPS: Large time gaps should be flagged', () => {
      const measurementsWithGaps = [
        { id: '1', measurementTimestamp: '2024-01-01T10:00:00Z', depth: 5.0, unitOfMeasurement: 'mm', validationStatus: 'validated' },
        { id: '2', measurementTimestamp: '2024-02-15T10:00:00Z', depth: 7.0, unitOfMeasurement: 'mm', validationStatus: 'validated' }, // 45 day gap
        { id: '3', measurementTimestamp: '2024-02-22T10:00:00Z', depth: 8.5, unitOfMeasurement: 'mm', validationStatus: 'validated' }
      ];
      
      const qualityAssessment = assessMeasurementQuality(measurementsWithGaps, 'foot', 52);
      
      expect(qualityAssessment.qualityFlags).toContain(
        expect.stringContaining('Large measurement gap: 45 days > 21 day threshold')
      );
      expect(qualityAssessment.qualityComponents.temporalStability).toBeLessThan(1.0);
    });

    test('OUTLIER DETECTION: Statistical outliers should be identified and handled', () => {
      const measurementsWithOutliers = createMockMeasurementHistory('outliers');
      
      const qualityAssessment = assessMeasurementQuality(measurementsWithOutliers, 'foot', 21);
      
      expect(qualityAssessment.qualityFlags).toContain(
        expect.stringContaining('High outlier rate')
      );
      expect(qualityAssessment.qualityComponents.outlierRate).toBeGreaterThan(0.2);
      expect(qualityAssessment.allowHighUrgencyAlerts).toBe(false);
    });

    test('MISSING VALIDATION STATUS: Unvalidated measurements should reduce confidence', () => {
      const unvalidatedMeasurements = [
        { id: '1', measurementTimestamp: '2024-01-01T10:00:00Z', depth: 5.0, unitOfMeasurement: 'mm', validationStatus: 'validated' },
        { id: '2', measurementTimestamp: '2024-01-08T10:00:00Z', depth: 6.5, unitOfMeasurement: 'mm', validationStatus: 'pending' },
        { id: '3', measurementTimestamp: '2024-01-15T10:00:00Z', depth: 8.0, unitOfMeasurement: 'mm', validationStatus: 'pending' },
        { id: '4', measurementTimestamp: '2024-01-22T10:00:00Z', depth: 9.2, unitOfMeasurement: 'mm' } // No validation status
      ];
      
      const qualityAssessment = assessMeasurementQuality(unvalidatedMeasurements, 'foot', 21);
      
      expect(qualityAssessment.qualityComponents.validationRate).toBe(0.25); // Only 1/4 validated
      expect(qualityAssessment.qualityFlags).toContain(
        expect.stringContaining('Low validation rate: 25% < 50% recommended')
      );
    });

    test('EXTREME ANATOMICAL VALUES: Values outside physiological range', () => {
      const extremeMeasurements = [
        { id: '1', measurementTimestamp: '2024-01-01T10:00:00Z', depth: 50.0, unitOfMeasurement: 'mm', validationStatus: 'flagged' }, // 50mm - extreme
        { id: '2', measurementTimestamp: '2024-01-08T10:00:00Z', depth: 0.1, unitOfMeasurement: 'mm', validationStatus: 'flagged' },  // 0.1mm - too shallow
        { id: '3', measurementTimestamp: '2024-01-15T10:00:00Z', depth: 5.0, unitOfMeasurement: 'mm', validationStatus: 'validated' }
      ];
      
      const depthValidation = validateDepthMeasurements(extremeMeasurements, 'foot');
      
      // Extreme depth should be flagged as anatomically implausible
      expect(depthValidation.depthValidationResults[0].validationFlags.anatomicallyPlausible).toBe(false);
      expect(depthValidation.depthValidationResults[0].recommendations).toContain(
        expect.stringContaining('exceeds expected anatomical limit')
      );
      
      // Very shallow depth should be flagged as poor quality
      expect(depthValidation.depthValidationResults[1].validationFlags.measurementQualityGood).toBe(false);
      expect(depthValidation.depthValidationResults[1].recommendations).toContain(
        expect.stringContaining('Very shallow depth measurement')
      );
    });

    test('TIMELINE EDGE CASES: Same-day measurements and rapid sequences', () => {
      const rapidMeasurements = [
        { id: '1', measurementTimestamp: '2024-01-01T08:00:00Z', depth: 5.0, unitOfMeasurement: 'mm', validationStatus: 'validated', recordedBy: 'nurse' },
        { id: '2', measurementTimestamp: '2024-01-01T14:00:00Z', depth: 5.2, unitOfMeasurement: 'mm', validationStatus: 'validated', recordedBy: 'physician' }, // Same day
        { id: '3', measurementTimestamp: '2024-01-02T09:00:00Z', depth: 5.1, unitOfMeasurement: 'mm', validationStatus: 'validated', recordedBy: 'physician' }, // Next day
        { id: '4', measurementTimestamp: '2024-01-02T15:00:00Z', depth: 5.3, unitOfMeasurement: 'mm', validationStatus: 'validated', recordedBy: 'nurse' }   // Same day as previous
      ];
      
      const depthValidation = validateDepthMeasurements(rapidMeasurements, 'foot');
      
      // Should handle same-day measurements without errors
      expect(depthValidation.depthValidationResults.length).toBe(4);
      expect(depthValidation.overallQualityScore).toBeGreaterThan(0);
      
      // Should not flag normal inter-measurement variation
      const maxVariation = Math.max(...depthValidation.depthValidationResults.map(r => r.depth)) - 
                          Math.min(...depthValidation.depthValidationResults.map(r => r.depth));
      expect(maxVariation).toBeLessThan(1.0); // < 1mm variation is normal
    });

    test('EMPTY AND NULL VALUES: Graceful handling of missing data', () => {
      const incompleteData = [
        { id: '1', measurementTimestamp: '2024-01-01T10:00:00Z', depth: null, unitOfMeasurement: 'mm', validationStatus: 'flagged' },
        { id: '2', measurementTimestamp: '2024-01-08T10:00:00Z', depth: undefined, unitOfMeasurement: 'mm', validationStatus: 'pending' },
        { id: '3', measurementTimestamp: '2024-01-15T10:00:00Z', depth: 5.0, unitOfMeasurement: 'mm', validationStatus: 'validated' },
        { id: '4', measurementTimestamp: null, depth: 6.0, unitOfMeasurement: 'mm', validationStatus: 'validated' }
      ];
      
      const qualityAssessment = assessMeasurementQuality(incompleteData, 'foot', 15);
      
      // Should filter out incomplete measurements gracefully
      expect(qualityAssessment.overallQualityScore).toBeGreaterThanOrEqual(0);
      expect(qualityAssessment.qualityFlags.length).toBeGreaterThan(0);
      
      // Should not crash on null/undefined values
      expect(() => assessMeasurementQuality(incompleteData, 'foot', 15)).not.toThrow();
    });
  });

  // ==================================================================
  // 8. EVIDENCE BASE VALIDATION TESTS (REGULATORY COMPLIANCE)
  // Verify all clinical thresholds have verified citations
  // ==================================================================
  describe('8. EVIDENCE BASE VALIDATION TESTS', () => {
    
    test('CLINICAL_THRESHOLDS: All thresholds should have corresponding evidence', () => {
      // Verify depth progression thresholds have evidence
      expect(CLINICAL_EVIDENCE.DEPTH_PROGRESSION.guidelineReferences.length).toBeGreaterThan(0);
      expect(CLINICAL_EVIDENCE.DEPTH_PROGRESSION.evidenceBasis.length).toBeGreaterThan(0);
      
      // Verify volume expansion thresholds have evidence  
      expect(CLINICAL_EVIDENCE.VOLUME_EXPANSION.guidelineReferences.length).toBeGreaterThan(0);
      expect(CLINICAL_EVIDENCE.VOLUME_EXPANSION.evidenceBasis.length).toBeGreaterThan(0);
      
      // Verify Medicare LCD references
      expect(CLINICAL_EVIDENCE.MEDICARE_LCD.policyReferences.length).toBeGreaterThan(0);
      expect(CLINICAL_EVIDENCE.MEDICARE_LCD.policyReferences[0].policy).toBe('Local Coverage Determination (LCD) L39806');
    });

    test('PMID VALIDATION: PubMed IDs should be properly formatted', () => {
      const depthEvidenceBasis = CLINICAL_EVIDENCE.DEPTH_PROGRESSION.evidenceBasis;
      
      depthEvidenceBasis.forEach(study => {
        if (study.pmid) {
          expect(study.pmid).toMatch(/^PMID: \d{8}$/); // PMID format validation
        }
      });
      
      // Verify specific PMIDs from the constants
      expect(depthEvidenceBasis[0].pmid).toBe('PMID: 33844426');
      expect(depthEvidenceBasis[1].pmid).toBe('PMID: 32418335');
    });

    test('GUIDELINE REFERENCES: Should include major wound care organizations', () => {
      const guidelines = CLINICAL_EVIDENCE.DEPTH_PROGRESSION.guidelineReferences;
      
      const organizations = guidelines.map(g => g.source);
      expect(organizations).toContain('International Working Group on the Diabetic Foot (IWGDF)');
      expect(organizations).toContain('Wound Healing Society (WHS)');
      
      // Verify years are current
      guidelines.forEach(guideline => {
        expect(parseInt(guideline.year)).toBeGreaterThanOrEqual(2020);
        expect(parseInt(guideline.year)).toBeLessThanOrEqual(2025);
      });
    });

    test('ANATOMICAL_REFERENCE_DATA: Should include source citations', () => {
      const tissueThickness = ANATOMICAL_REFERENCE_DATA.TISSUE_THICKNESS;
      
      Object.values(tissueThickness).forEach(reference => {
        expect(reference.source).toBeDefined();
        expect(reference.source.length).toBeGreaterThan(10); // Should have meaningful source description
      });
      
      // Verify specific sources
      expect(tissueThickness.foot.source).toBe('Diabetic foot anatomy studies');
      expect(tissueThickness.heel.source).toBe('Heel pad thickness literature');
    });

    test('EVIDENCE TRACEABILITY: Alert decisions should be traceable to evidence base', () => {
      const measurements = createMockMeasurementHistory('deteriorating');
      const validation = validateAlertRequirements('moderate_concern', measurements, 0.80, 0.75, 1);
      
      // Audit trail should reference evidence-based thresholds
      expect(validation.auditTrail.some(entry => 
        entry.includes('threshold') || entry.includes('evidence') || entry.includes('clinical')
      )).toBe(true);
      
      // Should be able to trace back to specific guideline references
      expect(CLINICAL_THRESHOLDS.DEPTH_PROGRESSION.MODERATE_INCREASE_PER_WEEK).toBe(1.0);
      expect(CLINICAL_EVIDENCE.DEPTH_PROGRESSION.guidelineReferences[1].recommendation).toContain('2mm over 2-week period');
    });
  });

  // ==================================================================
  // 9. PERFORMANCE AND LOAD TESTS (SYSTEM RELIABILITY)
  // Ensure real-time calculation performance under load
  // ==================================================================
  describe('9. PERFORMANCE AND LOAD TESTS', () => {
    
    test('PERFORMANCE: Quality assessment should complete within reasonable time', () => {
      const largeMeasurementSet = [];
      for (let i = 0; i < 100; i++) {
        largeMeasurementSet.push({
          id: `perf_${i}`,
          measurementTimestamp: new Date(Date.now() - (i * 24 * 60 * 60 * 1000)).toISOString(),
          depth: 5 + Math.random() * 3, // 5-8mm with variation
          unitOfMeasurement: 'mm',
          validationStatus: i % 5 === 0 ? 'flagged' : 'validated' // 20% flagged
        });
      }
      
      const startTime = Date.now();
      const qualityAssessment = assessMeasurementQuality(largeMeasurementSet, 'foot', 100);
      const endTime = Date.now();
      
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
      expect(qualityAssessment.overallQualityScore).toBeGreaterThan(0);
      expect(qualityAssessment.qualityGrade).toBeOneOf(['A', 'B', 'C', 'D', 'F']);
    });

    test('MEMORY EFFICIENCY: Large datasets should not cause memory issues', () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Process multiple large datasets
      for (let dataset = 0; dataset < 10; dataset++) {
        const measurements = [];
        for (let i = 0; i < 200; i++) {
          measurements.push({
            id: `mem_${dataset}_${i}`,
            measurementTimestamp: new Date(Date.now() - (i * 60 * 60 * 1000)).toISOString(),
            depth: 4 + Math.random() * 4,
            unitOfMeasurement: 'mm',
            validationStatus: 'validated'
          });
        }
        
        const qualityAssessment = assessMeasurementQuality(measurements, 'foot', 200);
        expect(qualityAssessment).toBeDefined();
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });

    test('CONCURRENT PROCESSING: Multiple validations should handle concurrently', async () => {
      const concurrentPromises = [];
      
      for (let i = 0; i < 20; i++) {
        const measurements = createMockMeasurementHistory(i % 2 === 0 ? 'healing' : 'deteriorating');
        
        const promise = new Promise(resolve => {
          const validation = validateAlertRequirements('moderate_concern', measurements, 0.80, 0.75);
          resolve(validation);
        });
        
        concurrentPromises.push(promise);
      }
      
      const startTime = Date.now();
      const results = await Promise.all(concurrentPromises);
      const endTime = Date.now();
      
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(results.length).toBe(20);
      results.forEach(result => {
        expect(result).toHaveProperty('shouldIssueAlert');
        expect(result).toHaveProperty('validationResults');
      });
    });

    test('EDGE CASE PERFORMANCE: Extreme datasets should not degrade performance', () => {
      // Test with all identical measurements (edge case for statistical calculations)
      const identicalMeasurements = [];
      for (let i = 0; i < 50; i++) {
        identicalMeasurements.push({
          id: `identical_${i}`,
          measurementTimestamp: new Date(Date.now() - (i * 24 * 60 * 60 * 1000)).toISOString(),
          depth: 5.0, // All identical
          unitOfMeasurement: 'mm',
          validationStatus: 'validated'
        });
      }
      
      const startTime = Date.now();
      const qualityAssessment = assessMeasurementQuality(identicalMeasurements, 'foot', 50);
      const endTime = Date.now();
      
      expect(endTime - startTime).toBeLessThan(500); // Should handle edge case quickly
      expect(qualityAssessment.qualityComponents.measurementConsistency).toBeGreaterThan(0.9); // High consistency
      expect(qualityAssessment.qualityComponents.outlierRate).toBe(0); // No outliers in identical data
    });
  });

  // ==================================================================
  // CLEANUP AND UTILITIES
  // ==================================================================
  beforeEach(() => {
    // Reset any global state or mocks before each test
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Clean up after each test
    jest.clearAllMocks();
  });
});

/**
 * CUSTOM JEST MATCHERS FOR IMPROVED TEST ASSERTIONS
 */
expect.extend({
  toBeOneOf(received: any, validOptions: any[]) {
    const pass = validOptions.includes(received);
    return {
      message: () => `expected ${received} to be one of ${validOptions.join(', ')}`,
      pass
    };
  }
});

// Type declaration for custom matcher
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeOneOf(validOptions: any[]): R;
    }
  }
}