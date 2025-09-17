import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import Header from "./header";
import { AlertTriangle, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

// Component-specific fallback UI for header errors
function HeaderErrorFallback({ title, subtitle }: { title: string; subtitle?: string }) {
  const handleLogout = () => {
    window.location.href = "/api/logout";
  };

  return (
    <header className="bg-card border-b border-border p-6" data-testid="header-error-fallback">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <AlertTriangle className="w-6 h-6 text-destructive" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {title}
            </h1>
            {subtitle && (
              <p className="text-muted-foreground">
                {subtitle} (Header Error - Safe Mode)
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <span className="text-xs text-muted-foreground">
            Navigation error - limited functionality
          </span>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleLogout}
            data-testid="button-logout-safe"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </div>
    </header>
  );
}

interface SafeHeaderProps {
  title: string;
  subtitle?: string;
}

export default function SafeHeader({ title, subtitle }: SafeHeaderProps) {
  return (
    <ErrorBoundary 
      level="component" 
      componentName="Header"
      fallback={<HeaderErrorFallback title={title} subtitle={subtitle} />}
      onError={(error, errorInfo) => {
        console.error('Header error:', error, errorInfo);
      }}
    >
      <Header title={title} subtitle={subtitle} />
    </ErrorBoundary>
  );
}