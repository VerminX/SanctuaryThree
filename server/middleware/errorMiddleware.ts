import { Request, Response, NextFunction } from 'express';
import { 
  AppError, 
  ErrorCategory, 
  ErrorSeverity, 
  errorLogger,
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  DatabaseError
} from '../services/errorManager';

// PHI/PII redaction for HIPAA compliance
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

// Enhanced error response interface
interface ErrorResponse {
  success: false;
  error: {
    message: string;
    correlationId: string;
    category: string;
    severity: string;
    timestamp: string;
    statusCode: number;
  };
  // Include additional details in development mode only
  details?: {
    stack?: string;
    context?: Record<string, any>;
    originalError?: string;
  };
}

// Request enhancement to include correlation ID
declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
    }
  }
}

// Middleware to add correlation ID to all requests
export function addCorrelationId(req: Request, res: Response, next: NextFunction) {
  // Use existing correlation ID from headers or create a new one
  req.correlationId = req.headers['x-correlation-id'] as string || 
                     req.headers['x-request-id'] as string ||
                     (new Date().getTime() + Math.random()).toString(36);
  
  // Add correlation ID to response headers for client tracking
  res.setHeader('X-Correlation-ID', req.correlationId);
  
  next();
}

// Enhanced request logging middleware
export function enhancedRequestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;
    
    // Log API requests with enhanced information
    if (path.startsWith("/api")) {
      const logData: any = {
        timestamp: new Date().toISOString(),
        type: 'REQUEST',
        correlationId: req.correlationId,
        method: req.method,
        path,
        statusCode,
        duration,
        userAgent: req.get('User-Agent'),
        ip: req.ip,
        userId: (req as any).user?.claims?.sub
      };

      // Add response body only for errors in development (never in production due to PHI risk)
      if (process.env.NODE_ENV === 'development' && statusCode >= 400) {
        logData.response = redactPHI(capturedJsonResponse);
      }

      // Determine log level based on status code
      if (statusCode >= 500) {
        errorLogger.logError(
          new AppError(
            `Server error on ${req.method} ${path}`,
            ErrorCategory.SYSTEM,
            ErrorSeverity.HIGH,
            statusCode,
            logData,
            undefined,
            req.correlationId
          )
        );
      } else if (statusCode >= 400) {
        const prefix = process.env.NODE_ENV === 'production' ? '' : '⚠️  ';
        console.warn(`${prefix}CLIENT ERROR: ${JSON.stringify(logData)}`);
      } else {
        // Log successful requests (can be disabled in production for performance)
        if (process.env.LOG_SUCCESSFUL_REQUESTS !== 'false') {
          const prefix = process.env.NODE_ENV === 'production' ? '' : '✅ ';
          console.log(`${prefix}SUCCESS: ${req.method} ${path} ${statusCode} in ${duration}ms`);
        }
      }

      // Log performance metrics for monitoring (use consistent naming with performance monitor)
      errorLogger.logMetric(`response_time_ms`, duration, {
        method: req.method,
        path: path.replace(/\/[^\/]+/g, '/*'), // Normalize paths for better grouping
        status_code: statusCode.toString()
      });
    }
  });

  next();
}

// Centralized error handling middleware
export function centralizedErrorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Don't handle if response already sent
  if (res.headersSent) {
    return next(err);
  }

  let appError: AppError;

  // Convert various error types to AppError
  if (err instanceof AppError) {
    appError = err;
  } else if (err.name === 'ValidationError' || err.name === 'ZodError') {
    appError = new ValidationError(
      err.message || 'Invalid input data',
      { 
        path: req.path,
        method: req.method,
        body: redactPHI(req.body),
        query: redactPHI(req.query),
        params: redactPHI(req.params)
      },
      err,
      req.correlationId
    );
  } else if (err.name === 'UnauthorizedError' || err.status === 401) {
    appError = new AuthenticationError(
      err.message || 'Authentication required',
      { 
        path: req.path,
        method: req.method
      },
      err,
      req.correlationId
    );
  } else if (err.status === 403) {
    appError = new AuthorizationError(
      err.message || 'Access denied',
      { 
        path: req.path,
        method: req.method,
        userId: (req as any).user?.claims?.sub
      },
      err,
      req.correlationId
    );
  } else if (err.code && err.code.startsWith('P') && err.meta) {
    // Database errors (Prisma-like or similar ORM errors)
    appError = new DatabaseError(
      'Database operation failed',
      { 
        code: err.code,
        meta: redactPHI(err.meta),
        path: req.path,
        method: req.method
      },
      err,
      req.correlationId
    );
  } else {
    // Unknown error - treat as system error
    appError = new AppError(
      err.message || 'Internal server error',
      ErrorCategory.SYSTEM,
      ErrorSeverity.HIGH,
      err.status || 500,
      { 
        path: req.path,
        method: req.method,
        name: err.name
      },
      err,
      req.correlationId
    );
  }

  // Log the error (no need to add correlationId again as it's already in appError)
  errorLogger.logError(appError, {
    userId: (req as any).user?.claims?.sub,
    path: req.path,
    method: req.method,
    userAgent: req.get('User-Agent'),
    ip: req.ip
  });

  // Build error response
  const errorResponse: ErrorResponse = {
    success: false,
    error: {
      message: appError.message,
      correlationId: appError.correlationId,
      category: appError.category,
      severity: appError.severity,
      timestamp: appError.timestamp.toISOString(),
      statusCode: appError.statusCode
    }
  };

  // Add debug information in development mode
  if (process.env.NODE_ENV === 'development') {
    errorResponse.details = {
      stack: appError.stack,
      context: appError.context,
      originalError: appError.originalError?.message
    };
  }

  // Send error response
  res.status(appError.statusCode).json(errorResponse);
}

// Async error wrapper utility
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Success response helper
export function sendSuccess(
  res: Response, 
  data: any, 
  message?: string, 
  statusCode: number = 200,
  metadata?: Record<string, any>
) {
  res.status(statusCode).json({
    success: true,
    message: message || 'Operation completed successfully',
    data,
    metadata: {
      timestamp: new Date().toISOString(),
      ...metadata
    }
  });
}

// Error factory functions for common scenarios
export const createError = {
  notFound: (resource: string, correlationId?: string) => 
    new AppError(
      `${resource} not found`,
      ErrorCategory.BUSINESS_LOGIC,
      ErrorSeverity.MEDIUM,
      404,
      { resource },
      undefined,
      correlationId
    ),

  unauthorized: (message?: string, correlationId?: string) =>
    new AuthenticationError(
      message || 'Authentication required',
      {},
      undefined,
      correlationId
    ),

  forbidden: (action?: string, correlationId?: string) =>
    new AuthorizationError(
      action ? `Not authorized to ${action}` : 'Access denied',
      { action },
      undefined,
      correlationId
    ),

  badRequest: (message: string, details?: any, correlationId?: string) =>
    new ValidationError(
      message,
      { details },
      undefined,
      correlationId
    ),

  conflict: (message: string, correlationId?: string) =>
    new AppError(
      message,
      ErrorCategory.BUSINESS_LOGIC,
      ErrorSeverity.MEDIUM,
      409,
      {},
      undefined,
      correlationId
    ),

  tooManyRequests: (message?: string, retryAfter?: number, correlationId?: string) =>
    new AppError(
      message || 'Too many requests',
      ErrorCategory.RATE_LIMIT,
      ErrorSeverity.MEDIUM,
      429,
      { retryAfter },
      undefined,
      correlationId
    )
};