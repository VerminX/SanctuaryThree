import { describe, expect, test, beforeEach, jest } from '@jest/globals';
import { healthMonitor } from '../healthMonitoring';
import { validateDiagnosisCodes } from '../eligibilityValidator';

jest.mock('@shared/config/rules', () => ({
  getProblemICD10Mappings: jest.fn(() => ({})),
}));

describe('eligibility telemetry instrumentation', () => {
  beforeEach(() => {
    healthMonitor.resetEligibilityTelemetry();
  });

  test('records metrics when primary diagnosis cannot be mapped', () => {
    const result = validateDiagnosisCodes('mysterious wound description', []);

    expect(result.isValid).toBe(false);
    expect(result.errorMessages).toHaveLength(1);

    const metrics = healthMonitor.getHealthStatus().eligibility;
    expect(metrics.unmatchedDiagnoses.total).toBe(1);
    expect(metrics.unmatchedDiagnoses.bySource.primary).toBe(1);
    expect(metrics.unmatchedDiagnoses.byFormat.text_description).toBe(1);
    expect(
      Object.values(metrics.unmatchedDiagnoses.descriptionLengthHistogram).reduce((sum, value) => sum + value, 0)
    ).toBe(1);
  });

  test('records metrics for invalid secondary diagnosis format', () => {
    const result = validateDiagnosisCodes('E11.621', ['bad-secondary']);

    expect(result.errorMessages).toContain('Secondary diagnosis 1 (bad-secondary) does not match ICD-10 format');

    const metrics = healthMonitor.getHealthStatus().eligibility;
    expect(metrics.unmatchedDiagnoses.total).toBe(1);
    expect(metrics.unmatchedDiagnoses.bySource.secondary).toBe(1);
    expect(metrics.unmatchedDiagnoses.byFormat.invalid_format).toBe(1);
  });
});
