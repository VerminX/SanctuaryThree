import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import Sidebar from "./sidebar";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// Component-specific fallback UI for sidebar errors
function SidebarErrorFallback() {
  return (
    <div className="w-64 bg-card border-r border-border flex flex-col" data-testid="sidebar-error-fallback">
      <div className="p-4 border-b border-border">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <h1 className="font-bold text-lg text-foreground">WoundCare Portal</h1>
            <p className="text-xs text-muted-foreground">Navigation Error</p>
          </div>
        </div>
      </div>
      
      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full">
          <CardContent className="p-4 text-center">
            <AlertTriangle className="w-8 h-8 text-destructive mx-auto mb-2" />
            <p className="text-sm text-muted-foreground mb-3">
              Navigation menu error
            </p>
            <Button 
              size="sm" 
              onClick={() => window.location.reload()}
              data-testid="button-reload-sidebar"
            >
              <RefreshCw className="w-3 h-3 mr-1" />
              Reload
            </Button>
          </CardContent>
        </Card>
      </div>
      
      <div className="p-4 border-t border-border">
        <div className="flex items-center justify-center">
          <span className="text-xs text-muted-foreground">Safe Mode</span>
        </div>
      </div>
    </div>
  );
}

export default function SafeSidebar() {
  return (
    <ErrorBoundary 
      level="component" 
      componentName="Sidebar"
      fallback={<SidebarErrorFallback />}
      onError={(error, errorInfo) => {
        console.error('Sidebar error:', error, errorInfo);
        // This would also be automatically reported to the backend
      }}
    >
      <Sidebar />
    </ErrorBoundary>
  );
}