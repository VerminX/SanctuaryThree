import { describe, expect, it } from '@jest/globals';
import { MAC_REGIONS as SharedMacRegions, MAC_REGION_CODES } from '@shared/macRegions';
import { MAC_REGIONS as ClientMacRegions } from '@/constants/macRegions';

describe('Eligibility page MAC region options', () => {
  it('reuses the shared MAC region configuration', () => {
    expect(ClientMacRegions).toBe(SharedMacRegions);
  });

  it('exposes the same MAC codes as the shared definition', () => {
    const eligibilityCodes = ClientMacRegions.map(region => region.code);
    expect(eligibilityCodes).toEqual(MAC_REGION_CODES);
  });
});
