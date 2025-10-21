import { describe, expect, it } from '@jest/globals';
import { validateMACRegion, VALID_MAC_REGIONS } from '../services/macRegionValidation';
import { MAC_REGION_CODES } from '@shared/macRegions';

describe('validateMACRegion', () => {
  it.each(MAC_REGION_CODES)('accepts MAC code %s from shared list', (code) => {
    const result = validateMACRegion(code);
    expect(result).toEqual({ valid: true });
  });

  it('rejects codes not present in the shared list', () => {
    const invalidCode = 'ZZ';
    const result = validateMACRegion(invalidCode);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid MAC region: ZZ');
    expect(result.error).toContain(VALID_MAC_REGIONS.join(', '));
  });
});
