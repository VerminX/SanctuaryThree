import { storage } from "../../storage";

// Extract MAC code from full MAC region name
// e.g., "CGS Administrators (MAC J-H)" → "JH"
export function extractMACCode(macRegion: string | null | undefined): string | null {
  if (!macRegion) return null;

  // Pattern: "Provider Name (MAC X-Y)" or just "XY"
  const match = macRegion.match(/\(MAC\s+([A-Z]-?[A-Z0-9])\)/i);
  if (match) {
    // Remove hyphen and return uppercase: "J-H" → "JH"
    return match[1].replace('-', '').toUpperCase();
  }

  // If already a short code (2 chars), return as-is
  const trimmed = macRegion.trim().toUpperCase();
  if (trimmed.length <= 3 && /^[A-Z0-9]+$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

// Helper function to split combined vascularAssessment back into separate fields
// PDF extraction combines clinicalVascularAssessment and vascularStudies into a single field,
// but the AI analysis expects them separately
export function splitVascularData(vascularAssessment: any) {
  if (!vascularAssessment) {
    return { vascularStudies: null, clinicalVascularAssessment: null };
  }

  const clinicalFields = {
    edema: vascularAssessment.edema,
    pulses: vascularAssessment.pulses,
    perfusionNotes: vascularAssessment.perfusionNotes,
    varicosities: vascularAssessment.varicosities,
    capillaryRefill: vascularAssessment.capillaryRefill
  };

  const studyFields = {
    abi: vascularAssessment.abi,
    tbi: vascularAssessment.tbi,
    tcpo2: vascularAssessment.tcpo2,
    duplexSummary: vascularAssessment.duplexSummary,
    angiographySummary: vascularAssessment.angiographySummary,
    interpretation: vascularAssessment.interpretation
  };

  // Only return non-empty objects
  const hasClinicalData = Object.values(clinicalFields).some(v => v != null);
  const hasStudyData = Object.values(studyFields).some(v => v != null);

  return {
    clinicalVascularAssessment: hasClinicalData ? clinicalFields : null,
    vascularStudies: hasStudyData ? studyFields : null
  };
}

// Helper function to track user activity (HIPAA-compliant, no PHI in descriptions)
export async function trackActivity(
  tenantId: string,
  userId: string,
  action: string,
  entityType: string,
  entityId: string,
  entityName?: string
): Promise<void> {
  try {
    await storage.createRecentActivity({
      tenantId,
      userId,
      action,
      entityType,
      entityId,
      entityName: entityName || `${entityType} ${entityId.substring(0, 8)}...`
    });
  } catch (error) {
    console.error('Failed to track activity:', error);
    // Don't throw - activity tracking shouldn't break main functionality
  }
}
