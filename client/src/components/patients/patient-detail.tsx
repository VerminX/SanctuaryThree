import { useState } from "react";
import { useParams, Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import EncounterForm from "@/components/encounters/encounter-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { ArrowLeft, Plus, Calendar, FileText, User, CreditCard, MapPin } from "lucide-react";

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
  insuranceId?: string;
  // Secondary insurance fields
  secondaryPayerType?: string;
  secondaryPlanName?: string;
  secondaryInsuranceId?: string;
  macRegion?: string;
  createdAt: string;
  updatedAt: string;
};

type PatientEncounter = {
  id: string;
  patientId: string;
  date: string;
  woundDetails?: {
    type?: string;
    location?: string;
    size?: string;
  };
  infectionStatus?: string;
  createdAt: string;
};

export default function PatientDetail() {
  const { patientId } = useParams();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isEncounterDialogOpen, setIsEncounterDialogOpen] = useState(false);

  // Get current tenant
  const currentTenant = user?.tenants?.[0];

  // Fetch patient data
  const { data: patient, isLoading: patientLoading, error: patientError } = useQuery<DecryptedPatient>({
    queryKey: ["/api/patients", patientId],
    enabled: !!patientId,
    retry: false,
  });

  // Fetch patient encounters
  const { data: encounters, isLoading: encountersLoading } = useQuery<PatientEncounter[]>({
    queryKey: ["/api/patients", patientId, "encounters"],
    enabled: !!patientId,
    retry: false,
  });

  const createEncounterMutation = useMutation({
    mutationFn: async (encounterData: any) => {
      await apiRequest("POST", `/api/patients/${patientId}/encounters`, encounterData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients", patientId, "encounters"] });
      setIsEncounterDialogOpen(false);
      toast({
        title: "Success",
        description: "Encounter created successfully",
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
        description: "Failed to create encounter",
        variant: "destructive",
      });
    },
  });

  if (patientLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading patient details...</p>
        </div>
      </div>
    );
  }

  if (patientError || !patient) {
    return (
      <div className="min-h-screen flex bg-background">
        <Sidebar />
        <main className="flex-1">
          <Header title="Patient Details" subtitle="Patient information and medical history" />
          <div className="p-6">
            <div className="text-center">
              <h3 className="text-lg font-semibold text-foreground mb-2">Patient Not Found</h3>
              <p className="text-muted-foreground mb-4">The requested patient could not be found.</p>
              <Link href="/patients">
                <Button>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Patients
                </Button>
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-background" data-testid="page-patient-detail">
      <Sidebar />
      
      <main className="flex-1">
        <Header title={`${patient.firstName} ${patient.lastName}`} subtitle="Patient details and medical history" />
        
        <div className="p-6 space-y-6">
          {/* Breadcrumb Navigation */}
          <Breadcrumb data-testid="breadcrumb-navigation">
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/patients">Patients</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{patient.firstName} {patient.lastName}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {/* Patient Information */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card data-testid="card-patient-info">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Patient Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">First Name</p>
                    <p className="font-medium text-foreground" data-testid="text-patient-firstName">
                      {patient.firstName}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Last Name</p>
                    <p className="font-medium text-foreground" data-testid="text-patient-lastName">
                      {patient.lastName}
                    </p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Medical Record Number</p>
                    <code className="text-sm bg-muted px-2 py-1 rounded" data-testid="text-patient-mrn">
                      {patient.mrn}
                    </code>
                  </div>
                  {patient.dob && (
                    <div>
                      <p className="text-sm text-muted-foreground">Date of Birth</p>
                      <p className="font-medium text-foreground" data-testid="text-patient-dob">
                        {patient.dob}
                      </p>
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">Created</p>
                  <p className="font-medium text-foreground" data-testid="text-patient-created">
                    {new Date(patient.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-insurance-info">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Insurance Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Primary Insurance */}
                <div className="space-y-3 pb-3 border-b">
                  <h4 className="text-sm font-semibold text-foreground">Primary Insurance</h4>
                  
                  <div>
                    <p className="text-sm text-muted-foreground">Payer Type</p>
                    <Badge 
                      variant={patient.payerType === 'Original Medicare' ? 'default' : 'secondary'}
                      data-testid="badge-patient-payerType"
                    >
                      {patient.payerType}
                    </Badge>
                  </div>
                  
                  {patient.planName && (
                    <div>
                      <p className="text-sm text-muted-foreground">Plan Name</p>
                      <p className="font-medium text-foreground" data-testid="text-patient-planName">
                        {patient.planName}
                      </p>
                    </div>
                  )}
                  
                  {patient.insuranceId && (
                    <div>
                      <p className="text-sm text-muted-foreground">Insurance ID</p>
                      <code className="text-sm bg-muted px-2 py-1 rounded" data-testid="text-patient-insuranceId">
                        {patient.insuranceId}
                      </code>
                    </div>
                  )}
                </div>

                {/* Secondary Insurance */}
                {(patient.secondaryPayerType || patient.secondaryPlanName || patient.secondaryInsuranceId) && (
                  <div className="space-y-3 pb-3 border-b">
                    <h4 className="text-sm font-semibold text-foreground">Secondary Insurance</h4>
                    
                    {patient.secondaryPayerType && (
                      <div>
                        <p className="text-sm text-muted-foreground">Payer Type</p>
                        <Badge 
                          variant="outline"
                          data-testid="badge-patient-secondaryPayerType"
                        >
                          {patient.secondaryPayerType}
                        </Badge>
                      </div>
                    )}
                    
                    {patient.secondaryPlanName && (
                      <div>
                        <p className="text-sm text-muted-foreground">Plan Name</p>
                        <p className="font-medium text-foreground" data-testid="text-patient-secondaryPlanName">
                          {patient.secondaryPlanName}
                        </p>
                      </div>
                    )}
                    
                    {patient.secondaryInsuranceId && (
                      <div>
                        <p className="text-sm text-muted-foreground">Insurance ID</p>
                        <code className="text-sm bg-muted px-2 py-1 rounded" data-testid="text-patient-secondaryInsuranceId">
                          {patient.secondaryInsuranceId}
                        </code>
                      </div>
                    )}
                  </div>
                )}
                
                {!patient.secondaryPayerType && !patient.secondaryPlanName && !patient.secondaryInsuranceId && (
                  <div className="text-sm text-muted-foreground italic">
                    No secondary insurance on file
                  </div>
                )}

                <div>
                  <p className="text-sm text-muted-foreground">MAC Region</p>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <p className="font-medium text-foreground" data-testid="text-patient-macRegion">
                      {patient.macRegion || 'Not specified'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Encounters Section */}
          <Card data-testid="card-patient-encounters">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Medical Encounters
                </CardTitle>
                <Dialog open={isEncounterDialogOpen} onOpenChange={setIsEncounterDialogOpen}>
                  <DialogTrigger asChild>
                    <Button data-testid="button-add-encounter">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Encounter
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Create New Encounter</DialogTitle>
                    </DialogHeader>
                    <EncounterForm 
                      patientId={patientId || ''}
                      onSubmit={(data) => createEncounterMutation.mutate(data)}
                      isLoading={createEncounterMutation.isPending}
                    />
                  </DialogContent>
                </Dialog>
              </div>
              <p className="text-sm text-muted-foreground">
                {encountersLoading ? "Loading..." : `${encounters?.length || 0} encounters found`}
              </p>
            </CardHeader>
            <CardContent>
              {encountersLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                  <p className="text-muted-foreground">Loading encounters...</p>
                </div>
              ) : encounters && encounters.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Wound Details</TableHead>
                      <TableHead>Infection Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {encounters.map((encounter) => (
                      <TableRow key={encounter.id} data-testid={`row-encounter-${encounter.id}`}>
                        <TableCell>
                          <div className="font-medium">
                            {new Date(encounter.date).toLocaleDateString()}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {new Date(encounter.date).toLocaleTimeString()}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <p><strong>Type:</strong> {encounter.woundDetails?.type || 'N/A'}</p>
                            <p><strong>Location:</strong> {encounter.woundDetails?.location || 'N/A'}</p>
                            {encounter.woundDetails?.size && (
                              <p><strong>Size:</strong> {encounter.woundDetails.size}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={encounter.infectionStatus === 'None' ? 'outline' : 'destructive'}>
                            {encounter.infectionStatus || 'Unknown'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(encounter.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Button variant="outline" size="sm" data-testid={`button-view-encounter-${encounter.id}`}>
                            View Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8">
                  <Calendar className="mx-auto h-12 w-12 text-muted-foreground/50" />
                  <h3 className="mt-2 text-sm font-medium text-foreground">No encounters found</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    This patient has no medical encounters recorded yet.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Back Button */}
          <div className="flex justify-start">
            <Link href="/patients">
              <Button variant="outline" data-testid="button-back-to-patients">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Patients
              </Button>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}