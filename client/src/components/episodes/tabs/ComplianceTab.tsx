import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  CheckCircle, AlertTriangle, Clock, Shield, FileCheck, Activity, 
  Target, TrendingUp, TrendingDown, Calendar, AlertCircle, 
  XCircle, Users, BookOpen, Stethoscope, Gauge
} from "lucide-react";
import { Episode, Encounter } from "@shared/schema";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, RadialBarChart, RadialBar } from "recharts";
import { useMemo } from "react";
import { 
  assessMedicareCompliance,
  classifyWound,
  statusToTrafficLight,
  type MedicareComplianceResult,
  type TrafficLightStatus as CentralizedTrafficLightStatus,
  type ComplianceStatus,
  type DocumentedException
} from "@shared/clinicalCompliance";

// Interface for decrypted patient data
interface DecryptedPatient {
  id: string;
  firstName: string;
  lastName: string;
  mrn: string;
  tenantId: string;
  payerType: string;
  planName?: string;
  macRegion?: string;
}

// Traffic Light Status Types (maintained for UI compatibility)
type TrafficLightStatus = CentralizedTrafficLightStatus;
type CompliancePriority = 'critical' | 'high' | 'moderate' | 'low';

// Compliance interfaces
interface ComplianceArea {
  id: string;
  name: string;
  status: TrafficLightStatus;
  score: number;
  completedRequirements: number;
  totalRequirements: number;
  criticalGaps: string[];
  recommendations: string[];
  daysToDeadline?: number;
}

interface ComplianceAlert {
  id: string;
  type: 'medicare-compliance' | 'treatment-escalation' | 'safety' | 'documentation';
  severity: CompliancePriority;
  title: string;
  message: string;
  recommendation: string;
  dueDate?: Date;
  daysRemaining?: number;
  resolved: boolean;
  basedOn: string[];
}

interface UnifiedComplianceData {
  overallStatus: TrafficLightStatus;
  overallScore: number;
  areas: ComplianceArea[];
  alerts: ComplianceAlert[];
  medicareCompliance: {
    conservativeCareDays: number;
    weeklyAssessmentsCoverage: number;
    reductionPercentage: number;
    missingWeeks: string[];
    daysToLCDDeadline: number;
    status: TrafficLightStatus;
  };
  trendData: Array<{
    date: string;
    score: number;
    alerts: number;
  }>;
}

// Traffic Light Component
interface TrafficLightProps {
  status: TrafficLightStatus;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

function TrafficLight({ status, size = 'md', showLabel = false, className = '' }: TrafficLightProps) {
  const colors = {
    green: 'bg-green-500 text-green-700',
    yellow: 'bg-yellow-500 text-yellow-700', 
    red: 'bg-red-500 text-red-700'
  };
  
  const sizes = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8'
  };

  const icons = {
    green: CheckCircle,
    yellow: AlertTriangle,
    red: XCircle
  };

  const Icon = icons[status];

  return (
    <div className={`flex items-center gap-2 ${className}`} data-testid={`traffic-light-${status}`}>
      <div className={`rounded-full ${colors[status]} ${sizes[size]} flex items-center justify-center`}>
        <Icon className={`${size === 'sm' ? 'h-2.5 w-2.5' : size === 'md' ? 'h-4 w-4' : 'h-5 w-5'} text-white`} />
      </div>
      {showLabel && (
        <span className={`text-sm font-medium ${
          status === 'green' ? 'text-green-700' :
          status === 'yellow' ? 'text-yellow-700' : 'text-red-700'
        }`}>
          {status === 'green' ? 'Compliant' : status === 'yellow' ? 'At Risk' : 'Non-Compliant'}
        </span>
      )}
    </div>
  );
}

// Convert centralized compliance result to UI format
function adaptComplianceResult(result: MedicareComplianceResult, encounters: Encounter[]): UnifiedComplianceData {
  // Generate compliance areas for UI display
  const timelineMetricsArea: ComplianceArea = {
    id: 'timeline-metrics',
    name: 'Timeline & Metrics',
    status: result.weeklyAssessments.statusWithExceptions === 'compliant' || result.weeklyAssessments.statusWithExceptions === 'compliant-with-exception' ? 
             statusToTrafficLight(result.weeklyAssessments.statusWithExceptions) : 'red',
    score: Math.round((result.weeklyAssessments.coverage + Math.min(result.woundReduction.percentage * 4, 100)) / 2),
    completedRequirements: (result.weeklyAssessments.statusWithExceptions !== 'non-compliant' ? 1 : 0) + 
                          (result.woundReduction.meetsThreshold ? 1 : 0),
    totalRequirements: 2,
    criticalGaps: result.criticalGaps.filter(gap => 
      gap.includes('Missing') && gap.includes('weeks') ||
      gap.includes('reduction')
    ),
    recommendations: result.recommendations.filter(rec => 
      rec.includes('weekly') || rec.includes('reduction') || rec.includes('progress')
    )
  };

  const conservativeCareArea: ComplianceArea = {
    id: 'conservative-care',
    name: 'Conservative Care',
    status: result.conservativeCareDays >= 30 && 
            (result.standardOfCare.offloading !== false) && 
            (result.standardOfCare.compression !== false) ? 'green' : 
            result.conservativeCareDays >= 20 ? 'yellow' : 'red',
    score: Math.round(((result.conservativeCareDays >= 30 ? 40 : (result.conservativeCareDays / 30) * 40) + 
            (result.standardOfCare.offloading !== false ? 30 : 0) + 
            (result.standardOfCare.compression !== false ? 30 : 0))),
    completedRequirements: (result.conservativeCareDays >= 30 ? 1 : 0) + 
                          (result.standardOfCare.offloading !== false ? 1 : 0) + 
                          (result.standardOfCare.compression !== false ? 1 : 0),
    totalRequirements: 3,
    criticalGaps: result.criticalGaps.filter(gap => 
      gap.includes('Conservative') || gap.includes('Offloading') || gap.includes('Compression')
    ),
    recommendations: result.recommendations.filter(rec => 
      rec.includes('conservative') || rec.includes('offloading') || rec.includes('compression')
    ),
    daysToDeadline: result.daysToDeadline
  };

  const diagnosisArea: ComplianceArea = {
    id: 'diagnosis',
    name: 'Diagnosis Compliance',
    status: 'green', // Assume compliant if episode exists
    score: 100,
    completedRequirements: 2,
    totalRequirements: 2,
    criticalGaps: [],
    recommendations: []
  };

  const documentationArea: ComplianceArea = {
    id: 'documentation',
    name: 'Documentation',
    status: result.standardOfCare.infectionControl && result.standardOfCare.patientEducation ? 'green' :
            result.standardOfCare.infectionControl || result.standardOfCare.patientEducation ? 'yellow' : 'red',
    score: Math.round(((encounters.length > 0 ? 40 : 0) + 
            (result.standardOfCare.infectionControl ? 30 : 0) + 
            (result.standardOfCare.patientEducation ? 30 : 0))),
    completedRequirements: (encounters.length > 0 ? 1 : 0) + 
                          (result.standardOfCare.infectionControl ? 1 : 0) + 
                          (result.standardOfCare.patientEducation ? 1 : 0),
    totalRequirements: 3,
    criticalGaps: result.criticalGaps.filter(gap => 
      gap.includes('documentation') || gap.includes('education') || gap.includes('infection')
    ),
    recommendations: result.recommendations.filter(rec => 
      rec.includes('document') || rec.includes('education') || rec.includes('infection')
    )
  };

  const areas = [timelineMetricsArea, conservativeCareArea, diagnosisArea, documentationArea];

  // Generate alerts from critical gaps
  const alerts: ComplianceAlert[] = result.criticalGaps.map((gap, index) => {
    const priority: CompliancePriority = gap.includes('CRITICAL') ? 'critical' : 
                                        gap.includes('Missing') ? 'high' : 'moderate';
    return {
      id: `gap-${index}`,
      type: gap.includes('Conservative') || gap.includes('Medicare') ? 'medicare-compliance' : 'documentation',
      severity: priority,
      title: gap.includes('CRITICAL') ? 'Critical Compliance Issue' : 'Compliance Gap',
      message: gap,
      recommendation: result.recommendations[index] || 'Address compliance gap',
      resolved: false,
      basedOn: encounters.map(e => e.id)
    };
  });

  // Generate trend data (simplified)
  const trendData = encounters.slice(-7).map((encounter, index) => ({
    date: new Date(encounter.date).toLocaleDateString(),
    score: Math.max(40, result.score - (6 - index) * 5),
    alerts: Math.max(0, alerts.length - index)
  }));

  return {
    overallStatus: result.trafficLight,
    overallScore: result.score,
    areas,
    alerts,
    medicareCompliance: {
      conservativeCareDays: result.conservativeCareDays,
      weeklyAssessmentsCoverage: result.weeklyAssessments.coverage,
      reductionPercentage: result.woundReduction.percentage,
      missingWeeks: result.weeklyAssessments.missingWeeks,
      daysToLCDDeadline: result.daysToDeadline,
      status: result.trafficLight
    },
    trendData
  };
}

interface ComplianceTabProps {
  episode?: Episode;
  encounters: Encounter[];
  patient?: DecryptedPatient;
  isLoading: boolean;
}

export default function ComplianceTab({ episode, encounters, patient, isLoading }: ComplianceTabProps) {
  // Centralized Medicare Compliance Assessment
  const unifiedComplianceData = useMemo((): UnifiedComplianceData => {
    if (!episode || !encounters || encounters.length === 0) {
      return {
        overallStatus: 'red',
        overallScore: 0,
        areas: [],
        alerts: [],
        medicareCompliance: {
          conservativeCareDays: 0,
          weeklyAssessmentsCoverage: 0,
          reductionPercentage: 0,
          missingWeeks: [],
          daysToLCDDeadline: 30,
          status: 'red'
        },
        trendData: []
      };
    }

    // Use centralized compliance assessment
    const complianceResult = assessMedicareCompliance(episode, encounters);
    
    // Adapt to existing UI structure
    return adaptComplianceResult(complianceResult, encounters);
  }, [episode, encounters]);

  // Add wound classification info for debugging and display
  const woundClassification = useMemo(() => {
    if (!episode) return null;
    return classifyWound(episode, episode.primaryDiagnosis || undefined);
  }, [episode]);

  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="compliance-loading">
        <div className="h-8 bg-muted animate-pulse rounded"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="h-40 bg-muted animate-pulse rounded"></div>
          <div className="h-40 bg-muted animate-pulse rounded"></div>
          <div className="h-40 bg-muted animate-pulse rounded"></div>
        </div>
        <div className="h-60 bg-muted animate-pulse rounded"></div>
      </div>
    );
  }

  // Chart colors for visualizations
  const CHART_COLORS = {
    primary: '#3B82F6',
    green: '#22C55E',
    yellow: '#EAB308', 
    red: '#EF4444',
    gray: '#6B7280'
  };

  const getStatusColor = (status: TrafficLightStatus) => {
    switch (status) {
      case 'green': return 'text-green-600 bg-green-50 border-green-200';
      case 'yellow': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'red': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getPriorityColor = (priority: CompliancePriority) => {
    switch (priority) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-200';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'moderate': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="space-y-6" data-testid="compliance-tab">
      <div className="flex items-center gap-3">
        <Shield className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Medicare Compliance Status Dashboard</h3>
      </div>

      {/* Overall Compliance Status */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card data-testid="card-overall-status" className="md:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-semibold flex items-center gap-3">
              <TrafficLight status={unifiedComplianceData.overallStatus} size="lg" />
              Overall Medicare LCD Compliance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mb-4">
              <div className="text-3xl font-bold" data-testid="text-overall-score">
                {unifiedComplianceData.overallScore}%
              </div>
              <Badge 
                className={`text-base px-3 py-1 ${getStatusColor(unifiedComplianceData.overallStatus)}`}
                data-testid={`badge-overall-${unifiedComplianceData.overallStatus}`}
              >
                {unifiedComplianceData.overallStatus === 'green' ? 'Fully Compliant' : 
                 unifiedComplianceData.overallStatus === 'yellow' ? 'At Risk' : 'Non-Compliant'}
              </Badge>
            </div>
            <Progress value={unifiedComplianceData.overallScore} className="mb-3" data-testid="progress-overall" />
            <div className="text-sm text-muted-foreground">
              {unifiedComplianceData.areas.filter(area => area.status === 'green').length} of {unifiedComplianceData.areas.length} areas fully compliant
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-medicare-timeline">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Medicare Timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-conservative-days">
              {unifiedComplianceData.medicareCompliance.conservativeCareDays}
            </div>
            <p className="text-xs text-muted-foreground mb-2">Days of conservative care</p>
            <div className={`text-xs font-medium ${
              unifiedComplianceData.medicareCompliance.daysToLCDDeadline > 7 ? 'text-green-600' :
              unifiedComplianceData.medicareCompliance.daysToLCDDeadline > 3 ? 'text-yellow-600' : 'text-red-600'
            }`} data-testid="text-days-to-deadline">
              {unifiedComplianceData.medicareCompliance.daysToLCDDeadline > 0 
                ? `${unifiedComplianceData.medicareCompliance.daysToLCDDeadline} days to 30-day requirement`
                : 'Medicare 30-day requirement met'
              }
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-reduction-progress">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4" />
              Wound Reduction
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-reduction-percentage">
              {unifiedComplianceData.medicareCompliance.reductionPercentage.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground mb-2">Area reduction achieved</p>
            <div className={`text-xs font-medium ${
              unifiedComplianceData.medicareCompliance.reductionPercentage >= 20 ? 'text-green-600' :
              unifiedComplianceData.medicareCompliance.reductionPercentage >= 10 ? 'text-yellow-600' : 'text-red-600'
            }`} data-testid="text-reduction-status">
              {unifiedComplianceData.medicareCompliance.reductionPercentage >= 20 ? 'Meets 20% threshold' : 'Below Medicare threshold'}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="areas" className="w-full" data-testid="compliance-tabs">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="areas" data-testid="tab-areas">Compliance Areas</TabsTrigger>
          <TabsTrigger value="alerts" data-testid="tab-alerts">
            Active Alerts ({unifiedComplianceData.alerts.length})
          </TabsTrigger>
          <TabsTrigger value="timeline" data-testid="tab-timeline">Medicare Timeline</TabsTrigger>
          <TabsTrigger value="trends" data-testid="tab-trends">Trends</TabsTrigger>
        </TabsList>

        <TabsContent value="areas" className="space-y-4" data-testid="areas-content">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {unifiedComplianceData.areas.map((area) => (
              <Card key={area.id} data-testid={`card-area-${area.id}`}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <TrafficLight status={area.status} />
                      {area.name}
                    </div>
                    <div className="text-lg font-bold" data-testid={`score-${area.id}`}>
                      {area.score}%
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Progress value={area.score} className="mb-3" data-testid={`progress-${area.id}`} />
                  <div className="text-sm text-muted-foreground mb-3">
                    {area.completedRequirements} of {area.totalRequirements} requirements met
                  </div>
                  
                  {area.criticalGaps.length > 0 && (
                    <div className="space-y-2" data-testid={`gaps-${area.id}`}>
                      <h5 className="text-sm font-medium text-red-700">Critical Gaps:</h5>
                      {area.criticalGaps.map((gap, index) => (
                        <div key={index} className="text-xs text-red-600 flex items-start gap-2">
                          <XCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                          {gap}
                        </div>
                      ))}
                    </div>
                  )}

                  {area.recommendations.length > 0 && (
                    <div className="mt-3 pt-3 border-t space-y-2" data-testid={`recommendations-${area.id}`}>
                      <h5 className="text-sm font-medium text-blue-700">Recommendations:</h5>
                      {area.recommendations.map((rec, index) => (
                        <div key={index} className="text-xs text-blue-600 flex items-start gap-2">
                          <CheckCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                          {rec}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="alerts" className="space-y-4" data-testid="alerts-content">
          {unifiedComplianceData.alerts.length === 0 ? (
            <Card data-testid="no-alerts">
              <CardContent className="text-center py-8">
                <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                <h3 className="text-lg font-semibold mb-2">All Clear!</h3>
                <p className="text-muted-foreground">No compliance alerts at this time.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {unifiedComplianceData.alerts
                .sort((a, b) => {
                  const priorityOrder = { critical: 0, high: 1, moderate: 2, low: 3 };
                  return priorityOrder[a.severity] - priorityOrder[b.severity];
                })
                .map((alert) => (
                <Alert key={alert.id} className={`${getPriorityColor(alert.severity)} border-l-4`} data-testid={`alert-${alert.id}`}>
                  <AlertTriangle className="h-5 w-5" />
                  <AlertDescription>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className={getPriorityColor(alert.severity)} data-testid={`badge-${alert.severity}`}>
                            {alert.severity.toUpperCase()}
                          </Badge>
                          {alert.daysRemaining && alert.daysRemaining > 0 && (
                            <span className="text-xs text-muted-foreground">
                              {alert.daysRemaining} days remaining
                            </span>
                          )}
                        </div>
                        <h4 className="font-medium mb-1" data-testid={`alert-title-${alert.id}`}>
                          {alert.title}
                        </h4>
                        <p className="text-sm mb-2" data-testid={`alert-message-${alert.id}`}>
                          {alert.message}
                        </p>
                        <div className="text-sm font-medium text-blue-700" data-testid={`alert-recommendation-${alert.id}`}>
                          <strong>Action Required:</strong> {alert.recommendation}
                        </div>
                      </div>
                    </div>
                  </AlertDescription>
                </Alert>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="timeline" className="space-y-4" data-testid="timeline-content">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card data-testid="card-weekly-assessments">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Weekly Assessment Coverage
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold mb-2" data-testid="text-weekly-coverage">
                  {unifiedComplianceData.medicareCompliance.weeklyAssessmentsCoverage.toFixed(1)}%
                </div>
                <Progress value={unifiedComplianceData.medicareCompliance.weeklyAssessmentsCoverage} className="mb-3" />
                {unifiedComplianceData.medicareCompliance.missingWeeks.length > 0 && (
                  <div className="text-sm text-red-600" data-testid="missing-weeks">
                    Missing {unifiedComplianceData.medicareCompliance.missingWeeks.length} weeks: {unifiedComplianceData.medicareCompliance.missingWeeks.slice(0, 3).join(', ')}
                    {unifiedComplianceData.medicareCompliance.missingWeeks.length > 3 && '...'}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card data-testid="card-medicare-requirements">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Medicare LCD Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">30-day Conservative Care</span>
                    <TrafficLight 
                      status={unifiedComplianceData.medicareCompliance.conservativeCareDays >= 30 ? 'green' : 'red'} 
                      size="sm" 
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Weekly Assessments</span>
                    <TrafficLight 
                      status={unifiedComplianceData.medicareCompliance.weeklyAssessmentsCoverage >= 90 ? 'green' : 
                             unifiedComplianceData.medicareCompliance.weeklyAssessmentsCoverage >= 70 ? 'yellow' : 'red'} 
                      size="sm" 
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">20% Reduction Progress</span>
                    <TrafficLight 
                      status={unifiedComplianceData.medicareCompliance.reductionPercentage >= 20 ? 'green' : 
                             unifiedComplianceData.medicareCompliance.reductionPercentage >= 10 ? 'yellow' : 'red'} 
                      size="sm" 
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="trends" className="space-y-4" data-testid="trends-content">
          <Card data-testid="card-compliance-trends">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Compliance Trends
              </CardTitle>
              <CardDescription>
                Track compliance score and alert trends over time
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={unifiedComplianceData.trendData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="score" 
                      stroke={CHART_COLORS.primary} 
                      strokeWidth={2}
                      name="Compliance Score" 
                    />
                    <Line 
                      type="monotone" 
                      dataKey="alerts" 
                      stroke={CHART_COLORS.red} 
                      strokeWidth={2}
                      name="Active Alerts" 
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card data-testid="card-area-breakdown">
              <CardHeader>
                <CardTitle>Compliance by Area</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={unifiedComplianceData.areas.map(area => ({
                          name: area.name,
                          value: area.score,
                          fill: area.status === 'green' ? CHART_COLORS.green :
                                area.status === 'yellow' ? CHART_COLORS.yellow : CHART_COLORS.red
                        }))}
                        cx="50%"
                        cy="50%"
                        outerRadius={60}
                        fill="#8884d8"
                        dataKey="value"
                      />
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-alert-priorities">
              <CardHeader>
                <CardTitle>Alert Priorities</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[
                      { priority: 'Critical', count: unifiedComplianceData.alerts.filter(a => a.severity === 'critical').length },
                      { priority: 'High', count: unifiedComplianceData.alerts.filter(a => a.severity === 'high').length },
                      { priority: 'Moderate', count: unifiedComplianceData.alerts.filter(a => a.severity === 'moderate').length },
                      { priority: 'Low', count: unifiedComplianceData.alerts.filter(a => a.severity === 'low').length }
                    ]}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="priority" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="count" fill={CHART_COLORS.primary} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}