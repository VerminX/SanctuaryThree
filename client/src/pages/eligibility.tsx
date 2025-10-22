import { useCallback, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { MAC_REGIONS } from "@/constants/macRegions";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { useEligibilityData } from "@/hooks/useEligibilityData";
import { useUnauthorizedRedirect } from "@/hooks/useUnauthorizedRedirect";
import { EligibilityLayout } from "@/components/eligibility/eligibility-layout";
import { NoTenantCard } from "@/components/eligibility/no-tenant-card";
import { InvalidTenantCard } from "@/components/eligibility/invalid-tenant-card";
import { StatsGrid } from "@/components/eligibility/stats-grid";
import { BulkDataErrorCard } from "@/components/eligibility/bulk-data-error-card";
import { AnalysisSection } from "@/components/eligibility/analysis-section";
import { RecentAnalysesCard } from "@/components/eligibility/recent-analyses-card";
import { AiInfoCard } from "@/components/eligibility/ai-info-card";

export default function Eligibility() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const redirectToLogin = useUnauthorizedRedirect();
  const { isLoading, isAuthenticated, currentTenant, tenantId, isValidTenant } = useProtectedPage();
  const [analysisResult, setAnalysisResult] = useState<unknown>(null);

  const { encounters, episodes, checksLoading, bulkDataLoading, bulkDataError, retryBulkData, stats } =
    useEligibilityData(tenantId, Boolean(tenantId) && isValidTenant);

  const analyzeEncounterMutation = useMutation({
    mutationFn: async ({ encounterId, macRegion }: { encounterId: string; macRegion: string }) => {
      const response = await apiRequest("POST", `/api/encounters/${encounterId}/analyze-eligibility`, { macRegion });
      return await response.json();
    },
    onSuccess: (data) => {
      setAnalysisResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/recent-eligibility-checks"] });
      toast({
        title: "Analysis Complete",
        description: "Single encounter eligibility analysis completed successfully",
      });
    },
    onError: (error) => {
      if (error instanceof Error && isUnauthorizedError(error)) {
        redirectToLogin();
        return;
      }

      toast({
        title: "Analysis Failed",
        description: "Failed to analyze encounter eligibility. Please try again.",
        variant: "destructive",
      });
    },
  });

  const analyzeEpisodeMutation = useMutation({
    mutationFn: async ({ episodeId, macRegion }: { episodeId: string; macRegion: string }) => {
      const response = await apiRequest("POST", `/api/episodes/${episodeId}/analyze-eligibility`, { macRegion });
      return await response.json();
    },
    onSuccess: (data) => {
      setAnalysisResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/recent-eligibility-checks"] });
      toast({
        title: "Analysis Complete",
        description: "Episode eligibility analysis with full patient history completed successfully",
      });
    },
    onError: (error) => {
      if (error instanceof Error && isUnauthorizedError(error)) {
        redirectToLogin();
        return;
      }

      toast({
        title: "Analysis Failed",
        description: "Failed to analyze episode eligibility. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleAnalyze = useCallback(
    async ({ mode, id, macRegion }: { mode: "episode" | "encounter"; id: string; macRegion: string }) => {
      if (mode === "episode") {
        await analyzeEpisodeMutation.mutateAsync({ episodeId: id, macRegion });
      } else {
        await analyzeEncounterMutation.mutateAsync({ encounterId: id, macRegion });
      }
    },
    [analyzeEncounterMutation, analyzeEpisodeMutation],
  );

  const handleRetryBulkData = useCallback(() => {
    toast({
      title: "Refreshing Data",
      description: "Retrying to load patient data...",
    });
    retryBulkData();
  }, [retryBulkData, toast]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!currentTenant) {
    return (
      <EligibilityLayout dataTestId="page-eligibility-no-tenant">
        <NoTenantCard />
      </EligibilityLayout>
    );
  }

  if (!isValidTenant) {
    // eslint-disable-next-line no-console
    console.error("Invalid tenant ID:", tenantId);
    return (
      <EligibilityLayout dataTestId="page-eligibility-invalid-tenant">
        <InvalidTenantCard />
      </EligibilityLayout>
    );
  }

  return (
    <EligibilityLayout dataTestId="page-eligibility">
      <StatsGrid
        totalAnalyses={stats.totalAnalyses}
        eligible={stats.eligible}
        notEligible={stats.notEligible}
        unclear={stats.unclear}
        isLoading={checksLoading}
      />

      {bulkDataError && <BulkDataErrorCard onRetry={handleRetryBulkData} />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AnalysisSection
          isLoading={bulkDataLoading}
          encounters={encounters}
          episodes={episodes}
          macRegions={MAC_REGIONS}
          onAnalyze={handleAnalyze}
          result={analysisResult}
          isAnalyzing={analyzeEncounterMutation.isPending || analyzeEpisodeMutation.isPending}
        />

        <RecentAnalysesCard analyses={stats.safeRecentChecks} isLoading={checksLoading} />
      </div>

      <AiInfoCard />
    </EligibilityLayout>
  );
}
