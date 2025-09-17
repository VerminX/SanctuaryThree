import { AppError, ErrorCategory, ErrorSeverity } from './errorManager';
import type { Pool } from 'pg';

// Health check interfaces for different service types
export interface ServiceHealth {
  name: string;
  healthy: boolean;
  status: 'UP' | 'DOWN' | 'DEGRADED';
  responseTime?: number;
  lastCheck: Date;
  details?: Record<string, any>;
  error?: string;
}

export interface SystemHealthSummary {
  overall: {
    healthy: boolean;
    status: 'UP' | 'DOWN' | 'DEGRADED';
    services_total: number;
    services_healthy: number;
    services_unhealthy: number;
    last_check: Date;
  };
  services: ServiceHealth[];
  system: {
    uptime: number;
    memory_usage: {
      rss: number;
      heap_used: number;
      heap_total: number;
      external: number;
    };
    version: string;
    environment: string;
    timestamp: Date;
  };
}

export interface PublicHealthSummary {
  overall: {
    status: 'UP' | 'DOWN' | 'DEGRADED';
    last_check: Date;
  };
  services: {
    name: string;
    status: 'UP' | 'DOWN' | 'DEGRADED';
  }[];
  system: {
    timestamp: Date;
  };
}

export interface ReadinessCheck {
  ready: boolean;
  services: {
    database: boolean;
    external_apis: boolean;
    critical_dependencies: boolean;
  };
  timestamp: Date;
}

export class HealthAggregator {
  private startTime: Date;
  private appVersion: string;
  private environment: string;
  private readonly STARTUP_GRACE_PERIOD = 30000; // 30 seconds

  constructor() {
    this.startTime = new Date();
    this.appVersion = process.env.npm_package_version || '1.0.0';
    this.environment = process.env.NODE_ENV || 'development';
  }

  /**
   * Get comprehensive system health status (authenticated users only)
   */
  async getSystemHealth(includeDetails: boolean = true): Promise<SystemHealthSummary> {
    const services: ServiceHealth[] = [];
    
    try {
      // Database health check
      const dbHealth = await this.checkDatabaseHealth();
      services.push(dbHealth);

      // External API health checks
      const externalAPIs = await this.checkExternalAPIs();
      services.push(...externalAPIs);

      // Application-level health checks
      const appHealth = await this.checkApplicationHealth();
      services.push(appHealth);

      // Calculate overall health
      const healthyServices = services.filter(s => s.healthy).length;
      const totalServices = services.length;
      const overallHealthy = healthyServices === totalServices;
      const overallStatus = this.calculateOverallStatus(services);

      return {
        overall: {
          healthy: overallHealthy,
          status: overallStatus,
          services_total: totalServices,
          services_healthy: healthyServices,
          services_unhealthy: totalServices - healthyServices,
          last_check: new Date()
        },
        services: includeDetails ? services : services.map(s => ({
          ...s,
          details: undefined // Remove details for compact view
        })),
        system: {
          uptime: Date.now() - this.startTime.getTime(),
          memory_usage: this.getMemoryUsage(),
          version: this.appVersion,
          environment: this.environment,
          timestamp: new Date()
        }
      };
    } catch (error) {
      throw new AppError(
        'Failed to get system health status',
        ErrorCategory.SYSTEM,
        ErrorSeverity.HIGH,
        503,
        { error: error instanceof Error ? error.message : String(error) },
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Check application readiness for deployment orchestration
   */
  async getReadinessStatus(): Promise<ReadinessCheck> {
    try {
      const [dbReady, externalReady] = await Promise.all([
        this.isDatabaseReady(),
        this.areExternalAPIsReady()
      ]);

      const ready = dbReady && externalReady;

      return {
        ready,
        services: {
          database: dbReady,
          external_apis: externalReady,
          critical_dependencies: ready // All critical deps must be ready
        },
        timestamp: new Date()
      };
    } catch (error) {
      return {
        ready: false,
        services: {
          database: false,
          external_apis: false,
          critical_dependencies: false
        },
        timestamp: new Date()
      };
    }
  }

  /**
   * Get health status for specific services
   */
  async getServiceHealth(serviceName: string): Promise<ServiceHealth | null> {
    try {
      switch (serviceName.toLowerCase()) {
        case 'database':
          return await this.checkDatabaseHealth();
        case 'openai':
          return await this.checkOpenAIHealth();
        case 'cms':
        case 'cms_api':
          return await this.checkCMSAPIHealth();
        case 'application':
        case 'app':
          return await this.checkApplicationHealth();
        default:
          return null;
      }
    } catch (error) {
      return {
        name: serviceName,
        healthy: false,
        status: 'DOWN',
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Check database health and resilience status
   */
  private async checkDatabaseHealth(): Promise<ServiceHealth> {
    try {
      const { storage } = await import('../storage');
      const startTime = Date.now();
      
      const [health, resilienceStatus] = await Promise.all([
        storage.healthCheck?.() || { isHealthy: false, error: 'Health check not implemented' },
        storage.getResilienceStatus?.() || null
      ]);

      const responseTime = Date.now() - startTime;

      return {
        name: 'database',
        healthy: health.isHealthy,
        status: health.isHealthy ? 'UP' : 'DOWN',
        responseTime,
        lastCheck: new Date(),
        details: {
          latency: health.latency,
          poolStats: health.poolStats,
          resilience: resilienceStatus ? {
            circuit_breaker_open: resilienceStatus.circuitBreakerOpen,
            consecutive_failures: resilienceStatus.consecutiveFailures,
            last_health_check: resilienceStatus.lastHealthCheck
          } : null
        },
        error: health.error
      };
    } catch (error) {
      return {
        name: 'database',
        healthy: false,
        status: 'DOWN',
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Check external API health via circuit breakers
   */
  private async checkExternalAPIs(): Promise<ServiceHealth[]> {
    try {
      const { openAICircuitBreaker, cmsApiCircuitBreaker } = await import('./apiCircuitBreaker');
      
      const [openAIHealth, cmsHealth] = await Promise.all([
        this.convertCircuitBreakerHealth('openai', openAICircuitBreaker.getStatus()),
        this.convertCircuitBreakerHealth('cms_api', cmsApiCircuitBreaker.getStatus())
      ]);

      return [openAIHealth, cmsHealth];
    } catch (error) {
      return [
        {
          name: 'openai',
          healthy: false,
          status: 'DOWN',
          lastCheck: new Date(),
          error: 'Circuit breaker not available'
        },
        {
          name: 'cms_api',
          healthy: false,
          status: 'DOWN', 
          lastCheck: new Date(),
          error: 'Circuit breaker not available'
        }
      ];
    }
  }

  /**
   * Check individual OpenAI service health
   */
  private async checkOpenAIHealth(): Promise<ServiceHealth> {
    try {
      const { openAICircuitBreaker } = await import('./apiCircuitBreaker');
      return this.convertCircuitBreakerHealth('openai', openAICircuitBreaker.getStatus());
    } catch (error) {
      return {
        name: 'openai',
        healthy: false,
        status: 'DOWN',
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Check individual CMS API service health
   */
  private async checkCMSAPIHealth(): Promise<ServiceHealth> {
    try {
      const { cmsApiCircuitBreaker } = await import('./apiCircuitBreaker');
      return this.convertCircuitBreakerHealth('cms_api', cmsApiCircuitBreaker.getStatus());
    } catch (error) {
      return {
        name: 'cms_api',
        healthy: false,
        status: 'DOWN',
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Check application-level health metrics
   */
  private async checkApplicationHealth(): Promise<ServiceHealth> {
    try {
      const memoryUsage = process.memoryUsage();
      const uptime = Date.now() - this.startTime.getTime();
      
      // Basic health checks - memory usage, uptime
      const memoryHealthy = memoryUsage.heapUsed < (1024 * 1024 * 500); // 500MB threshold
      const uptimeHealthy = uptime > 5000; // At least 5 seconds uptime
      
      const healthy = memoryHealthy && uptimeHealthy;

      return {
        name: 'application',
        healthy,
        status: healthy ? 'UP' : 'DEGRADED',
        lastCheck: new Date(),
        details: {
          uptime_ms: uptime,
          memory_usage: memoryUsage,
          version: this.appVersion,
          environment: this.environment,
          pid: process.pid
        }
      };
    } catch (error) {
      return {
        name: 'application',
        healthy: false,
        status: 'DOWN',
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Convert circuit breaker health to service health format
   */
  private convertCircuitBreakerHealth(serviceName: string, circuitHealth: any): ServiceHealth {
    return {
      name: serviceName,
      healthy: circuitHealth.isHealthy,
      status: circuitHealth.isHealthy ? 'UP' : 'DOWN',
      lastCheck: circuitHealth.lastCheck,
      details: {
        circuit_breaker_state: circuitHealth.metrics.circuitBreakerState,
        total_calls: circuitHealth.metrics.totalCalls,
        success_count: circuitHealth.metrics.successCount,
        failure_count: circuitHealth.metrics.failureCount,
        average_latency: circuitHealth.metrics.averageLatency,
        last_success: circuitHealth.metrics.lastSuccessTime,
        last_failure: circuitHealth.metrics.lastFailureTime
      },
      error: circuitHealth.error
    };
  }

  /**
   * Check if database is ready for traffic
   */
  private async isDatabaseReady(): Promise<boolean> {
    try {
      const dbHealth = await this.checkDatabaseHealth();
      return dbHealth.healthy && (dbHealth.responseTime || 0) < 5000; // Must respond within 5s
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if external APIs are ready (not necessarily healthy, but available)
   */
  private async areExternalAPIsReady(): Promise<boolean> {
    try {
      const { openAICircuitBreaker, cmsApiCircuitBreaker } = await import('./apiCircuitBreaker');
      
      const openAIStatus = openAICircuitBreaker.getStatus();
      const cmsStatus = cmsApiCircuitBreaker.getStatus();
      
      // Services are ready if circuit breakers are not permanently failed
      // Even if OPEN, they can still serve cached/fallback responses
      return openAIStatus.metrics.circuitBreakerState !== 'OPEN' || 
             cmsStatus.metrics.circuitBreakerState !== 'OPEN';
    } catch (error) {
      return false;
    }
  }

  /**
   * Calculate overall system status based on individual service health
   */
  private calculateOverallStatus(services: ServiceHealth[]): 'UP' | 'DOWN' | 'DEGRADED' {
    if (services.length === 0) return 'DOWN';
    
    const downServices = services.filter(s => s.status === 'DOWN');
    const degradedServices = services.filter(s => s.status === 'DEGRADED');
    
    if (downServices.length === 0 && degradedServices.length === 0) {
      return 'UP';
    }
    
    // If any critical service (database) is down, system is down
    const criticalDown = downServices.some(s => s.name === 'database');
    if (criticalDown) {
      return 'DOWN';
    }
    
    // If some services are down/degraded but critical services are up
    return 'DEGRADED';
  }

  /**
   * Get current memory usage statistics
   */
  private getMemoryUsage() {
    const usage = process.memoryUsage();
    return {
      rss: Math.round(usage.rss / 1024 / 1024), // MB
      heap_used: Math.round(usage.heapUsed / 1024 / 1024), // MB
      heap_total: Math.round(usage.heapTotal / 1024 / 1024), // MB
      external: Math.round(usage.external / 1024 / 1024) // MB
    };
  }

  /**
   * Get public health status (no sensitive information)
   */
  async getPublicHealth(): Promise<PublicHealthSummary> {
    try {
      const services: ServiceHealth[] = [];
      
      // Get basic health status for each service without sensitive details
      const [dbHealth, externalAPIs, appHealth] = await Promise.all([
        this.checkDatabaseHealth(),
        this.checkExternalAPIs(),
        this.checkApplicationHealth()
      ]);
      
      services.push(dbHealth, ...externalAPIs, appHealth);
      
      const overallStatus = this.calculateOverallStatus(services);
      
      return {
        overall: {
          status: overallStatus,
          last_check: new Date()
        },
        services: services.map(s => ({
          name: s.name,
          status: s.status
        })),
        system: {
          timestamp: new Date()
        }
      };
    } catch (error) {
      // Even for public health, return minimal error info
      return {
        overall: {
          status: 'DOWN',
          last_check: new Date()
        },
        services: [],
        system: {
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Check if the application is in startup grace period
   */
  private isInStartupGracePeriod(): boolean {
    const uptime = Date.now() - this.startTime.getTime();
    return uptime < this.STARTUP_GRACE_PERIOD;
  }

  /**
   * Get appropriate HTTP status code based on health status
   */
  getHttpStatusCode(overallStatus: 'UP' | 'DOWN' | 'DEGRADED'): number {
    switch (overallStatus) {
      case 'UP':
        return 200;
      case 'DEGRADED':
        // During startup grace period, return 200 even if degraded
        return this.isInStartupGracePeriod() ? 200 : 200;
      case 'DOWN':
        // During startup grace period, return 503 for true failures only
        return 503;
      default:
        return 503;
    }
  }
}

// Export singleton instance
export const healthAggregator = new HealthAggregator();