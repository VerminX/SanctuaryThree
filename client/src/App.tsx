import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Dashboard from "@/pages/dashboard";
import Patients from "@/pages/patients";
import Encounters from "@/pages/encounters";
import Eligibility from "@/pages/eligibility";
import Documents from "@/pages/documents";
import Policies from "@/pages/policies";
import Audit from "@/pages/audit";
import Settings from "@/pages/settings";
import TenantSetup from "@/pages/tenant-setup";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <Switch>
      {isLoading || !isAuthenticated ? (
        <Route path="/" component={Landing} />
      ) : (
        <>
          <Route path="/" component={Dashboard} />
          <Route path="/tenant-setup" component={TenantSetup} />
          <Route path="/patients" component={Patients} />
          <Route path="/encounters" component={Encounters} />
          <Route path="/eligibility" component={Eligibility} />
          <Route path="/documents" component={Documents} />
          <Route path="/policies" component={Policies} />
          <Route path="/audit" component={Audit} />
          <Route path="/settings" component={Settings} />
        </>
      )}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
