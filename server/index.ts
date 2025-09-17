import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { scheduledPolicyUpdate } from "./services/policyUpdater";
import { 
  setupGlobalErrorHandlers,
  errorLogger,
  AppError,
  ErrorCategory,
  ErrorSeverity
} from "./services/errorManager";
import {
  addCorrelationId,
  enhancedRequestLogger,
  centralizedErrorHandler
} from "./middleware/errorMiddleware";
import { performanceMonitor } from "./services/performanceMonitor";
import { intelligentRateLimiter } from "./services/rateLimiter";

// Setup global error handling first
setupGlobalErrorHandlers();

const app = express();

// Essential middleware
app.use(express.json({ limit: '10mb' })); // Increased limit for document uploads
app.use(express.urlencoded({ extended: false }));

// Add correlation ID to all requests
app.use(addCorrelationId);

// Enhanced request logging
app.use(enhancedRequestLogger);

// Performance monitoring - must come after correlation ID and request logging
app.use(performanceMonitor.createPerformanceMiddleware());

(async () => {
  const server = await registerRoutes(app);
  
  // CRITICAL: Rate limiting is now properly integrated inside registerRoutes
  // after authentication setup but before route definitions

  // Use centralized error handler
  app.use(centralizedErrorHandler);

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
    
    // Start nightly policy update scheduler
    setupPolicyUpdateScheduler();
  });

  // Simple scheduler for nightly policy updates
  function setupPolicyUpdateScheduler() {
    const scheduleNextUpdate = () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(now.getDate() + 1);
      tomorrow.setHours(2, 0, 0, 0); // Run at 2:00 AM

      const msUntilNextRun = tomorrow.getTime() - now.getTime();
      
      log(`Next policy update scheduled for: ${tomorrow.toISOString()}`);
      
      setTimeout(async () => {
        try {
          log('Starting scheduled policy update...');
          await scheduledPolicyUpdate();
          log('Scheduled policy update completed successfully');
        } catch (error) {
          log(`Scheduled policy update failed: ${error}`);
        }
        
        // Schedule the next update
        scheduleNextUpdate();
      }, msUntilNextRun);
    };

    // Start the scheduler
    scheduleNextUpdate();
  }
})();
