import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import AnalysisPanel from "@/components/eligibility/analysis-panel";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SearchCheck, Brain, CheckCircle, AlertTriangle, XCircle } from "lucide-react";

const MAC_REGIONS = [
  "Noridian Healthcare Solutions (MAC J-E)",
  "CGS Administrators (MAC J-H)",
  "Novitas Solutions (MAC J-L)",
  "First Coast Service Options (MAC J-N)",
  "Palmetto GBA (MAC J-J)",
  "Wisconsin Physicians Service (MAC J-5)",
];

export default function Eligibility() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading, user } = useAuth();
  const queryClient = useQueryClient();
  const [analysisResult, setAnalysisResult] = useState<any>(null);

  // Redirect to home if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast]);

  const currentTenant = user?.tenants?.[0];
  
  // Validate tenant ID format
  const tenantId = currentTenant?.id;
  const isValidTenant = tenantId && typeof tenantId === 'string' && tenantId.length >= 10;

  // OPTIMIZED: Use bulk endpoints instead of N+1 queries with proper array-segmented query keys
  // Get all encounters with patient information in a single API call
  const { data: encounters, isLoading: encountersLoading, error: encountersError } = useQuery<Array<{
    id: string;
    patientId: string;
    patientName: string;
    woundType: string;
    date: string;
    notes: string[];
    woundDetails?: any;
    conservativeCare?: any;
    infectionStatus?: string;
    comorbidities?: any;
    attachmentMetadata?: any;
    episodeId?: string;
    createdAt?: Date;
    updatedAt?: Date;
  }>>({
    queryKey: ["/api/encounters-with-patients", tenantId],
    enabled: isValidTenant,
    retry: false,
  });

  // Get all episodes with patient information and encounter counts in a single API call
  const { data: episodes, isLoading: episodesLoading, error: episodesError } = useQuery<Array<{
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
  }>>({
    queryKey: ["/api/episodes-with-patients", tenantId],
    enabled: isValidTenant,
    retry: false,
  });

  // Get recent eligibility checks with tenant scoping
  const { data: recentChecks, isLoading: checksLoading } = useQuery({
    queryKey: ["/api/recent-eligibility-checks", tenantId],
    enabled: isValidTenant,
    retry: false,
  });

  // Single encounter analysis mutation
  const analyzeEligibilityMutation = useMutation({
    mutationFn: async ({ encounterId, macRegion }: { encounterId: string; macRegion: string }) => {
      const response = await apiRequest("POST", `/api/encounters/${encounterId}/analyze-eligibility`, {
        macRegion,
      });
      return await response.json();
    },
    onSuccess: (data) => {
      setAnalysisResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/recent-eligibility-checks", tenantId] });
      toast({
        title: "Analysis Complete",
        description: "Single encounter eligibility analysis completed successfully",
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Analysis Failed",
        description: "Failed to analyze encounter eligibility. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Episode analysis mutation with full patient history (NEW DEFAULT)
  const analyzeEpisodeEligibilityMutation = useMutation({
    mutationFn: async ({ episodeId, macRegion }: { episodeId: string; macRegion: string }) => {
      const response = await apiRequest("POST", `/api/episodes/${episodeId}/analyze-eligibility`, {
        macRegion,
      });
      return await response.json();
    },
    onSuccess: (data) => {
      setAnalysisResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/recent-eligibility-checks", tenantId] });
      toast({
        title: "Analysis Complete",
        description: "Episode eligibility analysis with full patient history completed successfully",
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Analysis Failed",
        description: "Failed to analyze episode eligibility. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Handle auth loading
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

  // Handle no tenant case
  if (!currentTenant) {
    return (
      <div className="min-h-screen flex bg-background" data-testid="page-eligibility-no-tenant">
        <Sidebar />
        
        <main className="flex-1">
          <Header title="Eligibility Analysis" subtitle="AI-powered Medicare LCD policy checking and coverage determination" />
          
          <div className="p-6 space-y-6">
            <Card className="bg-muted/30 border-muted" data-testid="card-no-tenant">
              <CardContent className="p-8 text-center">
                <AlertTriangle className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">No Tenant Access</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  You don't have access to any tenant organizations. Please contact your administrator to get access to a tenant.
                </p>
                <p className="text-xs text-muted-foreground">
                  Tenant access is required to view patient data and perform eligibility analyses.
                </p>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    );
  }

  // Handle invalid tenant ID
  if (!isValidTenant) {
    console.error('Invalid tenant ID:', tenantId);
    return (
      <div className="min-h-screen flex bg-background" data-testid="page-eligibility-invalid-tenant">
        <Sidebar />
        
        <main className="flex-1">
          <Header title="Eligibility Analysis" subtitle="AI-powered Medicare LCD policy checking and coverage determination" />
          
          <div className="p-6 space-y-6">
            <Card className="bg-destructive/5 border-destructive/20" data-testid="card-invalid-tenant">
              <CardContent className="p-8 text-center">
                <AlertTriangle className="mx-auto h-12 w-12 text-destructive/70 mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">Invalid Tenant Configuration</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  There's an issue with your tenant configuration. Please contact support.
                </p>
                <p className="text-xs text-muted-foreground">
                  Error: Invalid tenant ID format
                </p>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    );
  }

  // Combined loading state for bulk queries
  const bulkDataLoading = encountersLoading || episodesLoading;

  // Error handling for bulk queries
  const bulkDataError = encountersError || episodesError;
  
  // Retry function for bulk queries with proper array-segmented keys
  const retryBulkData = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/encounters-with-patients", tenantId] });
    queryClient.invalidateQueries({ queryKey: ["/api/episodes-with-patients", tenantId] });
    queryClient.invalidateQueries({ queryKey: ["/api/recent-eligibility-checks", tenantId] });
    toast({
      title: "Refreshing Data",
      description: "Retrying to load patient data...",
    });
  };

  const handleAnalyze = async (params: { mode: 'episode' | 'encounter'; id: string; macRegion: string }) => {
    const { mode, id, macRegion } = params;
    
    if (mode === 'episode') {
      await analyzeEpisodeEligibilityMutation.mutateAsync({ episodeId: id, macRegion });
    } else {
      await analyzeEligibilityMutation.mutateAsync({ encounterId: id, macRegion });
    }
  };

  // Calculate stats
  const safeRecentChecks = Array.isArray(recentChecks) ? recentChecks : [];
  const totalAnalyses = safeRecentChecks.length;
  const eligible = safeRecentChecks.filter((check: any) => check.result?.eligibility === 'Yes').length;
  const notEligible = safeRecentChecks.filter((check: any) => check.result?.eligibility === 'No').length;
  const unclear = safeRecentChecks.filter((check: any) => check.result?.eligibility === 'Unclear').length;

  return (
    <div className="min-h-screen flex bg-background" data-testid="page-eligibility">
      <Sidebar />
      
      <main className="flex-1">
        <Header title="Eligibility Analysis" subtitle="AI-powered Medicare LCD policy checking and coverage determination" />
        
        <div className="p-6 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card data-testid="card-total-analyses">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Analyses</p>
                    <p className="text-3xl font-bold text-foreground">
                      {checksLoading ? "--" : totalAnalyses}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Brain className="text-primary text-xl" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-eligible">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Eligible</p>
                    <p className="text-3xl font-bold text-foreground">
                      {checksLoading ? "--" : eligible}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-chart-2/10 rounded-lg flex items-center justify-center">
                    <CheckCircle className="text-chart-2 text-xl" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-not-eligible">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Not Eligible</p>
                    <p className="text-3xl font-bold text-foreground">
                      {checksLoading ? "--" : notEligible}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-destructive/10 rounded-lg flex items-center justify-center">
                    <XCircle className="text-destructive text-xl" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-unclear">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Unclear</p>
                    <p className="text-3xl font-bold text-foreground">
                      {checksLoading ? "--" : unclear}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-chart-3/10 rounded-lg flex items-center justify-center">
                    <AlertTriangle className="text-chart-3 text-xl" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Error State for Bulk Data */}
          {bulkDataError && (
            <Card className="bg-destructive/5 border-destructive/20" data-testid="card-bulk-data-error">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <AlertTriangle className="w-5 h-5 text-destructive" />
                    <div>
                      <h3 className="text-sm font-medium text-foreground">Failed to Load Patient Data</h3>
                      <p className="text-xs text-muted-foreground">
                        Unable to load encounters and episodes. This may affect dropdown performance.
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={retryBulkData}
                    variant="outline"
                    size="sm"
                    className="border-destructive/20 hover:bg-destructive/10"
                    data-testid="button-retry-bulk-data"
                  >
                    Retry
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Main Analysis Panel */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {bulkDataLoading ? (
              <Card data-testid="card-analysis-loading">
                <div className="p-6 border-b border-border">
                  <div className="animate-pulse">
                    <div className="h-6 bg-muted rounded w-1/3 mb-2"></div>
                    <div className="h-4 bg-muted rounded w-2/3"></div>
                  </div>
                </div>
                <CardContent className="p-6">
                  <div className="space-y-4">
                    <div className="animate-pulse">
                      <div className="h-4 bg-muted rounded w-1/4 mb-2"></div>
                      <div className="h-10 bg-muted rounded w-full"></div>
                    </div>
                    <div className="animate-pulse">
                      <div className="h-4 bg-muted rounded w-1/4 mb-2"></div>
                      <div className="h-10 bg-muted rounded w-full"></div>
                    </div>
                    <div className="animate-pulse">
                      <div className="h-4 bg-muted rounded w-1/4 mb-2"></div>
                      <div className="h-10 bg-muted rounded w-full"></div>
                    </div>
                    <div className="animate-pulse">
                      <div className="h-10 bg-muted rounded w-32"></div>
                    </div>
                  </div>
                  <div className="mt-6 text-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto mb-2"></div>
                    <p className="text-sm text-muted-foreground">Loading patient data for dropdown optimization...</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <AnalysisPanel
                encounters={encounters ?? []}
                episodes={episodes ?? []}
                macRegions={MAC_REGIONS}
                onAnalyze={handleAnalyze}
                result={analysisResult?.result}
                isLoading={analyzeEligibilityMutation.isPending || analyzeEpisodeEligibilityMutation.isPending}
              />
            )}

            {/* Recent Analyses */}
            <Card data-testid="card-recent-analyses">
              <div className="p-6 border-b border-border">
                <h3 className="text-lg font-semibold text-foreground">Recent Analyses</h3>
                <p className="text-sm text-muted-foreground">Latest eligibility determinations</p>
              </div>
              <CardContent className="p-6">
                {checksLoading ? (
                  <div className="space-y-4">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="animate-pulse">
                        <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                        <div className="h-3 bg-muted rounded w-1/2"></div>
                      </div>
                    ))}
                  </div>
                ) : safeRecentChecks.length > 0 ? (
                  <div className="space-y-4">
                    {safeRecentChecks.slice(0, 5).map((check: any, index: number) => (
                      <div key={index} className="flex items-start space-x-3 p-3 border border-border rounded-lg">
                        <div className="flex-shrink-0">
                          {check.result?.eligibility === 'Yes' && <CheckCircle className="w-5 h-5 text-chart-2" />}
                          {check.result?.eligibility === 'No' && <XCircle className="w-5 h-5 text-destructive" />}
                          {check.result?.eligibility === 'Unclear' && <AlertTriangle className="w-5 h-5 text-chart-3" />}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-foreground">
                            Patient Analysis - {check.result?.eligibility}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(check.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <SearchCheck className="mx-auto h-12 w-12 text-muted-foreground/50" />
                    <h3 className="mt-2 text-sm font-medium text-foreground">No analyses yet</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Run your first eligibility analysis to get started.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* AI Information Panel */}
          <Card data-testid="card-ai-info">
            <div className="p-6 border-b border-border">
              <div className="flex items-center space-x-2">
                <Brain className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-semibold text-foreground">AI-Powered Analysis</h3>
              </div>
            </div>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium text-foreground mb-2">How It Works</h4>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li>• Analyzes encounter notes against Medicare LCD policies</li>
                    <li>• Retrieves relevant MAC documentation using RAG technology</li>
                    <li>• Checks conservative care requirements and wound criteria</li>
                    <li>• Provides actionable documentation gap analysis</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium text-foreground mb-2">Model Information</h4>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li>• <strong>Model:</strong> OpenAI GPT-5</li>
                    <li>• <strong>Compliance:</strong> HIPAA-eligible configuration</li>
                    <li>• <strong>Data Logging:</strong> Disabled for PHI protection</li>
                    <li>• <strong>Citations:</strong> Includes source URLs and effective dates</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
