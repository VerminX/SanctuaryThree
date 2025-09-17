import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, Bug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorId: string;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  level?: 'global' | 'page' | 'component';
  componentName?: string;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  showDetails?: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: ''
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    // Generate a unique error ID for tracking
    const errorId = `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      hasError: true,
      error,
      errorId
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error details
    const errorData = {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      errorInfo: {
        componentStack: errorInfo.componentStack,
      },
      level: this.props.level || 'component',
      componentName: this.props.componentName || 'Unknown',
      errorId: this.state.errorId,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
    };

    // Log to console for development
    if (import.meta.env.DEV) {
      console.group(`🚨 Error Boundary Caught Error (${this.state.errorId})`);
      console.error('Error:', error);
      console.error('Error Info:', errorInfo);
      console.error('Context:', errorData);
      console.groupEnd();
    }

    // Always send to backend error logging in production
    if (import.meta.env.PROD || import.meta.env.MODE === 'production') {
      this.reportErrorToBackend(errorData);
    }

    // Update state with error info
    this.setState({ errorInfo });

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  private async reportErrorToBackend(errorData: any) {
    try {
      // Sanitize data before sending to prevent PHI leakage
      const sanitizedData = {
        ...errorData,
        // Redact URL path parameters that might contain patient IDs
        url: this.sanitizeUrl(errorData.url),
        // Limit stack trace size and remove potentially sensitive paths
        error: {
          ...errorData.error,
          stack: errorData.error.stack ? errorData.error.stack.substring(0, 1000) : undefined
        },
        // Remove component stack which may contain sensitive prop data
        errorInfo: {
          componentStack: '[REDACTED]'
        }
      };

      await fetch('/api/errors/client', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sanitizedData),
        credentials: 'include'
      });
    } catch (reportingError) {
      // If error reporting fails, just log to console
      console.error('Failed to report error to backend:', reportingError);
    }
  }

  private sanitizeUrl(url: string): string {
    if (!url) return url;
    
    // Replace patient IDs and other UUIDs with placeholders
    return url
      .replace(/\/patients\/[a-f0-9\-]{36}/gi, '/patients/[ID]')
      .replace(/\/encounters\/[a-f0-9\-]{36}/gi, '/encounters/[ID]')
      .replace(/\/documents\/[a-f0-9\-]{36}/gi, '/documents/[ID]')
      .replace(/\/tenants\/[a-f0-9\-]{36}/gi, '/tenants/[ID]')
      .replace(/\?.*/, ''); // Remove all query parameters
  }

  private handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: ''
    });
  };

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = '/';
  };

  private copyErrorDetails = () => {
    const errorDetails = {
      errorId: this.state.errorId,
      error: this.state.error?.message,
      stack: this.state.error?.stack,
      componentStack: this.state.errorInfo?.componentStack,
      timestamp: new Date().toISOString(),
      url: window.location.href
    };
    
    navigator.clipboard.writeText(JSON.stringify(errorDetails, null, 2));
  };

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Render different UI based on error boundary level
      return this.renderErrorUI();
    }

    return this.props.children;
  }

  private renderErrorUI() {
    const { level = 'component', componentName } = this.props;
    const { error, errorId } = this.state;

    if (level === 'global') {
      return this.renderGlobalErrorUI();
    }

    if (level === 'page') {
      return this.renderPageErrorUI();
    }

    return this.renderComponentErrorUI();
  }

  private renderGlobalErrorUI() {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4" data-testid="error-boundary-global">
        <Card className="w-full max-w-lg">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
              <AlertTriangle className="w-8 h-8 text-destructive" />
            </div>
            <CardTitle className="text-2xl">Application Error</CardTitle>
            <CardDescription>
              Something went wrong and the application has encountered an error.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted p-3 rounded-lg">
              <p className="text-sm text-muted-foreground mb-2">Error ID for support:</p>
              <div className="flex items-center justify-between">
                <code className="text-xs font-mono bg-background px-2 py-1 rounded">
                  {this.state.errorId}
                </code>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={this.copyErrorDetails}
                  data-testid="button-copy-error"
                >
                  Copy Details
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Button onClick={this.handleReload} className="w-full" data-testid="button-reload">
                <RefreshCw className="w-4 h-4 mr-2" />
                Reload Application
              </Button>
              <Button 
                variant="outline" 
                onClick={this.handleGoHome} 
                className="w-full"
                data-testid="button-home"
              >
                <Home className="w-4 h-4 mr-2" />
                Go to Home
              </Button>
            </div>

            {import.meta.env.DEV && this.props.showDetails !== false && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm text-muted-foreground mb-2">
                  Show Error Details (Development)
                </summary>
                <div className="bg-destructive/5 p-3 rounded-lg text-xs font-mono text-destructive overflow-auto max-h-32">
                  {this.state.error?.stack || this.state.error?.message}
                </div>
              </details>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  private renderPageErrorUI() {
    return (
      <div className="min-h-[400px] flex items-center justify-center p-4" data-testid="error-boundary-page">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mb-3">
              <AlertTriangle className="w-6 h-6 text-destructive" />
            </div>
            <CardTitle>Page Error</CardTitle>
            <CardDescription>
              This page encountered an error and cannot be displayed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-center">
              <Badge variant="secondary" className="mb-3">
                Error ID: {this.state.errorId.slice(-8)}
              </Badge>
            </div>
            
            <div className="flex flex-col gap-2">
              <Button onClick={this.handleRetry} className="w-full" data-testid="button-retry">
                <RefreshCw className="w-4 h-4 mr-2" />
                Try Again
              </Button>
              <Button 
                variant="outline" 
                onClick={this.handleGoHome} 
                className="w-full"
                data-testid="button-home"
              >
                <Home className="w-4 h-4 mr-2" />
                Go to Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  private renderComponentErrorUI() {
    return (
      <div className="border border-destructive/20 bg-destructive/5 p-4 rounded-lg" data-testid="error-boundary-component">
        <div className="flex items-start space-x-3">
          <AlertTriangle className="w-5 h-5 text-destructive mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-destructive">Component Error</h3>
            <p className="text-sm text-muted-foreground mt-1">
              The {this.props.componentName || 'component'} encountered an error.
            </p>
            
            <div className="flex items-center space-x-2 mt-3">
              <Button 
                size="sm" 
                variant="outline" 
                onClick={this.handleRetry}
                data-testid="button-retry"
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                Retry
              </Button>
              
              {import.meta.env.DEV && (
                <Button 
                  size="sm" 
                  variant="ghost" 
                  onClick={this.copyErrorDetails}
                  data-testid="button-debug"
                >
                  <Bug className="w-3 h-3 mr-1" />
                  Debug
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
}

// Higher-order component for easy wrapping
export function withErrorBoundary(
  Component: React.ComponentType<any>,
  errorBoundaryProps?: Omit<ErrorBoundaryProps, 'children'>
) {
  const WrappedComponent = (props: any) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  );
  
  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;
  return WrappedComponent;
}

// Hook for manually reporting errors
export function useErrorReporting() {
  const reportError = (error: Error, context?: Record<string, any>) => {
    const errorData = {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      context,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
    };

    if (import.meta.env.DEV) {
      console.error('Manual error report:', errorData);
    }

    if (import.meta.env.PROD || import.meta.env.MODE === 'production') {
      fetch('/api/errors/client', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(errorData),
        credentials: 'include'
      }).catch(reportingError => {
        console.error('Failed to report error:', reportingError);
      });
    }
  };

  return { reportError };
}