import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import PatientForm from "@/components/patients/patient-form";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, Plus, Search, Filter } from "lucide-react";

// Type for decrypted patient data returned from API
type DecryptedPatient = {
  id: string;
  tenantId: string;
  mrn: string;
  firstName: string;
  lastName: string;
  dob?: string;
  payerType: string;
  planName?: string;
  macRegion?: string;
  createdAt: string;
  updatedAt: string;
};

export default function Patients() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading, user } = useAuth();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

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

  const { data: patients, isLoading: patientsLoading, error } = useQuery<DecryptedPatient[]>({
    queryKey: ["/api/tenants", currentTenant?.id, "patients"],
    enabled: !!currentTenant?.id,
    retry: false,
  });

  const createPatientMutation = useMutation({
    mutationFn: async (patientData: any) => {
      await apiRequest("POST", `/api/tenants/${currentTenant?.id}/patients`, patientData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", currentTenant?.id, "patients"] });
      setIsCreateDialogOpen(false);
      toast({
        title: "Success",
        description: "Patient created successfully",
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
        title: "Error",
        description: "Failed to create patient",
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

  // Filter patients based on search term
  const filteredPatients = (patients || []).filter((patient) =>
    patient.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    patient.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    patient.mrn.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen flex bg-background" data-testid="page-patients">
      <Sidebar />
      
      <main className="flex-1">
        <Header title="Patient Management" subtitle="Manage patient records and PHI data" />
        
        <div className="p-6 space-y-6">
          {/* Actions Bar */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center space-x-4 flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Search patients by name or MRN..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 w-80"
                  data-testid="input-search-patients"
                />
              </div>
              <Button variant="outline" size="sm" data-testid="button-filter">
                <Filter className="h-4 w-4 mr-2" />
                Filter
              </Button>
            </div>
            
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-create-patient">
                  <Plus className="h-4 w-4 mr-2" />
                  New Patient
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Create New Patient</DialogTitle>
                </DialogHeader>
                <PatientForm 
                  onSubmit={(data) => createPatientMutation.mutate(data)}
                  isLoading={createPatientMutation.isPending}
                />
              </DialogContent>
            </Dialog>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card data-testid="card-total-patients">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Patients</p>
                    <p className="text-3xl font-bold text-foreground">
                      {patientsLoading ? "--" : patients?.length || 0}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Users className="text-primary text-xl" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-medicare-patients">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Original Medicare</p>
                    <p className="text-3xl font-bold text-foreground">
                      {patientsLoading ? "--" : (patients || []).filter((p) => p.payerType === 'Original Medicare').length}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-chart-2/10 rounded-lg flex items-center justify-center">
                    <Users className="text-chart-2 text-xl" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-ma-patients">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Medicare Advantage</p>
                    <p className="text-3xl font-bold text-foreground">
                      {patientsLoading ? "--" : (patients || []).filter((p) => p.payerType === 'Medicare Advantage').length}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-chart-3/10 rounded-lg flex items-center justify-center">
                    <Users className="text-chart-3 text-xl" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Patients Table */}
          <Card data-testid="card-patients-table">
            <div className="p-6 border-b border-border">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-foreground">Patient Records</h3>
                <span className="text-sm text-muted-foreground">
                  {filteredPatients.length} of {patients?.length || 0} patients
                </span>
              </div>
            </div>
            <CardContent className="p-0">
              {patientsLoading ? (
                <div className="p-6 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                  <p className="text-muted-foreground">Loading patients...</p>
                </div>
              ) : error ? (
                <div className="p-6 text-center">
                  <p className="text-destructive">Failed to load patients</p>
                </div>
              ) : filteredPatients.length === 0 ? (
                <div className="p-6 text-center">
                  <Users className="mx-auto h-12 w-12 text-muted-foreground/50" />
                  <h3 className="mt-2 text-sm font-medium text-foreground">No patients found</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {searchTerm ? "Try adjusting your search criteria." : "Get started by creating your first patient."}
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Patient</TableHead>
                      <TableHead>MRN</TableHead>
                      <TableHead>Payer Type</TableHead>
                      <TableHead>MAC Region</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPatients.map((patient) => (
                      <TableRow key={patient.id} data-testid={`row-patient-${patient.id}`}>
                        <TableCell>
                          <div>
                            <div className="font-medium text-foreground">
                              {patient.firstName} {patient.lastName}
                            </div>
                            {patient.dob && (
                              <div className="text-sm text-muted-foreground">
                                DOB: {patient.dob}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <code className="text-sm bg-muted px-2 py-1 rounded">
                            {patient.mrn}
                          </code>
                        </TableCell>
                        <TableCell>
                          <Badge variant={patient.payerType === 'Original Medicare' ? 'default' : 'secondary'}>
                            {patient.payerType}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {patient.macRegion || 'Not specified'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(patient.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            data-testid={`button-view-patient-${patient.id}`}
                            onClick={() => setLocation(`/patients/${patient.id}`)}
                          >
                            View
                          </Button>
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
