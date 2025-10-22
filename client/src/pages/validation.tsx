import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  TestTube2, 
  Play, 
  CheckCircle, 
  XCircle, 
  Clock, 
  RefreshCw, 
  Search, 
  Brain, 
  BookOpen,
  AlertTriangle,
  TrendingUp,
  Database
} from "lucide-react";

interface EligibilityTelemetrySummary {
  policyFallbacks: {
    total: number;
    byType: Record<string, number>;
    byMacRegion: Record<string, number>;
    depthHistogram: Record<string, number>;
    consideredHistogram: Record<string, number>;
    lastHour: number;
    last24Hours: number;
  };
  unmatchedDiagnoses: {
    total: number;
    bySource: Record<string, number>;
    byFormat: Record<string, number>;
    descriptionLengthHistogram: Record<string, number>;
    lastHour: number;
    last24Hours: number;
  };
}

interface HealthStatusResponse {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  uptime: number;
  issues: string[];
  metrics: {
    database: Record<string, unknown>;
    encryption: Record<string, unknown>;
    system: {
      uptimeMinutes: number;
      memoryUsageMB: number;
      memoryTotalMB: number;
    };
    eligibility?: EligibilityTelemetrySummary;
  };
}

interface ValidationResult {
  testType: string;
  executedAt: string;
  results?: any[];
  testResults?: {
    policyRetrieval?: {
      totalTests: number;
      successfulTests: number;
      successRate: number;
      totalPoliciesFound: number;
      results: any[];
    };
    aiAnalysis?: {
      totalTests: number;
      successfulTests: number;
      successRate: number;
      averageResponseTime: number;
      results: any[];
    };
    citationValidation?: {
      totalTests: number;
      successfulTests: number;
      successRate: number;
      averageCitationAccuracy: number;
      results: any[];
    };
  };
  overallHealth?: {
    systemOperational: boolean;
    recommendations: string[];
  };
}

export default function Validation() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading, user } = useAuth();
  const [validationResults, setValidationResults] = useState<ValidationResult | null>(null);
  const [testMode, setTestMode] = useState<'individual' | 'comprehensive'>('comprehensive');

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

  const { data: healthStatus } = useQuery<HealthStatusResponse>({
    queryKey: ["/api/health"],
    enabled: isAuthenticated && !isLoading,
    retry: false,
  });

  // Comprehensive validation mutation
  const comprehensiveValidationMutation = useMutation({
    mutationFn: async (): Promise<ValidationResult> => {
      const response = await apiRequest("GET", `/api/validation/rag/comprehensive`);
      return response as unknown as ValidationResult;
    },
    onSuccess: (data: ValidationResult) => {
      setValidationResults(data);
      toast({
        title: "Validation Complete",
        description: "RAG system validation completed successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Validation Failed",
        description: error.message || "Failed to run comprehensive validation",
        variant: "destructive",
      });
    },
  });

  // Policy retrieval validation mutation
  const policyValidationMutation = useMutation({
    mutationFn: async (): Promise<ValidationResult> => {
      const response = await apiRequest("GET", `/api/validation/rag/policy-retrieval`);
      return response as unknown as ValidationResult;
    },
    onSuccess: (data: ValidationResult) => {
      setValidationResults(data);
      toast({
        title: "Policy Retrieval Test Complete",
        description: "Policy retrieval validation completed",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Test Failed",
        description: error.message || "Failed to run policy retrieval test",
        variant: "destructive",
      });
    },
  });

  // AI analysis validation mutation
  const aiValidationMutation = useMutation({
    mutationFn: async (): Promise<ValidationResult> => {
      const response = await apiRequest("GET", `/api/validation/rag/ai-analysis`);
      return response as unknown as ValidationResult;
    },
    onSuccess: (data: ValidationResult) => {
      setValidationResults(data);
      toast({
        title: "AI Analysis Test Complete",
        description: "AI analysis validation completed",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Test Failed",
        description: error.message || "Failed to run AI analysis test",
        variant: "destructive",
      });
    },
  });

  // Citation validation mutation
  const citationValidationMutation = useMutation({
    mutationFn: async (): Promise<ValidationResult> => {
      const response = await apiRequest("GET", `/api/validation/rag/citation-generation`);
      return response as unknown as ValidationResult;
    },
    onSuccess: (data: ValidationResult) => {
      setValidationResults(data);
      toast({
        title: "Citation Test Complete", 
        description: "Citation validation completed",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Test Failed",
        description: error.message || "Failed to run citation validation test",
        variant: "destructive",
      });
    },
  });

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

  const isAnyTestRunning = 
    comprehensiveValidationMutation.isPending || 
    policyValidationMutation.isPending || 
    aiValidationMutation.isPending || 
    citationValidationMutation.isPending;

  const renderHealthStatus = () => {
    if (!validationResults?.overallHealth) return null;

    const { systemOperational, recommendations } = validationResults.overallHealth;

    return (
      <Card data-testid="card-system-health">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {systemOperational ? (
              <CheckCircle className="w-5 h-5 text-green-500" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
            )}
            System Health Status
          </CardTitle>
          <CardDescription>
            Overall RAG system operational status and recommendations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant={systemOperational ? "default" : "secondary"} data-testid="badge-system-status">
                {systemOperational ? "Operational" : "Needs Attention"}
              </Badge>
            </div>

            {recommendations.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Recommendations:</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  {recommendations.map((rec, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="w-1 h-1 rounded-full bg-muted-foreground mt-2 flex-shrink-0"></span>
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderEligibilityTelemetry = () => {
    const telemetry = healthStatus?.metrics?.eligibility;
    if (!telemetry) return null;

    const topFallbackType = Object.entries(telemetry.policyFallbacks.byType)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || "none";
    const topFallbackRegion = Object.entries(telemetry.policyFallbacks.byMacRegion)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || "UNKNOWN";

    const fallbackAlert = telemetry.policyFallbacks.lastHour > 3;
    const unmatchedAlert = telemetry.unmatchedDiagnoses.lastHour > 5;

    return (
      <Card data-testid="card-eligibility-telemetry">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" />
            Eligibility Telemetry
          </CardTitle>
          <CardDescription>
            Real-time monitoring for fallback policy usage and diagnosis validation quality
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-foreground">Policy Fallbacks</h4>
                <Badge variant={fallbackAlert ? "destructive" : "outline"} data-testid="badge-fallback-alert">
                  {fallbackAlert ? "Investigate" : "Stable"}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-3 rounded-md border border-border">
                  <p className="text-muted-foreground">Total</p>
                  <p className="text-2xl font-semibold" data-testid="text-fallback-total">{telemetry.policyFallbacks.total}</p>
                </div>
                <div className="p-3 rounded-md border border-border">
                  <p className="text-muted-foreground">Last Hour</p>
                  <p className="text-2xl font-semibold" data-testid="text-fallback-hour">{telemetry.policyFallbacks.lastHour}</p>
                </div>
                <div className="p-3 rounded-md border border-border">
                  <p className="text-muted-foreground">Last 24h</p>
                  <p className="text-2xl font-semibold" data-testid="text-fallback-day">{telemetry.policyFallbacks.last24Hours}</p>
                </div>
                <div className="p-3 rounded-md border border-border">
                  <p className="text-muted-foreground">Top Type</p>
                  <p className="text-base font-medium" data-testid="text-fallback-top-type">{topFallbackType}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Highest activity MAC region: <span className="font-medium">{topFallbackRegion}</span>
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-foreground">Unmatched Diagnoses</h4>
                <Badge variant={unmatchedAlert ? "destructive" : "outline"} data-testid="badge-diagnosis-alert">
                  {unmatchedAlert ? "Investigate" : "Stable"}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-3 rounded-md border border-border">
                  <p className="text-muted-foreground">Total</p>
                  <p className="text-2xl font-semibold" data-testid="text-unmatched-total">{telemetry.unmatchedDiagnoses.total}</p>
                </div>
                <div className="p-3 rounded-md border border-border">
                  <p className="text-muted-foreground">Last Hour</p>
                  <p className="text-2xl font-semibold" data-testid="text-unmatched-hour">{telemetry.unmatchedDiagnoses.lastHour}</p>
                </div>
                <div className="p-3 rounded-md border border-border">
                  <p className="text-muted-foreground">Last 24h</p>
                  <p className="text-2xl font-semibold" data-testid="text-unmatched-day">{telemetry.unmatchedDiagnoses.last24Hours}</p>
                </div>
                <div className="p-3 rounded-md border border-border">
                  <p className="text-muted-foreground">Primary vs Secondary</p>
                  <p className="text-base font-medium" data-testid="text-unmatched-breakdown">
                    {telemetry.unmatchedDiagnoses.bySource.primary}/{telemetry.unmatchedDiagnoses.bySource.secondary}
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Most common format issue: {Object.entries(telemetry.unmatchedDiagnoses.byFormat)
                  .sort((a, b) => b[1] - a[1])[0]?.[0] || 'text_description'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderTestResults = () => {
    if (!validationResults) return null;

    // Handle comprehensive results
    if (validationResults.testResults) {
      const { policyRetrieval, aiAnalysis, citationValidation } = validationResults.testResults;

      return (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {policyRetrieval && (
              <Card data-testid="card-policy-summary">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Database className="w-5 h-5 text-blue-500" />
                      <div>
                        <p className="text-sm font-medium">Policy Retrieval</p>
                        <p className="text-2xl font-bold" data-testid="text-policy-success-rate">
                          {policyRetrieval.successRate.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                    <Badge variant={policyRetrieval.successRate >= 80 ? "default" : "destructive"}>
                      {policyRetrieval.successfulTests}/{policyRetrieval.totalTests}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Found {policyRetrieval.totalPoliciesFound} relevant policies
                  </p>
                </CardContent>
              </Card>
            )}

            {aiAnalysis && (
              <Card data-testid="card-ai-summary">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Brain className="w-5 h-5 text-purple-500" />
                      <div>
                        <p className="text-sm font-medium">AI Analysis</p>
                        <p className="text-2xl font-bold" data-testid="text-ai-success-rate">
                          {aiAnalysis.successRate.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                    <Badge variant={aiAnalysis.successRate >= 80 ? "default" : "destructive"}>
                      {aiAnalysis.successfulTests}/{aiAnalysis.totalTests}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Avg response: {aiAnalysis.averageResponseTime?.toFixed(0) || 0}ms
                  </p>
                </CardContent>
              </Card>
            )}

            {citationValidation && (
              <Card data-testid="card-citation-summary">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <BookOpen className="w-5 h-5 text-green-500" />
                      <div>
                        <p className="text-sm font-medium">Citations</p>
                        <p className="text-2xl font-bold" data-testid="text-citation-accuracy">
                          {citationValidation.averageCitationAccuracy.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                    <Badge variant={citationValidation.successRate >= 60 ? "default" : "destructive"}>
                      {citationValidation.successfulTests}/{citationValidation.totalTests}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Citation accuracy
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      );
    }

    // Handle individual test results
    if (validationResults.results && Array.isArray(validationResults.results)) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>Test Results: {validationResults.testType}</CardTitle>
            <CardDescription>
              Executed at {new Date(validationResults.executedAt).toLocaleString()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Test Case</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {validationResults.results.map((result, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{result.testCase?.name || `Test ${idx + 1}`}</p>
                        <p className="text-sm text-muted-foreground">
                          {result.testCase?.description || 'No description available'}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={result.success ? "default" : "destructive"} data-testid={`badge-test-status-${idx}`}>
                        {result.success ? "Pass" : "Fail"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {result.relevantPoliciesFound !== undefined && (
                          <p>Policies found: {result.relevantPoliciesFound}</p>
                        )}
                        {result.responseTime !== undefined && (
                          <p>Response time: {result.responseTime}ms</p>
                        )}
                        {result.citationAccuracy !== undefined && (
                          <p>Citation accuracy: {result.citationAccuracy.toFixed(1)}%</p>
                        )}
                        {result.errors && result.errors.length > 0 && (
                          <p className="text-red-600">Error: {result.errors[0]}</p>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      );
    }

    return null;
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="lg:pl-64">
        <Header title="RAG System Validation" />
        <main className="p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Page Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
                  <TestTube2 className="w-5 h-5 text-primary-foreground" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold">RAG System Validation</h1>
                  <p className="text-muted-foreground">
                    Validate policy retrieval, AI analysis, and citation generation with real data
                  </p>
                </div>
              </div>
            </div>

            {/* Test Controls */}
            <Card>
              <CardHeader>
                <CardTitle>Validation Tests</CardTitle>
                <CardDescription>
                  Run comprehensive validation or individual component tests
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Button
                    onClick={() => comprehensiveValidationMutation.mutate()}
                    disabled={isAnyTestRunning}
                    className="h-auto p-4 flex-col gap-2"
                    data-testid="button-comprehensive-test"
                  >
                    {comprehensiveValidationMutation.isPending ? (
                      <RefreshCw className="w-5 h-5 animate-spin" />
                    ) : (
                      <TrendingUp className="w-5 h-5" />
                    )}
                    <div className="text-center">
                      <p className="font-medium">Comprehensive</p>
                      <p className="text-xs opacity-75">All tests</p>
                    </div>
                  </Button>

                  <Button
                    onClick={() => policyValidationMutation.mutate()}
                    disabled={isAnyTestRunning}
                    variant="outline"
                    className="h-auto p-4 flex-col gap-2"
                    data-testid="button-policy-test"
                  >
                    {policyValidationMutation.isPending ? (
                      <RefreshCw className="w-5 h-5 animate-spin" />
                    ) : (
                      <Database className="w-5 h-5" />
                    )}
                    <div className="text-center">
                      <p className="font-medium">Policy Retrieval</p>
                      <p className="text-xs opacity-75">Test data access</p>
                    </div>
                  </Button>

                  <Button
                    onClick={() => aiValidationMutation.mutate()}
                    disabled={isAnyTestRunning}
                    variant="outline"
                    className="h-auto p-4 flex-col gap-2"
                    data-testid="button-ai-test"
                  >
                    {aiValidationMutation.isPending ? (
                      <RefreshCw className="w-5 h-5 animate-spin" />
                    ) : (
                      <Brain className="w-5 h-5" />
                    )}
                    <div className="text-center">
                      <p className="font-medium">AI Analysis</p>
                      <p className="text-xs opacity-75">Test AI quality</p>
                    </div>
                  </Button>

                  <Button
                    onClick={() => citationValidationMutation.mutate()}
                    disabled={isAnyTestRunning}
                    variant="outline"
                    className="h-auto p-4 flex-col gap-2"
                    data-testid="button-citation-test"
                  >
                    {citationValidationMutation.isPending ? (
                      <RefreshCw className="w-5 h-5 animate-spin" />
                    ) : (
                      <BookOpen className="w-5 h-5" />
                    )}
                    <div className="text-center">
                      <p className="font-medium">Citations</p>
                      <p className="text-xs opacity-75">Test accuracy</p>
                    </div>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* System Health Status */}
            {renderHealthStatus()}

            {/* Eligibility Telemetry */}
            {renderEligibilityTelemetry()}

            {/* Test Results */}
            {renderTestResults()}

            {/* Help Information */}
            <Card>
              <CardHeader>
                <CardTitle>About RAG Validation</CardTitle>
                <CardDescription>
                  Understanding the validation process and metrics
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
                  <div>
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <Database className="w-4 h-4" />
                      Policy Retrieval
                    </h4>
                    <ul className="text-muted-foreground space-y-1">
                      <li>• Tests across MAC regions (J-E, J-H, J-L)</li>
                      <li>• Validates wound care keyword filtering</li>
                      <li>• Checks citation accuracy</li>
                      <li>• Success rate target: ≥80%</li>
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <Brain className="w-4 h-4" />
                      AI Analysis
                    </h4>
                    <ul className="text-muted-foreground space-y-1">
                      <li>• Tests eligibility determination</li>
                      <li>• Validates documentation gap identification</li>
                      <li>• Measures response consistency</li>
                      <li>• Target response time: &lt;10 seconds</li>
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <BookOpen className="w-4 h-4" />
                      Citation Validation
                    </h4>
                    <ul className="text-muted-foreground space-y-1">
                      <li>• Compares RAG vs AI citations</li>
                      <li>• Validates URL accuracy</li>
                      <li>• Checks LCD ID references</li>
                      <li>• Target accuracy: ≥70%</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}