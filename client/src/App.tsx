import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { useAuth } from "@/hooks/useAuth";
import Landing from "@/pages/landing";
import Dashboard from "@/pages/dashboard";
import Analytics from "@/pages/analytics";
import Reports from "@/pages/reports";
import Patients from "@/pages/patients";
import PatientDetail from "@/components/patients/patient-detail";
import Episodes from "@/pages/episodes";
import EpisodeDetailWorkspace from "@/pages/episode-detail";
import Encounters from "@/pages/encounters";
import Eligibility from "@/pages/eligibility";
import Documents from "@/pages/documents";
import Policies from "@/pages/policies";
import Audit from "@/pages/audit";
import Settings from "@/pages/settings";
import TenantSetup from "@/pages/tenant-setup";
import Validation from "@/pages/validation";
import Upload from "@/pages/upload";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  // If loading, show a loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <Switch>
      {!isAuthenticated ? (
        <>
          {/* Public routes for unauthenticated users */}
          <Route path="/" component={Landing} />
          {/* Redirect unauthenticated users from /login to auth flow */}
          <Route path="/login">
            {() => {
              // Redirect to backend auth endpoint
              window.location.href = "/api/login";
              return null;
            }}
          </Route>
          {/* For any other route, redirect to auth flow */}
          <Route>
            {() => {
              window.location.href = "/api/login";
              return null;
            }}
          </Route>
        </>
      ) : (
        <>
          {/* Protected routes for authenticated users - more specific routes first */}
          <Route path="/" component={Dashboard} />
          <Route path="/analytics" component={Analytics} />
          <Route path="/reports" component={Reports} />
          <Route path="/tenant-setup" component={TenantSetup} />
          <Route path="/patients/:patientId" component={PatientDetail} />
          <Route path="/patients" component={Patients} />
          {/* More specific episode route first */}
          <Route path="/episodes/:episodeId" component={EpisodeDetailWorkspace} />
          <Route path="/episodes" component={Episodes} />
          <Route path="/encounters" component={Encounters} />
          <Route path="/eligibility" component={Eligibility} />
          <Route path="/documents" component={Documents} />
          <Route path="/policies" component={Policies} />
          <Route path="/audit" component={Audit} />
          <Route path="/validation" component={Validation} />
          <Route path="/upload" component={Upload} />
          <Route path="/settings" component={Settings} />
        </>
      )}
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
