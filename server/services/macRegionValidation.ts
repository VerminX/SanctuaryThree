import { MAC_REGION_CODES, type MacRegionCode } from '@shared/macRegions';

export const VALID_MAC_REGIONS: readonly MacRegionCode[] = MAC_REGION_CODES;

export function validateMACRegion(macRegion: string | null | undefined): { valid: boolean; error?: string } {
  if (!macRegion || !macRegion.trim()) {
    return { valid: false, error: 'MAC region is required' };
  }

  const normalizedRegion = macRegion.trim().toUpperCase();
  if (!VALID_MAC_REGIONS.includes(normalizedRegion as MacRegionCode)) {
    return {
      valid: false,
      error: `Invalid MAC region: ${macRegion}. Must be one of: ${VALID_MAC_REGIONS.join(', ')}`
    };
  }

  return { valid: true };
}
