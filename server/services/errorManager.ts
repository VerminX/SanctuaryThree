import { randomUUID } from 'crypto';

// Error severity levels
export enum ErrorSeverity {
  CRITICAL = 'CRITICAL',  // System-breaking errors requiring immediate attention
  HIGH = 'HIGH',          // Important errors affecting user experience
  MEDIUM = 'MEDIUM',      // Recoverable errors with fallback mechanisms
  LOW = 'LOW',            // Minor issues, informational
  INFO = 'INFO'           // Informational messages
}

// Error categories for better organization
export enum ErrorCategory {
  AUTHENTICATION = 'AUTHENTICATION',
  AUTHORIZATION = 'AUTHORIZATION',
  VALIDATION = 'VALIDATION',
  DATABASE = 'DATABASE',
  EXTERNAL_API = 'EXTERNAL_API',
  ENCRYPTION = 'ENCRYPTION',
  BUSINESS_LOGIC = 'BUSINESS_LOGIC',
  SYSTEM = 'SYSTEM',
  NETWORK = 'NETWORK',
  RATE_LIMIT = 'RATE_LIMIT',
  TIMEOUT = 'TIMEOUT'
}

// Base error class with correlation ID and structured data
export class AppError extends Error {
  public readonly correlationId: string;
  public readonly category: ErrorCategory;
  public readonly severity: ErrorSeverity;
  public readonly isOperational: boolean;
  public readonly statusCode: number;
  public readonly timestamp: Date;
  public readonly context?: Record<string, any>;
  public readonly originalError?: Error;

  constructor(
    message: string,
    category: ErrorCategory,
    severity: ErrorSeverity = ErrorSeverity.HIGH,
    statusCode: number = 500,
    context?: Record<string, any>,
    originalError?: Error,
    correlationId?: string
  ) {
    super(message);
    
    this.name = this.constructor.name;
    this.correlationId = correlationId || randomUUID();
    this.category = category;
    this.severity = severity;
    this.isOperational = true;
    this.statusCode = statusCode;
    this.timestamp = new Date();
    this.context = context;
    this.originalError = originalError;

    Error.captureStackTrace(this, this.constructor);
  }

  // Serialize error for logging
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      correlationId: this.correlationId,
      category: this.category,
      severity: this.severity,
      statusCode: this.statusCode,
      timestamp: this.timestamp.toISOString(),
      context: this.context,
      stack: this.stack,
      originalError: this.originalError?.message
    };
  }
}

// PHI/PII redaction utility for HIPAA compliance
const PHI_FIELDS = [
  'ssn', 'social_security_number', 'dob', 'date_of_birth', 'birthDate', 'dateOfBirth',
  'phone', 'phoneNumber', 'email', 'address', 'street', 'city', 'state', 'zip', 'zipcode',
  'mrn', 'medical_record_number', 'patient_id', 'patientId', 'patient_name', 'patientName',
  'first_name', 'firstName', 'last_name', 'lastName', 'fullName', 'full_name',
  'diagnosis', 'condition', 'medication', 'treatment', 'notes', 'clinical_notes',
  'password', 'token', 'refresh_token', 'access_token', 'api_key', 'secret'
];

function redactPHI(data: any): any {
  if (!data || typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(redactPHI);
  }

  const redacted = { ...data };
  
  for (const key in redacted) {
    const lowerKey = key.toLowerCase();
    
    // Redact known PHI fields
    if (PHI_FIELDS.some(field => lowerKey.includes(field))) {
      redacted[key] = '[REDACTED]';
    }
    // Recursively redact nested objects
    else if (redacted[key] && typeof redacted[key] === 'object') {
      redacted[key] = redactPHI(redacted[key]);
    }
  }
  
  return redacted;
}

// Specific error classes for different scenarios
export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication failed', context?: Record<string, any>, originalError?: Error, correlationId?: string) {
    super(message, ErrorCategory.AUTHENTICATION, ErrorSeverity.HIGH, 401, context, originalError, correlationId);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Access denied', context?: Record<string, any>, originalError?: Error, correlationId?: string) {
    super(message, ErrorCategory.AUTHORIZATION, ErrorSeverity.HIGH, 403, context, originalError, correlationId);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, context?: Record<string, any>, originalError?: Error, correlationId?: string) {
    super(message, ErrorCategory.VALIDATION, ErrorSeverity.MEDIUM, 400, context, originalError, correlationId);
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, context?: Record<string, any>, originalError?: Error, correlationId?: string) {
    super(message, ErrorCategory.DATABASE, ErrorSeverity.CRITICAL, 500, context, originalError, correlationId);
  }
}

export class ExternalApiError extends AppError {
  constructor(message: string, apiName?: string, context?: Record<string, any>, originalError?: Error, correlationId?: string) {
    const enhancedContext = { ...context, apiName };
    super(message, ErrorCategory.EXTERNAL_API, ErrorSeverity.HIGH, 502, enhancedContext, originalError, correlationId);
  }
}

export class EncryptionError extends AppError {
  constructor(message: string, context?: Record<string, any>, originalError?: Error, correlationId?: string) {
    super(message, ErrorCategory.ENCRYPTION, ErrorSeverity.CRITICAL, 500, context, originalError, correlationId);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded', context?: Record<string, any>, originalError?: Error, correlationId?: string) {
    super(message, ErrorCategory.RATE_LIMIT, ErrorSeverity.MEDIUM, 429, context, originalError, correlationId);
  }
}

export class TimeoutError extends AppError {
  constructor(message: string, timeoutMs?: number, context?: Record<string, any>, originalError?: Error, correlationId?: string) {
    const enhancedContext = { ...context, timeoutMs };
    super(message, ErrorCategory.TIMEOUT, ErrorSeverity.HIGH, 408, enhancedContext, originalError, correlationId);
  }
}

export class BusinessLogicError extends AppError {
  constructor(message: string, context?: Record<string, any>, originalError?: Error, correlationId?: string) {
    super(message, ErrorCategory.BUSINESS_LOGIC, ErrorSeverity.MEDIUM, 400, context, originalError, correlationId);
  }
}

// Error logger with structured logging
export class ErrorLogger {
  private static instance: ErrorLogger;

  public static getInstance(): ErrorLogger {
    if (!ErrorLogger.instance) {
      ErrorLogger.instance = new ErrorLogger();
    }
    return ErrorLogger.instance;
  }

  logError(error: AppError | Error, additionalContext?: Record<string, any>) {
    const timestamp = new Date().toISOString();
    
    if (error instanceof AppError) {
      const redactedContext = redactPHI({ ...error.context, ...additionalContext });
      
      const logData = {
        timestamp,
        level: this.getSeverityLogLevel(error.severity),
        correlationId: error.correlationId,
        category: error.category,
        severity: error.severity,
        statusCode: error.statusCode,
        message: error.message,
        context: redactedContext,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        originalError: error.originalError?.message
      };

      // Log with appropriate console method based on severity
      this.logToConsole(error.severity, logData);
    } else {
      // Handle non-AppError instances
      const redactedContext = redactPHI(additionalContext);
      
      const logData = {
        timestamp,
        level: 'ERROR',
        correlationId: randomUUID(),
        category: ErrorCategory.SYSTEM,
        severity: ErrorSeverity.HIGH,
        statusCode: 500,
        message: error.message,
        context: redactedContext,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        name: error.name
      };

      this.logToConsole(ErrorSeverity.HIGH, logData);
    }
  }

  private getSeverityLogLevel(severity: ErrorSeverity): string {
    switch (severity) {
      case ErrorSeverity.CRITICAL:
        return 'CRITICAL';
      case ErrorSeverity.HIGH:
        return 'ERROR';
      case ErrorSeverity.MEDIUM:
        return 'WARN';
      case ErrorSeverity.LOW:
      case ErrorSeverity.INFO:
        return 'INFO';
      default:
        return 'ERROR';
    }
  }

  private logToConsole(severity: ErrorSeverity, data: any) {
    const formattedLog = JSON.stringify(data, null, process.env.NODE_ENV === 'development' ? 2 : 0);
    
    // Use simple prefixes in production for better log parsing
    const prefix = process.env.NODE_ENV === 'production' ? '' : this.getEmojiPrefix(severity);
    
    switch (severity) {
      case ErrorSeverity.CRITICAL:
        console.error(`${prefix}CRITICAL:`, formattedLog);
        break;
      case ErrorSeverity.HIGH:
        console.error(`${prefix}ERROR:`, formattedLog);
        break;
      case ErrorSeverity.MEDIUM:
        console.warn(`${prefix}WARN:`, formattedLog);
        break;
      case ErrorSeverity.LOW:
      case ErrorSeverity.INFO:
        console.info(`${prefix}INFO:`, formattedLog);
        break;
      default:
        console.error(`${prefix}ERROR:`, formattedLog);
    }
  }

  private getEmojiPrefix(severity: ErrorSeverity): string {
    switch (severity) {
      case ErrorSeverity.CRITICAL:
        return '🚨 ';
      case ErrorSeverity.HIGH:
        return '❌ ';
      case ErrorSeverity.MEDIUM:
        return '⚠️  ';
      case ErrorSeverity.LOW:
      case ErrorSeverity.INFO:
        return 'ℹ️  ';
      default:
        return '';
    }
  }

  // Log operational metrics for monitoring
  logMetric(metricName: string, value: number, tags?: Record<string, string>) {
    const logData = {
      timestamp: new Date().toISOString(),
      type: 'METRIC',
      metric: metricName,
      value,
      tags
    };
    
    const prefix = process.env.NODE_ENV === 'production' ? '' : '📊 ';
    console.log(`${prefix}METRIC: ${JSON.stringify(logData)}`);
  }
}

// Error recovery utilities
export class ErrorRecovery {
  // Retry with exponential backoff
  static async retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelayMs: number = 1000,
    maxDelayMs: number = 10000,
    shouldRetry?: (error: any) => boolean
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        
        // Don't retry if custom condition says no
        if (shouldRetry && !shouldRetry(error)) {
          throw error;
        }
        
        // Don't retry on last attempt
        if (attempt === maxRetries) {
          throw error;
        }
        
        // Calculate delay with exponential backoff and jitter
        const exponentialDelay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
        const jitter = Math.random() * 0.1 * exponentialDelay;
        const delay = exponentialDelay + jitter;
        
        ErrorLogger.getInstance().logError(
          new AppError(
            `Operation failed, retrying in ${Math.round(delay)}ms (attempt ${attempt}/${maxRetries})`,
            ErrorCategory.SYSTEM,
            ErrorSeverity.INFO,
            500,
            { attempt, maxRetries, delay, originalError: error instanceof Error ? error.message : String(error) }
          )
        );
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }

  // Circuit breaker pattern (simplified version)
  static createCircuitBreaker(
    name: string,
    failureThreshold: number = 5,
    resetTimeoutMs: number = 60000
  ) {
    let failureCount = 0;
    let lastFailureTime = 0;
    let state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

    return {
      async execute<T>(operation: () => Promise<T>): Promise<T> {
        const now = Date.now();

        // Check if circuit should move from OPEN to HALF_OPEN
        if (state === 'OPEN' && now - lastFailureTime >= resetTimeoutMs) {
          state = 'HALF_OPEN';
          ErrorLogger.getInstance().logError(
            new AppError(
              `Circuit breaker ${name} moved to HALF_OPEN state`,
              ErrorCategory.SYSTEM,
              ErrorSeverity.INFO
            )
          );
        }

        // Reject immediately if circuit is OPEN
        if (state === 'OPEN') {
          throw new AppError(
            `Circuit breaker ${name} is OPEN`,
            ErrorCategory.SYSTEM,
            ErrorSeverity.HIGH,
            503
          );
        }

        try {
          const result = await operation();
          
          // Success - reset failure count and close circuit
          if (state === 'HALF_OPEN') {
            state = 'CLOSED';
            failureCount = 0;
            ErrorLogger.getInstance().logError(
              new AppError(
                `Circuit breaker ${name} moved to CLOSED state`,
                ErrorCategory.SYSTEM,
                ErrorSeverity.INFO
              )
            );
          }
          
          return result;
        } catch (error: any) {
          failureCount++;
          lastFailureTime = now;
          
          // Open circuit if threshold exceeded
          if (failureCount >= failureThreshold) {
            state = 'OPEN';
            ErrorLogger.getInstance().logError(
              new AppError(
                `Circuit breaker ${name} moved to OPEN state after ${failureCount} failures`,
                ErrorCategory.SYSTEM,
                ErrorSeverity.HIGH,
                503,
                { failureCount, failureThreshold }
              )
            );
          }
          
          throw error;
        }
      },

      getState() {
        return { state, failureCount, lastFailureTime };
      }
    };
  }
}

// Global error handler
export function setupGlobalErrorHandlers() {
  const logger = ErrorLogger.getInstance();

  // Handle uncaught exceptions
  process.on('uncaughtException', (error: Error) => {
    logger.logError(
      new AppError(
        'Uncaught Exception',
        ErrorCategory.SYSTEM,
        ErrorSeverity.CRITICAL,
        500,
        undefined,
        error
      )
    );
    
    // Give time for the log to be written, then exit
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    logger.logError(
      new AppError(
        'Unhandled Promise Rejection',
        ErrorCategory.SYSTEM,
        ErrorSeverity.CRITICAL,
        500,
        { reason: reason?.toString(), promise: promise?.toString() }
      )
    );
  });
}

// Export logger instance
export const errorLogger = ErrorLogger.getInstance();