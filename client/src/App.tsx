import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { GlobalErrorHandlers } from "@/components/error/GlobalErrorHandlers";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Dashboard from "@/pages/dashboard";
import Patients from "@/pages/patients";
import PatientDetail from "@/components/patients/patient-detail";
import Encounters from "@/pages/encounters";
import Eligibility from "@/pages/eligibility";
import Documents from "@/pages/documents";
import Policies from "@/pages/policies";
import Audit from "@/pages/audit";
import Settings from "@/pages/settings";
import TenantSetup from "@/pages/tenant-setup";
import Validation from "@/pages/validation";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <ErrorBoundary level="page" componentName="Router">
      <Switch>
        {isLoading || !isAuthenticated ? (
          <Route path="/" component={Landing} />
        ) : (
          <>
            <Route 
              path="/" 
              component={() => (
                <ErrorBoundary level="page" componentName="Dashboard">
                  <Dashboard />
                </ErrorBoundary>
              )} 
            />
            <Route 
              path="/tenant-setup" 
              component={() => (
                <ErrorBoundary level="page" componentName="TenantSetup">
                  <TenantSetup />
                </ErrorBoundary>
              )} 
            />
            <Route 
              path="/patients/:patientId" 
              component={() => (
                <ErrorBoundary level="page" componentName="PatientDetail">
                  <PatientDetail />
                </ErrorBoundary>
              )} 
            />
            <Route 
              path="/patients" 
              component={() => (
                <ErrorBoundary level="page" componentName="Patients">
                  <Patients />
                </ErrorBoundary>
              )} 
            />
            <Route 
              path="/encounters" 
              component={() => (
                <ErrorBoundary level="page" componentName="Encounters">
                  <Encounters />
                </ErrorBoundary>
              )} 
            />
            <Route 
              path="/eligibility" 
              component={() => (
                <ErrorBoundary level="page" componentName="Eligibility">
                  <Eligibility />
                </ErrorBoundary>
              )} 
            />
            <Route 
              path="/documents" 
              component={() => (
                <ErrorBoundary level="page" componentName="Documents">
                  <Documents />
                </ErrorBoundary>
              )} 
            />
            <Route 
              path="/policies" 
              component={() => (
                <ErrorBoundary level="page" componentName="Policies">
                  <Policies />
                </ErrorBoundary>
              )} 
            />
            <Route 
              path="/audit" 
              component={() => (
                <ErrorBoundary level="page" componentName="Audit">
                  <Audit />
                </ErrorBoundary>
              )} 
            />
            <Route 
              path="/validation" 
              component={() => (
                <ErrorBoundary level="page" componentName="Validation">
                  <Validation />
                </ErrorBoundary>
              )} 
            />
            <Route 
              path="/settings" 
              component={() => (
                <ErrorBoundary level="page" componentName="Settings">
                  <Settings />
                </ErrorBoundary>
              )} 
            />
          </>
        )}
        <Route component={NotFound} />
      </Switch>
    </ErrorBoundary>
  );
}

function App() {
  return (
    <ErrorBoundary 
      level="global" 
      componentName="App"
      onError={(error, errorInfo) => {
        // Global error reporting
        console.error('Global error caught:', error, errorInfo);
      }}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <GlobalErrorHandlers />
          <Toaster />
          <Router />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
