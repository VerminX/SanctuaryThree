import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import EncounterForm from "@/components/encounters/encounter-form";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClipboardList, Plus, Search, Filter, Calendar } from "lucide-react";

export default function Encounters() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading, user } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedEncounter, setSelectedEncounter] = useState<any>(null);

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

  const { data: patients, isLoading: patientsLoading } = useQuery({
    queryKey: ["/api/tenants", currentTenant?.id, "patients"],
    enabled: !!currentTenant?.id,
    retry: false,
  });

  // Get all encounters for all patients
  const { data: allEncounters, isLoading: encountersLoading, error } = useQuery({
    queryKey: ["/api/encounters"],
    queryFn: async () => {
      if (!patients || patients.length === 0) return [];
      
      const encounterPromises = patients.map(async (patient: any) => {
        try {
          const response = await fetch(`/api/patients/${patient.id}/encounters`, {
            credentials: "include",
          });
          if (response.ok) {
            const encounters = await response.json();
            return encounters.map((encounter: any) => ({
              ...encounter,
              patientName: `${patient.firstName} ${patient.lastName}`,
              patientMrn: patient.mrn,
            }));
          }
          return [];
        } catch (error) {
          return [];
        }
      });
      
      const encountersArrays = await Promise.all(encounterPromises);
      return encountersArrays.flat().sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    },
    enabled: !!patients && patients.length > 0,
    retry: false,
  });

  const createEncounterMutation = useMutation({
    mutationFn: async (encounterData: any) => {
      await apiRequest("POST", `/api/patients/${selectedPatientId}/encounters`, encounterData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/encounters"] });
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      setIsCreateDialogOpen(false);
      setSelectedPatientId("");
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

  const updateEncounterMutation = useMutation({
    mutationFn: async (encounterData: any) => {
      await apiRequest("PUT", `/api/encounters/${selectedEncounter.id}`, encounterData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/encounters"] });
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      setIsEditDialogOpen(false);
      setSelectedEncounter(null);
      toast({
        title: "Success",
        description: "Encounter updated successfully",
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
        description: "Failed to update encounter",
        variant: "destructive",
      });
    },
  });

  const handleViewEncounter = (encounter: any) => {
    setSelectedEncounter(encounter);
    setIsEditDialogOpen(true);
  };

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

  // Filter encounters based on search term
  const filteredEncounters = allEncounters?.filter((encounter: any) =>
    encounter.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    encounter.patientMrn.toLowerCase().includes(searchTerm.toLowerCase()) ||
    encounter.woundDetails?.type?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const getWoundTypeColor = (type: string) => {
    switch (type) {
      case "DFU":
        return "bg-chart-1/10 text-chart-1 border-chart-1/20";
      case "VLU":
        return "bg-chart-2/10 text-chart-2 border-chart-2/20";
      default:
        return "bg-muted text-muted-foreground border-border";
    }
  };

  return (
    <div className="min-h-screen flex bg-background" data-testid="page-encounters">
      <Sidebar />
      
      <main className="flex-1">
        <Header title="Encounter Management" subtitle="Document patient visits and wound assessments" />
        
        <div className="p-6 space-y-6">
          {/* Actions Bar */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center space-x-4 flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Search encounters by patient name, MRN, or wound type..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 w-80"
                  data-testid="input-search-encounters"
                />
              </div>
              <Button variant="outline" size="sm" data-testid="button-filter">
                <Filter className="h-4 w-4 mr-2" />
                Filter
              </Button>
            </div>
            
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-create-encounter">
                  <Plus className="h-4 w-4 mr-2" />
                  New Encounter
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create New Encounter</DialogTitle>
                </DialogHeader>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Select Patient
                  </label>
                  <select
                    value={selectedPatientId}
                    onChange={(e) => setSelectedPatientId(e.target.value)}
                    className="w-full p-2 border border-input rounded-lg bg-background text-foreground"
                    data-testid="select-patient-for-encounter"
                  >
                    <option value="">Choose a patient...</option>
                    {patients?.map((patient: any) => (
                      <option key={patient.id} value={patient.id}>
                        {patient.firstName} {patient.lastName} (MRN: {patient.mrn})
                      </option>
                    ))}
                  </select>
                </div>
                {selectedPatientId && (
                  <EncounterForm
                    patientId={selectedPatientId}
                    onSubmit={(data) => createEncounterMutation.mutate(data)}
                    isLoading={createEncounterMutation.isPending}
                  />
                )}
              </DialogContent>
            </Dialog>

            {/* Edit Encounter Dialog */}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
              <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Edit Encounter</DialogTitle>
                </DialogHeader>
                {selectedEncounter && (
                  <EncounterForm
                    patientId={selectedEncounter.patientId}
                    encounter={selectedEncounter}
                    mode="edit"
                    onSubmit={(data) => updateEncounterMutation.mutate(data)}
                    isLoading={updateEncounterMutation.isPending}
                  />
                )}
              </DialogContent>
            </Dialog>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card data-testid="card-total-encounters">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Encounters</p>
                    <p className="text-3xl font-bold text-foreground">
                      {encountersLoading ? "--" : allEncounters?.length || 0}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <ClipboardList className="text-primary text-xl" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-dfu-encounters">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">DFU Encounters</p>
                    <p className="text-3xl font-bold text-foreground">
                      {encountersLoading ? "--" : allEncounters?.filter((e: any) => e.woundDetails?.type === 'DFU').length || 0}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-chart-1/10 rounded-lg flex items-center justify-center">
                    <ClipboardList className="text-chart-1 text-xl" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-vlu-encounters">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">VLU Encounters</p>
                    <p className="text-3xl font-bold text-foreground">
                      {encountersLoading ? "--" : allEncounters?.filter((e: any) => e.woundDetails?.type === 'VLU').length || 0}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-chart-2/10 rounded-lg flex items-center justify-center">
                    <ClipboardList className="text-chart-2 text-xl" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-recent-encounters">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">This Week</p>
                    <p className="text-3xl font-bold text-foreground">
                      {encountersLoading ? "--" : allEncounters?.filter((e: any) => {
                        const encounterDate = new Date(e.date);
                        const oneWeekAgo = new Date();
                        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
                        return encounterDate >= oneWeekAgo;
                      }).length || 0}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-chart-3/10 rounded-lg flex items-center justify-center">
                    <Calendar className="text-chart-3 text-xl" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Encounters Table */}
          <Card data-testid="card-encounters-table">
            <div className="p-6 border-b border-border">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-foreground">Patient Encounters</h3>
                <span className="text-sm text-muted-foreground">
                  {filteredEncounters.length} of {allEncounters?.length || 0} encounters
                </span>
              </div>
            </div>
            <CardContent className="p-0">
              {encountersLoading ? (
                <div className="p-6 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                  <p className="text-muted-foreground">Loading encounters...</p>
                </div>
              ) : error ? (
                <div className="p-6 text-center">
                  <p className="text-destructive">Failed to load encounters</p>
                </div>
              ) : filteredEncounters.length === 0 ? (
                <div className="p-6 text-center">
                  <ClipboardList className="mx-auto h-12 w-12 text-muted-foreground/50" />
                  <h3 className="mt-2 text-sm font-medium text-foreground">No encounters found</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {searchTerm ? "Try adjusting your search criteria." : "Get started by creating your first encounter."}
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Patient</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Wound Type</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Size (L×W×D cm)</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEncounters.map((encounter: any) => (
                      <TableRow key={encounter.id} data-testid={`row-encounter-${encounter.id}`}>
                        <TableCell>
                          <div>
                            <div className="font-medium text-foreground">
                              {encounter.patientName}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              MRN: {encounter.patientMrn}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(encounter.date).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Badge className={getWoundTypeColor(encounter.woundDetails?.type)}>
                            {encounter.woundDetails?.type || 'Unknown'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {encounter.woundDetails?.location || 'Not specified'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground font-mono">
                          {encounter.woundDetails?.measurements ? 
                            `${encounter.woundDetails.measurements.length}×${encounter.woundDetails.measurements.width}${encounter.woundDetails.measurements.depth ? `×${encounter.woundDetails.measurements.depth}` : ''}` :
                            'Not recorded'
                          }
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {encounter.woundDetails?.duration || 'Not specified'}
                        </TableCell>
                        <TableCell>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => handleViewEncounter(encounter)}
                            data-testid={`button-view-encounter-${encounter.id}`}
                          >
                            View Details
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
