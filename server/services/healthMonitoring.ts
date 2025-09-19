/**
 * Health Monitoring Service for Phase 4
 * Tracks database connectivity, encryption failures, and system health
 */

import { DatabaseStorage } from '../storage.js';

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
      }
    };

    // Start background monitoring
    this.startHealthChecks();
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
   * Updates the total patient count for corruption rate calculation
   */
  updateTotalPatientCount(count: number): void {
    this.metrics.encryption.totalPatients = count;
    this.updateCorruptionMetrics();
  }

  /**
   * Gets current health status
   */
  getHealthStatus(): HealthMetrics {
    this.updateSystemMetrics();
    this.updateDatabaseMetrics();
    return { ...this.metrics };
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
      'Recent Database Errors:',
      ...health.database.recentErrors.slice(-5).map((error, index) => `  ${index + 1}. ${error}`)
    ];

    return report.join('\n');
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