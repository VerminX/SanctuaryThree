import { Component, ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: { componentStack?: string } | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: { componentStack?: string }) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({
      error,
      errorInfo
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4" data-testid="error-boundary-fallback">
          <Card className="w-full max-w-2xl">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <AlertCircle className="h-8 w-8 text-red-500" data-testid="error-icon" />
                <CardTitle className="text-2xl" data-testid="error-title">Something went wrong</CardTitle>
              </div>
              <CardDescription data-testid="error-description">
                An unexpected error occurred. Please try refreshing the page or contact support if the problem persists.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {this.state.error && (
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm text-gray-700 dark:text-gray-300">Error Details:</h3>
                  <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-md">
                    <p className="text-sm font-mono text-red-600 dark:text-red-400" data-testid="error-message">
                      {this.state.error.toString()}
                    </p>
                  </div>
                </div>
              )}

              {process.env.NODE_ENV === 'development' && this.state.errorInfo?.componentStack && (
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm text-gray-700 dark:text-gray-300">Component Stack:</h3>
                  <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-md max-h-48 overflow-auto">
                    <pre className="text-xs font-mono text-gray-600 dark:text-gray-400 whitespace-pre-wrap" data-testid="error-stack">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button 
                  onClick={this.handleReset} 
                  variant="default"
                  data-testid="button-retry"
                >
                  Try Again
                </Button>
                <Button 
                  onClick={() => window.location.href = '/'} 
                  variant="outline"
                  data-testid="button-home"
                >
                  Go to Home
                </Button>
                <Button 
                  onClick={() => window.location.reload()} 
                  variant="outline"
                  data-testid="button-reload"
                >
                  Reload Page
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
