import { 
  errorLogger, 
  AppError, 
  ErrorCategory, 
  ErrorSeverity 
} from './errorManager';

// Import performance monitor for metrics integration
let performanceMonitor: any = null;
try {
  // Use dynamic import to avoid circular dependency
  const { performanceMonitor: pm } = require('./performanceMonitor');
  performanceMonitor = pm;
} catch (error) {
  // Performance monitor not available - will skip metrics recording
}

export interface ApiCircuitBreakerConfig {
  serviceName: string;
  failureThreshold: number; // consecutive failures to open circuit
  recoveryTimeout: number; // ms to wait before half-open
  requestTimeout: number; // ms timeout for individual requests
  retryAttempts: number;
  retryDelayBase: number; // ms base delay for exponential backoff
  retryMaxDelay: number; // ms maximum retry delay
  monitoringEnabled: boolean;
}

export interface ApiCallMetrics {
  totalCalls: number;
  successCount: number;
  failureCount: number;
  averageLatency: number;
  lastSuccessTime?: Date;
  lastFailureTime?: Date;
  circuitBreakerState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}

export interface ApiServiceHealth {
  serviceName: string;
  isHealthy: boolean;
  metrics: ApiCallMetrics;
  lastCheck: Date;
  error?: string;
}

enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation, requests allowed
  OPEN = 'OPEN',         // Circuit breaker open, requests blocked
  HALF_OPEN = 'HALF_OPEN' // Testing if service recovered
}

export class ApiCircuitBreaker {
  private config: ApiCircuitBreakerConfig;
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private lastFailureTime?: Date;
  private nextAttemptTime?: Date;
  private metrics: ApiCallMetrics;

  constructor(config: ApiCircuitBreakerConfig) {
    this.config = config;
    this.metrics = {
      totalCalls: 0,
      successCount: 0,
      failureCount: 0,
      averageLatency: 0,
      circuitBreakerState: CircuitState.CLOSED
    };
  }

  /**
   * Execute API call with circuit breaker protection
   */
  async execute<T>(
    apiCall: () => Promise<T>,
    operationName: string,
    correlationId?: string
  ): Promise<T> {
    // Check circuit breaker state
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.state = CircuitState.HALF_OPEN;
        this.logStateChange('HALF_OPEN', operationName, correlationId);
      } else {
        throw new AppError(
          `Circuit breaker is OPEN for ${this.config.serviceName}`,
          ErrorCategory.EXTERNAL_API,
          ErrorSeverity.HIGH,
          503,
          {
            serviceName: this.config.serviceName,
            operationName,
            circuitState: this.state,
            failureCount: this.failureCount,
            nextAttemptTime: this.nextAttemptTime
          },
          undefined,
          correlationId
        );
      }
    }

    let lastError: Error | null = null;
    const startTime = Date.now();

    // Retry logic with exponential backoff
    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        const result = await this.executeWithTimeout(apiCall, this.config.requestTimeout);
        
        // Success - update metrics and reset circuit breaker if needed
        const latency = Date.now() - startTime;
        this.recordSuccess(latency, operationName, correlationId);
        
        return result;
      } catch (error) {
        lastError = error as Error;
        const latency = Date.now() - startTime;
        
        // Determine if error is retryable
        const isRetryable = this.isRetryableError(error as Error);
        const isLastAttempt = attempt === this.config.retryAttempts;
        
        // Log retry attempt
        const retryError = new AppError(
          `API call failed for ${this.config.serviceName}`,
          ErrorCategory.EXTERNAL_API,
          isLastAttempt ? ErrorSeverity.HIGH : ErrorSeverity.MEDIUM,
          500,
          {
            serviceName: this.config.serviceName,
            operationName,
            attempt,
            totalAttempts: this.config.retryAttempts,
            isRetryable,
            error: error instanceof Error ? error.message : String(error),
            latency
          },
          error instanceof Error ? error : undefined,
          correlationId
        );
        errorLogger.logError(retryError);

        if (!isRetryable || isLastAttempt) {
          this.recordFailure(latency, operationName, correlationId);
          break;
        }

        // Calculate exponential backoff with jitter
        const delay = Math.min(
          this.config.retryDelayBase * Math.pow(2, attempt - 1),
          this.config.retryMaxDelay
        );
        const jitteredDelay = delay + Math.random() * 1000;
        
        await this.sleep(jitteredDelay);
      }
    }

    // If we're in HALF_OPEN state and failed, go back to OPEN
    if (this.state === CircuitState.HALF_OPEN) {
      this.openCircuit(operationName, correlationId);
    }

    // All retry attempts failed
    throw new AppError(
      `All retry attempts failed for ${this.config.serviceName}: ${lastError?.message || 'Unknown error'}`,
      ErrorCategory.EXTERNAL_API,
      ErrorSeverity.CRITICAL,
      503,
      {
        serviceName: this.config.serviceName,
        operationName,
        retryAttempts: this.config.retryAttempts,
        originalError: lastError?.message || 'Unknown error',
        circuitState: this.state
      },
      lastError || undefined,
      correlationId
    );
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
        reject(new Error(`Operation timed out after ${timeout}ms`));
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
   * Check if should attempt to reset circuit breaker
   */
  private shouldAttemptReset(): boolean {
    if (!this.nextAttemptTime) return false;
    return Date.now() >= this.nextAttemptTime.getTime();
  }

  /**
   * Record successful API call
   */
  private recordSuccess(latency: number, operationName: string, correlationId?: string): void {
    this.metrics.totalCalls++;
    this.metrics.successCount++;
    this.metrics.lastSuccessTime = new Date();
    
    // Update average latency (simple moving average)
    this.metrics.averageLatency = 
      (this.metrics.averageLatency * (this.metrics.successCount - 1) + latency) / this.metrics.successCount;

    // Record metrics in performance monitor
    this.recordApiMetrics(latency, true, operationName, correlationId);

    // Reset failure count and circuit breaker state
    if (this.failureCount > 0) {
      const recoveryInfo = new AppError(
        `API service recovered: ${this.config.serviceName}`,
        ErrorCategory.EXTERNAL_API,
        ErrorSeverity.INFO,
        200,
        {
          serviceName: this.config.serviceName,
          operationName,
          previousFailureCount: this.failureCount,
          latency
        },
        undefined,
        correlationId
      );
      errorLogger.logError(recoveryInfo);
    }

    this.failureCount = 0;
    if (this.state !== CircuitState.CLOSED) {
      this.state = CircuitState.CLOSED;
      this.metrics.circuitBreakerState = CircuitState.CLOSED;
      this.logStateChange('CLOSED', operationName, correlationId);
    }
  }

  /**
   * Record failed API call
   */
  private recordFailure(latency: number, operationName: string, correlationId?: string): void {
    this.metrics.totalCalls++;
    this.metrics.failureCount++;
    this.metrics.lastFailureTime = new Date();
    this.failureCount++;

    // Record metrics in performance monitor
    this.recordApiMetrics(latency, false, operationName, correlationId);

    // Check if we should open the circuit breaker
    if (this.failureCount >= this.config.failureThreshold && this.state === CircuitState.CLOSED) {
      this.openCircuit(operationName, correlationId);
    }
  }

  /**
   * Open circuit breaker
   */
  private openCircuit(operationName: string, correlationId?: string): void {
    this.state = CircuitState.OPEN;
    this.metrics.circuitBreakerState = CircuitState.OPEN;
    this.lastFailureTime = new Date();
    this.nextAttemptTime = new Date(Date.now() + this.config.recoveryTimeout);

    const circuitOpenError = new AppError(
      `Circuit breaker opened for ${this.config.serviceName}`,
      ErrorCategory.EXTERNAL_API,
      ErrorSeverity.CRITICAL,
      503,
      {
        serviceName: this.config.serviceName,
        operationName,
        failureCount: this.failureCount,
        threshold: this.config.failureThreshold,
        nextAttemptTime: this.nextAttemptTime
      },
      undefined,
      correlationId
    );
    errorLogger.logError(circuitOpenError);
    
    this.logStateChange('OPEN', operationName, correlationId);
  }

  /**
   * Log circuit breaker state changes
   */
  private logStateChange(newState: string, operationName: string, correlationId?: string): void {
    const stateChangeInfo = new AppError(
      `Circuit breaker state changed to ${newState} for ${this.config.serviceName}`,
      ErrorCategory.SYSTEM,
      ErrorSeverity.INFO,
      200,
      {
        serviceName: this.config.serviceName,
        operationName,
        newState,
        failureCount: this.failureCount
      },
      undefined,
      correlationId
    );
    errorLogger.logError(stateChangeInfo);
  }

  /**
   * Determine if error is retryable
   */
  private isRetryableError(error: Error): boolean {
    const retryablePatterns = [
      /timeout/i,
      /ECONNRESET/i,
      /ENOTFOUND/i,
      /ECONNREFUSED/i,
      /ETIMEDOUT/i,
      /network.*error/i,
      /rate.*limit/i,
      /too.*many.*requests/i,
      /service.*unavailable/i,
      /internal.*server.*error/i,
      /bad.*gateway/i,
      /gateway.*timeout/i,
      /connection.*reset/i
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
   * Get current circuit breaker status and metrics
   */
  getStatus(): ApiServiceHealth {
    return {
      serviceName: this.config.serviceName,
      isHealthy: this.state === CircuitState.CLOSED,
      metrics: { ...this.metrics },
      lastCheck: new Date(),
      error: this.state === CircuitState.OPEN ? 
        `Circuit breaker is OPEN (${this.failureCount} consecutive failures)` : undefined
    };
  }

  /**
   * Manually reset circuit breaker (for emergency recovery)
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.metrics.circuitBreakerState = CircuitState.CLOSED;
    this.failureCount = 0;
    this.lastFailureTime = undefined;
    this.nextAttemptTime = undefined;

    const resetInfo = new AppError(
      `Circuit breaker manually reset for ${this.config.serviceName}`,
      ErrorCategory.SYSTEM,
      ErrorSeverity.INFO,
      200,
      {
        serviceName: this.config.serviceName
      }
    );
    errorLogger.logError(resetInfo);
  }

  /**
   * Get detailed metrics
   */
  getMetrics(): ApiCallMetrics {
    return { ...this.metrics };
  }

  /**
   * Record API metrics in performance monitor
   */
  private recordApiMetrics(latency: number, success: boolean, operationName: string, correlationId?: string): void {
    if (!performanceMonitor) return;
    
    try {
      // Record API call latency
      performanceMonitor.recordMetric(`${this.config.serviceName.toLowerCase()}_api_latency_ms`, latency, 'milliseconds', {
        operation: operationName,
        success: success.toString(),
        service: this.config.serviceName,
        correlationId: correlationId || 'unknown'
      });
      
      // Record success/failure count
      performanceMonitor.recordMetric(`${this.config.serviceName.toLowerCase()}_api_call_count`, 1, 'count', {
        operation: operationName,
        success: success.toString(),
        service: this.config.serviceName,
        correlationId: correlationId || 'unknown'
      });
      
      // Calculate and record success rate
      const currentSuccessRate = this.metrics.totalCalls > 0 
        ? (this.metrics.successCount / this.metrics.totalCalls) * 100 
        : 100;
      
      performanceMonitor.recordMetric(`${this.config.serviceName.toLowerCase()}_success_rate`, currentSuccessRate, 'percentage', {
        operation: operationName,
        service: this.config.serviceName,
        total_calls: this.metrics.totalCalls.toString(),
        success_count: this.metrics.successCount.toString()
      });
      
      // Record generic external API success rate for aggregated monitoring
      performanceMonitor.recordMetric('external_api_success_rate', currentSuccessRate, 'percentage', {
        operation: operationName,
        service: this.config.serviceName,
        correlationId: correlationId || 'unknown'
      });
      
      // Record circuit breaker state
      performanceMonitor.recordMetric(`${this.config.serviceName.toLowerCase()}_circuit_breaker_open`, 
        this.state === CircuitState.OPEN ? 1 : 0, 'boolean', {
        state: this.state,
        failure_count: this.failureCount.toString()
      });
      
      // Log metric recording for debugging
      const metricLog = new AppError(
        `API metrics recorded for ${this.config.serviceName}`,
        ErrorCategory.SYSTEM,
        ErrorSeverity.LOW,
        200,
        {
          service: this.config.serviceName,
          operation: operationName,
          latency,
          success,
          success_rate: Math.round(currentSuccessRate * 100) / 100,
          correlationId: correlationId || 'unknown'
        },
        undefined,
        correlationId
      );
      errorLogger.logError(metricLog);
    } catch (error) {
      // Don't fail API operations due to metrics recording issues
      const metricsError = new AppError(
        `Failed to record API metrics for ${this.config.serviceName}`,
        ErrorCategory.SYSTEM,
        ErrorSeverity.LOW,
        500,
        {
          service: this.config.serviceName,
          operation: operationName,
          error: error instanceof Error ? error.message : String(error)
        },
        error instanceof Error ? error : undefined,
        correlationId
      );
      errorLogger.logError(metricsError);
    }
  }
}

// Pre-configured circuit breakers for common services
export const openAICircuitBreaker = new ApiCircuitBreaker({
  serviceName: 'OpenAI',
  failureThreshold: 3,
  recoveryTimeout: 60000, // 1 minute
  requestTimeout: 30000,  // 30 seconds
  retryAttempts: 2,       // Lower retry count for paid API
  retryDelayBase: 2000,   // 2 seconds base delay
  retryMaxDelay: 10000,   // 10 seconds max delay
  monitoringEnabled: true
});

export const cmsApiCircuitBreaker = new ApiCircuitBreaker({
  serviceName: 'CMS_API',
  failureThreshold: 5,
  recoveryTimeout: 300000, // 5 minutes (CMS is slower to recover)
  requestTimeout: 30000,   // 30 seconds
  retryAttempts: 3,
  retryDelayBase: 1000,    // 1 second base delay
  retryMaxDelay: 30000,    // 30 seconds max delay
  monitoringEnabled: true
});