/**
 * Intelligent Rate Limiting Service for HIPAA-Compliant Healthcare Application
 * 
 * Features:
 * - Multi-tier rate limiting (per-user, per-tenant, per-IP, global)
 * - Subscription-based limits with role-based overrides
 * - Smart throttling based on system resource utilization
 * - Healthcare operation bypass for critical endpoints
 * - Comprehensive usage analytics and monitoring integration
 * - Sliding window rate limiting with memory-efficient storage
 */

import { Request, Response, NextFunction } from 'express';
import { AppError, ErrorCategory, ErrorSeverity } from './errorManager';
import { errorLogger } from './errorManager';
import { performanceMonitor } from './performanceMonitor';

// Rate limit configuration interfaces
export interface RateLimitRule {
  id: string;
  name: string;
  type: 'per_user' | 'per_tenant' | 'per_ip' | 'global';
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  burstRequests?: number; // Burst allowance (higher short-term limit)
  skipSuccessfulRequests?: boolean; // Only count failed requests
  skipFailedRequests?: boolean; // Only count successful requests
  keyGenerator?: (req: Request) => string; // Custom key generation
  skip?: (req: Request) => boolean; // Skip rate limiting for specific requests
  onLimitReached?: (req: Request, rateLimitInfo: RateLimitInfo) => void;
  enabled: boolean;
  priority: number; // Lower number = higher priority
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: Date;
  retryAfter?: number; // Seconds until reset
  type: string;
  key: string;
}

export interface UsageMetrics {
  totalRequests: number;
  blockedRequests: number;
  averageResponseTime: number;
  peakRequestsPerMinute: number;
  quotaUtilization: number; // Percentage of quota used
  lastReset: Date;
  currentWindow: Date;
}

export interface TenantQuota {
  tenantId: string;
  requestsPerHour: number;
  requestsPerDay: number;
  burstLimit: number;
  role: string; // 'basic', 'pro', 'enterprise', 'admin'
  criticalEndpointsBypass: boolean;
  customLimits?: Record<string, number>; // Endpoint-specific limits
}

// Sliding window storage with memory efficiency
class SlidingWindow {
  private windows: Map<string, { requests: number[]; lastCleanup: number }> = new Map();
  private readonly CLEANUP_INTERVAL = 60000; // 1 minute
  private readonly MAX_WINDOWS = 10000; // Prevent memory leaks

  recordRequest(key: string, windowMs: number): { count: number; oldestTimestamp: number } {
    const now = Date.now();
    const windowStart = now - windowMs;
    
    if (!this.windows.has(key)) {
      this.windows.set(key, { requests: [], lastCleanup: now });
    }
    
    const window = this.windows.get(key)!;
    
    // Clean old requests outside the window
    window.requests = window.requests.filter(timestamp => timestamp > windowStart);
    
    // Add current request
    window.requests.push(now);
    
    // CRITICAL FIX: Check cleanup condition BEFORE updating lastCleanup
    // Otherwise cleanup never runs since (now - now) is always 0
    if (now - window.lastCleanup > this.CLEANUP_INTERVAL) {
      this.cleanupOldWindows(windowMs);
      window.lastCleanup = now; // Update AFTER cleanup runs
    }
    
    return {
      count: window.requests.length,
      oldestTimestamp: window.requests.length > 0 ? Math.min(...window.requests) : now
    };
  }
  
  getCurrentCount(key: string, windowMs: number): number {
    const window = this.windows.get(key);
    if (!window) return 0;
    
    const now = Date.now();
    const windowStart = now - windowMs;
    
    return window.requests.filter(timestamp => timestamp > windowStart).length;
  }
  
  private cleanupOldWindows(windowMs: number) {
    const now = Date.now();
    const cutoff = now - (windowMs * 2); // Keep some buffer
    
    // Remove completely expired windows
    for (const [key, window] of Array.from(this.windows.entries())) {
      if (window.lastCleanup < cutoff || window.requests.length === 0) {
        this.windows.delete(key);
      }
    }
    
    // Enforce maximum windows to prevent memory exhaustion
    if (this.windows.size > this.MAX_WINDOWS) {
      const oldestEntries = Array.from(this.windows.entries())
        .sort((a, b) => a[1].lastCleanup - b[1].lastCleanup)
        .slice(0, this.windows.size - this.MAX_WINDOWS);
      
      oldestEntries.forEach(([key]) => this.windows.delete(key));
    }
  }
  
  getUsageStats(): { totalWindows: number; totalRequests: number; memoryUsage: string } {
    let totalRequests = 0;
    for (const window of Array.from(this.windows.values())) {
      totalRequests += window.requests.length;
    }
    
    return {
      totalWindows: this.windows.size,
      totalRequests,
      memoryUsage: `${Math.round(JSON.stringify(Array.from(this.windows)).length / 1024)}KB`
    };
  }
}

export class IntelligentRateLimiter {
  private rateLimitRules: Map<string, RateLimitRule> = new Map();
  private slidingWindows: SlidingWindow = new SlidingWindow();
  private tenantQuotas: Map<string, TenantQuota> = new Map();
  private usageMetrics: Map<string, UsageMetrics> = new Map();
  private systemResourceThreshold: number = 0.8; // 80% system utilization threshold
  private criticalEndpoints: Set<string> = new Set();
  
  constructor() {
    this.initializeDefaultRules();
    this.initializeDefaultQuotas();
    this.defineCriticalEndpoints();
    this.startMetricsCollection();
  }
  
  /**
   * Initialize default rate limiting rules for healthcare application
   */
  private initializeDefaultRules() {
    const defaultRules: RateLimitRule[] = [
      {
        id: 'global_api_limit',
        name: 'Global API Rate Limit',
        type: 'global',
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 1000, // 1000 requests per minute globally
        burstRequests: 1200,
        enabled: true,
        priority: 1
      },
      {
        id: 'per_user_standard',
        name: 'Per-User Standard Rate Limit',
        type: 'per_user',
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 100, // 100 requests per minute per user
        burstRequests: 120,
        skipSuccessfulRequests: false,
        enabled: true,
        priority: 2
      },
      {
        id: 'per_tenant_limit',
        name: 'Per-Tenant Rate Limit',
        type: 'per_tenant',
        windowMs: 60 * 60 * 1000, // 1 hour
        maxRequests: 5000, // 5000 requests per hour per tenant
        burstRequests: 6000,
        enabled: true,
        priority: 3
      },
      {
        id: 'per_ip_aggressive',
        name: 'Per-IP Aggressive Rate Limit',
        type: 'per_ip',
        windowMs: 15 * 60 * 1000, // 15 minutes
        maxRequests: 500, // 500 requests per 15 minutes per IP
        burstRequests: 600,
        skip: (req: Request) => !!((req as any).user?.claims?.sub), // Skip for authenticated users
        enabled: true,
        priority: 4
      },
      {
        id: 'authentication_endpoints',
        name: 'Authentication Endpoints Rate Limit',
        type: 'per_ip',
        windowMs: 15 * 60 * 1000, // 15 minutes
        maxRequests: 20, // 20 login attempts per 15 minutes per IP
        keyGenerator: (req: Request) => `auth:${req.ip}:${req.path}`,
        skip: (req: Request) => !req.path.includes('/api/auth/') && !req.path.includes('/api/callback'),
        enabled: true,
        priority: 0 // Highest priority
      }
    ];
    
    defaultRules.forEach(rule => this.rateLimitRules.set(rule.id, rule));
  }
  
  /**
   * Initialize default tenant quotas based on subscription tiers
   */
  private initializeDefaultQuotas() {
    const defaultQuotas: TenantQuota[] = [
      {
        tenantId: 'default_basic',
        requestsPerHour: 1000,
        requestsPerDay: 10000,
        burstLimit: 50,
        role: 'basic',
        criticalEndpointsBypass: false
      },
      {
        tenantId: 'default_pro',
        requestsPerHour: 5000,
        requestsPerDay: 100000,
        burstLimit: 200,
        role: 'pro',
        criticalEndpointsBypass: true
      },
      {
        tenantId: 'default_enterprise',
        requestsPerHour: 20000,
        requestsPerDay: 500000,
        burstLimit: 1000,
        role: 'enterprise',
        criticalEndpointsBypass: true
      },
      {
        tenantId: 'default_admin',
        requestsPerHour: 100000,
        requestsPerDay: 1000000,
        burstLimit: 5000,
        role: 'admin',
        criticalEndpointsBypass: true
      }
    ];
    
    defaultQuotas.forEach(quota => this.tenantQuotas.set(quota.tenantId, quota));
  }
  
  /**
   * Define critical healthcare endpoints that bypass rate limiting
   */
  private defineCriticalEndpoints() {
    this.criticalEndpoints = new Set([
      '/api/health',
      '/api/health/diagnostics',
      '/api/emergencies',
      '/api/patients/emergency',
      '/api/encounters/urgent',
      '/api/eligibility/emergency',
      '/api/auth/logout' // Allow users to logout even if rate limited
    ]);
  }
  
  /**
   * Create rate limiting middleware
   */
  createRateLimitMiddleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const startTime = Date.now();
        
        // Check if endpoint should bypass rate limiting
        if (this.shouldBypassRateLimit(req)) {
          return next();
        }
        
        // Check system resource utilization for dynamic throttling
        if (await this.isSystemOverloaded()) {
          const resourceError = new AppError(
            'System temporarily overloaded, please try again later',
            ErrorCategory.SYSTEM,
            ErrorSeverity.HIGH,
            503,
            {
              ip: req.ip,
              path: req.path,
              userAgent: req.get('User-Agent'),
              userId: (req as any).user?.claims?.sub
            },
            undefined,
            req.correlationId
          );
          
          errorLogger.logError(resourceError);
          return this.sendRateLimitResponse(res, {
            limit: 0,
            remaining: 0,
            reset: new Date(Date.now() + 60000),
            retryAfter: 60,
            type: 'system_overload',
            key: 'global'
          });
        }
        
        // Apply rate limiting rules in priority order
        const sortedRules = Array.from(this.rateLimitRules.values())
          .filter(rule => rule.enabled)
          .sort((a, b) => a.priority - b.priority);
        
        for (const rule of sortedRules) {
          const rateLimitInfo = await this.checkRateLimit(req, rule);
          
          if (rateLimitInfo.remaining < 0) {
            // Log rate limit violation
            const rateLimitError = new AppError(
              `Rate limit exceeded: ${rule.name}`,
              ErrorCategory.RATE_LIMIT,
              ErrorSeverity.MEDIUM,
              429,
              {
                rule: rule.name,
                type: rule.type,
                limit: rateLimitInfo.limit,
                key: rateLimitInfo.key,
                ip: req.ip,
                userId: (req as any).user?.claims?.sub,
                tenantId: (req as any).user?.claims?.tenantId,
                path: req.path
              },
              undefined,
              req.correlationId
            );
            
            errorLogger.logError(rateLimitError);
            
            // Record blocked request in performance metrics
            performanceMonitor.recordMetric('rate_limit_violations', 1, 'count', {
              rule_type: rule.type,
              rule_name: rule.name,
              path: req.path
            });
            
            // Update usage metrics
            this.updateUsageMetrics(rateLimitInfo.key, false, Date.now() - startTime);
            
            // Execute custom handler if defined
            if (rule.onLimitReached) {
              rule.onLimitReached(req, rateLimitInfo);
            }
            
            return this.sendRateLimitResponse(res, rateLimitInfo);
          }
        }
        
        // Request allowed - update metrics and continue
        const processTime = Date.now() - startTime;
        this.updateUsageMetrics('global', true, processTime);
        
        // Add rate limit headers for transparency
        this.addRateLimitHeaders(req, res);
        
        next();
      } catch (error) {
        const middlewareError = new AppError(
          'Rate limiting middleware error',
          ErrorCategory.SYSTEM,
          ErrorSeverity.HIGH,
          500,
          {
            error: error instanceof Error ? error.message : String(error),
            ip: req.ip,
            path: req.path,
            userId: (req as any).user?.claims?.sub
          },
          error instanceof Error ? error : undefined,
          req.correlationId
        );
        
        errorLogger.logError(middlewareError);
        
        // Fail open - allow request if rate limiting fails
        next();
      }
    };
  }
  
  /**
   * Check if request should bypass rate limiting
   */
  private shouldBypassRateLimit(req: Request): boolean {
    const user = (req as any).user;
    const path = req.path;
    
    // Bypass critical healthcare endpoints
    if (this.criticalEndpoints.has(path)) {
      return true;
    }
    
    // Bypass static frontend assets and development files
    const staticAssetPatterns = [
      /\.(js|jsx|ts|tsx|css|scss|sass|less)$/i,
      /\.(png|jpg|jpeg|gif|svg|ico|webp)$/i,
      /\.(woff|woff2|ttf|eot|otf)$/i,
      /\.(json|xml|txt|html|htm)$/i,
      /\/favicon\.ico$/i,
      /\/@vite\//,
      /\/__vite_ping$/,
      /\/src\//,
      /\/client\//,
      /\/assets\//
    ];
    
    if (staticAssetPatterns.some(pattern => pattern.test(path))) {
      return true;
    }
    
    // Bypass for admin users (with audit logging)
    if (user?.claims?.sub) {
      // This would integrate with storage.getUserTenantRole to check admin status
      // For now, we'll check if user has admin privileges
      const tenantId = user.claims.tenantId;
      if (tenantId) {
        const quota = this.tenantQuotas.get(tenantId) || this.tenantQuotas.get('default_basic');
        if (quota?.role === 'admin' && quota.criticalEndpointsBypass) {
          // Log admin bypass for audit
          errorLogger.logError(
            new AppError(
              'Admin rate limit bypass',
              ErrorCategory.SYSTEM,
              ErrorSeverity.INFO,
              200,
              {
                userId: user.claims.sub,
                tenantId: tenantId,
                path: path,
                ip: req.ip
              },
              undefined,
              req.correlationId
            )
          );
          return true;
        }
      }
    }
    
    return false;
  }
  
  /**
   * Check system resource utilization for dynamic throttling
   */
  private async isSystemOverloaded(): Promise<boolean> {
    try {
      // Determine if we're in development environment
      const isDevelopment = process.env.NODE_ENV !== 'production';
      
      const memoryUsage = process.memoryUsage();
      const totalMemory = memoryUsage.heapUsed + memoryUsage.external;
      const memoryUtilizationGB = totalMemory / (1024 * 1024 * 1024);
      
      // Set environment-appropriate thresholds
      const memoryThreshold = isDevelopment ? 4.0 : 2.0; // 4GB dev, 2GB prod
      const errorRateThreshold = isDevelopment ? 0.75 : 0.25; // 75% dev, 25% prod
      const responseTimeThreshold = isDevelopment ? 15000 : 8000; // 15s dev, 8s prod
      
      // Only consider system overloaded if memory usage is extremely high
      if (memoryUtilizationGB > memoryThreshold) {
        errorLogger.logError(
          new AppError(
            'System overload detected: High memory usage',
            ErrorCategory.SYSTEM,
            ErrorSeverity.HIGH,
            503,
            {
              memoryUsageGB: memoryUtilizationGB.toFixed(2),
              threshold: memoryThreshold,
              environment: isDevelopment ? 'development' : 'production'
            }
          )
        );
        return true;
      }
      
      // Check performance metrics for system stress
      const performanceData = performanceMonitor.getPerformanceSummary();
      const recentErrorRate = performanceData.error_rate_percentage || 0;
      const averageResponseTime = performanceData.average_response_time_ms || 0;
      
      // Only consider system overloaded if BOTH error rate AND response time are problematic
      // This prevents false positives from single metric spikes
      const highErrorRate = recentErrorRate > errorRateThreshold;
      const slowResponseTime = averageResponseTime > responseTimeThreshold;
      
      if (highErrorRate && slowResponseTime) {
        errorLogger.logError(
          new AppError(
            'System overload detected: High error rate and slow response time',
            ErrorCategory.SYSTEM,
            ErrorSeverity.HIGH,
            503,
            {
              errorRate: `${(recentErrorRate * 100).toFixed(1)}%`,
              errorRateThreshold: `${(errorRateThreshold * 100).toFixed(1)}%`,
              responseTime: `${averageResponseTime}ms`,
              responseTimeThreshold: `${responseTimeThreshold}ms`,
              environment: isDevelopment ? 'development' : 'production'
            }
          )
        );
        return true;
      }
      
      return false;
    } catch (error) {
      // Fail safe - if we can't determine system load, don't throttle
      errorLogger.logError(
        new AppError(
          'Error checking system overload status',
          ErrorCategory.SYSTEM,
          ErrorSeverity.MEDIUM,
          500,
          {
            error: error instanceof Error ? error.message : String(error)
          },
          error instanceof Error ? error : undefined
        )
      );
      return false;
    }
  }
  
  /**
   * Check rate limit for a specific rule
   */
  private async checkRateLimit(req: Request, rule: RateLimitRule): Promise<RateLimitInfo> {
    const key = this.generateRateLimitKey(req, rule);
    
    // Skip if rule has skip function that returns true
    if (rule.skip && rule.skip(req)) {
      return {
        limit: rule.maxRequests,
        remaining: rule.maxRequests,
        reset: new Date(Date.now() + rule.windowMs),
        type: rule.type,
        key: key
      };
    }
    
    // Record request and get current count
    const { count } = this.slidingWindows.recordRequest(key, rule.windowMs);
    
    // Determine effective limit (consider burst)
    const effectiveLimit = this.getEffectiveLimit(req, rule);
    const remaining = Math.max(0, effectiveLimit - count);
    const resetTime = new Date(Date.now() + rule.windowMs);
    
    return {
      limit: effectiveLimit,
      remaining: remaining,
      reset: resetTime,
      retryAfter: remaining <= 0 ? Math.ceil(rule.windowMs / 1000) : undefined,
      type: rule.type,
      key: key
    };
  }
  
  /**
   * Generate rate limit key based on rule type
   */
  private generateRateLimitKey(req: Request, rule: RateLimitRule): string {
    if (rule.keyGenerator) {
      return rule.keyGenerator(req);
    }
    
    const user = (req as any).user;
    
    switch (rule.type) {
      case 'per_user':
        return user?.claims?.sub ? `user:${user.claims.sub}:${rule.id}` : `ip:${req.ip}:${rule.id}`;
      case 'per_tenant':
        return user?.claims?.tenantId ? `tenant:${user.claims.tenantId}:${rule.id}` : `ip:${req.ip}:${rule.id}`;
      case 'per_ip':
        return `ip:${req.ip}:${rule.id}`;
      case 'global':
        return `global:${rule.id}`;
      default:
        return `default:${req.ip}:${rule.id}`;
    }
  }
  
  /**
   * Get effective rate limit considering tenant quotas and burst limits
   */
  private getEffectiveLimit(req: Request, rule: RateLimitRule): number {
    const user = (req as any).user;
    let effectiveLimit = rule.maxRequests;
    
    // Apply tenant-specific quotas
    if (user?.claims?.tenantId) {
      const quota = this.tenantQuotas.get(user.claims.tenantId) || 
                   this.tenantQuotas.get(`default_${this.getUserRole(user)}`);
      
      if (quota) {
        // Scale limit based on tenant quota
        const quotaMultiplier = this.getQuotaMultiplier(quota.role);
        effectiveLimit = Math.floor(rule.maxRequests * quotaMultiplier);
      }
    }
    
    // Apply burst allowance if configured
    if (rule.burstRequests && rule.burstRequests > effectiveLimit) {
      // Allow burst for short periods
      const burstWindow = Math.min(rule.windowMs / 4, 15000); // Max 15 seconds
      const recentRequests = this.slidingWindows.getCurrentCount(
        this.generateRateLimitKey(req, rule), 
        burstWindow
      );
      
      if (recentRequests < rule.burstRequests * 0.1) { // Allow burst if within 10% of burst limit recently
        effectiveLimit = rule.burstRequests;
      }
    }
    
    return effectiveLimit;
  }
  
  /**
   * Get quota multiplier based on user role
   */
  private getQuotaMultiplier(role: string): number {
    const multipliers: Record<string, number> = {
      'basic': 1.0,
      'pro': 2.5,
      'enterprise': 10.0,
      'admin': 50.0
    };
    
    return multipliers[role] || 1.0;
  }
  
  /**
   * Get user role from user object (placeholder implementation)
   */
  private getUserRole(user: any): string {
    // This would integrate with actual user role system
    // For now, return basic as default
    return 'basic';
  }
  
  /**
   * Update usage metrics for analytics
   */
  private updateUsageMetrics(key: string, success: boolean, responseTime: number) {
    if (!this.usageMetrics.has(key)) {
      this.usageMetrics.set(key, {
        totalRequests: 0,
        blockedRequests: 0,
        averageResponseTime: 0,
        peakRequestsPerMinute: 0,
        quotaUtilization: 0,
        lastReset: new Date(),
        currentWindow: new Date()
      });
    }
    
    const metrics = this.usageMetrics.get(key)!;
    metrics.totalRequests++;
    
    if (!success) {
      metrics.blockedRequests++;
    }
    
    // Update average response time
    metrics.averageResponseTime = 
      (metrics.averageResponseTime * (metrics.totalRequests - 1) + responseTime) / metrics.totalRequests;
    
    // Record metric for performance monitoring integration
    performanceMonitor.recordMetric('rate_limiter_response_time', responseTime, 'milliseconds', {
      key: key.split(':')[0], // Just the type (user, tenant, ip, global)
      success: success.toString()
    });
  }
  
  /**
   * Add rate limit headers to response
   */
  private addRateLimitHeaders(req: Request, res: Response) {
    // Get primary rate limit info (user or IP based)
    const primaryRule = this.rateLimitRules.get('per_user_standard') || 
                       this.rateLimitRules.get('per_ip_aggressive');
    
    if (primaryRule) {
      const key = this.generateRateLimitKey(req, primaryRule);
      const currentCount = this.slidingWindows.getCurrentCount(key, primaryRule.windowMs);
      const effectiveLimit = this.getEffectiveLimit(req, primaryRule);
      
      res.setHeader('X-RateLimit-Limit', effectiveLimit);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, effectiveLimit - currentCount));
      res.setHeader('X-RateLimit-Reset', new Date(Date.now() + primaryRule.windowMs).toISOString());
      res.setHeader('X-RateLimit-Window', `${primaryRule.windowMs / 1000}s`);
    }
  }
  
  /**
   * Send rate limit exceeded response
   */
  private sendRateLimitResponse(res: Response, rateLimitInfo: RateLimitInfo) {
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Rate limit exceeded. Please try again later.',
        details: {
          limit: rateLimitInfo.limit,
          remaining: rateLimitInfo.remaining,
          reset: rateLimitInfo.reset.toISOString(),
          retryAfter: rateLimitInfo.retryAfter,
          type: rateLimitInfo.type
        }
      },
      timestamp: new Date().toISOString()
    });
  }
  
  /**
   * Start metrics collection for monitoring integration
   */
  private startMetricsCollection() {
    setInterval(() => {
      const stats = this.slidingWindows.getUsageStats();
      
      performanceMonitor.recordMetric('rate_limiter_total_windows', stats.totalWindows, 'count');
      performanceMonitor.recordMetric('rate_limiter_total_requests', stats.totalRequests, 'count');
      performanceMonitor.recordMetric('rate_limiter_memory_usage', parseInt(stats.memoryUsage.replace('KB', '')), 'kilobytes');
      
      // Log usage statistics
      errorLogger.logError(
        new AppError(
          'Rate limiter statistics',
          ErrorCategory.SYSTEM,
          ErrorSeverity.INFO,
          200,
          {
            activeWindows: stats.totalWindows,
            totalTrackedRequests: stats.totalRequests,
            memoryUsage: stats.memoryUsage,
            activeRules: this.rateLimitRules.size,
            tenantQuotas: this.tenantQuotas.size
          }
        )
      );
    }, 300000); // Every 5 minutes
  }
  
  /**
   * Get comprehensive usage analytics
   */
  getUsageAnalytics(): {
    rules: Array<RateLimitRule & { currentUsage?: number }>;
    quotas: TenantQuota[];
    systemStats: any;
    recentViolations: number;
  } {
    const stats = this.slidingWindows.getUsageStats();
    const rulesWithUsage = Array.from(this.rateLimitRules.values()).map(rule => ({
      ...rule,
      currentUsage: this.slidingWindows.getCurrentCount(`global:${rule.id}`, rule.windowMs)
    }));
    
    return {
      rules: rulesWithUsage,
      quotas: Array.from(this.tenantQuotas.values()),
      systemStats: {
        totalWindows: stats.totalWindows,
        totalRequests: stats.totalRequests,
        memoryUsage: stats.memoryUsage,
        criticalEndpoints: Array.from(this.criticalEndpoints)
      },
      recentViolations: this.getRecentViolationCount()
    };
  }
  
  /**
   * Get recent rate limit violations count
   */
  private getRecentViolationCount(): number {
    // This would integrate with performance monitoring to get recent violation count
    // For now, return placeholder
    return 0;
  }
  
  /**
   * Update rate limit rule
   */
  updateRateLimitRule(ruleId: string, updates: Partial<RateLimitRule>): boolean {
    const existingRule = this.rateLimitRules.get(ruleId);
    if (!existingRule) {
      return false;
    }
    
    const updatedRule = { ...existingRule, ...updates };
    this.rateLimitRules.set(ruleId, updatedRule);
    
    return true;
  }
  
  /**
   * Update tenant quota
   */
  updateTenantQuota(tenantId: string, quota: TenantQuota): void {
    this.tenantQuotas.set(tenantId, quota);
  }
  
  /**
   * Get current rate limit status for a request
   */
  async getRateLimitStatus(req: Request): Promise<Record<string, RateLimitInfo>> {
    const status: Record<string, RateLimitInfo> = {};
    
    const sortedRules = Array.from(this.rateLimitRules.values())
      .filter(rule => rule.enabled)
      .sort((a, b) => a.priority - b.priority);
    
    for (const rule of sortedRules) {
      status[rule.id] = await this.checkRateLimit(req, rule);
    }
    
    return status;
  }
}

// Export singleton instance
export const intelligentRateLimiter = new IntelligentRateLimiter();