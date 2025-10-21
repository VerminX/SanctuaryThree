export const MAC_REGIONS = [
  { code: "JE", label: "Noridian Healthcare Solutions (MAC J-E)" },
  { code: "JF", label: "Noridian Healthcare Solutions (MAC J-F)" },
  { code: "JH", label: "CGS Administrators (MAC J-H)" },
  { code: "JJ", label: "Palmetto GBA (MAC J-J)" },
  { code: "JK", label: "National Government Services (MAC J-K)" },
  { code: "JL", label: "Novitas Solutions (MAC J-L)" },
  { code: "JM", label: "Palmetto GBA (MAC J-M)" },
  { code: "JN", label: "First Coast Service Options (MAC J-N)" },
  { code: "J5", label: "Wisconsin Physicians Service (MAC J-5)" },
  { code: "J6", label: "National Government Services (MAC J-6)" },
  { code: "J8", label: "Wisconsin Physicians Service (MAC J-8)" },
] as const;

export type MacRegion = typeof MAC_REGIONS[number];
export type MacRegionCode = MacRegion['code'];

export const MAC_REGION_CODES: readonly MacRegionCode[] = MAC_REGIONS.map(
  region => region.code
) as readonly MacRegionCode[];
