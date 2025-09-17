import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import { PolicySource } from "@shared/schema";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Book, Search, Filter, RefreshCw, ExternalLink, Calendar, AlertCircle, CheckCircle } from "lucide-react";

export default function Policies() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading, user } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

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

  const currentTenant = user?.tenants?.[0];

  // Helper function for safe date formatting
  const formatDate = (date: string | Date | null | undefined): string => {
    if (!date) return 'N/A';
    const parsedDate = new Date(date);
    return isNaN(parsedDate.getTime()) ? 'N/A' : parsedDate.toLocaleDateString();
  };

  const { data: policiesData = [], isLoading: policiesLoading, error } = useQuery<PolicySource[]>({
    queryKey: ["/api/tenants", currentTenant?.id, "policies"],
    enabled: !!currentTenant?.id,
    retry: false,
  });

  // Runtime safety: ensure policies is always an array
  const policies = Array.isArray(policiesData) ? policiesData : [];

  const refreshPoliciesMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/tenants/${currentTenant?.id}/policies/refresh`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", currentTenant?.id, "policies"] });
      toast({
        title: "Policies Refreshed",
        description: "Policy database has been updated successfully",
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
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
      toast({
        title: "Refresh Failed",
        description: "Failed to refresh policy database",
        variant: "destructive",
      });
    },
  });

  if (isLoading || !isAuthenticated || !currentTenant) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Filter policies based on search term and status
  const filteredPolicies = policies.filter((policy: PolicySource) => {
    const matchesSearch = policy.title?.toLowerCase()?.includes(searchTerm.toLowerCase()) ||
                         policy.mac?.toLowerCase()?.includes(searchTerm.toLowerCase()) ||
                         policy.lcdId?.toLowerCase()?.includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === "all" || policy.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-chart-2/10 text-chart-2 border-chart-2/20";
      case "postponed":
        return "bg-chart-3/10 text-chart-3 border-chart-3/20";
      case "superseded":
        return "bg-muted text-muted-foreground border-border";
      default:
        return "bg-muted text-muted-foreground border-border";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "active":
        return <CheckCircle className="w-4 h-4 text-chart-2" />;
      case "postponed":
        return <AlertCircle className="w-4 h-4 text-chart-3" />;
      case "superseded":
        return <AlertCircle className="w-4 h-4 text-muted-foreground" />;
      default:
        return <AlertCircle className="w-4 h-4 text-muted-foreground" />;
    }
  };

  // Calculate stats
  const totalPolicies = policies.length;
  const activePolicies = policies.filter((p: PolicySource) => p.status === 'active').length;
  const postponedPolicies = policies.filter((p: PolicySource) => p.status === 'postponed').length;
  const recentUpdates = policies.filter((p: PolicySource) => {
    // Use updatedAt if available, fallback to effectiveDate, skip if neither
    const dateToCheck = p.updatedAt ?? p.effectiveDate;
    if (!dateToCheck) return false;
    
    const updateDate = new Date(dateToCheck);
    // Skip if date is invalid
    if (isNaN(updateDate.getTime())) return false;
    
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    return updateDate >= oneWeekAgo;
  }).length;

  return (
    <div className="min-h-screen flex bg-background" data-testid="page-policies">
      <Sidebar />
      
      <main className="flex-1">
        <Header title="Policy Database" subtitle="Medicare LCD policies and MAC documentation management" />
        
        <div className="p-6 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card data-testid="card-total-policies">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Policies</p>
                    <p className="text-3xl font-bold text-foreground">
                      {policiesLoading ? "--" : totalPolicies}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Book className="text-primary text-xl" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-active-policies">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Active Policies</p>
                    <p className="text-3xl font-bold text-foreground">
                      {policiesLoading ? "--" : activePolicies}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-chart-2/10 rounded-lg flex items-center justify-center">
                    <CheckCircle className="text-chart-2 text-xl" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-postponed-policies">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Postponed</p>
                    <p className="text-3xl font-bold text-foreground">
                      {policiesLoading ? "--" : postponedPolicies}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-chart-3/10 rounded-lg flex items-center justify-center">
                    <AlertCircle className="text-chart-3 text-xl" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-recent-updates">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Recent Updates</p>
                    <p className="text-3xl font-bold text-foreground">
                      {policiesLoading ? "--" : recentUpdates}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-chart-4/10 rounded-lg flex items-center justify-center">
                    <Calendar className="text-chart-4 text-xl" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Actions Bar */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center space-x-4 flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Search policies by title, MAC, or LCD ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 w-80"
                  data-testid="input-search-policies"
                />
              </div>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-3 py-2 border border-input rounded-lg bg-background text-foreground"
                data-testid="select-filter-status"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="postponed">Postponed</option>
                <option value="superseded">Superseded</option>
              </select>
            </div>
            
            <Button
              onClick={() => refreshPoliciesMutation.mutate()}
              disabled={refreshPoliciesMutation.isPending}
              data-testid="button-refresh-policies"
            >
              {refreshPoliciesMutation.isPending ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Refreshing...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh Policy Database
                </>
              )}
            </Button>
          </div>

          {/* Policy Updates Panel */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2" data-testid="card-policy-updates">
              <div className="p-6 border-b border-border">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-foreground">Recent Policy Updates</h3>
                  <div className="flex items-center space-x-1">
                    <div className="w-2 h-2 bg-chart-2 rounded-full"></div>
                    <span className="text-xs text-muted-foreground">Auto-sync enabled</span>
                  </div>
                </div>
              </div>
              <CardContent className="p-6">
                {policiesLoading ? (
                  <div className="space-y-4">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="animate-pulse">
                        <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                        <div className="h-3 bg-muted rounded w-1/2"></div>
                      </div>
                    ))}
                  </div>
                ) : policies.length > 0 ? (
                  <div className="space-y-4">
                    {policies.slice(0, 5).map((policy: PolicySource) => (
                      <div key={policy.id} className="border border-border rounded-lg p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-2">
                              {getStatusIcon(policy.status)}
                              <h4 className="font-medium text-foreground text-sm">{policy.lcdId}</h4>
                              <Badge className={getStatusColor(policy.status)}>
                                {policy.status}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">{policy.mac}</p>
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{policy.title}</p>
                        <div className="flex items-center justify-between mt-3">
                          <span className="text-xs text-muted-foreground">
                            Effective: {formatDate(policy.effectiveDate)}
                          </span>
                          <a
                            href={policy.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline flex items-center space-x-1"
                            data-testid={`link-policy-${policy.id}`}
                          >
                            <span>View Policy</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Book className="mx-auto h-12 w-12 text-muted-foreground/50" />
                    <h3 className="mt-2 text-sm font-medium text-foreground">No policies found</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Policy database appears to be empty. Try refreshing to load policies.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* MAC Region Info */}
            <Card data-testid="card-mac-info">
              <div className="p-6 border-b border-border">
                <h3 className="text-lg font-semibold text-foreground">MAC Region</h3>
              </div>
              <CardContent className="p-6">
                <div className="space-y-4">
                  <div className="text-center p-4 bg-muted/50 rounded-lg">
                    <div className="text-lg font-bold text-foreground">{currentTenant.macRegion}</div>
                    <div className="text-sm text-muted-foreground">Current MAC</div>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="text-sm">
                      <p className="font-medium text-foreground mb-1">Coverage Area:</p>
                      <p className="text-muted-foreground">Regional Medicare Administrative Contractor</p>
                    </div>
                    
                    <div className="text-sm">
                      <p className="font-medium text-foreground mb-1">Policy Focus:</p>
                      <p className="text-muted-foreground">Skin Substitutes & CTPs for wound care</p>
                    </div>

                    <div className="text-sm">
                      <p className="font-medium text-foreground mb-1">Last Sync:</p>
                      <p className="text-muted-foreground">2 hours ago</p>
                    </div>
                  </div>

                  <Button variant="outline" className="w-full" size="sm">
                    <Calendar className="h-4 w-4 mr-2" />
                    View Sync Schedule
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Policies Table */}
          <Card data-testid="card-policies-table">
            <div className="p-6 border-b border-border">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-foreground">Policy Database</h3>
                <span className="text-sm text-muted-foreground">
                  {filteredPolicies.length} of {policies.length} policies
                </span>
              </div>
            </div>
            <CardContent className="p-0">
              {policiesLoading ? (
                <div className="p-6 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                  <p className="text-muted-foreground">Loading policies...</p>
                </div>
              ) : error ? (
                <div className="p-6 text-center">
                  <div className="mx-auto h-12 w-12 text-destructive mb-4">
                    <AlertCircle className="h-12 w-12" />
                  </div>
                  <h3 className="text-sm font-medium text-foreground mb-2">Failed to load policies</h3>
                  <p className="text-sm text-muted-foreground">Please try refreshing the policy database or contact support if the issue persists.</p>
                </div>
              ) : filteredPolicies.length === 0 ? (
                <div className="p-6 text-center">
                  <Book className="mx-auto h-12 w-12 text-muted-foreground/50" />
                  <h3 className="mt-2 text-sm font-medium text-foreground">No policies found</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {searchTerm || filterStatus !== "all" ? "Try adjusting your search or filter criteria." : "Policy database is empty. Try refreshing to load policies."}
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>LCD ID</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>MAC</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Effective Date</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPolicies.map((policy: PolicySource) => (
                      <TableRow key={policy.id} data-testid={`row-policy-${policy.id}`}>
                        <TableCell>
                          <code className="text-sm bg-muted px-2 py-1 rounded font-mono">
                            {policy.lcdId}
                          </code>
                        </TableCell>
                        <TableCell>
                          <div className="max-w-md">
                            <p className="font-medium text-foreground line-clamp-2">
                              {policy.title}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {policy.mac}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            {getStatusIcon(policy.status)}
                            <Badge className={getStatusColor(policy.status)}>
                              {policy.status}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(policy.effectiveDate)}
                          {policy.postponedDate && (
                            <div className="text-xs text-chart-3">
                              Postponed to: {formatDate(policy.postponedDate)}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex space-x-2">
                            <a
                              href={policy.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              data-testid={`button-view-policy-${policy.id}`}
                            >
                              <Button variant="outline" size="sm">
                                <ExternalLink className="h-3 w-3 mr-1" />
                                View
                              </Button>
                            </a>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
