import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings, Building, Users, Shield, Bell, Key, Save, Plus, UserPlus } from "lucide-react";

export default function SettingsPage() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading, user } = useAuth();
  const queryClient = useQueryClient();
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);

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
  const userRole = user?.tenants?.[0] ? 'Admin' : 'User';

  // Tenant settings form state
  const [tenantSettings, setTenantSettings] = useState({
    name: currentTenant?.name || "",
    npi: currentTenant?.npi || "",
    tin: currentTenant?.tin || "",
    macRegion: currentTenant?.macRegion || "",
    address: currentTenant?.address || "",
    phone: currentTenant?.phone || "",
  });

  // Security settings state
  const [securitySettings, setSecuritySettings] = useState({
    require2FA: true,
    sessionTimeout: 30,
    passwordExpiry: 90,
    auditRetention: 7,
  });

  // Notification settings state
  const [notificationSettings, setNotificationSettings] = useState({
    emailNotifications: true,
    policyUpdates: true,
    systemAlerts: true,
    complianceReports: false,
  });

  // User invitation form state
  const [inviteForm, setInviteForm] = useState({
    email: "",
    role: "Staff" as "Admin" | "Physician" | "Staff",
    firstName: "",
    lastName: "",
  });

  const updateTenantMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("PUT", `/api/tenants/${currentTenant?.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", currentTenant?.id] });
      toast({
        title: "Settings Updated",
        description: "Tenant settings have been updated successfully",
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
        title: "Update Failed",
        description: "Failed to update settings",
        variant: "destructive",
      });
    },
  });

  const inviteUserMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("POST", `/api/tenants/${currentTenant?.id}/users/invite`, data);
    },
    onSuccess: () => {
      setIsInviteDialogOpen(false);
      setInviteForm({ email: "", role: "Staff", firstName: "", lastName: "" });
      toast({
        title: "Invitation Sent",
        description: "User invitation has been sent successfully",
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
        title: "Invitation Failed",
        description: "Failed to send user invitation",
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

  const handleTenantSave = () => {
    updateTenantMutation.mutate(tenantSettings);
  };

  const handleInviteUser = () => {
    if (inviteForm.email && inviteForm.firstName && inviteForm.lastName) {
      inviteUserMutation.mutate(inviteForm);
    }
  };

  return (
    <div className="min-h-screen flex bg-background" data-testid="page-settings">
      <Sidebar />
      
      <main className="flex-1">
        <Header title="Settings" subtitle="Configure clinic settings and system preferences" />
        
        <div className="p-6 space-y-6">
          <Tabs defaultValue="clinic" className="space-y-6">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="clinic" data-testid="tab-clinic">
                <Building className="w-4 h-4 mr-2" />
                Clinic
              </TabsTrigger>
              <TabsTrigger value="users" data-testid="tab-users">
                <Users className="w-4 h-4 mr-2" />
                Users
              </TabsTrigger>
              <TabsTrigger value="security" data-testid="tab-security">
                <Shield className="w-4 h-4 mr-2" />
                Security
              </TabsTrigger>
              <TabsTrigger value="notifications" data-testid="tab-notifications">
                <Bell className="w-4 h-4 mr-2" />
                Notifications
              </TabsTrigger>
            </TabsList>

            {/* Clinic Settings */}
            <TabsContent value="clinic">
              <Card data-testid="card-clinic-settings">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Building className="w-5 h-5" />
                    <span>Clinic Information</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="clinic-name">Clinic Name</Label>
                      <Input
                        id="clinic-name"
                        value={tenantSettings.name}
                        onChange={(e) => setTenantSettings({...tenantSettings, name: e.target.value})}
                        data-testid="input-clinic-name"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="clinic-phone">Phone</Label>
                      <Input
                        id="clinic-phone"
                        value={tenantSettings.phone}
                        onChange={(e) => setTenantSettings({...tenantSettings, phone: e.target.value})}
                        data-testid="input-clinic-phone"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="clinic-npi">NPI Number</Label>
                      <Input
                        id="clinic-npi"
                        value={tenantSettings.npi}
                        onChange={(e) => setTenantSettings({...tenantSettings, npi: e.target.value})}
                        data-testid="input-clinic-npi"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="clinic-tin">TIN Number</Label>
                      <Input
                        id="clinic-tin"
                        value={tenantSettings.tin}
                        onChange={(e) => setTenantSettings({...tenantSettings, tin: e.target.value})}
                        data-testid="input-clinic-tin"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="clinic-mac">MAC Region</Label>
                    <Select value={tenantSettings.macRegion} onValueChange={(value) => setTenantSettings({...tenantSettings, macRegion: value})}>
                      <SelectTrigger data-testid="select-mac-region">
                        <SelectValue placeholder="Select MAC region" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Noridian Healthcare Solutions (MAC J-E)">Noridian Healthcare Solutions (MAC J-E)</SelectItem>
                        <SelectItem value="CGS Administrators (MAC J-H)">CGS Administrators (MAC J-H)</SelectItem>
                        <SelectItem value="Novitas Solutions (MAC J-L)">Novitas Solutions (MAC J-L)</SelectItem>
                        <SelectItem value="First Coast Service Options (MAC J-N)">First Coast Service Options (MAC J-N)</SelectItem>
                        <SelectItem value="Palmetto GBA (MAC J-J)">Palmetto GBA (MAC J-J)</SelectItem>
                        <SelectItem value="Wisconsin Physicians Service (MAC J-5)">Wisconsin Physicians Service (MAC J-5)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="clinic-address">Address</Label>
                    <Input
                      id="clinic-address"
                      value={tenantSettings.address}
                      onChange={(e) => setTenantSettings({...tenantSettings, address: e.target.value})}
                      data-testid="input-clinic-address"
                    />
                  </div>

                  <Separator />

                  <div className="flex justify-end">
                    <Button
                      onClick={handleTenantSave}
                      disabled={updateTenantMutation.isPending}
                      data-testid="button-save-clinic"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      {updateTenantMutation.isPending ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* User Management */}
            <TabsContent value="users">
              <Card data-testid="card-user-management">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center space-x-2">
                      <Users className="w-5 h-5" />
                      <span>User Management</span>
                    </CardTitle>
                    <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
                      <DialogTrigger asChild>
                        <Button data-testid="button-invite-user">
                          <UserPlus className="w-4 h-4 mr-2" />
                          Invite User
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Invite New User</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="invite-firstName">First Name</Label>
                              <Input
                                id="invite-firstName"
                                value={inviteForm.firstName}
                                onChange={(e) => setInviteForm({...inviteForm, firstName: e.target.value})}
                                data-testid="input-invite-firstName"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="invite-lastName">Last Name</Label>
                              <Input
                                id="invite-lastName"
                                value={inviteForm.lastName}
                                onChange={(e) => setInviteForm({...inviteForm, lastName: e.target.value})}
                                data-testid="input-invite-lastName"
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="invite-email">Email Address</Label>
                            <Input
                              id="invite-email"
                              type="email"
                              value={inviteForm.email}
                              onChange={(e) => setInviteForm({...inviteForm, email: e.target.value})}
                              data-testid="input-invite-email"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="invite-role">Role</Label>
                            <Select value={inviteForm.role} onValueChange={(value: any) => setInviteForm({...inviteForm, role: value})}>
                              <SelectTrigger data-testid="select-invite-role">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Admin">Admin</SelectItem>
                                <SelectItem value="Physician">Physician</SelectItem>
                                <SelectItem value="Staff">Staff</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex justify-end space-x-2">
                            <Button variant="outline" onClick={() => setIsInviteDialogOpen(false)}>
                              Cancel
                            </Button>
                            <Button 
                              onClick={handleInviteUser}
                              disabled={inviteUserMutation.isPending}
                              data-testid="button-send-invite"
                            >
                              {inviteUserMutation.isPending ? "Sending..." : "Send Invitation"}
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 border border-border rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                          <span className="text-primary font-semibold text-sm">
                            {user?.firstName?.charAt(0)}{user?.lastName?.charAt(0)}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-foreground">
                            {user?.firstName} {user?.lastName}
                          </p>
                          <p className="text-sm text-muted-foreground">{user?.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge className="bg-primary/10 text-primary">Admin</Badge>
                        <Badge variant="outline" className="text-chart-2 border-chart-2">You</Badge>
                      </div>
                    </div>
                    
                    <div className="text-center py-8">
                      <Users className="mx-auto h-12 w-12 text-muted-foreground/50" />
                      <h3 className="mt-2 text-sm font-medium text-foreground">No additional users</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Invite team members to collaborate on patient care.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Security Settings */}
            <TabsContent value="security">
              <Card data-testid="card-security-settings">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Shield className="w-5 h-5" />
                    <span>Security Settings</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Two-Factor Authentication</Label>
                        <p className="text-sm text-muted-foreground">Require 2FA for all users</p>
                      </div>
                      <Switch
                        checked={securitySettings.require2FA}
                        onCheckedChange={(checked) => setSecuritySettings({...securitySettings, require2FA: checked})}
                        data-testid="switch-2fa"
                      />
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <Label>Session Timeout (minutes)</Label>
                      <Input
                        type="number"
                        value={securitySettings.sessionTimeout}
                        onChange={(e) => setSecuritySettings({...securitySettings, sessionTimeout: parseInt(e.target.value)})}
                        data-testid="input-session-timeout"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Password Expiry (days)</Label>
                      <Input
                        type="number"
                        value={securitySettings.passwordExpiry}
                        onChange={(e) => setSecuritySettings({...securitySettings, passwordExpiry: parseInt(e.target.value)})}
                        data-testid="input-password-expiry"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Audit Log Retention (years)</Label>
                      <Input
                        type="number"
                        value={securitySettings.auditRetention}
                        onChange={(e) => setSecuritySettings({...securitySettings, auditRetention: parseInt(e.target.value)})}
                        data-testid="input-audit-retention"
                      />
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <h4 className="text-sm font-medium text-foreground">Encryption Status</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex items-center space-x-3 p-3 bg-chart-2/10 rounded-lg">
                        <Key className="w-5 h-5 text-chart-2" />
                        <div>
                          <p className="text-sm font-medium text-foreground">Data at Rest</p>
                          <p className="text-xs text-muted-foreground">AES-256-GCM</p>
                        </div>
                        <Badge className="ml-auto bg-chart-2 text-white">Active</Badge>
                      </div>
                      <div className="flex items-center space-x-3 p-3 bg-chart-2/10 rounded-lg">
                        <Key className="w-5 h-5 text-chart-2" />
                        <div>
                          <p className="text-sm font-medium text-foreground">Data in Transit</p>
                          <p className="text-xs text-muted-foreground">TLS 1.3</p>
                        </div>
                        <Badge className="ml-auto bg-chart-2 text-white">Active</Badge>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="flex justify-end">
                    <Button data-testid="button-save-security">
                      <Save className="w-4 h-4 mr-2" />
                      Save Security Settings
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Notification Settings */}
            <TabsContent value="notifications">
              <Card data-testid="card-notification-settings">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Bell className="w-5 h-5" />
                    <span>Notification Preferences</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Email Notifications</Label>
                        <p className="text-sm text-muted-foreground">Receive general system notifications</p>
                      </div>
                      <Switch
                        checked={notificationSettings.emailNotifications}
                        onCheckedChange={(checked) => setNotificationSettings({...notificationSettings, emailNotifications: checked})}
                        data-testid="switch-email-notifications"
                      />
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Policy Updates</Label>
                        <p className="text-sm text-muted-foreground">Get notified about Medicare LCD changes</p>
                      </div>
                      <Switch
                        checked={notificationSettings.policyUpdates}
                        onCheckedChange={(checked) => setNotificationSettings({...notificationSettings, policyUpdates: checked})}
                        data-testid="switch-policy-updates"
                      />
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>System Alerts</Label>
                        <p className="text-sm text-muted-foreground">Security and maintenance notifications</p>
                      </div>
                      <Switch
                        checked={notificationSettings.systemAlerts}
                        onCheckedChange={(checked) => setNotificationSettings({...notificationSettings, systemAlerts: checked})}
                        data-testid="switch-system-alerts"
                      />
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Compliance Reports</Label>
                        <p className="text-sm text-muted-foreground">Monthly compliance and audit summaries</p>
                      </div>
                      <Switch
                        checked={notificationSettings.complianceReports}
                        onCheckedChange={(checked) => setNotificationSettings({...notificationSettings, complianceReports: checked})}
                        data-testid="switch-compliance-reports"
                      />
                    </div>
                  </div>

                  <Separator />

                  <div className="flex justify-end">
                    <Button data-testid="button-save-notifications">
                      <Save className="w-4 h-4 mr-2" />
                      Save Notification Settings
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
