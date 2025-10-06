import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DateRange } from "react-day-picker";
import { format as formatDate, subDays, startOfMonth, endOfMonth } from "date-fns";
import { 
  FileText,
  Download,
  Calendar,
  Filter,
  Settings,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
  FileSpreadsheet,
  FileImage,
  Trash2,
  Eye,
  RefreshCw,
  TrendingUp,
  Users,
  Shield,
  DollarSign,
  Activity,
  Target
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

// Types for reports
interface ReportTemplate {
  type: string;
  name: string;
  description: string;
  formats: string[];
  features: string[];
}

interface ExportFormat {
  format: string;
  name: string;
  description: string;
  features: string[];
}

interface ReportTemplates {
  reportTypes: ReportTemplate[];
  exportFormats: ExportFormat[];
}

interface GeneratedReport {
  id: string;
  type: string;
  format: string;
  fileName: string;
  fileSize: number;
  generatedAt: string;
  expiresAt: string;
  metadata: {
    totalRecords: number;
    dateRange?: string;
    filters?: any;
    generatedBy: string;
  };
}

interface ReportGenerationRequest {
  type: string;
  format: string;
  tenantId: string;
  dateRange?: {
    startDate: string;
    endDate: string;
  };
  filters?: {
    patientId?: string;
    episodeId?: string;
    providerId?: string;
    woundType?: string;
    complianceLevel?: string;
  };
  options?: {
    includeCharts?: boolean;
    includeDetails?: boolean;
    includeCitations?: boolean;
    groupBy?: string;
  };
}

// Report type icons
const getReportIcon = (type: string) => {
  switch (type) {
    case 'clinical-summary':
      return <Activity className="h-5 w-5" />;
    case 'episode-summary':
      return <Target className="h-5 w-5" />;
    case 'provider-performance':
      return <Users className="h-5 w-5" />;
    case 'medicare-compliance':
      return <Shield className="h-5 w-5" />;
    case 'lcd-compliance':
      return <CheckCircle className="h-5 w-5" />;
    case 'audit-trail':
      return <Eye className="h-5 w-5" />;
    case 'cost-effectiveness':
      return <DollarSign className="h-5 w-5" />;
    case 'healing-outcomes':
      return <TrendingUp className="h-5 w-5" />;
    default:
      return <FileText className="h-5 w-5" />;
  }
};

// Format type icons
const getFormatIcon = (format: string) => {
  switch (format) {
    case 'pdf':
      return <FileImage className="h-4 w-4" />;
    case 'excel':
      return <FileSpreadsheet className="h-4 w-4" />;
    case 'csv':
      return <FileText className="h-4 w-4" />;
    default:
      return <FileText className="h-4 w-4" />;
  }
};

export default function ReportsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const currentTenant = user?.tenants?.[0];

  // State management
  const [selectedReportType, setSelectedReportType] = useState<string>("");
  const [selectedFormat, setSelectedFormat] = useState<string>("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 30),
    to: new Date()
  });
  const [filters, setFilters] = useState<any>({});
  const [options, setOptions] = useState<any>({
    includeCharts: true,
    includeDetails: true,
    includeCitations: true
  });
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [generatedReports, setGeneratedReports] = useState<GeneratedReport[]>([]);

  // Safe array helper function
  const safeArray = <T,>(array: T[] | undefined | null): T[] => {
    return Array.isArray(array) ? array : [];
  };

  // Fetch report templates
  const { data: templatesResponse, isLoading: templatesLoading, error: templatesError } = useQuery({
    queryKey: ['/api/reports/templates'],
    enabled: !!currentTenant?.id,
    staleTime: 10 * 60 * 1000, // 10 minutes
    retry: 2
  });

  // Extract templates from API response structure
  const templates: ReportTemplates | undefined = (templatesResponse as any)?.success ? (templatesResponse as any).templates : undefined;

  // Generate report mutation
  const generateReportMutation = useMutation({
    mutationFn: async (request: ReportGenerationRequest) => {
      const response = await fetch('/api/reports/generate', {
        method: 'POST',
        body: JSON.stringify(request),
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to generate report');
      }
      
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to generate report');
      }
      
      return data.report;
    },
    onSuccess: (report: GeneratedReport) => {
      toast({
        title: "Report Generated Successfully",
        description: `${report.fileName} is ready for download`,
      });
      setGeneratedReports(prev => [report, ...prev]);
      setGenerateDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['/api/reports/templates'] });
    },
    onError: (error: any) => {
      toast({
        title: "Report Generation Failed",
        description: error.message || "An error occurred while generating the report",
        variant: "destructive",
      });
    }
  });

  // Quick export mutations for common reports
  const exportClinicalSummaryMutation = useMutation({
    mutationFn: async ({ format, tenantId, startDate, endDate }: any) => {
      const response = await apiRequest('GET', `/api/analytics/export/clinical-summary?tenantId=${tenantId}&format=${format}&startDate=${startDate}&endDate=${endDate}`);
      return await response.json();
    },
    onSuccess: (data: any) => {
      if (data.success && data.report) {
        toast({
          title: "Clinical Summary Generated",
          description: "Your report is ready for download",
        });
        // Trigger download
        window.open(data.report.downloadUrl, '_blank');
      }
    },
    onError: (error: any) => {
      toast({
        title: "Export Failed",
        description: error.message || "Failed to export clinical summary",
        variant: "destructive",
      });
    }
  });

  const exportComplianceReportMutation = useMutation({
    mutationFn: async ({ format, tenantId, startDate, endDate }: any) => {
      const response = await apiRequest('GET', `/api/analytics/export/compliance-report?tenantId=${tenantId}&format=${format}&startDate=${startDate}&endDate=${endDate}`);
      return await response.json();
    },
    onSuccess: (data: any) => {
      if (data.success && data.report) {
        toast({
          title: "Compliance Report Generated",
          description: "Your report is ready for download",
        });
        // Trigger download
        window.open(data.report.downloadUrl, '_blank');
      }
    },
    onError: (error: any) => {
      toast({
        title: "Export Failed",
        description: error.message || "Failed to export compliance report",
        variant: "destructive",
      });
    }
  });

  // Handle report generation
  const handleGenerateReport = () => {
    if (!selectedReportType || !selectedFormat || !currentTenant) {
      toast({
        title: "Missing Information",
        description: "Please select a report type and format",
        variant: "destructive",
      });
      return;
    }

    const request: ReportGenerationRequest = {
      type: selectedReportType,
      format: selectedFormat,
      tenantId: currentTenant.id,
      dateRange: dateRange ? {
        startDate: formatDate(dateRange.from!, 'yyyy-MM-dd'),
        endDate: formatDate(dateRange.to!, 'yyyy-MM-dd')
      } : undefined,
      filters: Object.keys(filters).length > 0 ? filters : undefined,
      options
    };

    generateReportMutation.mutate(request);
  };

  // Handle quick export
  const handleQuickExport = (type: 'clinical' | 'compliance', format: 'pdf' | 'excel' | 'csv') => {
    if (!currentTenant || !dateRange) {
      toast({
        title: "Missing Information",
        description: "Please ensure you have a valid date range selected",
        variant: "destructive",
      });
      return;
    }

    const params = {
      format,
      tenantId: currentTenant.id,
      startDate: formatDate(dateRange.from!, 'yyyy-MM-dd'),
      endDate: formatDate(dateRange.to!, 'yyyy-MM-dd')
    };

    if (type === 'clinical') {
      exportClinicalSummaryMutation.mutate(params);
    } else {
      exportComplianceReportMutation.mutate(params);
    }
  };

  // Handle report download
  const handleDownloadReport = (report: GeneratedReport) => {
    const downloadUrl = `/api/reports/download/${report.fileName}`;
    window.open(downloadUrl, '_blank');
    
    toast({
      title: "Download Started",
      description: `Downloading ${report.fileName}`,
    });
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (templatesError) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load report templates. Please refresh the page or contact support.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-8">
      <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white" data-testid="page-title">
            Reports & Analytics
          </h1>
          <p className="text-gray-600 dark:text-gray-300 mt-2">
            Generate comprehensive clinical summaries, compliance reports, and regulatory documentation
          </p>
        </div>
        
        <div className="flex space-x-3">
          <DatePickerWithRange
            date={dateRange}
            onDateChange={setDateRange}
            data-testid="date-range-picker"
          />
          <Button
            onClick={() => setGenerateDialogOpen(true)}
            data-testid="button-generate-custom-report"
            className="bg-blue-600 hover:bg-blue-700"
          >
            <FileText className="h-4 w-4 mr-2" />
            Custom Report
          </Button>
        </div>
      </div>

      <Tabs defaultValue="quick-reports" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="quick-reports" data-testid="tab-quick-reports">Quick Reports</TabsTrigger>
          <TabsTrigger value="report-library" data-testid="tab-report-library">Report Library</TabsTrigger>
          <TabsTrigger value="report-history" data-testid="tab-report-history">Report History</TabsTrigger>
        </TabsList>

        {/* Quick Reports Tab */}
        <TabsContent value="quick-reports" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <RefreshCw className="h-5 w-5" />
                <span>Quick Export</span>
              </CardTitle>
              <CardDescription>
                Generate commonly used reports with default settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Clinical Summary Quick Export */}
              <div className="p-4 border rounded-lg space-y-4">
                <div className="flex items-center space-x-3">
                  <Activity className="h-6 w-6 text-blue-600" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 dark:text-white">Clinical Summary Report</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      Patient outcomes, healing progression, and treatment effectiveness
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleQuickExport('clinical', 'pdf')}
                    disabled={exportClinicalSummaryMutation.isPending}
                    data-testid="button-export-clinical-pdf"
                  >
                    {exportClinicalSummaryMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <FileImage className="h-4 w-4 mr-2" />
                    )}
                    Export PDF
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleQuickExport('clinical', 'excel')}
                    disabled={exportClinicalSummaryMutation.isPending}
                    data-testid="button-export-clinical-excel"
                  >
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Export Excel
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleQuickExport('clinical', 'csv')}
                    disabled={exportClinicalSummaryMutation.isPending}
                    data-testid="button-export-clinical-csv"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Export CSV
                  </Button>
                </div>
              </div>

              {/* Compliance Report Quick Export */}
              <div className="p-4 border rounded-lg space-y-4">
                <div className="flex items-center space-x-3">
                  <Shield className="h-6 w-6 text-green-600" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 dark:text-white">Medicare Compliance Report</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      20% reduction tracking, compliance scoring, and audit preparation
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleQuickExport('compliance', 'pdf')}
                    disabled={exportComplianceReportMutation.isPending}
                    data-testid="button-export-compliance-pdf"
                  >
                    {exportComplianceReportMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <FileImage className="h-4 w-4 mr-2" />
                    )}
                    Export PDF
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleQuickExport('compliance', 'excel')}
                    disabled={exportComplianceReportMutation.isPending}
                    data-testid="button-export-compliance-excel"
                  >
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Export Excel
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleQuickExport('compliance', 'csv')}
                    disabled={exportComplianceReportMutation.isPending}
                    data-testid="button-export-compliance-csv"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Export CSV
                  </Button>
                </div>
              </div>

              {/* Date Range Info */}
              <Alert>
                <Calendar className="h-4 w-4" />
                <AlertDescription>
                  Quick exports use the selected date range: {dateRange && dateRange.from && dateRange.to ? 
                    `${formatDate(dateRange.from, 'MMM dd, yyyy')} - ${formatDate(dateRange.to, 'MMM dd, yyyy')}` : 
                    'Please select a date range'
                  }
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Report Library Tab */}
        <TabsContent value="report-library" className="space-y-6">
          {templatesLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-full" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-20 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {safeArray(templates?.reportTypes).map((reportType) => (
                <Card
                  key={reportType.type}
                  className="hover:shadow-md transition-shadow cursor-pointer"
                  data-testid={`card-report-type-${reportType.type}`}
                >
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      {getReportIcon(reportType.type)}
                      <span className="text-sm">{reportType.name}</span>
                    </CardTitle>
                    <CardDescription className="text-xs">
                      {reportType.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-medium">Features</Label>
                      <div className="flex flex-wrap gap-1">
                        {safeArray(reportType.features).slice(0, 3).map((feature, index) => (
                          <Badge key={index} variant="secondary" className="text-xs">
                            {feature}
                          </Badge>
                        ))}
                        {reportType.features.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{reportType.features.length - 3} more
                          </Badge>
                        )}
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-xs font-medium">Available Formats</Label>
                      <div className="flex space-x-1">
                        {safeArray(reportType.formats).map((format) => (
                          <Badge key={format} variant="outline" className="text-xs">
                            {getFormatIcon(format)}
                            <span className="ml-1">{format.toUpperCase()}</span>
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <Button
                      size="sm"
                      className="w-full"
                      onClick={() => {
                        setSelectedReportType(reportType.type);
                        setGenerateDialogOpen(true);
                      }}
                      data-testid={`button-generate-${reportType.type}`}
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      Generate Report
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Report History Tab */}
        <TabsContent value="report-history" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Generated Reports</CardTitle>
              <CardDescription>
                Recently generated reports and their download links
              </CardDescription>
            </CardHeader>
            <CardContent>
              {generatedReports.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No Reports Generated</h3>
                  <p className="text-gray-600 dark:text-gray-300 mb-4">
                    Generate your first report to see it appear here
                  </p>
                  <Button onClick={() => setGenerateDialogOpen(true)}>
                    <FileText className="h-4 w-4 mr-2" />
                    Generate Report
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {safeArray(generatedReports).map((report) => (
                    <div
                      key={report.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                      data-testid={`report-item-${report.id}`}
                    >
                      <div className="flex items-center space-x-4">
                        {getFormatIcon(report.format)}
                        <div>
                          <h4 className="font-medium text-gray-900 dark:text-white">
                            {report.fileName}
                          </h4>
                          <div className="flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-300">
                            <span>{formatFileSize(report.fileSize)}</span>
                            <span>•</span>
                            <span>{formatDate(new Date(report.generatedAt), 'MMM dd, yyyy HH:mm')}</span>
                            <span>•</span>
                            <span>{report.metadata.totalRecords} records</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <Badge
                          variant={new Date(report.expiresAt) > new Date() ? "secondary" : "destructive"}
                        >
                          {new Date(report.expiresAt) > new Date() ? "Available" : "Expired"}
                        </Badge>
                        
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDownloadReport(report)}
                          disabled={new Date(report.expiresAt) <= new Date()}
                          data-testid={`button-download-${report.id}`}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Download
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Generate Report Dialog */}
      <Dialog open={generateDialogOpen} onOpenChange={setGenerateDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Generate Custom Report</DialogTitle>
            <DialogDescription>
              Configure your report settings and generate a custom analytical report
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Report Type Selection */}
            <div className="space-y-2">
              <Label>Report Type</Label>
              <Select value={selectedReportType} onValueChange={setSelectedReportType}>
                <SelectTrigger data-testid="select-report-type">
                  <SelectValue placeholder="Select a report type" />
                </SelectTrigger>
                <SelectContent>
                  {safeArray(templates?.reportTypes).map((type) => (
                    <SelectItem key={type.type} value={type.type}>
                      <div className="flex items-center space-x-2">
                        {getReportIcon(type.type)}
                        <span>{type.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Format Selection */}
            <div className="space-y-2">
              <Label>Export Format</Label>
              <Select value={selectedFormat} onValueChange={setSelectedFormat}>
                <SelectTrigger data-testid="select-export-format">
                  <SelectValue placeholder="Select export format" />
                </SelectTrigger>
                <SelectContent>
                  {safeArray(templates?.exportFormats).map((format) => (
                    <SelectItem key={format.format} value={format.format}>
                      <div className="flex items-center space-x-2">
                        {getFormatIcon(format.format)}
                        <div className="flex flex-col">
                          <span>{format.name}</span>
                          <span className="text-xs text-gray-500">{format.description}</span>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date Range Selection */}
            <div className="space-y-2">
              <Label>Date Range</Label>
              <DatePickerWithRange
                date={dateRange}
                onDateChange={setDateRange}
                className="w-full"
                data-testid="dialog-date-range-picker"
              />
            </div>

            {/* Report Options */}
            <div className="space-y-4">
              <Label>Report Options</Label>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm">Include Charts and Visualizations</Label>
                    <p className="text-xs text-gray-600 dark:text-gray-300">
                      Add charts and graphs to the report
                    </p>
                  </div>
                  <Switch
                    checked={options.includeCharts}
                    onCheckedChange={(checked) => 
                      setOptions((prev: any) => ({ ...prev, includeCharts: checked }))
                    }
                    data-testid="switch-include-charts"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm">Include Detailed Data</Label>
                    <p className="text-xs text-gray-600 dark:text-gray-300">
                      Include comprehensive data tables
                    </p>
                  </div>
                  <Switch
                    checked={options.includeDetails}
                    onCheckedChange={(checked) => 
                      setOptions((prev: any) => ({ ...prev, includeDetails: checked }))
                    }
                    data-testid="switch-include-details"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm">Include Policy Citations</Label>
                    <p className="text-xs text-gray-600 dark:text-gray-300">
                      Add regulatory policy references
                    </p>
                  </div>
                  <Switch
                    checked={options.includeCitations}
                    onCheckedChange={(checked) => 
                      setOptions((prev: any) => ({ ...prev, includeCitations: checked }))
                    }
                    data-testid="switch-include-citations"
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setGenerateDialogOpen(false)}
              data-testid="button-cancel-generate"
            >
              Cancel
            </Button>
            <Button
              onClick={handleGenerateReport}
              disabled={generateReportMutation.isPending || !selectedReportType || !selectedFormat}
              data-testid="button-confirm-generate"
            >
              {generateReportMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4 mr-2" />
                  Generate Report
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}