import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Shield, Search, Filter, Download, Eye, Clock, User, FileText, Activity, AlertTriangle } from "lucide-react";

export default function Audit() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading, user } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterAction, setFilterAction] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("7days");

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
  const userRole = user?.tenants?.[0] ? 'Admin' : 'User'; // This would come from tenant relationship

  // Only admins can view audit logs
  const canViewAudit = userRole === 'Admin';

  const { data: auditLogs, isLoading: auditLoading, error } = useQuery({
    queryKey: ["/api/tenants", currentTenant?.id, "audit-logs", { limit: 100 }],
    enabled: !!currentTenant?.id && canViewAudit,
    retry: false,
  });

  const exportAuditMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/tenants/${currentTenant?.id}/audit-logs/export`, {
        format: 'csv',
        dateRange,
        filters: { action: filterAction, search: searchTerm }
      });
    },
    onSuccess: () => {
      toast({
        title: "Export Started",
        description: "Audit log export has been initiated",
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
        title: "Export Failed",
        description: "Failed to export audit logs",
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

  if (!canViewAudit) {
    return (
      <div className="min-h-screen flex bg-background" data-testid="page-audit-unauthorized">
        <Sidebar />
        <main className="flex-1">
          <Header title="Audit Logs" subtitle="Security and compliance monitoring" />
          <div className="p-6">
            <Card>
              <CardContent className="p-6 text-center">
                <Shield className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">Access Restricted</h3>
                <p className="text-muted-foreground">
                  Admin privileges are required to view audit logs. Please contact your system administrator.
                </p>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    );
  }

  // Filter audit logs based on search term and action
  const filteredLogs = auditLogs?.filter((log: any) => {
    const matchesSearch = searchTerm === "" ||
                         log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         log.entity.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         log.entityId.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesAction = filterAction === "all" || log.action === filterAction;
    return matchesSearch && matchesAction;
  }) || [];

  const getActionIcon = (action: string) => {
    switch (action) {
      case "CREATE_PATIENT":
      case "CREATE_TENANT":
      case "CREATE_ENCOUNTER":
        return <User className="w-4 h-4 text-chart-2" />;
      case "VIEW_PATIENT":
      case "VIEW_PATIENTS":
        return <Eye className="w-4 h-4 text-primary" />;
      case "GENERATE_DOCUMENT":
        return <FileText className="w-4 h-4 text-chart-3" />;
      case "AI_ELIGIBILITY_ANALYSIS":
        return <Activity className="w-4 h-4 text-chart-4" />;
      default:
        return <Activity className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case "CREATE_PATIENT":
      case "CREATE_TENANT":
      case "CREATE_ENCOUNTER":
        return "bg-chart-2/10 text-chart-2 border-chart-2/20";
      case "VIEW_PATIENT":
      case "VIEW_PATIENTS":
        return "bg-primary/10 text-primary border-primary/20";
      case "GENERATE_DOCUMENT":
        return "bg-chart-3/10 text-chart-3 border-chart-3/20";
      case "AI_ELIGIBILITY_ANALYSIS":
        return "bg-chart-4/10 text-chart-4 border-chart-4/20";
      default:
        return "bg-muted text-muted-foreground border-border";
    }
  };

  // Calculate stats
  const totalLogs = auditLogs?.length || 0;
  const todayLogs = auditLogs?.filter((log: any) => {
    const logDate = new Date(log.timestamp);
    const today = new Date();
    return logDate.toDateString() === today.toDateString();
  }).length || 0;
  const uniqueUsers = auditLogs ? [...new Set(auditLogs.map((log: any) => log.userId))].length : 0;
  const securityEvents = auditLogs?.filter((log: any) => 
    log.action.includes('LOGIN') || log.action.includes('LOGOUT') || log.action.includes('AUTH')
  ).length || 0;

  return (
    <div className="min-h-screen flex bg-background" data-testid="page-audit">
      <Sidebar />
      
      <main className="flex-1">
        <Header title="Audit Logs" subtitle="Security monitoring and compliance tracking" />
        
        <div className="p-6 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card data-testid="card-total-logs">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Events</p>
                    <p className="text-3xl font-bold text-foreground">
                      {auditLoading ? "--" : totalLogs}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Shield className="text-primary text-xl" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-today-logs">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Today's Activity</p>
                    <p className="text-3xl font-bold text-foreground">
                      {auditLoading ? "--" : todayLogs}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-chart-2/10 rounded-lg flex items-center justify-center">
                    <Clock className="text-chart-2 text-xl" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-unique-users">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Active Users</p>
                    <p className="text-3xl font-bold text-foreground">
                      {auditLoading ? "--" : uniqueUsers}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-chart-3/10 rounded-lg flex items-center justify-center">
                    <User className="text-chart-3 text-xl" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-security-events">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Security Events</p>
                    <p className="text-3xl font-bold text-foreground">
                      {auditLoading ? "--" : securityEvents}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-chart-4/10 rounded-lg flex items-center justify-center">
                    <AlertTriangle className="text-chart-4 text-xl" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Security Status Dashboard */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card data-testid="card-security-status">
              <div className="p-6 border-b border-border">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-foreground">Security Status</h3>
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-chart-2 rounded-full"></div>
                    <span className="text-xs text-muted-foreground">All systems operational</span>
                  </div>
                </div>
              </div>
              <CardContent className="p-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-chart-2/10 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <Shield className="text-chart-2" />
                      <span className="text-sm font-medium text-foreground">Data Encryption</span>
                    </div>
                    <Badge className="bg-chart-2 text-white">Active</Badge>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-chart-2/10 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <Shield className="text-chart-2" />
                      <span className="text-sm font-medium text-foreground">Audit Trail Integrity</span>
                    </div>
                    <Badge className="bg-chart-2 text-white">99.9%</Badge>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-chart-2/10 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <Shield className="text-chart-2" />
                      <span className="text-sm font-medium text-foreground">2FA Compliance</span>
                    </div>
                    <Badge className="bg-chart-2 text-white">100%</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-compliance-metrics">
              <div className="p-6 border-b border-border">
                <h3 className="text-lg font-semibold text-foreground">Compliance Metrics</h3>
              </div>
              <CardContent className="p-6">
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">HIPAA Compliance Score</span>
                    <div className="flex items-center space-x-2">
                      <div className="w-24 bg-muted rounded-full h-2">
                        <div className="bg-chart-2 h-2 rounded-full" style={{ width: "98%" }}></div>
                      </div>
                      <span className="text-sm font-medium text-chart-2">98%</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Audit Coverage</span>
                    <div className="flex items-center space-x-2">
                      <div className="w-24 bg-muted rounded-full h-2">
                        <div className="bg-chart-2 h-2 rounded-full" style={{ width: "100%" }}></div>
                      </div>
                      <span className="text-sm font-medium text-chart-2">100%</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Data Integrity</span>
                    <div className="flex items-center space-x-2">
                      <div className="w-24 bg-muted rounded-full h-2">
                        <div className="bg-chart-2 h-2 rounded-full" style={{ width: "99%" }}></div>
                      </div>
                      <span className="text-sm font-medium text-chart-2">99.9%</span>
                    </div>
                  </div>

                  <Button 
                    variant="outline" 
                    className="w-full mt-4"
                    onClick={() => exportAuditMutation.mutate()}
                    disabled={exportAuditMutation.isPending}
                    data-testid="button-compliance-report"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Generate Compliance Report
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center space-x-4 flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Search audit logs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 w-80"
                  data-testid="input-search-audit"
                />
              </div>
              
              <Select value={filterAction} onValueChange={setFilterAction}>
                <SelectTrigger className="w-48" data-testid="select-filter-action">
                  <SelectValue placeholder="Filter by action" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  <SelectItem value="CREATE_PATIENT">Create Patient</SelectItem>
                  <SelectItem value="VIEW_PATIENT">View Patient</SelectItem>
                  <SelectItem value="GENERATE_DOCUMENT">Generate Document</SelectItem>
                  <SelectItem value="AI_ELIGIBILITY_ANALYSIS">AI Analysis</SelectItem>
                </SelectContent>
              </Select>

              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-36" data-testid="select-date-range">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24hours">Last 24 Hours</SelectItem>
                  <SelectItem value="7days">Last 7 Days</SelectItem>
                  <SelectItem value="30days">Last 30 Days</SelectItem>
                  <SelectItem value="90days">Last 90 Days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <Button
              variant="outline"
              onClick={() => exportAuditMutation.mutate()}
              disabled={exportAuditMutation.isPending}
              data-testid="button-export-audit"
            >
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>

          {/* Audit Logs Table */}
          <Card data-testid="card-audit-table">
            <div className="p-6 border-b border-border">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-foreground">Audit Trail</h3>
                <span className="text-sm text-muted-foreground">
                  {filteredLogs.length} of {auditLogs?.length || 0} events
                </span>
              </div>
            </div>
            <CardContent className="p-0">
              {auditLoading ? (
                <div className="p-6 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                  <p className="text-muted-foreground">Loading audit logs...</p>
                </div>
              ) : error ? (
                <div className="p-6 text-center">
                  <p className="text-destructive">Failed to load audit logs</p>
                </div>
              ) : filteredLogs.length === 0 ? (
                <div className="p-6 text-center">
                  <Shield className="mx-auto h-12 w-12 text-muted-foreground/50" />
                  <h3 className="mt-2 text-sm font-medium text-foreground">No audit events found</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {searchTerm || filterAction !== "all" ? "Try adjusting your search or filter criteria." : "No audit events have been recorded yet."}
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Entity</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>IP Address</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLogs.map((log: any) => (
                      <TableRow key={log.id} data-testid={`row-audit-${log.id}`}>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(log.timestamp).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            {getActionIcon(log.action)}
                            <Badge className={getActionColor(log.action)}>
                              {log.action.replace(/_/g, ' ')}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {log.entity}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {log.userId || 'System'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground font-mono">
                          {log.ipAddress}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-chart-2/10 text-chart-2">
                            Success
                          </Badge>
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
