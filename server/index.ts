import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic } from "./vite";
import { handleServerStarted } from "./startup";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
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
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

export const serverReady = (async () => {
  const server = await registerRoutes(app);

  // API-specific error handler to ensure JSON responses
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    // Only handle errors for API routes
    if (req.path.startsWith('/api')) {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      // Ensure we haven't already sent a response
      if (!res.headersSent) {
        res.status(status).json({ message });
      }
      
      // Log error but don't throw to prevent further error propagation
      console.error('API Error:', err);
      return;
    }
    
    // Pass to next error handler for non-API routes
    next(err);
  });

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
  await new Promise<void>((resolve, reject) => {
    const handleError = (error: Error) => {
      if (typeof (server as any).off === "function") {
        (server as any).off("error", handleError);
      } else {
        server.removeListener("error", handleError);
      }

      reject(error);
    };

    server.on("error", handleError);

    server.listen(
      {
        port,
        host: "0.0.0.0",
        reusePort: true,
      },
      async () => {
        if (typeof (server as any).off === "function") {
          (server as any).off("error", handleError);
        } else {
          server.removeListener("error", handleError);
        }

        await handleServerStarted(port);

        resolve();
      },
    );
  });

  return server;
})();

void serverReady;
