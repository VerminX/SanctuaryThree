import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Activity, Calendar, TrendingUp, Clock, Ruler, Target, Gauge, AlertTriangle, CheckCircle2, TrendingDown } from "lucide-react";
import { Episode, Encounter } from "@shared/schema";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area, RadialBarChart, RadialBar, Cell, PieChart, Pie } from "recharts";
import { useMemo } from "react";

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

// Chart data interfaces
interface WoundMeasurement {
  date: string;
  length?: number;
  width?: number;
  depth?: number;
  area?: number;
  unit?: string;
}

interface ChartDataPoint {
  date: string;
  isoDate: string;
  length: number | null;
  width: number | null;
  depth: number | null;
  area: number | null;
  calculatedArea: number | null;
}

interface MedicareReductionData {
  baseline: number;
  current: number;
  reductionPercentage: number;
  isCompliant: boolean;
  status: 'on-track' | 'at-risk' | 'compliant' | 'non-compliant';
  daysToDeadline: number;
  daysSinceBaseline: number;
  isIn28DayWindow: boolean;
}

// Type guards for runtime safety
interface WoundDetails {
  measurements?: {
    length?: number;
    width?: number;
    depth?: number;
    area?: number;
    unit?: string;
  };
  type?: string;
}

function isValidWoundDetails(woundDetails: any): woundDetails is WoundDetails {
  return woundDetails && typeof woundDetails === 'object';
}

function isValidMeasurement(value: any): value is number {
  return typeof value === 'number' && !isNaN(value) && isFinite(value);
}

function safeNumber(value: any): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return isValidMeasurement(num) ? num : null;
}

interface HealingVelocityData {
  currentRate: number;
  trend: 'improving' | 'stable' | 'declining';
  weeklyRate: number;
  monthlyRate: number;
  benchmark: number;
  status: 'excellent' | 'good' | 'fair' | 'poor';
}

interface TimelineMetricsTabProps {
  episode?: Episode;
  encounters: Encounter[];
  patient?: DecryptedPatient;
  isLoading: boolean;
}

export default function TimelineMetricsTab({ episode, encounters, patient, isLoading }: TimelineMetricsTabProps) {
  // Process wound measurement data
  const measurementData = useMemo(() => {
    if (!encounters || encounters.length === 0) return [];
    
    // First, sort encounters by ISO date to ensure proper chronological order
    const sortedEncounters = encounters
      .filter(encounter => {
        const woundDetails = encounter.woundDetails;
        return isValidWoundDetails(woundDetails) && woundDetails.measurements;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    return sortedEncounters.map(encounter => {
      const woundDetails = encounter.woundDetails as WoundDetails;
      const measurements = woundDetails.measurements!;
      
      // Use ?? null instead of || null to preserve 0 values
      const length = safeNumber(measurements.length);
      const width = safeNumber(measurements.width);
      const depth = safeNumber(measurements.depth);
      const area = safeNumber(measurements.area);
      
      // Calculate area only if both length and width are valid numbers
      const calculatedArea = (length !== null && width !== null) 
        ? Number((length * width).toFixed(2))
        : null;
      
      return {
        date: new Date(encounter.date).toLocaleDateString(),
        isoDate: encounter.date,
        length: length ?? null,
        width: width ?? null,
        depth: depth ?? null,
        area: area ?? null,
        calculatedArea
      };
    });
  }, [encounters]);

  // Calculate Medicare 20% reduction data with proper 28-day evaluation window
  const medicareData = useMemo((): MedicareReductionData => {
    if (measurementData.length < 1 || !episode?.episodeStartDate) {
      return {
        baseline: 0,
        current: 0,
        reductionPercentage: 0,
        isCompliant: false,
        status: 'at-risk',
        daysToDeadline: 28,
        daysSinceBaseline: 0,
        isIn28DayWindow: true
      };
    }

    const episodeStartDate = new Date(episode.episodeStartDate);
    const today = new Date();
    const daysSinceBaseline = Math.ceil((today.getTime() - episodeStartDate.getTime()) / (1000 * 60 * 60 * 24));
    const daysToDeadline = Math.max(0, 28 - daysSinceBaseline);
    const isIn28DayWindow = daysSinceBaseline <= 28;
    
    // Get baseline measurement (first available measurement)
    const baselineMeasurement = measurementData[0];
    const baseline = baselineMeasurement.calculatedArea ?? baselineMeasurement.area ?? 0;
    
    // For Medicare compliance, evaluate at 28 days or current if past 28 days
    let evaluationMeasurement;
    if (isIn28DayWindow && measurementData.length >= 2) {
      // Find measurement closest to day 28 or use latest if before day 28
      evaluationMeasurement = measurementData[measurementData.length - 1];
    } else {
      // Past 28 days - use measurement at or around day 28, or latest available
      const day28Date = new Date(episodeStartDate.getTime() + 28 * 24 * 60 * 60 * 1000);
      evaluationMeasurement = measurementData.find(m => 
        new Date(m.isoDate).getTime() >= day28Date.getTime()
      ) || measurementData[measurementData.length - 1];
    }
    
    const current = evaluationMeasurement.calculatedArea ?? evaluationMeasurement.area ?? 0;
    const reductionPercentage = baseline > 0 ? ((baseline - current) / baseline) * 100 : 0;
    
    // Medicare compliance logic based on 28-day window
    let isCompliant: boolean;
    let status: 'on-track' | 'at-risk' | 'compliant' | 'non-compliant';
    
    if (isIn28DayWindow) {
      // During 28-day window, track progress toward 20%
      const targetProgress = (daysSinceBaseline / 28) * 20; // Expected progress
      isCompliant = reductionPercentage >= 20;
      
      if (isCompliant) {
        status = 'compliant';
      } else if (reductionPercentage >= targetProgress * 0.8) {
        status = 'on-track';
      } else if (reductionPercentage >= targetProgress * 0.5) {
        status = 'at-risk';
      } else {
        status = 'non-compliant';
      }
    } else {
      // Past 28 days - final evaluation
      isCompliant = reductionPercentage >= 20;
      status = isCompliant ? 'compliant' : 'non-compliant';
    }
    
    return {
      baseline,
      current,
      reductionPercentage: Math.max(0, reductionPercentage),
      isCompliant,
      status,
      daysToDeadline,
      daysSinceBaseline,
      isIn28DayWindow
    };
  }, [measurementData, episode?.episodeStartDate]);

  // Calculate healing velocity with improved interval-based calculation
  const healingVelocity = useMemo((): HealingVelocityData => {
    if (measurementData.length < 2) {
      return {
        currentRate: 0,
        trend: 'stable',
        weeklyRate: 0,
        monthlyRate: 0,
        benchmark: 5, // 5% per week typical benchmark
        status: 'poor'
      };
    }

    // Calculate velocity using actual measurement intervals
    const intervals: { days: number; reduction: number }[] = [];
    
    for (let i = 1; i < measurementData.length; i++) {
      const prev = measurementData[i - 1];
      const curr = measurementData[i];
      
      const prevArea = prev.calculatedArea ?? prev.area;
      const currArea = curr.calculatedArea ?? curr.area;
      
      if (prevArea !== null && currArea !== null && prevArea > 0) {
        const days = Math.ceil(
          (new Date(curr.isoDate).getTime() - new Date(prev.isoDate).getTime()) / (1000 * 60 * 60 * 24)
        );
        
        if (days > 0) {
          const intervalReduction = ((prevArea - currArea) / prevArea) * 100;
          intervals.push({ days, reduction: intervalReduction });
        }
      }
    }
    
    // Calculate rates based on actual intervals
    let weeklyRate = 0;
    let monthlyRate = 0;
    
    if (intervals.length > 0) {
      // Use weighted average of intervals for more accurate velocity
      const totalWeightedReduction = intervals.reduce((sum, interval) => 
        sum + (interval.reduction * interval.days), 0
      );
      const totalDays = intervals.reduce((sum, interval) => sum + interval.days, 0);
      
      if (totalDays > 0) {
        const dailyRate = totalWeightedReduction / totalDays;
        weeklyRate = dailyRate * 7;
        monthlyRate = dailyRate * 30;
      }
      
      // For recent trend, focus on last 14-28 days
      const recentDate = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);
      const recentMeasurements = measurementData.filter(m => 
        new Date(m.isoDate).getTime() >= recentDate.getTime()
      );
      
      if (recentMeasurements.length >= 2) {
        const recentIntervals = [];
        for (let i = 1; i < recentMeasurements.length; i++) {
          const prev = recentMeasurements[i - 1];
          const curr = recentMeasurements[i];
          
          const prevArea = prev.calculatedArea ?? prev.area;
          const currArea = curr.calculatedArea ?? curr.area;
          
          if (prevArea !== null && currArea !== null && prevArea > 0) {
            const days = Math.ceil(
              (new Date(curr.isoDate).getTime() - new Date(prev.isoDate).getTime()) / (1000 * 60 * 60 * 24)
            );
            
            if (days > 0) {
              const intervalReduction = ((prevArea - currArea) / prevArea) * 100;
              recentIntervals.push(intervalReduction / days); // Daily rate
            }
          }
        }
        
        if (recentIntervals.length > 0) {
          const recentDailyRate = recentIntervals.reduce((sum, rate) => sum + rate, 0) / recentIntervals.length;
          weeklyRate = Math.max(weeklyRate, recentDailyRate * 7); // Use better of overall or recent
        }
      }
    }
    
    // Determine trend using moving average of last few intervals
    let trend: 'improving' | 'stable' | 'declining' = 'stable';
    if (intervals.length >= 2) {
      const recent = intervals.slice(-2);
      const avgRecentRate = recent.reduce((sum, interval) => 
        sum + (interval.reduction / interval.days), 0
      ) / recent.length;
      
      const earlier = intervals.slice(0, -2);
      if (earlier.length > 0) {
        const avgEarlierRate = earlier.reduce((sum, interval) => 
          sum + (interval.reduction / interval.days), 0
        ) / earlier.length;
        
        const rateChange = avgRecentRate - avgEarlierRate;
        if (rateChange > 0.3) trend = 'improving'; // Daily rate improvement
        else if (rateChange < -0.3) trend = 'declining';
      }
    }
    
    let status: 'excellent' | 'good' | 'fair' | 'poor' = 'poor';
    if (weeklyRate >= 8) status = 'excellent';
    else if (weeklyRate >= 5) status = 'good';
    else if (weeklyRate >= 2) status = 'fair';
    
    return {
      currentRate: medicareData.reductionPercentage,
      trend,
      weeklyRate: Math.max(0, weeklyRate),
      monthlyRate: Math.max(0, monthlyRate),
      benchmark: 5,
      status
    };
  }, [measurementData, medicareData]);

  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="timeline-metrics-loading">
        <div className="h-8 bg-muted animate-pulse rounded"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-40 bg-muted animate-pulse rounded"></div>
          <div className="h-40 bg-muted animate-pulse rounded"></div>
        </div>
        <div className="h-60 bg-muted animate-pulse rounded"></div>
      </div>
    );
  }

  const totalEncounters = encounters.length;
  const recentEncounters = encounters.filter(
    e => new Date(e.date) >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  ).length;

  const getMedicareStatusColor = (status: string) => {
    switch (status) {
      case 'compliant': return 'text-green-600 bg-green-50 border-green-200';
      case 'on-track': return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'at-risk': return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'non-compliant': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getHealingStatusColor = (status: string) => {
    switch (status) {
      case 'excellent': return 'text-green-600';
      case 'good': return 'text-blue-600';
      case 'fair': return 'text-orange-600';
      case 'poor': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  return (
    <div className="space-y-6" data-testid="timeline-metrics-tab">
      <div className="flex items-center gap-3">
        <Activity className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Timeline & Metrics Overview</h3>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card data-testid="card-total-encounters">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Total Encounters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-encounters">
              {totalEncounters}
            </div>
            <p className="text-xs text-muted-foreground">
              Since episode start
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-medicare-reduction">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4" />
              Medicare Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-medicare-reduction">
              {medicareData.reductionPercentage.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              Wound reduction
            </p>
            <Badge 
              className={`mt-1 text-xs ${getMedicareStatusColor(medicareData.status)}`}
              data-testid={`badge-medicare-${medicareData.status}`}
            >
              {medicareData.status.charAt(0).toUpperCase() + medicareData.status.slice(1).replace('-', ' ')}
            </Badge>
          </CardContent>
        </Card>

        <Card data-testid="card-healing-velocity">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Gauge className="h-4 w-4" />
              Healing Velocity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-healing-velocity">
              {healingVelocity.weeklyRate.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              Per week
            </p>
            <div className={`mt-1 text-xs font-medium ${getHealingStatusColor(healingVelocity.status)}`} data-testid={`text-healing-${healingVelocity.status}`}>
              {healingVelocity.trend === 'improving' && <TrendingUp className="inline h-3 w-3 mr-1" />}
              {healingVelocity.trend === 'declining' && <TrendingDown className="inline h-3 w-3 mr-1" />}
              {healingVelocity.status.charAt(0).toUpperCase() + healingVelocity.status.slice(1)}
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-episode-duration">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Episode Duration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-episode-duration">
              {episode?.episodeStartDate ? 
                Math.ceil((Date.now() - new Date(episode.episodeStartDate).getTime()) / (1000 * 60 * 60 * 24)) 
                : 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Days active
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Medicare 20% Reduction Tracking */}
      <Card data-testid="card-medicare-tracking">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Medicare 20% Reduction Tracking
          </CardTitle>
          <CardDescription>
            Progress toward Medicare compliance requirement
          </CardDescription>
        </CardHeader>
        <CardContent>
          {measurementData.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Ruler className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No measurement data available for tracking.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div>
                  <h4 className="text-sm font-medium">Current Reduction</h4>
                  <p className="text-2xl font-bold" data-testid="text-current-reduction">{medicareData.reductionPercentage.toFixed(1)}%</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium">Target</h4>
                  <p className="text-2xl font-bold text-muted-foreground">20.0%</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium">Days Since Start</h4>
                  <p className="text-2xl font-bold" data-testid="text-days-since-baseline">{medicareData.daysSinceBaseline}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium">
                    {medicareData.isIn28DayWindow ? 'Days to Deadline' : 'Past Deadline'}
                  </h4>
                  <p className={`text-2xl font-bold ${medicareData.isIn28DayWindow ? 'text-orange-600' : 'text-red-600'}`} data-testid="text-days-to-deadline">
                    {medicareData.isIn28DayWindow ? medicareData.daysToDeadline : `+${medicareData.daysSinceBaseline - 28}`}
                  </p>
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Progress to Medicare Threshold</span>
                  <span>{Math.min(100, (medicareData.reductionPercentage / 20) * 100).toFixed(0)}% of target</span>
                </div>
                <Progress 
                  value={Math.min(100, (medicareData.reductionPercentage / 20) * 100)} 
                  className="h-3"
                  data-testid="progress-medicare-reduction"
                />
              </div>
              
              {/* 28-Day Window Status Alert */}
              {medicareData.isIn28DayWindow ? (
                <Alert className="border-blue-200 bg-blue-50 mb-3" data-testid="alert-28-day-window">
                  <Clock className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-blue-800">
                    <strong>Active 28-Day Evaluation Period:</strong> {medicareData.daysToDeadline} days remaining to achieve 20% reduction for Medicare compliance.
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert className="border-purple-200 bg-purple-50 mb-3" data-testid="alert-past-28-days">
                  <Clock className="h-4 w-4 text-purple-600" />
                  <AlertDescription className="text-purple-800">
                    <strong>Post 28-Day Evaluation:</strong> Final Medicare assessment based on day 28 measurements.
                  </AlertDescription>
                </Alert>
              )}

              {/* Compliance Status Alert */}
              {medicareData.reductionPercentage >= 20 ? (
                <Alert className="border-green-200 bg-green-50" data-testid="alert-medicare-compliant">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800">
                    <strong>Medicare Compliant:</strong> Wound has achieved {medicareData.reductionPercentage.toFixed(1)}% reduction, meeting the 20% threshold
                    {medicareData.isIn28DayWindow ? ' within the 28-day evaluation period.' : ' by day 28.'}
                  </AlertDescription>
                </Alert>
              ) : medicareData.status === 'on-track' ? (
                <Alert className="border-blue-200 bg-blue-50" data-testid="alert-medicare-on-track">
                  <TrendingUp className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-blue-800">
                    <strong>On Track:</strong> Progress is {medicareData.reductionPercentage.toFixed(1)}% - good trajectory toward 20% reduction target.
                    {medicareData.isIn28DayWindow && ` ${medicareData.daysToDeadline} days remaining.`}
                  </AlertDescription>
                </Alert>
              ) : medicareData.status === 'at-risk' ? (
                <Alert className="border-orange-200 bg-orange-50" data-testid="alert-medicare-at-risk">
                  <AlertTriangle className="h-4 w-4 text-orange-600" />
                  <AlertDescription className="text-orange-800">
                    <strong>At Risk:</strong> Only {medicareData.reductionPercentage.toFixed(1)}% reduction achieved.
                    {medicareData.isIn28DayWindow 
                      ? ` Need to accelerate healing - ${medicareData.daysToDeadline} days left.`
                      : ' Did not meet 20% threshold by day 28.'}
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert className="border-red-200 bg-red-50" data-testid="alert-medicare-non-compliant">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-800">
                    <strong>Non-Compliant:</strong> {medicareData.reductionPercentage.toFixed(1)}% reduction is significantly below Medicare requirements.
                    {medicareData.isIn28DayWindow 
                      ? ` Immediate intervention needed - ${medicareData.daysToDeadline} days remaining.`
                      : ' Failed to meet 20% threshold by day 28.'}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Wound Measurement Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card data-testid="card-measurement-trends">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Ruler className="h-5 w-5" />
              Wound Measurements Over Time
            </CardTitle>
            <CardDescription>
              Length, width, and depth progression
            </CardDescription>
          </CardHeader>
          <CardContent>
            {measurementData.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No measurement data available.</p>
              </div>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={measurementData} data-testid="chart-measurements">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                    <XAxis 
                      dataKey="date" 
                      fontSize={12}
                      stroke="#666"
                    />
                    <YAxis 
                      fontSize={12}
                      stroke="#666"
                      label={{ value: 'cm', angle: -90, position: 'insideLeft' }}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#f8f9fa', 
                        border: '1px solid #dee2e6',
                        borderRadius: '6px'
                      }}
                    />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="length" 
                      stroke="hsl(var(--chart-1))" 
                      strokeWidth={2}
                      dot={{ fill: 'hsl(var(--chart-1))', strokeWidth: 2, r: 4 }}
                      name="Length (cm)"
                      connectNulls={false}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="width" 
                      stroke="hsl(var(--chart-2))" 
                      strokeWidth={2}
                      dot={{ fill: 'hsl(var(--chart-2))', strokeWidth: 2, r: 4 }}
                      name="Width (cm)"
                      connectNulls={false}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="depth" 
                      stroke="hsl(var(--chart-3))" 
                      strokeWidth={2}
                      dot={{ fill: 'hsl(var(--chart-3))', strokeWidth: 2, r: 4 }}
                      name="Depth (cm)"
                      connectNulls={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-area-trends">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Wound Area Progression
            </CardTitle>
            <CardDescription>
              Area reduction over time (calculated and measured)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {measurementData.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No area data available.</p>
              </div>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={measurementData} data-testid="chart-area">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                    <XAxis 
                      dataKey="date" 
                      fontSize={12}
                      stroke="#666"
                    />
                    <YAxis 
                      fontSize={12}
                      stroke="#666"
                      label={{ value: 'cm²', angle: -90, position: 'insideLeft' }}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#f8f9fa', 
                        border: '1px solid #dee2e6',
                        borderRadius: '6px'
                      }}
                    />
                    <Legend />
                    <Area 
                      type="monotone" 
                      dataKey="calculatedArea" 
                      stroke="hsl(var(--chart-1))" 
                      fill="hsl(var(--chart-1))" 
                      fillOpacity={0.3}
                      strokeWidth={2}
                      name="Calculated Area (L×W)"
                      connectNulls={false}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="area" 
                      stroke="hsl(var(--chart-2))" 
                      fill="hsl(var(--chart-2))" 
                      fillOpacity={0.2}
                      strokeWidth={2}
                      name="Measured Area"
                      connectNulls={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Healing Velocity Gauges */}
      <Card data-testid="card-healing-velocity-gauges">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gauge className="h-5 w-5" />
            Healing Velocity Analysis
          </CardTitle>
          <CardDescription>
            Current healing rate compared to clinical benchmarks
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Weekly Rate Gauge */}
            <div className="text-center" data-testid="gauge-weekly-rate">
              <div className="h-40 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <RadialBarChart 
                    cx="50%" 
                    cy="50%" 
                    innerRadius="40%" 
                    outerRadius="80%" 
                    data={[{ value: Math.min(100, (healingVelocity.weeklyRate / 10) * 100) }]}
                  >
                    <RadialBar 
                      dataKey="value" 
                      cornerRadius={10} 
                      fill={getHealingStatusColor(healingVelocity.status).includes('green') ? '#22c55e' : 
                           getHealingStatusColor(healingVelocity.status).includes('blue') ? '#3b82f6' :
                           getHealingStatusColor(healingVelocity.status).includes('orange') ? '#f59e0b' : '#ef4444'}
                    />
                  </RadialBarChart>
                </ResponsiveContainer>
              </div>
              <h4 className="font-medium">Weekly Rate</h4>
              <p className="text-xl font-bold">{healingVelocity.weeklyRate.toFixed(1)}%</p>
              <p className="text-sm text-muted-foreground">Benchmark: {healingVelocity.benchmark}%</p>
            </div>

            {/* Monthly Rate Gauge */}
            <div className="text-center" data-testid="gauge-monthly-rate">
              <div className="h-40 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <RadialBarChart 
                    cx="50%" 
                    cy="50%" 
                    innerRadius="40%" 
                    outerRadius="80%" 
                    data={[{ value: Math.min(100, (healingVelocity.monthlyRate / 40) * 100) }]}
                  >
                    <RadialBar 
                      dataKey="value" 
                      cornerRadius={10} 
                      fill={getHealingStatusColor(healingVelocity.status).includes('green') ? '#22c55e' : 
                           getHealingStatusColor(healingVelocity.status).includes('blue') ? '#3b82f6' :
                           getHealingStatusColor(healingVelocity.status).includes('orange') ? '#f59e0b' : '#ef4444'}
                    />
                  </RadialBarChart>
                </ResponsiveContainer>
              </div>
              <h4 className="font-medium">Monthly Rate</h4>
              <p className="text-xl font-bold">{healingVelocity.monthlyRate.toFixed(1)}%</p>
              <p className="text-sm text-muted-foreground">Target: 20%+</p>
            </div>

            {/* Overall Status */}
            <div className="text-center" data-testid="gauge-overall-status">
              <div className="h-40 flex items-center justify-center">
                <div className="text-center">
                  <div className={`mx-auto w-20 h-20 rounded-full flex items-center justify-center mb-4 ${
                    healingVelocity.status === 'excellent' ? 'bg-green-100 text-green-600' :
                    healingVelocity.status === 'good' ? 'bg-blue-100 text-blue-600' :
                    healingVelocity.status === 'fair' ? 'bg-orange-100 text-orange-600' :
                    'bg-red-100 text-red-600'
                  }`}>
                    {healingVelocity.trend === 'improving' && <TrendingUp className="h-8 w-8" />}
                    {healingVelocity.trend === 'declining' && <TrendingDown className="h-8 w-8" />}
                    {healingVelocity.trend === 'stable' && <Activity className="h-8 w-8" />}
                  </div>
                </div>
              </div>
              <h4 className="font-medium">Overall Status</h4>
              <p className={`text-xl font-bold ${getHealingStatusColor(healingVelocity.status)}`}>
                {healingVelocity.status.charAt(0).toUpperCase() + healingVelocity.status.slice(1)}
              </p>
              <p className="text-sm text-muted-foreground">
                Trend: {healingVelocity.trend.charAt(0).toUpperCase() + healingVelocity.trend.slice(1)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Encounter Timeline */}
      <Card data-testid="card-encounter-timeline">
        <CardHeader>
          <CardTitle>Encounter Timeline</CardTitle>
          <CardDescription>
            Chronological view of all encounters with measurement markers
          </CardDescription>
        </CardHeader>
        <CardContent>
          {encounters.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="no-encounters-message">
              <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No encounters recorded for this episode yet.</p>
            </div>
          ) : (
            <div className="space-y-4" data-testid="encounter-timeline-list">
              {encounters
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .map((encounter, index) => {
                  const woundDetails = encounter.woundDetails as any;
                  const hasMeasurements = woundDetails?.measurements;
                  
                  return (
                    <div 
                      key={encounter.id} 
                      className="flex items-start gap-4 pb-4 border-b last:border-b-0"
                      data-testid={`timeline-encounter-${index}`}
                    >
                      <div className={`flex-shrink-0 w-3 h-3 rounded-full mt-2 ${
                        hasMeasurements ? 'bg-primary' : 'bg-muted-foreground'
                      }`}></div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium" data-testid={`encounter-date-${index}`}>
                            {new Date(encounter.date).toLocaleDateString()}
                          </span>
                          <div className="flex gap-2">
                            {hasMeasurements && (
                              <Badge 
                                variant="outline" 
                                className="bg-blue-50 text-blue-600 border-blue-200"
                                data-testid={`badge-measurements-${index}`}
                              >
                                <Ruler className="h-3 w-3 mr-1" />
                                Measurements
                              </Badge>
                            )}
                            <Badge 
                              variant="outline"
                              data-testid={`encounter-type-${index}`}
                            >
                              {woundDetails?.type || 'Standard Visit'}
                            </Badge>
                          </div>
                        </div>
                        {hasMeasurements && (
                          <div className="text-sm text-muted-foreground mb-1" data-testid={`measurements-${index}`}>
                            L: {woundDetails.measurements.length || 'N/A'} × 
                            W: {woundDetails.measurements.width || 'N/A'} × 
                            D: {woundDetails.measurements.depth || 'N/A'} 
                            {woundDetails.measurements.unit && ` ${woundDetails.measurements.unit}`}
                          </div>
                        )}
                        <p className="text-sm text-muted-foreground" data-testid={`encounter-summary-${index}`}>
                          Assessment and treatment documented
                        </p>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}