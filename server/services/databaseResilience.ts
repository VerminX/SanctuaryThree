import { Pool } from '@neondatabase/serverless';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import { errorLogger, AppError, ErrorCategory, ErrorSeverity } from './errorManager';

export interface ConnectionHealth {
  isHealthy: boolean;
  latency?: number;
  poolStats?: {
    totalConnections: number;
    activeConnections: number;
    waitingConnections: number;
  };
  lastCheck: Date;
  error?: string;
}

export interface DatabaseResilienceConfig {
  healthCheckInterval: number; // ms
  connectionTimeout: number; // ms
  retryAttempts: number;
  retryDelayBase: number; // ms
  retryMaxDelay: number; // ms
  circuitBreakerThreshold: number; // consecutive failures
  circuitBreakerTimeout: number; // ms
  poolMonitoringEnabled: boolean;
}

class DatabaseResilienceService {
  private pool: Pool;
  private config: DatabaseResilienceConfig;
  private isHealthy: boolean = true;
  private consecutiveFailures: number = 0;
  private circuitBreakerOpen: boolean = false;
  private lastHealthCheck: Date = new Date();
  private healthCheckTimer?: NodeJS.Timeout;
  private circuitBreakerTimer?: NodeJS.Timeout;

  constructor(pool: Pool, config?: Partial<DatabaseResilienceConfig>) {
    this.pool = pool;
    this.config = {
      healthCheckInterval: 30000, // 30 seconds
      connectionTimeout: 10000, // 10 seconds
      retryAttempts: 3,
      retryDelayBase: 1000, // 1 second
      retryMaxDelay: 30000, // 30 seconds
      circuitBreakerThreshold: 5, // 5 consecutive failures
      circuitBreakerTimeout: 60000, // 1 minute
      poolMonitoringEnabled: true,
      ...config
    };

    this.startHealthMonitoring();
  }

  /**
   * Execute database operation with resilience patterns
   */
  async executeWithResilience<T>(
    operation: () => Promise<T>,
    operationName: string,
    correlationId?: string
  ): Promise<T> {
    // Check circuit breaker
    if (this.circuitBreakerOpen) {
      throw new AppError(
        `Circuit breaker is open for database operations`,
        ErrorCategory.SYSTEM,
        ErrorSeverity.HIGH,
        503,
        {
          operationName,
          circuitBreakerOpen: true,
          consecutiveFailures: this.consecutiveFailures
        },
        undefined,
        correlationId
      );
    }

    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        const result = await this.executeWithTimeout(operation, this.config.connectionTimeout);
        
        // Reset failure count on success
        if (this.consecutiveFailures > 0) {
          this.consecutiveFailures = 0;
          const recoveryInfo = new AppError(
            `Database operation recovered`,
            ErrorCategory.SYSTEM,
            ErrorSeverity.INFO,
            200,
            {
              operationName,
              attempt
            },
            undefined,
            correlationId
          );
          errorLogger.logError(recoveryInfo);
        }
        
        return result;
      } catch (error) {
        lastError = error as Error;
        this.consecutiveFailures++;
        
        const isRetryable = this.isRetryableError(error as Error);
        const isLastAttempt = attempt === this.config.retryAttempts;
        
        const dbError = new AppError(
          `Database operation failed`,
          ErrorCategory.DATABASE,
          ErrorSeverity.MEDIUM,
          503,
          {
            operationName,
            attempt,
            totalAttempts: this.config.retryAttempts,
            error: error instanceof Error ? error.message : String(error),
            isRetryable,
            consecutiveFailures: this.consecutiveFailures
          },
          error instanceof Error ? error : undefined,
          correlationId
        );
        errorLogger.logError(dbError);

        // Open circuit breaker if threshold reached
        if (this.consecutiveFailures >= this.config.circuitBreakerThreshold) {
          this.openCircuitBreaker();
        }

        if (!isRetryable || isLastAttempt) {
          break;
        }

        // Calculate exponential backoff delay
        const delay = Math.min(
          this.config.retryDelayBase * Math.pow(2, attempt - 1),
          this.config.retryMaxDelay
        );

        // Add jitter to prevent thundering herd
        const jitteredDelay = delay + Math.random() * 1000;
        
        const retryInfo = new AppError(
          `Retrying database operation after delay`,
          ErrorCategory.SYSTEM,
          ErrorSeverity.INFO,
          200,
          {
            operationName,
            attempt,
            delay: jitteredDelay
          },
          undefined,
          correlationId
        );
        errorLogger.logError(retryInfo);

        await this.sleep(jitteredDelay);
      }
    }

    // All retry attempts failed
    throw new AppError(
      `Database operation failed after ${this.config.retryAttempts} attempts: ${lastError?.message || 'Unknown error'}`,
      ErrorCategory.DATABASE,
      ErrorSeverity.CRITICAL,
      503,
      {
        operationName,
        retryAttempts: this.config.retryAttempts,
        consecutiveFailures: this.consecutiveFailures,
        originalError: lastError?.message || 'Unknown error'
      },
      lastError || undefined,
      correlationId
    );
  }

  /**
   * Check database connection health
   */
  async checkHealth(): Promise<ConnectionHealth> {
    const startTime = Date.now();
    
    try {
      // Simple ping query to test connection
      await db.execute(sql`SELECT 1 as ping`);
      
      const latency = Date.now() - startTime;
      this.lastHealthCheck = new Date();
      this.isHealthy = true;

      const health: ConnectionHealth = {
        isHealthy: true,
        latency,
        lastCheck: this.lastHealthCheck
      };

      // Get pool stats if monitoring is enabled
      if (this.config.poolMonitoringEnabled) {
        health.poolStats = await this.getPoolStats();
      }

      return health;
    } catch (error) {
      this.isHealthy = false;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      const healthError = new AppError(
        `Database health check failed`,
        ErrorCategory.DATABASE,
        ErrorSeverity.HIGH,
        503,
        {
          error: errorMessage,
          latency: Date.now() - startTime,
          consecutiveFailures: this.consecutiveFailures
        },
        error instanceof Error ? error : undefined
      );
      errorLogger.logError(healthError);

      return {
        isHealthy: false,
        lastCheck: new Date(),
        error: errorMessage
      };
    }
  }

  /**
   * Get connection pool statistics
   */
  private async getPoolStats() {
    try {
      // Note: Neon serverless doesn't expose detailed pool stats
      // This is a placeholder for when more detailed metrics become available
      return {
        totalConnections: 1, // Neon manages this internally
        activeConnections: 1,
        waitingConnections: 0
      };
    } catch (error) {
      const poolError = new AppError(
        `Failed to get pool stats`,
        ErrorCategory.DATABASE,
        ErrorSeverity.MEDIUM,
        500,
        {
          error: error instanceof Error ? error.message : String(error)
        },
        error instanceof Error ? error : undefined
      );
      errorLogger.logError(poolError);
      return undefined;
    }
  }

  /**
   * Start continuous health monitoring
   */
  private startHealthMonitoring(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(async () => {
      await this.checkHealth();
    }, this.config.healthCheckInterval);

    const monitoringInfo = new AppError(
      `Database health monitoring started`,
      ErrorCategory.SYSTEM,
      ErrorSeverity.INFO,
      200,
      {
        healthCheckInterval: this.config.healthCheckInterval,
        circuitBreakerThreshold: this.config.circuitBreakerThreshold
      }
    );
    errorLogger.logError(monitoringInfo);
  }

  /**
   * Open circuit breaker to prevent cascading failures
   */
  private openCircuitBreaker(): void {
    if (this.circuitBreakerOpen) return;

    this.circuitBreakerOpen = true;
    
    const circuitError = new AppError(
      `Database circuit breaker opened`,
      ErrorCategory.DATABASE,
      ErrorSeverity.CRITICAL,
      503,
      {
        consecutiveFailures: this.consecutiveFailures,
        threshold: this.config.circuitBreakerThreshold,
        timeout: this.config.circuitBreakerTimeout
      }
    );
    errorLogger.logError(circuitError);

    // Set timer to try half-open state
    this.circuitBreakerTimer = setTimeout(() => {
      this.circuitBreakerOpen = false;
      this.consecutiveFailures = 0;
      
      const recoveryInfo = new AppError(
        `Database circuit breaker half-opened, allowing test requests`,
        ErrorCategory.SYSTEM,
        ErrorSeverity.INFO,
        200,
        {
          timeout: this.config.circuitBreakerTimeout
        }
      );
      errorLogger.logError(recoveryInfo);
    }, this.config.circuitBreakerTimeout);
  }

  /**
   * Execute operation with timeout
   */
  private async executeWithTimeout<T>(
    operation: () => Promise<T>,
    timeout: number
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Database operation timed out after ${timeout}ms`));
      }, timeout);

      operation()
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Determine if error is retryable
   */
  private isRetryableError(error: Error): boolean {
    const retryablePatterns = [
      /connection.*closed/i,
      /connection.*timeout/i,
      /connection.*refused/i,
      /connection.*reset/i,
      /network.*error/i,
      /timeout/i,
      /temporary.*failure/i,
      /service.*unavailable/i,
      /too many connections/i,
      /connection.*lost/i
    ];

    const errorMessage = error.message.toLowerCase();
    return retryablePatterns.some(pattern => pattern.test(errorMessage));
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current resilience status
   */
  getStatus() {
    return {
      isHealthy: this.isHealthy,
      consecutiveFailures: this.consecutiveFailures,
      circuitBreakerOpen: this.circuitBreakerOpen,
      lastHealthCheck: this.lastHealthCheck,
      config: this.config
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }

    if (this.circuitBreakerTimer) {
      clearTimeout(this.circuitBreakerTimer);
      this.circuitBreakerTimer = undefined;
    }

    const shutdownInfo = new AppError(
      `Database resilience service shutdown completed`,
      ErrorCategory.SYSTEM,
      ErrorSeverity.INFO,
      200,
      {}
    );
    errorLogger.logError(shutdownInfo);
  }

  /**
   * Force circuit breaker reset (for emergency recovery)
   */
  resetCircuitBreaker(): void {
    this.circuitBreakerOpen = false;
    this.consecutiveFailures = 0;
    
    if (this.circuitBreakerTimer) {
      clearTimeout(this.circuitBreakerTimer);
      this.circuitBreakerTimer = undefined;
    }

    const resetInfo = new AppError(
      `Database circuit breaker manually reset`,
      ErrorCategory.SYSTEM,
      ErrorSeverity.INFO,
      200,
      {}
    );
    errorLogger.logError(resetInfo);
  }
}

// Import the pool properly
import { pool } from '../db';

// Create singleton instance
export const databaseResilience = new DatabaseResilienceService(pool);

// Export class
export { DatabaseResilienceService };