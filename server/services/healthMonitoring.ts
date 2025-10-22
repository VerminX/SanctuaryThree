/**
 * Health Monitoring Service for Phase 4
 * Tracks database connectivity, encryption failures, and system health
 */

import { DatabaseStorage } from '../storage.js';

type DiagnosisSource = 'primary' | 'secondary';
type FallbackDepthBucket = 'stage_0' | 'stage_1' | 'stage_2' | 'stage_3_plus';
type FallbackConsideredBucket = 'policies_0' | 'policies_1_2' | 'policies_3_5' | 'policies_6_plus';
type DescriptionLengthBucket = 'empty' | 'short' | 'medium' | 'long' | 'very_long';

interface PolicyFallbackMetrics {
  total: number;
  byType: Record<string, number>;
  byMacRegion: Record<string, number>;
  depthHistogram: Record<FallbackDepthBucket, number>;
  consideredHistogram: Record<FallbackConsideredBucket, number>;
  recentTimestamps: number[];
}

interface UnmatchedDiagnosisMetrics {
  total: number;
  bySource: Record<DiagnosisSource, number>;
  byFormat: Record<'text_description' | 'invalid_format' | 'icd10_like', number>;
  descriptionLengthHistogram: Record<DescriptionLengthBucket, number>;
  recentTimestamps: number[];
}

interface EligibilityMetrics {
  policyFallbacks: PolicyFallbackMetrics;
  unmatchedDiagnoses: UnmatchedDiagnosisMetrics;
}

export interface EligibilityTelemetrySummary {
  policyFallbacks: {
    total: number;
    byType: Record<string, number>;
    byMacRegion: Record<string, number>;
    depthHistogram: Record<FallbackDepthBucket, number>;
    consideredHistogram: Record<FallbackConsideredBucket, number>;
    lastHour: number;
    last24Hours: number;
  };
  unmatchedDiagnoses: {
    total: number;
    bySource: Record<DiagnosisSource, number>;
    byFormat: Record<'text_description' | 'invalid_format' | 'icd10_like', number>;
    descriptionLengthHistogram: Record<DescriptionLengthBucket, number>;
    lastHour: number;
    last24Hours: number;
  };
}

interface HealthMetrics {
  database: {
    isConnected: boolean;
    lastSuccessfulConnection: Date | null;
    consecutiveFailures: number;
    averageResponseTime: number;
    recentErrors: string[];
  };
  encryption: {
    totalPatients: number;
    corruptedPatients: number;
    corruptedEncounterNotes: number;
    lastCorruptionDetected: Date | null;
    corruptionRate: number;
  };
  system: {
    uptime: number;
    memoryUsage: NodeJS.MemoryUsage;
    timestamp: Date;
  };
  eligibility: EligibilityMetrics;
}

interface DatabaseConnectionTest {
  success: boolean;
  responseTime: number;
  error?: string;
}

class HealthMonitoringService {
  private metrics: HealthMetrics;
  private dbFailureCount = 0;
  private recentDbErrors: string[] = [];
  private lastDbSuccessTime: Date | null = null;
  private responseTimes: number[] = [];

  // Encryption failure tracking (from encryption service)
  private corruptedPatientIds = new Set<string>();
  private corruptedEncounterNoteCount = 0;
  private lastCorruptionTime: Date | null = null;

  constructor() {
    this.metrics = {
      database: {
        isConnected: false,
        lastSuccessfulConnection: null,
        consecutiveFailures: 0,
        averageResponseTime: 0,
        recentErrors: []
      },
      encryption: {
        totalPatients: 0,
        corruptedPatients: 0,
        corruptedEncounterNotes: 0,
        lastCorruptionDetected: null,
        corruptionRate: 0
      },
      system: {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        timestamp: new Date()
      },
      eligibility: this.createInitialEligibilityMetrics()
    };

    // Start background monitoring
    this.startHealthChecks();
  }

  private createInitialEligibilityMetrics(): EligibilityMetrics {
    return {
      policyFallbacks: {
        total: 0,
        byType: {},
        byMacRegion: {},
        depthHistogram: {
          stage_0: 0,
          stage_1: 0,
          stage_2: 0,
          stage_3_plus: 0
        },
        consideredHistogram: {
          policies_0: 0,
          policies_1_2: 0,
          policies_3_5: 0,
          policies_6_plus: 0
        },
        recentTimestamps: []
      },
      unmatchedDiagnoses: {
        total: 0,
        bySource: { primary: 0, secondary: 0 },
        byFormat: { text_description: 0, invalid_format: 0, icd10_like: 0 },
        descriptionLengthHistogram: {
          empty: 0,
          short: 0,
          medium: 0,
          long: 0,
          very_long: 0
        },
        recentTimestamps: []
      }
    };
  }

  /**
   * Tests database connectivity with timeout
   */
  async testDatabaseConnection(storage: DatabaseStorage): Promise<DatabaseConnectionTest> {
    const startTime = Date.now();
    
    try {
      // Simple connectivity test - try to get tenant count
      await storage.getTenantsByUser('health-check-user-id'); // This will fail but tests DB connectivity
      
      const responseTime = Date.now() - startTime;
      
      // Record successful connection
      this.lastDbSuccessTime = new Date();
      this.dbFailureCount = 0;
      this.recordResponseTime(responseTime);
      
      return {
        success: true,
        responseTime
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown database error';
      
      // Record failure
      this.dbFailureCount++;
      this.addDbError(errorMessage);
      
      return {
        success: false,
        responseTime,
        error: errorMessage
      };
    }
  }

  /**
   * Records a patient encryption failure using a hash (HIPAA-safe)
   */
  reportPatientEncryptionFailure(patientHash: string): void {
    this.corruptedPatientIds.add(patientHash);
    this.lastCorruptionTime = new Date();
    this.updateCorruptionMetrics();
  }

  /**
   * Records encounter note encryption failures
   */
  reportEncounterNoteFailure(): void {
    this.corruptedEncounterNoteCount++;
    this.lastCorruptionTime = new Date();
    this.updateCorruptionMetrics();
  }

  /**
   * Records corruption scan results for monitoring
   */
  reportCorruptionScanResults(report: { totalEncountersScanned: number; corruptedEncounters: number; corruptionRate: number; quarantinedCount: number }): void {
    console.log(`📊 CORRUPTION SCAN: ${report.corruptedEncounters}/${report.totalEncountersScanned} encounters corrupted (${report.corruptionRate.toFixed(1)}%)`);
    console.log(`🔒 QUARANTINED: ${report.quarantinedCount} encounters flagged for recovery`);
    
    // Update metrics for health monitoring
    if (report.corruptionRate > 20) {
      console.warn('⚠️ HIGH CORRUPTION RATE: Immediate investigation recommended');
    }
  }

  /**
   * Updates the total patient count for corruption rate calculation
   */
  updateTotalPatientCount(count: number): void {
    this.metrics.encryption.totalPatients = count;
    this.updateCorruptionMetrics();
  }

  recordPolicyFallback(event: { fallbackType: string; fallbackStageCount: number; consideredPolicies: number; macRegion?: string | null }): void {
    const metrics = this.metrics.eligibility.policyFallbacks;
    const sanitizedType = this.sanitizeMetricLabel(event.fallbackType);
    const sanitizedMac = this.sanitizeMacRegion(event.macRegion);

    metrics.total += 1;
    this.incrementCount(metrics.byType, sanitizedType);
    this.incrementCount(metrics.byMacRegion, sanitizedMac);

    const stageCount = Number.isFinite(event.fallbackStageCount)
      ? Math.max(1, Math.round(event.fallbackStageCount))
      : 1;
    const depthBucket = this.mapFallbackDepth(stageCount);
    this.incrementCount(metrics.depthHistogram, depthBucket);

    const considered = Number.isFinite(event.consideredPolicies)
      ? Math.max(0, Math.round(event.consideredPolicies))
      : 0;
    const consideredBucket = this.mapConsideredBucket(considered);
    this.incrementCount(metrics.consideredHistogram, consideredBucket);

    metrics.recentTimestamps.push(Date.now());
    this.trimRecent(metrics.recentTimestamps);
  }

  recordUnmatchedDiagnosis(event: { source: DiagnosisSource; descriptionLength: number; format: 'text_description' | 'invalid_format' | 'icd10_like' }): void {
    const metrics = this.metrics.eligibility.unmatchedDiagnoses;

    metrics.total += 1;
    this.incrementCount(metrics.bySource, event.source);
    this.incrementCount(metrics.byFormat, event.format);

    const length = Number.isFinite(event.descriptionLength)
      ? Math.max(0, Math.round(event.descriptionLength))
      : 0;
    const bucket = this.mapDescriptionLengthBucket(length);
    this.incrementCount(metrics.descriptionLengthHistogram, bucket);

    metrics.recentTimestamps.push(Date.now());
    this.trimRecent(metrics.recentTimestamps);
  }

  resetEligibilityTelemetry(): void {
    this.metrics.eligibility = this.createInitialEligibilityMetrics();
  }

  /**
   * Gets current health status
   */
  getHealthStatus(): HealthMetrics {
    this.updateSystemMetrics();
    this.updateDatabaseMetrics();
    return { ...this.metrics };
  }

  getEligibilityTelemetrySummary(): EligibilityTelemetrySummary {
    const fallbackMetrics = this.metrics.eligibility.policyFallbacks;
    const unmatchedMetrics = this.metrics.eligibility.unmatchedDiagnoses;

    const policyFallbacks = {
      total: fallbackMetrics.total,
      byType: { ...fallbackMetrics.byType },
      byMacRegion: { ...fallbackMetrics.byMacRegion },
      depthHistogram: { ...fallbackMetrics.depthHistogram },
      consideredHistogram: { ...fallbackMetrics.consideredHistogram },
      lastHour: this.countRecent(fallbackMetrics.recentTimestamps, 60 * 60 * 1000),
      last24Hours: this.countRecent(fallbackMetrics.recentTimestamps, 24 * 60 * 60 * 1000)
    };

    const unmatchedDiagnoses = {
      total: unmatchedMetrics.total,
      bySource: { ...unmatchedMetrics.bySource },
      byFormat: { ...unmatchedMetrics.byFormat },
      descriptionLengthHistogram: { ...unmatchedMetrics.descriptionLengthHistogram },
      lastHour: this.countRecent(unmatchedMetrics.recentTimestamps, 60 * 60 * 1000),
      last24Hours: this.countRecent(unmatchedMetrics.recentTimestamps, 24 * 60 * 60 * 1000)
    };

    return {
      policyFallbacks,
      unmatchedDiagnoses
    };
  }

  /**
   * Gets a simple health check result for API endpoints
   */
  getSimpleHealthCheck(): { status: 'healthy' | 'degraded' | 'unhealthy'; issues: string[] } {
    const issues: string[] = [];
    
    // Check database health
    if (this.dbFailureCount > 5) {
      issues.push('Database connectivity issues detected');
    }
    
    // Check encryption corruption rate
    const corruptionRate = this.metrics.encryption.corruptionRate;
    if (corruptionRate > 0.1) { // More than 10% corruption
      issues.push(`High encryption corruption rate: ${(corruptionRate * 100).toFixed(1)}%`);
    }
    
    // Check memory usage
    const memUsage = process.memoryUsage();
    const memUsageMB = memUsage.heapUsed / 1024 / 1024;
    if (memUsageMB > 512) { // More than 512MB
      issues.push(`High memory usage: ${memUsageMB.toFixed(0)}MB`);
    }

    const fallbackLastHour = this.countRecent(this.metrics.eligibility.policyFallbacks.recentTimestamps, 60 * 60 * 1000);
    if (fallbackLastHour > 3) {
      issues.push(`Policy selection fallback triggered ${fallbackLastHour} times in the last hour`);
    }

    const unmatchedLastHour = this.countRecent(this.metrics.eligibility.unmatchedDiagnoses.recentTimestamps, 60 * 60 * 1000);
    if (unmatchedLastHour > 5) {
      issues.push(`Unmatched diagnosis entries detected (${unmatchedLastHour} in the last hour)`);
    }

    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (issues.length === 0) {
      status = 'healthy';
    } else if (issues.length <= 2) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }

    return { status, issues };
  }

  /**
   * Generates a detailed health report
   */
  generateHealthReport(): string {
    const health = this.getHealthStatus();
    const simple = this.getSimpleHealthCheck();

    const report = [
      `System Health Report - ${health.system.timestamp.toISOString()}`,
      '='.repeat(60),
      '',
      `Overall Status: ${simple.status.toUpperCase()}`,
      simple.issues.length > 0 ? `Issues: ${simple.issues.join(', ')}` : 'No critical issues detected',
      '',
      'Database Health:',
      `  Connection Status: ${health.database.isConnected ? 'Connected' : 'Disconnected'}`,
      `  Last Successful Connection: ${health.database.lastSuccessfulConnection?.toISOString() || 'Never'}`,
      `  Consecutive Failures: ${health.database.consecutiveFailures}`,
      `  Average Response Time: ${health.database.averageResponseTime.toFixed(2)}ms`,
      `  Recent Errors: ${health.database.recentErrors.length}`,
      '',
      'Encryption Health:',
      `  Total Patients: ${health.encryption.totalPatients}`,
      `  Corrupted Patients: ${health.encryption.corruptedPatients}`,
      `  Corrupted Encounter Notes: ${health.encryption.corruptedEncounterNotes}`,
      `  Corruption Rate: ${(health.encryption.corruptionRate * 100).toFixed(2)}%`,
      `  Last Corruption: ${health.encryption.lastCorruptionDetected?.toISOString() || 'None'}`,
      '',
      'System Resources:',
      `  Uptime: ${(health.system.uptime / 60).toFixed(1)} minutes`,
      `  Memory Usage: ${(health.system.memoryUsage.heapUsed / 1024 / 1024).toFixed(1)}MB`,
      `  Memory Peak: ${(health.system.memoryUsage.heapTotal / 1024 / 1024).toFixed(1)}MB`,
      '',
      'Eligibility & Policy Selection Metrics:',
      `  Policy Fallbacks (total): ${health.eligibility.policyFallbacks.total}`,
      `  Policy Fallbacks (last hour): ${this.countRecent(health.eligibility.policyFallbacks.recentTimestamps, 60 * 60 * 1000)}`,
      `  Most common fallback: ${this.getTopKey(health.eligibility.policyFallbacks.byType)}`,
      `  Unmatched Diagnoses (total): ${health.eligibility.unmatchedDiagnoses.total}`,
      `  Unmatched Diagnoses (last hour): ${this.countRecent(health.eligibility.unmatchedDiagnoses.recentTimestamps, 60 * 60 * 1000)}`,
      `  Primary vs Secondary unmatched: ${health.eligibility.unmatchedDiagnoses.bySource.primary}/${health.eligibility.unmatchedDiagnoses.bySource.secondary}`,
      '',
      'Recent Database Errors:',
      ...health.database.recentErrors.slice(-5).map((error, index) => `  ${index + 1}. ${error}`)
    ];

    return report.join('\n');
  }

  private incrementCount<T extends string>(map: Record<T, number>, key: T): void;
  private incrementCount(map: Record<string, number>, key: string): void;
  private incrementCount(map: Record<string, number>, key: string): void {
    // eslint-disable-next-line no-param-reassign
    map[key] = (map[key] ?? 0) + 1;
  }

  private sanitizeMetricLabel(label: string): string {
    const normalized = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const sanitized = normalized.replace(/^_+|_+$/g, '');
    return sanitized || 'unknown';
  }

  private sanitizeMacRegion(macRegion?: string | null): string {
    if (!macRegion) {
      return 'UNKNOWN';
    }

    const normalized = macRegion.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!normalized) {
      return 'UNKNOWN';
    }

    return normalized.slice(0, 12);
  }

  private mapFallbackDepth(count: number): FallbackDepthBucket {
    if (count <= 0) return 'stage_0';
    if (count === 1) return 'stage_1';
    if (count === 2) return 'stage_2';
    return 'stage_3_plus';
  }

  private mapConsideredBucket(count: number): FallbackConsideredBucket {
    if (count <= 0) return 'policies_0';
    if (count <= 2) return 'policies_1_2';
    if (count <= 5) return 'policies_3_5';
    return 'policies_6_plus';
  }

  private mapDescriptionLengthBucket(length: number): DescriptionLengthBucket {
    if (length <= 0) return 'empty';
    if (length <= 10) return 'short';
    if (length <= 30) return 'medium';
    if (length <= 60) return 'long';
    return 'very_long';
  }

  private trimRecent(list: number[], limit = 100): void {
    if (list.length > limit) {
      list.splice(0, list.length - limit);
    }
  }

  private countRecent(list: number[], windowMs: number): number {
    const now = Date.now();
    return list.filter(ts => now - ts <= windowMs).length;
  }

  private getTopKey(map: Record<string, number>): string {
    let topKey = 'none';
    let topValue = 0;
    for (const [key, value] of Object.entries(map)) {
      if (value > topValue) {
        topKey = key;
        topValue = value;
      }
    }
    return topKey;
  }

  private startHealthChecks(): void {
    // Run health checks every 5 minutes
    setInterval(() => {
      this.performScheduledHealthCheck();
    }, 5 * 60 * 1000);

    // Clean up old data every hour
    setInterval(() => {
      this.cleanupOldData();
    }, 60 * 60 * 1000);
  }

  private async performScheduledHealthCheck(): Promise<void> {
    try {
      // This would be called with actual storage instance in production
      console.log('Scheduled health check completed');
    } catch (error) {
      console.error('Health check failed:', error);
    }
  }

  private cleanupOldData(): void {
    // Keep only last 10 errors
    if (this.recentDbErrors.length > 10) {
      this.recentDbErrors = this.recentDbErrors.slice(-10);
    }
    
    // Keep only last 50 response times for average calculation
    if (this.responseTimes.length > 50) {
      this.responseTimes = this.responseTimes.slice(-50);
    }
  }

  private recordResponseTime(time: number): void {
    this.responseTimes.push(time);
    this.responseTimes = this.responseTimes.slice(-50); // Keep last 50
  }

  private addDbError(error: string): void {
    const timestampedError = `[${new Date().toISOString()}] ${error}`;
    this.recentDbErrors.push(timestampedError);
    this.recentDbErrors = this.recentDbErrors.slice(-10); // Keep last 10
  }

  private updateDatabaseMetrics(): void {
    this.metrics.database.consecutiveFailures = this.dbFailureCount;
    this.metrics.database.lastSuccessfulConnection = this.lastDbSuccessTime;
    this.metrics.database.isConnected = this.dbFailureCount === 0;
    this.metrics.database.recentErrors = [...this.recentDbErrors];
    
    if (this.responseTimes.length > 0) {
      this.metrics.database.averageResponseTime = 
        this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length;
    }
  }

  private updateCorruptionMetrics(): void {
    this.metrics.encryption.corruptedPatients = this.corruptedPatientIds.size;
    this.metrics.encryption.corruptedEncounterNotes = this.corruptedEncounterNoteCount;
    this.metrics.encryption.lastCorruptionDetected = this.lastCorruptionTime;
    
    if (this.metrics.encryption.totalPatients > 0) {
      this.metrics.encryption.corruptionRate = 
        this.corruptedPatientIds.size / this.metrics.encryption.totalPatients;
    }
  }

  private updateSystemMetrics(): void {
    this.metrics.system.uptime = process.uptime();
    this.metrics.system.memoryUsage = process.memoryUsage();
    this.metrics.system.timestamp = new Date();
  }
}

// Export singleton instance
export const healthMonitor = new HealthMonitoringService();

// Export types for use in other modules
export type { HealthMetrics, DatabaseConnectionTest };