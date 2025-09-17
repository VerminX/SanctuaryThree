import { AppError, ErrorCategory, ErrorSeverity, errorLogger } from './errorManager';
import type { Request, Response } from 'express';

// Performance monitoring interfaces
export interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  timestamp: Date;
  tags: Record<string, string>;
}

export interface AlertRule {
  id: string;
  name: string;
  metric: string;
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  threshold: number;
  duration_minutes: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  enabled: boolean;
  cooldown_minutes: number;
  channels: AlertChannel[];
}

export interface AlertChannel {
  type: 'email' | 'webhook' | 'log';
  config: Record<string, any>;
  enabled: boolean;
}

export interface Alert {
  id: string;
  rule_id: string;
  metric_name: string;
  current_value: number;
  threshold: number;
  severity: string;
  message: string;
  triggered_at: Date;
  resolved_at?: Date;
  status: 'TRIGGERED' | 'RESOLVED';
}

export interface PerformanceSummary {
  uptime_seconds: number;
  total_requests: number;
  requests_per_minute: number;
  error_rate_percentage: number;
  average_response_time_ms: number;
  p95_response_time_ms: number;
  active_alerts: number;
  memory_usage: {
    heap_used_mb: number;
    heap_total_mb: number;
    external_mb: number;
    rss_mb: number;
  };
  database: {
    average_query_time_ms: number;
    active_connections: number;
    query_error_rate: number;
  };
  external_apis: {
    openai_success_rate: number;
    cms_api_success_rate: number;
  };
}

export class PerformanceMonitor {
  private metrics: Map<string, PerformanceMetric[]> = new Map();
  private alerts: Map<string, Alert> = new Map();
  private alertRules: AlertRule[] = [];
  private startTime: Date;
  private totalRequests: number = 0;
  private totalErrors: number = 0;
  private responseTimes: number[] = [];
  private requestsPerMinute: number[] = [];
  private lastMinuteRequests: number = 0;
  private lastAlertCheck: Date = new Date();
  
  // Rolling time window data for sustained condition evaluation
  private sustainedConditionTracker: Map<string, Map<string, { timestamp: Date; value: number; breachesThreshold: boolean }[]>> = new Map();

  constructor() {
    this.startTime = new Date();
    this.initializeDefaultAlertRules();
    this.startPerformanceMonitoring();
  }

  /**
   * Initialize default alert rules for healthcare application
   */
  private initializeDefaultAlertRules() {
    this.alertRules = [
      {
        id: 'high_response_time',
        name: 'High Response Time Alert',
        metric: 'response_time_ms',
        operator: 'gt',
        threshold: 2000, // 2 seconds
        duration_minutes: 2,
        severity: 'HIGH',
        enabled: true,
        cooldown_minutes: 5,
        channels: [
          { type: 'log', config: {}, enabled: true },
          { type: 'webhook', config: { url: process.env.ALERT_WEBHOOK_URL }, enabled: !!process.env.ALERT_WEBHOOK_URL }
        ]
      },
      {
        id: 'high_error_rate',
        name: 'High Error Rate Alert', 
        metric: 'error_rate_percentage',
        operator: 'gt',
        threshold: 5, // 5% error rate
        duration_minutes: 1,
        severity: 'CRITICAL',
        enabled: true,
        cooldown_minutes: 10,
        channels: [
          { type: 'log', config: {}, enabled: true },
          { type: 'webhook', config: { url: process.env.ALERT_WEBHOOK_URL }, enabled: !!process.env.ALERT_WEBHOOK_URL }
        ]
      },
      {
        id: 'high_memory_usage',
        name: 'High Memory Usage Alert',
        metric: 'memory_usage_mb',
        operator: 'gt',
        threshold: 750, // 750MB
        duration_minutes: 3,
        severity: 'MEDIUM',
        enabled: true,
        cooldown_minutes: 15,
        channels: [
          { type: 'log', config: {}, enabled: true }
        ]
      },
      {
        id: 'database_slow_queries',
        name: 'Database Slow Queries Alert',
        metric: 'avg_query_time_ms',
        operator: 'gt',
        threshold: 1000, // 1 second
        duration_minutes: 2,
        severity: 'HIGH',
        enabled: true,
        cooldown_minutes: 5,
        channels: [
          { type: 'log', config: {}, enabled: true }
        ]
      },
      {
        id: 'external_api_failures',
        name: 'External API Failures Alert',
        metric: 'external_api_success_rate',
        operator: 'lt',
        threshold: 90, // 90% success rate
        duration_minutes: 3,
        severity: 'HIGH',
        enabled: true,
        cooldown_minutes: 10,
        channels: [
          { type: 'log', config: {}, enabled: true }
        ]
      }
    ];
  }

  /**
   * Express middleware to collect request performance metrics
   */
  createPerformanceMiddleware() {
    const monitor = this; // Capture instance reference for closure
    
    return (req: Request, res: Response, next: Function) => {
      const startTime = Date.now();
      const correlationId = (req as any).correlationId;

      // Track request start
      monitor.totalRequests++;
      monitor.lastMinuteRequests++;

      // Override res.end to capture response metrics
      const originalEnd = res.end.bind(res);
      
      // Capture metrics when response ends
      const captureMetrics = () => {
        const responseTime = Date.now() - startTime;
        const statusCode = res.statusCode;

        // Record metrics using captured monitor instance
        monitor.recordMetric('response_time_ms', responseTime, 'milliseconds', {
          method: req.method,
          path: monitor.sanitizePath(req.path),
          status_code: statusCode.toString()
        });

        // Track error rates
        if (statusCode >= 400) {
          monitor.totalErrors++;
          monitor.recordMetric('error_count', 1, 'count', {
            method: req.method,
            path: monitor.sanitizePath(req.path),
            status_code: statusCode.toString()
          });
        }

        // Store response time for statistical analysis
        monitor.responseTimes.push(responseTime);
        if (monitor.responseTimes.length > 1000) {
          monitor.responseTimes = monitor.responseTimes.slice(-1000); // Keep last 1000
        }
      };

      // Override with proper Express overload signatures
      res.end = function(chunk?: any, encoding?: any, cb?: any) {
        // Capture metrics before calling original
        captureMetrics();
        
        // Handle all Express overload cases correctly
        if (arguments.length === 0) {
          // res.end()
          return originalEnd();
        } else if (arguments.length === 1) {
          if (typeof chunk === 'function') {
            // res.end(callback)
            return originalEnd(chunk);
          } else {
            // res.end(chunk)
            return originalEnd(chunk);
          }
        } else if (arguments.length === 2) {
          if (typeof encoding === 'function') {
            // res.end(chunk, callback)
            return originalEnd(chunk, encoding);
          } else {
            // res.end(chunk, encoding)
            return originalEnd(chunk, encoding);
          }
        } else {
          // res.end(chunk, encoding, callback)
          return originalEnd(chunk, encoding, cb);
        }
      };

      next();
    };
  }

  /**
   * Record a performance metric
   */
  recordMetric(name: string, value: number, unit: string, tags: Record<string, string> = {}) {
    const metric: PerformanceMetric = {
      name,
      value,
      unit,
      timestamp: new Date(),
      tags
    };

    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }

    const metricHistory = this.metrics.get(name)!;
    metricHistory.push(metric);

    // Keep only last 1000 metrics per type for memory efficiency
    if (metricHistory.length > 1000) {
      metricHistory.splice(0, metricHistory.length - 1000);
    }

    // Check alert rules for this metric
    this.checkAlertRules(name, value);
  }

  /**
   * Get comprehensive performance summary
   */
  getPerformanceSummary(): PerformanceSummary {
    const uptime = (Date.now() - this.startTime.getTime()) / 1000;
    const errorRate = this.totalRequests > 0 ? (this.totalErrors / this.totalRequests) * 100 : 0;
    const avgResponseTime = this.responseTimes.length > 0 
      ? this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length 
      : 0;
    const p95ResponseTime = this.calculatePercentile(this.responseTimes, 95);

    return {
      uptime_seconds: Math.round(uptime),
      total_requests: this.totalRequests,
      requests_per_minute: this.getRequestsPerMinute(),
      error_rate_percentage: Math.round(errorRate * 100) / 100,
      average_response_time_ms: Math.round(avgResponseTime),
      p95_response_time_ms: Math.round(p95ResponseTime),
      active_alerts: this.getActiveAlertsCount(),
      memory_usage: this.getMemoryMetrics(),
      database: this.getDatabaseMetrics(),
      external_apis: this.getExternalAPIMetrics()
    };
  }

  /**
   * Get current alert status
   */
  getAlertStatus() {
    const activeAlerts = Array.from(this.alerts.values()).filter(a => a.status === 'TRIGGERED');
    const resolvedAlerts = Array.from(this.alerts.values()).filter(a => a.status === 'RESOLVED');

    return {
      active_alerts: activeAlerts,
      resolved_alerts: resolvedAlerts.slice(-10), // Last 10 resolved alerts
      alert_rules: this.alertRules.filter(r => r.enabled),
      total_active: activeAlerts.length,
      severity_breakdown: {
        CRITICAL: activeAlerts.filter(a => a.severity === 'CRITICAL').length,
        HIGH: activeAlerts.filter(a => a.severity === 'HIGH').length,
        MEDIUM: activeAlerts.filter(a => a.severity === 'MEDIUM').length,
        LOW: activeAlerts.filter(a => a.severity === 'LOW').length
      }
    };
  }

  /**
   * Get metrics history for a specific metric
   */
  getMetricHistory(metricName: string, minutes: number = 60): PerformanceMetric[] {
    const since = new Date(Date.now() - minutes * 60 * 1000);
    const metrics = this.metrics.get(metricName) || [];
    
    return metrics.filter(m => m.timestamp >= since);
  }

  /**
   * Add or update alert rule
   */
  updateAlertRule(rule: AlertRule) {
    const existingIndex = this.alertRules.findIndex(r => r.id === rule.id);
    if (existingIndex >= 0) {
      this.alertRules[existingIndex] = rule;
    } else {
      this.alertRules.push(rule);
    }
  }

  /**
   * Check alert rules against current metrics using sustained condition evaluation
   */
  private checkAlertRules(metricName: string, currentValue: number) {
    const relevantRules = this.alertRules.filter(r => 
      r.enabled && r.metric === metricName
    );

    for (const rule of relevantRules) {
      // Track sustained conditions over time
      this.trackSustainedCondition(rule, metricName, currentValue);
      
      // Evaluate if condition has been sustained for required duration
      const shouldTrigger = this.evaluateSustainedCondition(rule, metricName);
      const existingAlert = this.alerts.get(rule.id);

      if (shouldTrigger && (!existingAlert || existingAlert.status === 'RESOLVED')) {
        const aggregatedValue = this.getAggregatedValue(rule, metricName);
        this.triggerAlert(rule, metricName, aggregatedValue);
      } else if (!shouldTrigger && existingAlert && existingAlert.status === 'TRIGGERED') {
        this.resolveAlert(rule.id);
      }
    }
  }

  /**
   * Evaluate if alert condition is met for a single value
   */
  private evaluateAlertCondition(rule: AlertRule, value: number): boolean {
    switch (rule.operator) {
      case 'gt': return value > rule.threshold;
      case 'lt': return value < rule.threshold;
      case 'eq': return value === rule.threshold;
      case 'gte': return value >= rule.threshold;
      case 'lte': return value <= rule.threshold;
      default: return false;
    }
  }

  /**
   * Track sustained condition data for alert evaluation
   */
  private trackSustainedCondition(rule: AlertRule, metricName: string, currentValue: number) {
    if (!this.sustainedConditionTracker.has(rule.id)) {
      this.sustainedConditionTracker.set(rule.id, new Map());
    }
    
    const ruleTracker = this.sustainedConditionTracker.get(rule.id)!;
    
    if (!ruleTracker.has(metricName)) {
      ruleTracker.set(metricName, []);
    }
    
    const metricTracker = ruleTracker.get(metricName)!;
    const now = new Date();
    const breachesThreshold = this.evaluateAlertCondition(rule, currentValue);
    
    // Add current data point
    metricTracker.push({
      timestamp: now,
      value: currentValue,
      breachesThreshold
    });
    
    // Remove data points outside the evaluation window (duration + buffer)
    const windowStart = new Date(now.getTime() - (rule.duration_minutes + 1) * 60 * 1000);
    const filteredData = metricTracker.filter(point => point.timestamp >= windowStart);
    ruleTracker.set(metricName, filteredData);
  }

  /**
   * Evaluate if condition has been sustained for required duration
   */
  private evaluateSustainedCondition(rule: AlertRule, metricName: string): boolean {
    const ruleTracker = this.sustainedConditionTracker.get(rule.id);
    if (!ruleTracker) return false;
    
    const metricTracker = ruleTracker.get(metricName);
    if (!metricTracker || metricTracker.length === 0) return false;
    
    const now = new Date();
    const windowStart = new Date(now.getTime() - rule.duration_minutes * 60 * 1000);
    
    // Get data points within the duration window
    const relevantData = metricTracker.filter(point => point.timestamp >= windowStart);
    
    if (relevantData.length === 0) return false;
    
    // Check if condition has been consistently breached
    // We need at least 50% of data points to breach threshold to consider it sustained
    const breachingPoints = relevantData.filter(point => point.breachesThreshold);
    const breachPercentage = breachingPoints.length / relevantData.length;
    
    // Also check that we have data spanning most of the duration window
    const dataSpan = Math.max(...relevantData.map(p => p.timestamp.getTime())) - 
                    Math.min(...relevantData.map(p => p.timestamp.getTime()));
    const minSpan = (rule.duration_minutes * 60 * 1000) * 0.7; // At least 70% of duration
    
    // Log sustained condition evaluation for debugging
    const debugInfo = new AppError(
      `Sustained condition evaluation for ${rule.name}`,
      ErrorCategory.SYSTEM,
      ErrorSeverity.LOW,
      200,
      {
        rule_id: rule.id,
        metric: metricName,
        data_points: relevantData.length,
        breach_percentage: Math.round(breachPercentage * 100),
        data_span_minutes: Math.round(dataSpan / 60000),
        required_minutes: rule.duration_minutes,
        threshold_met: breachPercentage >= 0.5 && dataSpan >= minSpan
      }
    );
    errorLogger.logError(debugInfo);
    
    return breachPercentage >= 0.5 && dataSpan >= minSpan;
  }

  /**
   * Get aggregated value for sustained condition
   */
  private getAggregatedValue(rule: AlertRule, metricName: string): number {
    const ruleTracker = this.sustainedConditionTracker.get(rule.id);
    if (!ruleTracker) return 0;
    
    const metricTracker = ruleTracker.get(metricName);
    if (!metricTracker || metricTracker.length === 0) return 0;
    
    const now = new Date();
    const windowStart = new Date(now.getTime() - rule.duration_minutes * 60 * 1000);
    const relevantData = metricTracker.filter(point => point.timestamp >= windowStart);
    
    if (relevantData.length === 0) return 0;
    
    // Return average value over the sustained period
    return relevantData.reduce((sum, point) => sum + point.value, 0) / relevantData.length;
  }

  /**
   * Trigger a new alert
   */
  private triggerAlert(rule: AlertRule, metricName: string, aggregatedValue: number) {
    // Check cooldown period
    const existingAlert = this.alerts.get(rule.id);
    if (existingAlert && existingAlert.resolved_at) {
      const cooldownEnd = new Date(existingAlert.resolved_at.getTime() + rule.cooldown_minutes * 60 * 1000);
      if (new Date() < cooldownEnd) {
        const cooldownInfo = new AppError(
          `Alert ${rule.name} still in cooldown period`,
          ErrorCategory.SYSTEM,
          ErrorSeverity.LOW,
          200,
          {
            rule_id: rule.id,
            metric: metricName,
            cooldown_end: cooldownEnd.toISOString(),
            minutes_remaining: Math.ceil((cooldownEnd.getTime() - Date.now()) / 60000)
          }
        );
        errorLogger.logError(cooldownInfo);
        return; // Still in cooldown period
      }
    }

    const alert: Alert = {
      id: `${rule.id}_${Date.now()}`,
      rule_id: rule.id,
      metric_name: metricName,
      current_value: Math.round(aggregatedValue * 100) / 100,
      threshold: rule.threshold,
      severity: rule.severity,
      message: `${rule.name}: ${metricName} sustained at ${Math.round(aggregatedValue * 100) / 100} for ${rule.duration_minutes} minutes (threshold: ${rule.threshold})`,
      triggered_at: new Date(),
      status: 'TRIGGERED'
    };

    this.alerts.set(rule.id, alert);

    // Send alert through configured channels
    this.sendAlert(alert, rule.channels);

    // Log alert trigger for audit
    const alertLog = new AppError(
      `Performance alert triggered: ${alert.message}`,
      ErrorCategory.SYSTEM,
      rule.severity === 'CRITICAL' ? ErrorSeverity.CRITICAL : 
      rule.severity === 'HIGH' ? ErrorSeverity.HIGH : 
      rule.severity === 'MEDIUM' ? ErrorSeverity.MEDIUM : ErrorSeverity.LOW,
      503,
      {
        alert_id: alert.id,
        rule_id: rule.id,
        metric: metricName,
        aggregated_value: aggregatedValue,
        threshold: rule.threshold,
        duration_minutes: rule.duration_minutes,
        severity: rule.severity,
        sustained_condition: true
      }
    );
    errorLogger.logError(alertLog);
  }

  /**
   * Resolve an active alert
   */
  private resolveAlert(ruleId: string) {
    const alert = this.alerts.get(ruleId);
    if (alert && alert.status === 'TRIGGERED') {
      alert.status = 'RESOLVED';
      alert.resolved_at = new Date();

      // Log alert resolution
      const resolutionLog = new AppError(
        `Performance alert resolved: ${alert.message}`,
        ErrorCategory.SYSTEM,
        ErrorSeverity.INFO,
        200,
        {
          alert_id: alert.id,
          rule_id: alert.rule_id,
          duration_minutes: Math.round((alert.resolved_at.getTime() - alert.triggered_at.getTime()) / 60000)
        }
      );
      errorLogger.logError(resolutionLog);
    }
  }

  /**
   * Send alert through configured channels
   */
  private async sendAlert(alert: Alert, channels: AlertChannel[]) {
    for (const channel of channels.filter(c => c.enabled)) {
      try {
        switch (channel.type) {
          case 'log':
            // Already logged in triggerAlert
            break;
          case 'webhook':
            if (channel.config.url) {
              await this.sendWebhookAlert(alert, channel.config.url);
            }
            break;
          case 'email':
            if (channel.config.to && channel.config.smtp) {
              await this.sendEmailAlert(alert, channel.config);
            }
            break;
        }
      } catch (error) {
        const channelError = new AppError(
          `Failed to send alert through ${channel.type} channel`,
          ErrorCategory.SYSTEM,
          ErrorSeverity.MEDIUM,
          500,
          {
            alert_id: alert.id,
            channel_type: channel.type,
            error: error instanceof Error ? error.message : String(error)
          },
          error instanceof Error ? error : undefined
        );
        errorLogger.logError(channelError);
      }
    }
  }

  /**
   * Send webhook alert
   */
  private async sendWebhookAlert(alert: Alert, webhookUrl: string) {
    const payload = {
      alert_id: alert.id,
      metric: alert.metric_name,
      value: alert.current_value,
      threshold: alert.threshold,
      severity: alert.severity,
      message: alert.message,
      triggered_at: alert.triggered_at.toISOString(),
      app_name: 'HIPAA Pre-determination Portal',
      environment: process.env.NODE_ENV || 'development'
    };

    // Note: In a real implementation, you'd use fetch or axios here
    // For this example, we'll just log the webhook attempt
    const webhookLog = new AppError(
      `Webhook alert sent: ${alert.message}`,
      ErrorCategory.SYSTEM,
      ErrorSeverity.INFO,
      200,
      {
        webhook_url: webhookUrl.replace(/\/\/[^@]*@/, '//***@'), // Mask credentials
        payload
      }
    );
    errorLogger.logError(webhookLog);
  }

  /**
   * Send email alert (placeholder implementation)
   */
  private async sendEmailAlert(alert: Alert, emailConfig: any) {
    // Note: In a real implementation, you'd integrate with an email service
    const emailLog = new AppError(
      `Email alert would be sent: ${alert.message}`,
      ErrorCategory.SYSTEM,
      ErrorSeverity.INFO,
      200,
      {
        recipient: emailConfig.to,
        subject: `[${alert.severity}] Performance Alert: ${alert.metric_name}`,
        alert_id: alert.id
      }
    );
    errorLogger.logError(emailLog);
  }

  /**
   * Start background performance monitoring
   */
  private startPerformanceMonitoring() {
    // Monitor requests per minute
    setInterval(() => {
      this.requestsPerMinute.push(this.lastMinuteRequests);
      this.lastMinuteRequests = 0;
      
      // Keep only last hour of data
      if (this.requestsPerMinute.length > 60) {
        this.requestsPerMinute.shift();
      }

      // Record system metrics
      this.recordSystemMetrics();
    }, 60000); // Every minute

    // Alert evaluation
    setInterval(() => {
      this.evaluateSystemAlerts();
    }, 30000); // Every 30 seconds
  }

  /**
   * Record system-level metrics
   */
  private recordSystemMetrics() {
    const memoryUsage = process.memoryUsage();
    this.recordMetric('memory_usage_mb', memoryUsage.heapUsed / 1024 / 1024, 'megabytes', {});

    const errorRate = this.totalRequests > 0 ? (this.totalErrors / this.totalRequests) * 100 : 0;
    this.recordMetric('error_rate_percentage', errorRate, 'percentage', {});
  }

  /**
   * Evaluate system-level alert conditions
   */
  private evaluateSystemAlerts() {
    // This will be called by the interval to check system-wide conditions
    const summary = this.getPerformanceSummary();
    
    // Record derived metrics for alert evaluation
    this.recordMetric('error_rate_percentage', summary.error_rate_percentage, 'percentage', {});
    this.recordMetric('memory_usage_mb', summary.memory_usage.heap_used_mb, 'megabytes', {});
    this.recordMetric('avg_response_time_ms', summary.average_response_time_ms, 'milliseconds', {});
  }

  /**
   * Helper methods
   */
  private sanitizePath(path: string): string {
    return path
      .replace(/\/[a-f0-9\-]{36}/gi, '/[ID]') // UUIDs
      .replace(/\/\d+/g, '/[ID]') // Numeric IDs
      .replace(/\?.*/, ''); // Query parameters
  }

  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * percentile / 100) - 1;
    return sorted[index] || 0;
  }

  private getActiveAlertsCount(): number {
    return Array.from(this.alerts.values()).filter(a => a.status === 'TRIGGERED').length;
  }

  private getRequestsPerMinute(): number {
    return this.requestsPerMinute.length > 0 
      ? Math.round(this.requestsPerMinute.reduce((a, b) => a + b, 0) / this.requestsPerMinute.length)
      : 0;
  }

  private getMemoryMetrics() {
    const usage = process.memoryUsage();
    return {
      heap_used_mb: Math.round(usage.heapUsed / 1024 / 1024),
      heap_total_mb: Math.round(usage.heapTotal / 1024 / 1024),
      external_mb: Math.round(usage.external / 1024 / 1024),
      rss_mb: Math.round(usage.rss / 1024 / 1024)
    };
  }

  private getDatabaseMetrics() {
    // Get metrics from recorded database metrics
    try {
      const queryTimeMetrics = this.metrics.get('avg_query_time_ms') || [];
      const activeConnectionMetrics = this.metrics.get('database_active_connections') || [];
      const errorRateMetrics = this.metrics.get('database_query_error_rate') || [];
      
      // Calculate recent averages (last 5 minutes)
      const recentTime = new Date(Date.now() - 5 * 60 * 1000);
      
      const recentQueryTimes = queryTimeMetrics.filter(m => m.timestamp >= recentTime);
      const recentConnections = activeConnectionMetrics.filter(m => m.timestamp >= recentTime);
      const recentErrorRates = errorRateMetrics.filter(m => m.timestamp >= recentTime);
      
      const avgQueryTime = recentQueryTimes.length > 0
        ? recentQueryTimes.reduce((sum, m) => sum + m.value, 0) / recentQueryTimes.length
        : 0;
        
      const activeConnections = recentConnections.length > 0
        ? recentConnections[recentConnections.length - 1].value // Most recent value
        : 0;
        
      const queryErrorRate = recentErrorRates.length > 0
        ? recentErrorRates[recentErrorRates.length - 1].value // Most recent value
        : 0;
      
      return {
        average_query_time_ms: Math.round(avgQueryTime * 100) / 100,
        active_connections: Math.round(activeConnections),
        query_error_rate: Math.round(queryErrorRate * 100) / 100
      };
    } catch (error) {
      const dbMetricsError = new AppError(
        `Failed to get database metrics`,
        ErrorCategory.SYSTEM,
        ErrorSeverity.LOW,
        500,
        {
          error: error instanceof Error ? error.message : String(error)
        },
        error instanceof Error ? error : undefined
      );
      errorLogger.logError(dbMetricsError);
      
      return {
        average_query_time_ms: 0,
        active_connections: 0,
        query_error_rate: 0
      };
    }
  }

  private getExternalAPIMetrics() {
    // Get metrics from recorded API circuit breaker metrics
    try {
      const openaiMetrics = this.metrics.get('openai_success_rate') || [];
      const cmsMetrics = this.metrics.get('cms_api_success_rate') || [];
      
      // Calculate recent averages (last 10 minutes)
      const recentTime = new Date(Date.now() - 10 * 60 * 1000);
      
      const recentOpenAI = openaiMetrics.filter(m => m.timestamp >= recentTime);
      const recentCMS = cmsMetrics.filter(m => m.timestamp >= recentTime);
      
      const openaiSuccessRate = recentOpenAI.length > 0
        ? recentOpenAI[recentOpenAI.length - 1].value // Most recent value
        : 100; // Default to 100% if no recent data
        
      const cmsSuccessRate = recentCMS.length > 0
        ? recentCMS[recentCMS.length - 1].value // Most recent value
        : 100; // Default to 100% if no recent data
      
      return {
        openai_success_rate: Math.round(openaiSuccessRate * 100) / 100,
        cms_api_success_rate: Math.round(cmsSuccessRate * 100) / 100
      };
    } catch (error) {
      const apiMetricsError = new AppError(
        `Failed to get external API metrics`,
        ErrorCategory.SYSTEM,
        ErrorSeverity.LOW,
        500,
        {
          error: error instanceof Error ? error.message : String(error)
        },
        error instanceof Error ? error : undefined
      );
      errorLogger.logError(apiMetricsError);
      
      return {
        openai_success_rate: 0,
        cms_api_success_rate: 0
      };
    }
  }
}

// Export singleton instance
export const performanceMonitor = new PerformanceMonitor();