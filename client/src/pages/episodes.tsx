import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import EpisodeForm from "@/components/episodes/episode-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Plus, Search, Filter, Edit, Trash2, AlertCircle } from "lucide-react";
import { Episode } from "@shared/schema";

export default function Episodes() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading, user } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [woundTypeFilter, setWoundTypeFilter] = useState<string>("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null);

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

  // Get all episodes for all patients
  const { data: allEpisodes, isLoading: episodesLoading, error } = useQuery({
    queryKey: ["/api/episodes"],
    queryFn: async () => {
      if (!patients || !Array.isArray(patients) || patients.length === 0) return [];
      
      const episodePromises = patients.map(async (patient: any) => {
        try {
          const response = await fetch(`/api/patients/${patient.id}/episodes`, {
            credentials: "include",
          });
          if (response.ok) {
            const episodes = await response.json();
            return episodes.map((episode: any) => ({
              ...episode,
              patientName: `${patient.firstName} ${patient.lastName}`,
              patientMrn: patient.mrn,
            }));
          }
          return [];
        } catch (error) {
          return [];
        }
      });
      
      const episodesArrays = await Promise.all(episodePromises);
      return episodesArrays.flat().sort((a: any, b: any) => 
        new Date(b.episodeStartDate).getTime() - new Date(a.episodeStartDate).getTime()
      );
    },
    enabled: !!patients && Array.isArray(patients) && patients.length > 0,
    retry: false,
  });

  const createEpisodeMutation = useMutation({
    mutationFn: async (episodeData: any) => {
      await apiRequest("POST", `/api/patients/${selectedPatientId}/episodes`, episodeData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/episodes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", currentTenant?.id, "patients"] });
      setIsCreateDialogOpen(false);
      setSelectedPatientId("");
      toast({
        title: "Success",
        description: "Episode created successfully",
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
        description: "Failed to create episode",
        variant: "destructive",
      });
    },
  });

  const updateEpisodeMutation = useMutation({
    mutationFn: async (episodeData: any) => {
      await apiRequest("PUT", `/api/episodes/${selectedEpisode?.id}`, episodeData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/episodes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", currentTenant?.id, "patients"] });
      setIsEditDialogOpen(false);
      setSelectedEpisode(null);
      toast({
        title: "Success",
        description: "Episode updated successfully",
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
        description: "Failed to update episode",
        variant: "destructive",
      });
    },
  });

  const deleteEpisodeMutation = useMutation({
    mutationFn: async (episodeId: string) => {
      await apiRequest("DELETE", `/api/episodes/${episodeId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/episodes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", currentTenant?.id, "patients"] });
      toast({
        title: "Success",
        description: "Episode deleted successfully",
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
        description: "Failed to delete episode",
        variant: "destructive",
      });
    },
  });

  // Filter episodes based on search term, status, and wound type
  const filteredEpisodes = allEpisodes?.filter((episode: any) => {
    const matchesSearch = !searchTerm || 
      episode.patientName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      episode.patientMrn?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      episode.woundLocation?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      episode.primaryDiagnosis?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || episode.status === statusFilter;
    const matchesWoundType = woundTypeFilter === "all" || episode.woundType === woundTypeFilter;
    
    return matchesSearch && matchesStatus && matchesWoundType;
  }) || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">Active</Badge>;
      case 'resolved':
        return <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">Resolved</Badge>;
      case 'chronic':
        return <Badge variant="destructive" className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300">Chronic</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header title="Episode Management" subtitle="Manage care episodes for wound conditions" />
        
        <main className="flex-1 p-6 space-y-6 overflow-auto">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Episodes</h1>
              <p className="text-muted-foreground mt-1">
                Manage care episodes for wound conditions
              </p>
            </div>
            
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="space-x-2" data-testid="button-create-episode">
                  <Plus className="h-4 w-4" />
                  <span>Create Episode</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create New Episode</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Select Patient</label>
                    <Select value={selectedPatientId} onValueChange={setSelectedPatientId}>
                      <SelectTrigger data-testid="select-patient-for-episode">
                        <SelectValue placeholder="Choose a patient" />
                      </SelectTrigger>
                      <SelectContent>
                        {patients && Array.isArray(patients) && 
                          patients.map((patient: any) => (
                            <SelectItem key={patient.id} value={patient.id}>
                              {patient.firstName} {patient.lastName} - {patient.mrn}
                            </SelectItem>
                          ))
                        }
                      </SelectContent>
                    </Select>
                  </div>
                  {selectedPatientId && (
                    <EpisodeForm
                      onSubmit={(data) => createEpisodeMutation.mutate(data)}
                      onCancel={() => {
                        setIsCreateDialogOpen(false);
                        setSelectedPatientId("");
                      }}
                      isLoading={createEpisodeMutation.isPending}
                      patientId={selectedPatientId}
                      mode="create"
                    />
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Search and Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-4 items-end">
                <div className="flex-1 min-w-0">
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by patient name, MRN, wound location, or diagnosis..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                      data-testid="input-search-episodes"
                    />
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-32" data-testid="select-status-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                      <SelectItem value="chronic">Chronic</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  <Select value={woundTypeFilter} onValueChange={setWoundTypeFilter}>
                    <SelectTrigger className="w-32" data-testid="select-wound-type-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="DFU">DFU</SelectItem>
                      <SelectItem value="VLU">VLU</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Episodes List */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Calendar className="h-5 w-5" />
                <span>Episodes ({filteredEpisodes.length})</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {episodesLoading && (
                <div className="text-center py-8 text-muted-foreground">
                  Loading episodes...
                </div>
              )}
              
              {error && (
                <div className="text-center py-8 text-destructive flex items-center justify-center space-x-2">
                  <AlertCircle className="h-4 w-4" />
                  <span>Failed to load episodes</span>
                </div>
              )}
              
              {!episodesLoading && !error && filteredEpisodes.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  {allEpisodes?.length === 0 
                    ? "No episodes found. Create your first episode to get started."
                    : "No episodes match your search criteria."}
                </div>
              )}
              
              {!episodesLoading && !error && filteredEpisodes.length > 0 && (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Patient</TableHead>
                        <TableHead>Wound Type</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Start Date</TableHead>
                        <TableHead>End Date</TableHead>
                        <TableHead>Primary Diagnosis</TableHead>
                        <TableHead>Encounters</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredEpisodes.map((episode: any) => (
                        <TableRow key={episode.id} data-testid={`row-episode-${episode.id}`}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{episode.patientName}</div>
                              <div className="text-sm text-muted-foreground">
                                MRN: {episode.patientMrn}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{episode.woundType}</Badge>
                          </TableCell>
                          <TableCell>{episode.woundLocation}</TableCell>
                          <TableCell>{getStatusBadge(episode.status)}</TableCell>
                          <TableCell>
                            {new Date(episode.episodeStartDate).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            {episode.episodeEndDate 
                              ? new Date(episode.episodeEndDate).toLocaleDateString()
                              : <span className="text-muted-foreground">Ongoing</span>
                            }
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {episode.primaryDiagnosis || 
                              <span className="text-muted-foreground">Not specified</span>
                            }
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="font-mono">
                              {episode.encounterCount || 0}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center space-x-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSelectedEpisode(episode);
                                  setIsEditDialogOpen(true);
                                }}
                                data-testid={`button-edit-episode-${episode.id}`}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    data-testid={`button-delete-episode-${episode.id}`}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Episode</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to delete this episode for {episode.patientName}? 
                                      This action cannot be undone and will also delete all associated encounters, 
                                      documents, and eligibility checks.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel data-testid={`button-cancel-delete-${episode.id}`}>
                                      Cancel
                                    </AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => deleteEpisodeMutation.mutate(episode.id)}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      data-testid={`button-confirm-delete-${episode.id}`}
                                    >
                                      Delete Episode
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </main>
      </div>

      {/* Edit Episode Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Episode</DialogTitle>
          </DialogHeader>
          {selectedEpisode && (
            <EpisodeForm
              onSubmit={(data) => updateEpisodeMutation.mutate(data)}
              onCancel={() => {
                setIsEditDialogOpen(false);
                setSelectedEpisode(null);
              }}
              isLoading={updateEpisodeMutation.isPending}
              patientId={selectedEpisode.patientId}
              episode={selectedEpisode}
              mode="edit"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}