import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { isUnauthorizedError } from "@/lib/authUtils";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Search, FileText, RefreshCw, CheckCircle, AlertTriangle, Clock } from "lucide-react";
import { User } from "@shared/schema";

interface DashboardStats {
  activePatients: number;
  pendingEligibility: number;
  generatedLetters: number;
  policyUpdates: number;
  recentActivity: any[];
}

export default function Dashboard() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading, user } = useAuth();
  const [, setLocation] = useLocation();

  // Redirect to home if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast]);

  // Get current tenant (first tenant for now)
  const currentTenant = user?.tenants?.[0];

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/tenants", currentTenant?.id, "dashboard-stats"],
    enabled: !!currentTenant?.id,
    retry: false,
  });

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Show onboarding if user has no tenants
  if (!currentTenant) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="max-w-md mx-auto text-center">
          <div className="w-16 h-16 bg-primary rounded-xl flex items-center justify-center mx-auto mb-6">
            <Users className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-4">Welcome to WoundCare Portal!</h1>
          <p className="text-muted-foreground mb-6">
            To get started, you'll need to set up your first clinic or practice. This will create your secure, 
            HIPAA-compliant workspace for managing wound care pre-determinations.
          </p>
          <Card>
            <CardContent className="p-6">
              <h2 className="text-lg font-semibold mb-4">Create Your First Clinic</h2>
              <p className="text-sm text-muted-foreground mb-4">
                You'll be able to add your clinic details, NPI/TIN numbers, MAC region, and invite team members.
              </p>
              <Button 
                className="w-full" 
                onClick={() => {
                  setLocation("/tenant-setup");
                }}
                data-testid="button-setup-clinic"
              >
                Set Up My Clinic
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-background" data-testid="page-dashboard">
      <Sidebar />
      
      <main className="flex-1">
        <Header title="Clinical Dashboard" subtitle={`${currentTenant.name} • NPI: ${currentTenant.npi}`} />
        
        <div className="p-6 space-y-6">
          {/* Stats Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card data-testid="card-active-patients">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Active Patients</p>
                    <p className="text-3xl font-bold text-foreground">
                      {statsLoading ? "--" : stats?.activePatients || 0}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Users className="text-primary text-xl" />
                  </div>
                </div>
                <div className="mt-4 flex items-center text-sm">
                  <span className="text-chart-2 font-medium">+12%</span>
                  <span className="text-muted-foreground ml-1">vs last month</span>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-pending-eligibility">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Pending Eligibility</p>
                    <p className="text-3xl font-bold text-foreground">
                      {statsLoading ? "--" : stats?.pendingEligibility || 0}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-chart-3/10 rounded-lg flex items-center justify-center">
                    <Search className="text-chart-3 text-xl" />
                  </div>
                </div>
                <div className="mt-4 flex items-center text-sm">
                  <span className="text-chart-3 font-medium">-3</span>
                  <span className="text-muted-foreground ml-1">since yesterday</span>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-generated-letters">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Generated Letters</p>
                    <p className="text-3xl font-bold text-foreground">
                      {statsLoading ? "--" : stats?.generatedLetters || 0}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-chart-2/10 rounded-lg flex items-center justify-center">
                    <FileText className="text-chart-2 text-xl" />
                  </div>
                </div>
                <div className="mt-4 flex items-center text-sm">
                  <span className="text-chart-2 font-medium">+24</span>
                  <span className="text-muted-foreground ml-1">this week</span>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-policy-updates">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Policy Updates</p>
                    <p className="text-3xl font-bold text-foreground">
                      {statsLoading ? "--" : stats?.policyUpdates || 0}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-chart-5/10 rounded-lg flex items-center justify-center">
                    <RefreshCw className="text-chart-5 text-xl" />
                  </div>
                </div>
                <div className="mt-4 flex items-center text-sm">
                  <span className="text-muted-foreground">Last sync:</span>
                  <span className="text-foreground ml-1 font-medium">2 hours ago</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Dashboard Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Activity */}
            <Card data-testid="card-recent-activity">
              <div className="p-6 border-b border-border">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-foreground">Recent Activity</h3>
                  <button className="text-primary hover:text-primary/80 text-sm font-medium">
                    View All
                  </button>
                </div>
              </div>
              <CardContent className="p-6">
                {statsLoading ? (
                  <div className="space-y-4">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="animate-pulse">
                        <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                        <div className="h-3 bg-muted rounded w-1/2"></div>
                      </div>
                    ))}
                  </div>
                ) : stats?.recentActivity?.length ? (
                  <div className="space-y-4">
                    {stats?.recentActivity?.map((activity: any, index: number) => (
                      <div key={index} className="flex items-center justify-between text-sm">
                        <div className="flex items-center space-x-2">
                          <Clock className="text-muted-foreground w-4 h-4" />
                          <span className="text-foreground">{activity.action}</span>
                        </div>
                        <span className="text-muted-foreground">
                          {new Date(activity.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Clock className="mx-auto h-12 w-12 text-muted-foreground/50" />
                    <h3 className="mt-2 text-sm font-medium text-foreground">No recent activity</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Activity will appear here as you use the system.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card data-testid="card-quick-actions">
              <div className="p-6 border-b border-border">
                <h3 className="text-lg font-semibold text-foreground">Quick Actions</h3>
                <p className="text-sm text-muted-foreground">Common clinical workflows and tools</p>
              </div>
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button 
                    className="p-4 border border-border rounded-lg text-left hover:bg-muted/50 transition-colors"
                    onClick={() => setLocation("/patients")}
                    data-testid="button-new-patient"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                        <Users className="text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">New Patient</p>
                        <p className="text-sm text-muted-foreground">Register patient</p>
                      </div>
                    </div>
                  </button>

                  <button 
                    className="p-4 border border-border rounded-lg text-left hover:bg-muted/50 transition-colors"
                    onClick={() => setLocation("/encounters")}
                    data-testid="button-new-encounter"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-chart-2/10 rounded-lg flex items-center justify-center">
                        <FileText className="text-chart-2" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">New Encounter</p>
                        <p className="text-sm text-muted-foreground">Document visit</p>
                      </div>
                    </div>
                  </button>

                  <button 
                    className="p-4 border border-border rounded-lg text-left hover:bg-muted/50 transition-colors"
                    onClick={() => setLocation("/eligibility")}
                    data-testid="button-bulk-analysis"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-chart-3/10 rounded-lg flex items-center justify-center">
                        <Search className="text-chart-3" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">Bulk Analysis</p>
                        <p className="text-sm text-muted-foreground">Multiple eligibility checks</p>
                      </div>
                    </div>
                  </button>

                  <button 
                    className="p-4 border border-border rounded-lg text-left hover:bg-muted/50 transition-colors"
                    onClick={() => setLocation("/audit")}
                    data-testid="button-export-reports"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-chart-4/10 rounded-lg flex items-center justify-center">
                        <FileText className="text-chart-4" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">Export Reports</p>
                        <p className="text-sm text-muted-foreground">Compliance reports</p>
                      </div>
                    </div>
                  </button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Security Status */}
          <Card data-testid="card-security-status">
            <div className="p-6 border-b border-border">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-foreground">Security & Compliance</h3>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-chart-2 rounded-full"></div>
                  <span className="text-xs text-muted-foreground">HIPAA Compliant</span>
                </div>
              </div>
            </div>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center justify-between p-3 bg-chart-2/10 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <CheckCircle className="text-chart-2" />
                    <span className="text-sm font-medium text-foreground">Data Encryption</span>
                  </div>
                  <span className="text-xs text-chart-2 font-medium">Active</span>
                </div>

                <div className="flex items-center justify-between p-3 bg-chart-2/10 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <CheckCircle className="text-chart-2" />
                    <span className="text-sm font-medium text-foreground">2FA Enforcement</span>
                  </div>
                  <span className="text-xs text-chart-2 font-medium">100%</span>
                </div>

                <div className="flex items-center justify-between p-3 bg-chart-2/10 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <CheckCircle className="text-chart-2" />
                    <span className="text-sm font-medium text-foreground">Audit Logging</span>
                  </div>
                  <span className="text-xs text-chart-2 font-medium">Real-time</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
