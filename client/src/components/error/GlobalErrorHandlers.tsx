import { useEffect } from 'react';
import { useErrorReporting } from './ErrorBoundary';

// Global error handlers for async errors that error boundaries can't catch
export function GlobalErrorHandlers() {
  const { reportError } = useErrorReporting();

  useEffect(() => {
    // Handle unhandled JavaScript errors
    const handleError = (event: ErrorEvent) => {
      const error = new Error(event.message);
      error.stack = event.error?.stack;
      
      reportError(error, {
        type: 'unhandled_error',
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        source: 'window.onerror'
      });
    };

    // Handle unhandled promise rejections
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const error = event.reason instanceof Error 
        ? event.reason 
        : new Error(String(event.reason));
      
      reportError(error, {
        type: 'unhandled_rejection',
        source: 'unhandledrejection'
      });
      
      // Prevent the default browser behavior (logging to console)
      event.preventDefault();
    };

    // Add event listeners
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    // Cleanup on unmount
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, [reportError]);

  // This component doesn't render anything
  return null;
}