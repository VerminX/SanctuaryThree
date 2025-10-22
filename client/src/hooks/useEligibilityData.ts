import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useUnauthorizedRedirect } from "@/hooks/useUnauthorizedRedirect";

interface EncounterSummary {
  id: string;
  patientId: string;
  patientName: string;
  woundType: string;
  date: string;
  notes: string[];
  woundDetails?: unknown;
  conservativeCare?: unknown;
  infectionStatus?: string;
  comorbidities?: unknown;
  attachmentMetadata?: unknown;
  episodeId?: string;
  createdAt?: Date;
  updatedAt?: Date;
  [key: string]: unknown;
}

interface EpisodeSummary {
  id: string;
  patientId: string;
  patientName: string;
  woundType: string;
  woundLocation: string;
  episodeStartDate: string;
  status: string;
  encounterCount: number;
  episodeEndDate?: Date | null;
  primaryDiagnosis?: string | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  [key: string]: unknown;
}

export function useEligibilityData(tenantId: string | null, enabled: boolean) {
  const queryClient = useQueryClient();
  const redirectToLogin = useUnauthorizedRedirect();

  const encountersQuery = useQuery<EncounterSummary[]>({
    queryKey: ["/api/encounters-with-patients", tenantId],
    enabled,
    retry: false,
    onError: (error) => {
      if (error instanceof Error && isUnauthorizedError(error)) {
        redirectToLogin();
      }
    },
  });

  const episodesQuery = useQuery<EpisodeSummary[]>({
    queryKey: ["/api/episodes-with-patients", tenantId],
    enabled,
    retry: false,
    onError: (error) => {
      if (error instanceof Error && isUnauthorizedError(error)) {
        redirectToLogin();
      }
    },
  });

  const recentChecksQuery = useQuery({
    queryKey: ["/api/recent-eligibility-checks"],
    enabled,
    retry: false,
    onError: (error) => {
      if (error instanceof Error && isUnauthorizedError(error)) {
        redirectToLogin();
      }
    },
  });

  const retryBulkData = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/encounters-with-patients", tenantId] });
    queryClient.invalidateQueries({ queryKey: ["/api/episodes-with-patients", tenantId] });
    queryClient.invalidateQueries({ queryKey: ["/api/recent-eligibility-checks"] });
  };

  const stats = useMemo(() => {
    const safeRecentChecks = Array.isArray(recentChecksQuery.data) ? recentChecksQuery.data : [];

    const totalAnalyses = safeRecentChecks.length;
    const eligible = safeRecentChecks.filter((check: any) => check.result?.eligibility === "Yes").length;
    const notEligible = safeRecentChecks.filter((check: any) => check.result?.eligibility === "No").length;
    const unclear = safeRecentChecks.filter((check: any) => check.result?.eligibility === "Unclear").length;

    return {
      safeRecentChecks,
      totalAnalyses,
      eligible,
      notEligible,
      unclear,
    } as const;
  }, [recentChecksQuery.data]);

  const bulkDataLoading = encountersQuery.isLoading || episodesQuery.isLoading;
  const bulkDataError = encountersQuery.error || episodesQuery.error;

  return {
    encounters: (encountersQuery.data ?? []) as EncounterSummary[],
    episodes: (episodesQuery.data ?? []) as EpisodeSummary[],
    checks: recentChecksQuery.data,
    checksLoading: recentChecksQuery.isLoading,
    bulkDataLoading,
    bulkDataError,
    retryBulkData,
    stats,
  } as const;
}
