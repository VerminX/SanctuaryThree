import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorBoundary } from '@/components/error/ErrorBoundary';
import { AlertTriangle, Bug, Zap } from 'lucide-react';

// Component that can throw errors for testing
function ErrorThrowingComponent({ errorType }: { errorType: string }) {
  const throwError = () => {
    switch (errorType) {
      case 'render':
        throw new Error('Intentional render error for testing error boundary');
      case 'async':
        setTimeout(() => {
          throw new Error('Intentional async error');
        }, 100);
        break;
      case 'network':
        throw new Error('Network request failed - simulated error');
      default:
        throw new Error('Unknown error type');
    }
  };

  // Throw error immediately for render error
  if (errorType === 'render') {
    throwError();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Error Testing Component</CardTitle>
        <CardDescription>This component is working normally</CardDescription>
      </CardHeader>
      <CardContent>
        <Button 
          onClick={throwError}
          variant="destructive"
          data-testid={`button-throw-${errorType}`}
        >
          <Bug className="w-4 h-4 mr-2" />
          Throw {errorType} Error
        </Button>
      </CardContent>
    </Card>
  );
}

// Main test component
export default function ErrorBoundaryTest() {
  const [showError, setShowError] = useState<string | null>(null);

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Zap className="w-5 h-5 mr-2 text-primary" />
            Error Boundary Testing
          </CardTitle>
          <CardDescription>
            Test different error scenarios to verify error boundary functionality
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <Button 
              onClick={() => setShowError('render')}
              data-testid="button-test-render-error"
            >
              Test Render Error
            </Button>
            <Button 
              onClick={() => setShowError('network')}
              data-testid="button-test-network-error"
            >
              Test Network Error
            </Button>
            <Button 
              onClick={() => setShowError('async')}
              data-testid="button-test-async-error"
            >
              Test Async Error
            </Button>
            <Button 
              variant="outline" 
              onClick={() => setShowError(null)}
              data-testid="button-reset-test"
            >
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Test different error boundary levels */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        {/* Component-level error boundary */}
        <div>
          <h3 className="text-lg font-semibold mb-2">Component-Level Error Boundary</h3>
          <ErrorBoundary level="component" componentName="TestComponent">
            {showError ? (
              <ErrorThrowingComponent errorType={showError} />
            ) : (
              <Card>
                <CardContent className="p-4">
                  <p className="text-muted-foreground">No error - component working normally</p>
                </CardContent>
              </Card>
            )}
          </ErrorBoundary>
        </div>

        {/* Page-level error boundary */}
        <div>
          <h3 className="text-lg font-semibold mb-2">Page-Level Error Boundary</h3>
          <ErrorBoundary level="page" componentName="TestPage">
            {showError ? (
              <ErrorThrowingComponent errorType={showError} />
            ) : (
              <Card>
                <CardContent className="p-4">
                  <p className="text-muted-foreground">No error - page component working normally</p>
                </CardContent>
              </Card>
            )}
          </ErrorBoundary>
        </div>

        {/* Custom fallback error boundary */}
        <div>
          <h3 className="text-lg font-semibold mb-2">Custom Fallback</h3>
          <ErrorBoundary 
            level="component" 
            componentName="CustomTest"
            fallback={
              <Card className="border-destructive/50 bg-destructive/5">
                <CardContent className="p-4 text-center">
                  <AlertTriangle className="w-6 h-6 text-destructive mx-auto mb-2" />
                  <p className="text-sm text-destructive">Custom error UI</p>
                  <Button 
                    size="sm" 
                    onClick={() => setShowError(null)}
                    className="mt-2"
                    data-testid="button-reset-custom"
                  >
                    Reset
                  </Button>
                </CardContent>
              </Card>
            }
          >
            {showError ? (
              <ErrorThrowingComponent errorType={showError} />
            ) : (
              <Card>
                <CardContent className="p-4">
                  <p className="text-muted-foreground">No error - custom fallback test</p>
                </CardContent>
              </Card>
            )}
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}