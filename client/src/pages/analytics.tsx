import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DateRange } from "react-day-picker";
import { 
  Calendar,
  TrendingUp,
  Users,
  DollarSign,
  Shield,
  Activity,
  Target,
  ClipboardCheck,
  AlertTriangle,
  Download,
  RefreshCw
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerWithRange } from "@/components/ui/date-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart
} from "recharts";
import { useAuth } from "@/hooks/useAuth";
import { queryClient, getParameterizedQueryFn, apiRequest } from "@/lib/queryClient";

// Types for analytics data
interface DashboardSummary {
  totalPatients: number;
  activeEpisodes: number;
  complianceRate: number;
  costEfficiency: number;
  healingSuccessRate: number;
  averageHealingTime: number;
  totalCostSavings: number;
  riskViolations: number;
}

interface ClinicalMetrics {
  healingVelocityTrends: Array<{
    date: string;
    averageVelocity: number;
    episodeCount: number;
  }>;
  outcomeDistribution: Array<{
    name: string;
    value: number;
    color: string;
  }>;
  providerPerformance: Array<{
    providerId: string;
    providerName: string;
    healingRate: number;
    averageTime: number;
    compliance: number;
    episodes: number;
  }>;
  complianceTracking: Array<{
    category: string;
    score: number;
    violations: number;
    trend: 'up' | 'down' | 'stable';
  }>;
}

interface FinancialMetrics {
  costTrends: Array<{
    date: string;
    costPerEpisode: number;
    reimbursementRate: number;
    margin: number;
  }>;
  profitabilityBreakdown: Array<{
    category: string;
    revenue: number;
    costs: number;
    margin: number;
  }>;
  reimbursementCapture: {
    captured: number;
    potential: number;
    rate: number;
  };
}

// Additional interfaces for compliance data
interface ComplianceArea {
  area: string;
  status: "green" | "yellow" | "red";
  score: number;
}

interface ComplianceViolation {
  category: string;
  count: number;
  resolved: number;
}

interface ComplianceTrend {
  date: string;
  overallScore: number;
  target: number;
}

interface ComplianceData {
  complianceAreas: ComplianceArea[];
  violations: ComplianceViolation[];
  complianceTrends: ComplianceTrend[];
}

// Healing trends interface
interface HealingTrend {
  date: string;
  averageVelocity: number;
  episodeCount: number;
}

// Component prop interfaces
interface ClinicalPerformanceSectionProps {
  data: ClinicalMetrics | undefined;
  loading: boolean;
  trendsData: HealingTrend[] | undefined;
  trendsLoading: boolean;
}

interface FinancialAnalyticsSectionProps {
  data: FinancialMetrics | undefined;
  loading: boolean;
}

interface ComplianceDashboardSectionProps {
  data: ComplianceData | undefined;
  loading: boolean;
}

const CHART_COLORS = {
  primary: "#0ea5e9",
  secondary: "#10b981", 
  accent: "#f59e0b",
  danger: "#ef4444",
  warning: "#f97316",
  success: "#22c55e",
  muted: "#6b7280"
};

export default function AnalyticsPage() {
  const { user } = useAuth();
  const currentTenant = user?.tenants?.[0];
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
    to: new Date()
  });
  const [selectedProvider, setSelectedProvider] = useState<string>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [exportType, setExportType] = useState<string>("");
  const [exportFormat, setExportFormat] = useState<string>("csv");
  
  // Check if we're in demo mode
  const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true';

  // Mock data for development/fallback
  const mockSummaryData: DashboardSummary = {
    totalPatients: 324,
    activeEpisodes: 89,
    complianceRate: 92,
    costEfficiency: 78500,
    healingSuccessRate: 87,
    averageHealingTime: 42,
    totalCostSavings: 125000,
    riskViolations: 3
  };

  const mockHealingTrends = [
    { date: "2025-09-01", averageVelocity: 2.3, episodeCount: 12 },
    { date: "2025-09-02", averageVelocity: 2.1, episodeCount: 15 },
    { date: "2025-09-03", averageVelocity: 2.5, episodeCount: 18 },
    { date: "2025-09-04", averageVelocity: 2.8, episodeCount: 14 },
    { date: "2025-09-05", averageVelocity: 2.4, episodeCount: 16 },
    { date: "2025-09-06", averageVelocity: 2.7, episodeCount: 13 },
    { date: "2025-09-07", averageVelocity: 3.1, episodeCount: 19 }
  ];

  const mockClinicalData: ClinicalMetrics = {
    healingVelocityTrends: mockHealingTrends,
    outcomeDistribution: [
      { name: 'Successful', value: 75, color: CHART_COLORS.success },
      { name: 'In Progress', value: 20, color: CHART_COLORS.warning },
      { name: 'Failed', value: 5, color: CHART_COLORS.danger }
    ],
    providerPerformance: [
      { providerId: "1", providerName: "Dr. Smith", healingRate: 92, averageTime: 38, compliance: 95, episodes: 45 },
      { providerId: "2", providerName: "Dr. Johnson", healingRate: 88, averageTime: 42, compliance: 91, episodes: 38 },
      { providerId: "3", providerName: "Dr. Williams", healingRate: 85, averageTime: 45, compliance: 89, episodes: 32 }
    ],
    complianceTracking: [
      { category: "Documentation", score: 95, violations: 2, trend: 'up' as const },
      { category: "Conservative Care", score: 92, violations: 3, trend: 'stable' as const },
      { category: "Wound Progression", score: 87, violations: 5, trend: 'down' as const }
    ]
  };

  const mockFinancialData: FinancialMetrics = {
    costTrends: [
      { date: "2025-09-01", costPerEpisode: 2400, reimbursementRate: 2800, margin: 400 },
      { date: "2025-09-02", costPerEpisode: 2350, reimbursementRate: 2750, margin: 400 },
      { date: "2025-09-03", costPerEpisode: 2450, reimbursementRate: 2900, margin: 450 },
      { date: "2025-09-04", costPerEpisode: 2380, reimbursementRate: 2820, margin: 440 },
      { date: "2025-09-05", costPerEpisode: 2420, reimbursementRate: 2850, margin: 430 }
    ],
    profitabilityBreakdown: [
      { category: "DFU Treatment", revenue: 150000, costs: 98000, margin: 52000 },
      { category: "VLU Treatment", revenue: 120000, costs: 85000, margin: 35000 },
      { category: "Surgical Wounds", revenue: 95000, costs: 78000, margin: 17000 }
    ],
    reimbursementCapture: {
      captured: 285000,
      potential: 320000,
      rate: 89
    }
  };

  // Fetch dashboard summary data with fallback
  const { data: summaryData, isLoading: summaryLoading, error: summaryError } = useQuery<DashboardSummary>({
    queryKey: [
      '/api/analytics/dashboard/summary', 
      {
        tenantId: currentTenant?.id,
        startDate: dateRange?.from,
        endDate: dateRange?.to,
        providerId: selectedProvider !== 'all' ? selectedProvider : undefined
      }
    ],
    queryFn: getParameterizedQueryFn({ on401: "throw" }),
    enabled: !!currentTenant?.id,
    retry: 1,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false
  });

  // Fetch clinical performance data with fallback
  const { data: clinicalData, isLoading: clinicalLoading, error: clinicalError } = useQuery<ClinicalMetrics>({
    queryKey: [
      '/api/analytics/dashboard/clinical', 
      {
        tenantId: currentTenant?.id,
        startDate: dateRange?.from,
        endDate: dateRange?.to,
        providerId: selectedProvider !== 'all' ? selectedProvider : undefined
      }
    ],
    queryFn: getParameterizedQueryFn({ on401: "throw" }),
    enabled: !!currentTenant?.id,
    retry: 1,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false
  });

  // Fetch financial analytics data with fallback
  const { data: financialData, isLoading: financialLoading, error: financialError } = useQuery<FinancialMetrics>({
    queryKey: [
      '/api/analytics/dashboard/financial', 
      {
        tenantId: currentTenant?.id,
        startDate: dateRange?.from,
        endDate: dateRange?.to,
        providerId: selectedProvider !== 'all' ? selectedProvider : undefined
      }
    ],
    queryFn: getParameterizedQueryFn({ on401: "throw" }),
    enabled: !!currentTenant?.id,
    retry: 1,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false
  });

  // Fetch healing trends data with fallback
  const { data: healingTrends, isLoading: trendsLoading, error: trendsError } = useQuery<HealingTrend[]>({
    queryKey: [
      '/api/analytics/healing-trends', 
      {
        tenantId: currentTenant?.id,
        startDate: dateRange?.from,
        endDate: dateRange?.to,
        providerId: selectedProvider !== 'all' ? selectedProvider : undefined
      }
    ],
    queryFn: getParameterizedQueryFn({ on401: "throw" }),
    enabled: !!currentTenant?.id,
    retry: 1,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false
  });

  // Fetch compliance data with fallback
  const { data: complianceData, isLoading: complianceLoading, error: complianceError } = useQuery<ComplianceData>({
    queryKey: [
      '/api/analytics/compliance', 
      {
        tenantId: currentTenant?.id,
        startDate: dateRange?.from,
        endDate: dateRange?.to,
        providerId: selectedProvider !== 'all' ? selectedProvider : undefined
      }
    ],
    queryFn: getParameterizedQueryFn({ on401: "throw" }),
    enabled: !!currentTenant?.id,
    retry: 1,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false
  });

  // Use mock data as fallback only in demo mode, otherwise fail with actionable errors
  const effectiveSummaryData = summaryData || (isDemoMode ? mockSummaryData : null);
  const effectiveClinicalData = clinicalData || (isDemoMode ? mockClinicalData : null);
  const effectiveFinancialData = financialData || (isDemoMode ? mockFinancialData : null);
  const effectiveHealingTrends = healingTrends || (isDemoMode ? mockHealingTrends : null);
  const effectiveComplianceData = complianceData || (isDemoMode ? {
    complianceAreas: [
      { area: "Documentation", status: "green" as const, score: 95 },
      { area: "Diagnosis Coding", status: "yellow" as const, score: 85 },
      { area: "Conservative Care", status: "green" as const, score: 92 },
      { area: "Wound Progression", status: "red" as const, score: 78 }
    ],
    violations: [
      { category: "Missing Documentation", count: 3, resolved: 1 },
      { category: "Incomplete Assessment", count: 2, resolved: 2 },
      { category: "Late Follow-up", count: 1, resolved: 0 }
    ],
    complianceTrends: [
      { date: "2025-09-01", overallScore: 89, target: 95 },
      { date: "2025-09-02", overallScore: 91, target: 95 },
      { date: "2025-09-03", overallScore: 88, target: 95 },
      { date: "2025-09-04", overallScore: 92, target: 95 },
      { date: "2025-09-05", overallScore: 90, target: 95 }
    ]
  } : null);
  
  // Check if we have critical data missing in production
  const hasProductionDataFailure = !isDemoMode && (!summaryData || !clinicalData || !financialData || !healingTrends || !complianceData) && (summaryError || clinicalError || financialError || trendsError || complianceError);

  // Check if we have any errors and should show warnings
  const hasErrors = summaryError || clinicalError || financialError || trendsError || complianceError;
  const isAllLoading = summaryLoading && clinicalLoading && financialLoading && trendsLoading && complianceLoading;
  const isUsingDemoData = isDemoMode && (hasErrors || (!summaryData || !clinicalData || !financialData || !healingTrends || !complianceData));

  const handleRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ 
      predicate: (query) => {
        const firstKey = query.queryKey[0];
        return typeof firstKey === 'string' && firstKey.startsWith('/api/analytics');
      }
    });
    setRefreshing(false);
  };

  // Export mutations
  const clinicalSummaryExportMutation = useMutation({
    mutationFn: async ({ format }: { format: 'csv' | 'pdf' }) => {
      const params = new URLSearchParams({
        tenantId: currentTenant!.id,
        format,
        ...(dateRange?.from && { startDate: dateRange.from.toISOString() }),
        ...(dateRange?.to && { endDate: dateRange.to.toISOString() }),
        ...(selectedProvider !== 'all' && { providerId: selectedProvider })
      });
      
      const response = await fetch(`/api/analytics/export/clinical-summary?${params}`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Export failed: ${response.status} ${errorText}`);
      }
      
      // Get filename from Content-Disposition header
      const contentDisposition = response.headers.get('Content-Disposition');
      const filename = contentDisposition 
        ? contentDisposition.split('filename=')[1]?.replace(/"/g, '') 
        : `clinical-summary.${format}`;
      
      const blob = await response.blob();
      return { blob, filename };
    },
    onSuccess: ({ blob, filename }) => {
      // Download file
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    onError: (error: Error) => {
      console.error('Clinical summary export failed:', error);
    }
  });

  const complianceReportExportMutation = useMutation({
    mutationFn: async ({ format }: { format: 'csv' | 'pdf' }) => {
      const params = new URLSearchParams({
        tenantId: currentTenant!.id,
        format,
        ...(dateRange?.from && { startDate: dateRange.from.toISOString() }),
        ...(dateRange?.to && { endDate: dateRange.to.toISOString() })
      });
      
      const response = await fetch(`/api/analytics/export/compliance-report?${params}`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Export failed: ${response.status} ${errorText}`);
      }
      
      // Get filename from Content-Disposition header
      const contentDisposition = response.headers.get('Content-Disposition');
      const filename = contentDisposition 
        ? contentDisposition.split('filename=')[1]?.replace(/"/g, '') 
        : `compliance-report.${format}`;
      
      const blob = await response.blob();
      return { blob, filename };
    },
    onSuccess: ({ blob, filename }) => {
      // Download file
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    onError: (error: Error) => {
      console.error('Compliance report export failed:', error);
    }
  });

  const handleExport = () => {
    if (exportType === 'clinical') {
      clinicalSummaryExportMutation.mutate({ format: exportFormat as 'csv' | 'pdf' });
    } else if (exportType === 'compliance') {
      complianceReportExportMutation.mutate({ format: exportFormat as 'csv' | 'pdf' });
    }
  };

  const isExporting = clinicalSummaryExportMutation.isPending || complianceReportExportMutation.isPending;
  const exportError = clinicalSummaryExportMutation.error || complianceReportExportMutation.error;

  if (!currentTenant) {
    return (
      <div className="container mx-auto px-6 py-8">
        <Alert data-testid="alert-no-tenant">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Please set up a tenant to access analytics dashboard.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-6 py-8 space-y-6" data-testid="analytics-dashboard">
      {/* Header Section */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground" data-testid="page-title">
            Analytics Dashboard
          </h1>
          <p className="text-muted-foreground" data-testid="page-description">
            Comprehensive insights into clinical performance, financial metrics, and Medicare compliance
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <DatePickerWithRange
            date={dateRange}
            onDateChange={(date: DateRange | undefined) => setDateRange(date)}
            className="w-auto"
            data-testid="date-range-picker"
          />
          <Select value={selectedProvider} onValueChange={setSelectedProvider} data-testid="provider-filter">
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Providers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Providers</SelectItem>
              <SelectItem value="dr-smith">Dr. Smith</SelectItem>
              <SelectItem value="dr-johnson">Dr. Johnson</SelectItem>
            </SelectContent>
          </Select>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh}
            disabled={refreshing}
            data-testid="button-refresh"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <div className="flex items-center gap-2">
            <Select value={exportType} onValueChange={setExportType} data-testid="export-type-select">
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select Export Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="clinical">Clinical Summary</SelectItem>
                <SelectItem value="compliance">Compliance Report</SelectItem>
              </SelectContent>
            </Select>
            <Select value={exportFormat} onValueChange={setExportFormat} data-testid="export-format-select">
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="csv">CSV</SelectItem>
                <SelectItem value="pdf">PDF</SelectItem>
              </SelectContent>
            </Select>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleExport}
              disabled={!exportType || isExporting}
              data-testid="button-export"
            >
              {isExporting ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              {isExporting ? 'Exporting...' : 'Export'}
            </Button>
          </div>
        </div>
      </div>

      {/* Error Alerts */}
      {hasProductionDataFailure && (
        <Alert className="border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950" data-testid="alert-production-failure">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800 dark:text-red-200">
            <div className="font-semibold">Analytics data failed to load from server</div>
            <div className="mt-1 text-sm">
              {summaryError && <div>• Summary data: {summaryError.message}</div>}
              {clinicalError && <div>• Clinical data: {clinicalError.message}</div>}
              {financialError && <div>• Financial data: {financialError.message}</div>}
              {trendsError && <div>• Trends data: {trendsError.message}</div>}
              {complianceError && <div>• Compliance data: {complianceError.message}</div>}
            </div>
            <div className="mt-2">
              Please check your network connection and server status, or contact technical support if the issue persists.
              <Button variant="link" className="h-auto p-0 ml-2" onClick={handleRefresh}>
                Try refreshing
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
      
      {isUsingDemoData && (
        <Alert className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950" data-testid="alert-demo-mode">
          <AlertTriangle className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800 dark:text-blue-200">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-blue-300 text-blue-700 bg-blue-100">
                DEMO MODE
              </Badge>
              <span>Using demonstration data for visualization purposes. This is not real clinical data.</span>
            </div>
            <Button variant="link" className="h-auto p-0 ml-2" onClick={handleRefresh}>
              Try loading real data
            </Button>
          </AlertDescription>
        </Alert>
      )}
      
      {exportError && (
        <Alert className="border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950" data-testid="alert-export-error">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800 dark:text-red-200">
            Export failed: {exportError.message}
          </AlertDescription>
        </Alert>
      )}

      {/* Summary Cards */}
      {!hasProductionDataFailure && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <SummaryCard
            title="Total Patients"
            value={isAllLoading ? "..." : (effectiveSummaryData?.totalPatients?.toString() || "N/A")}
            icon={Users}
            trend={effectiveSummaryData ? "+12%" : ""}
            trendUp={true}
            loading={summaryLoading}
            testId="card-total-patients"
          />
          <SummaryCard
            title="Active Episodes"
            value={isAllLoading ? "..." : (effectiveSummaryData?.activeEpisodes?.toString() || "N/A")}
            icon={Activity}
            trend={effectiveSummaryData ? "+8%" : ""}
            trendUp={true}
            loading={summaryLoading}
            testId="card-active-episodes"
          />
          <SummaryCard
            title="Compliance Rate"
            value={isAllLoading ? "..." : (effectiveSummaryData ? `${effectiveSummaryData.complianceRate}%` : "N/A")}
            icon={Shield}
            trend={effectiveSummaryData ? "+5%" : ""}
            trendUp={true}
            loading={summaryLoading}
            testId="card-compliance-rate"
          />
          <SummaryCard
            title="Cost Efficiency"
            value={isAllLoading ? "..." : (effectiveSummaryData ? `$${effectiveSummaryData.costEfficiency.toLocaleString()}` : "N/A")}
            icon={DollarSign}
            trend={effectiveSummaryData ? "-3%" : ""}
            trendUp={false}
            loading={summaryLoading}
            testId="card-cost-efficiency"
          />
        </div>
      )}

      {/* Main Dashboard Tabs */}
      <Tabs defaultValue="overview" className="space-y-6" data-testid="dashboard-tabs">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="clinical" data-testid="tab-clinical">Clinical Performance</TabsTrigger>
          <TabsTrigger value="financial" data-testid="tab-financial">Financial Analytics</TabsTrigger>
          <TabsTrigger value="compliance" data-testid="tab-compliance">Compliance Dashboard</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Healing Velocity Trends */}
            <Card data-testid="card-healing-velocity">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Healing Velocity Trends
                </CardTitle>
                <CardDescription>
                  Average healing velocity over time (cm²/day)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {trendsLoading ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={effectiveHealingTrends?.slice(0, 10) || []}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line 
                        type="monotone" 
                        dataKey="averageVelocity" 
                        stroke={CHART_COLORS.primary} 
                        strokeWidth={2}
                        name="Avg Velocity (cm²/day)"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Episode Outcomes Distribution */}
            <Card data-testid="card-episode-outcomes">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Episode Outcomes
                </CardTitle>
                <CardDescription>
                  Distribution of healing success and failure rates
                </CardDescription>
              </CardHeader>
              <CardContent>
                {clinicalLoading ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={effectiveClinicalData?.outcomeDistribution || []}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {effectiveClinicalData?.outcomeDistribution?.map((entry: { name: string; value: number; color: string; }, index: number) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Medicare Compliance Gauge */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card data-testid="card-compliance-gauge">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardCheck className="h-5 w-5" />
                  Medicare LCD Compliance
                </CardTitle>
                <CardDescription>Real-time compliance percentage</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="text-center">
                    <div className="text-4xl font-bold text-foreground">
                      {complianceLoading ? "..." : `${effectiveSummaryData?.complianceRate || 0}%`}
                    </div>
                    <p className="text-sm text-muted-foreground">Current Compliance Rate</p>
                  </div>
                  <Progress 
                    value={effectiveSummaryData?.complianceRate || 0} 
                    className="w-full"
                    data-testid="progress-compliance"
                  />
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Target: 95%</span>
                    <span className={(effectiveSummaryData?.complianceRate || 0) >= 95 ? "text-green-600" : "text-orange-600"}>
                      {(effectiveSummaryData?.complianceRate || 0) >= 95 ? "✓ Compliant" : "⚠ Below Target"}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-healing-success">
              <CardHeader>
                <CardTitle>Healing Success Rate</CardTitle>
                <CardDescription>Overall wound healing success</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="text-center">
                    <div className="text-4xl font-bold text-foreground">
                      {summaryLoading ? "..." : `${effectiveSummaryData?.healingSuccessRate || 0}%`}
                    </div>
                    <p className="text-sm text-muted-foreground">Success Rate</p>
                  </div>
                  <Progress 
                    value={effectiveSummaryData?.healingSuccessRate || 0} 
                    className="w-full"
                    data-testid="progress-healing-success"
                  />
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-cost-savings">
              <CardHeader>
                <CardTitle>Cost Savings</CardTitle>
                <CardDescription>Total cost savings achieved</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="text-center">
                    <div className="text-4xl font-bold text-foreground">
                      {summaryLoading ? "..." : `$${(effectiveSummaryData?.totalCostSavings || 0).toLocaleString()}`}
                    </div>
                    <p className="text-sm text-muted-foreground">This Period</p>
                  </div>
                  <Badge variant="secondary" className="w-full justify-center">
                    +15% vs. Previous Period
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Clinical Performance Tab */}
        <TabsContent value="clinical" className="space-y-6">
          <ClinicalPerformanceSection 
            data={clinicalData}
            loading={clinicalLoading}
            trendsData={healingTrends}
            trendsLoading={trendsLoading}
          />
        </TabsContent>

        {/* Financial Analytics Tab */}
        <TabsContent value="financial" className="space-y-6">
          <FinancialAnalyticsSection 
            data={financialData}
            loading={financialLoading}
          />
        </TabsContent>

        {/* Compliance Dashboard Tab */}
        <TabsContent value="compliance" className="space-y-6">
          <ComplianceDashboardSection 
            data={complianceData}
            loading={complianceLoading}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Summary Card Component
interface SummaryCardProps {
  title: string;
  value: string;
  icon: React.ComponentType<any>;
  trend: string;
  trendUp: boolean;
  loading: boolean;
  testId: string;
}

function SummaryCard({ title, value, icon: Icon, trend, trendUp, loading, testId }: SummaryCardProps) {
  return (
    <Card data-testid={testId}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <p className="text-3xl font-bold">{value}</p>
            )}
          </div>
          <div className="flex flex-col items-end space-y-2">
            <Icon className="h-5 w-5 text-muted-foreground" />
            <Badge 
              variant={trendUp ? "default" : "destructive"}
              className="text-xs"
            >
              {trend}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Clinical Performance Section Component
function ClinicalPerformanceSection({ data, loading, trendsData, trendsLoading }: ClinicalPerformanceSectionProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Healing Velocity Detailed Chart */}
        <Card data-testid="card-healing-velocity-detailed">
          <CardHeader>
            <CardTitle>Healing Velocity Analysis</CardTitle>
            <CardDescription>Detailed wound area reduction over time</CardDescription>
          </CardHeader>
          <CardContent>
            {trendsLoading ? (
              <Skeleton className="h-[400px] w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={400}>
                <ComposedChart data={trendsData?.slice(0, 15) || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip />
                  <Legend />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="averageVelocity"
                    fill={CHART_COLORS.primary}
                    fillOpacity={0.6}
                    stroke={CHART_COLORS.primary}
                    name="Healing Velocity (cm²/day)"
                  />
                  <Bar
                    yAxisId="right"
                    dataKey="episodeCount"
                    fill={CHART_COLORS.secondary}
                    name="Episode Count"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Provider Performance Table */}
        <Card data-testid="card-provider-performance">
          <CardHeader>
            <CardTitle>Provider Performance Rankings</CardTitle>
            <CardDescription>Ranked by healing success rate and compliance</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map(i => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {(data?.providerPerformance || []).map((provider: ClinicalMetrics['providerPerformance'][0], index: number) => (
                  <div 
                    key={provider.providerId}
                    className="flex items-center justify-between p-4 border rounded-lg"
                    data-testid={`provider-${index}`}
                  >
                    <div className="space-y-1">
                      <p className="font-medium">{provider.providerName}</p>
                      <p className="text-sm text-muted-foreground">
                        {provider.episodes} episodes
                      </p>
                    </div>
                    <div className="text-right space-y-1">
                      <Badge variant={provider.healingRate >= 80 ? "default" : "secondary"}>
                        {provider.healingRate}% Success
                      </Badge>
                      <p className="text-sm text-muted-foreground">
                        {provider.compliance}% Compliance
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Medicare 20% Reduction Tracking */}
      <Card data-testid="card-medicare-reduction">
        <CardHeader>
          <CardTitle>Medicare 20% Reduction Compliance</CardTitle>
          <CardDescription>Tracking wound area reduction requirements</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[300px] w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data?.complianceTracking || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="category" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="score" fill={CHART_COLORS.success} name="Compliance Score" />
                <Bar dataKey="violations" fill={CHART_COLORS.danger} name="Violations" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Financial Analytics Section Component
function FinancialAnalyticsSection({ data, loading }: FinancialAnalyticsSectionProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cost Per Episode Trends */}
        <Card data-testid="card-cost-trends">
          <CardHeader>
            <CardTitle>Cost Per Episode Analysis</CardTitle>
            <CardDescription>Cost efficiency trends over time</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={data?.costTrends || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip formatter={(value, name) => [`$${value}`, name]} />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="costPerEpisode" 
                    stroke={CHART_COLORS.danger} 
                    strokeWidth={2}
                    name="Cost per Episode"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="reimbursementRate" 
                    stroke={CHART_COLORS.success} 
                    strokeWidth={2}
                    name="Reimbursement Rate"
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Profitability Breakdown */}
        <Card data-testid="card-profitability">
          <CardHeader>
            <CardTitle>Episode Profitability</CardTitle>
            <CardDescription>Revenue vs costs by category</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data?.profitabilityBreakdown || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="category" />
                  <YAxis />
                  <Tooltip formatter={(value) => `$${value}`} />
                  <Legend />
                  <Bar dataKey="revenue" fill={CHART_COLORS.success} name="Revenue" />
                  <Bar dataKey="costs" fill={CHART_COLORS.danger} name="Costs" />
                  <Bar dataKey="margin" fill={CHART_COLORS.primary} name="Margin" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Reimbursement Capture Rate */}
      <Card data-testid="card-reimbursement-capture">
        <CardHeader>
          <CardTitle>Reimbursement Capture Analysis</CardTitle>
          <CardDescription>Maximizing revenue capture opportunities</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Captured Revenue</p>
              <p className="text-2xl font-bold text-success">
                ${(data?.reimbursementCapture?.captured || 0).toLocaleString()}
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Potential Revenue</p>
              <p className="text-2xl font-bold">
                ${(data?.reimbursementCapture?.potential || 0).toLocaleString()}
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Capture Rate</p>
              <p className="text-2xl font-bold">
                {data?.reimbursementCapture?.rate || 0}%
              </p>
              <Progress 
                value={data?.reimbursementCapture?.rate || 0} 
                className="w-full"
                data-testid="progress-capture-rate"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Compliance Dashboard Section Component
function ComplianceDashboardSection({ data, loading }: ComplianceDashboardSectionProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Compliance Status Overview */}
        <Card data-testid="card-compliance-status">
          <CardHeader>
            <CardTitle>LCD Compliance Status</CardTitle>
            <CardDescription>Traffic light indicators for compliance areas</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4].map(i => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {(data?.complianceAreas || [
                  { area: "Documentation", status: "green", score: 95 },
                  { area: "Diagnosis Coding", status: "yellow", score: 85 },
                  { area: "Conservative Care", status: "green", score: 92 },
                  { area: "Wound Progression", status: "red", score: 78 }
                ]).map((area: ComplianceArea, index: number) => (
                  <div 
                    key={index}
                    className="flex items-center justify-between p-3 border rounded-lg"
                    data-testid={`compliance-area-${index}`}
                  >
                    <div className="flex items-center gap-3">
                      <div 
                        className={`w-3 h-3 rounded-full ${
                          area.status === 'green' ? 'bg-green-500' :
                          area.status === 'yellow' ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                      />
                      <span className="font-medium">{area.area}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold">{area.score}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Compliance Violations */}
        <Card data-testid="card-compliance-violations">
          <CardHeader>
            <CardTitle>Recent Violations</CardTitle>
            <CardDescription>Risk analysis and violation tracking</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data?.violations || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="category" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="count" fill={CHART_COLORS.danger} name="Violations" />
                  <Bar dataKey="resolved" fill={CHART_COLORS.success} name="Resolved" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Compliance Score Trending */}
      <Card data-testid="card-compliance-trending">
        <CardHeader>
          <CardTitle>Compliance Score Trends</CardTitle>
          <CardDescription>Regulatory compliance performance over time</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[300px] w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={data?.complianceTrends || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="overallScore"
                  stroke={CHART_COLORS.primary}
                  fill={CHART_COLORS.primary}
                  fillOpacity={0.6}
                  name="Overall Compliance Score"
                />
                <Area
                  type="monotone"
                  dataKey="target"
                  stroke={CHART_COLORS.success}
                  fill="transparent"
                  strokeDasharray="5 5"
                  name="Target (95%)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}