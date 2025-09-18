import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { insertEpisodeSchema } from "@shared/schema";
import { Calendar, Plus, X, UserCheck } from "lucide-react";

const episodeFormSchema = insertEpisodeSchema.extend({
  episodeStartDate: z.string().min(1, "Episode start date is required"),
  episodeEndDate: z.string().optional().or(z.literal("")),
});

type EpisodeFormData = z.infer<typeof episodeFormSchema>;

interface EpisodeFormProps {
  onSubmit: (data: EpisodeFormData) => void;
  onCancel?: () => void;
  isLoading: boolean;
  patientId: string;
  episode?: any; // For editing mode
  mode?: 'create' | 'edit';
}

export default function EpisodeForm({ onSubmit, onCancel, isLoading, patientId, episode, mode = 'create' }: EpisodeFormProps) {
  const isEditing = mode === 'edit' && episode;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [encounterSearchTerm, setEncounterSearchTerm] = useState("");

  // Get encounters currently in this episode (only for editing)
  const { data: currentEncounters, refetch: refetchCurrentEncounters } = useQuery({
    queryKey: ["/api/episodes", episode?.id, "encounters"],
    queryFn: async () => {
      const response = await fetch(`/api/episodes/${episode.id}/encounters`, {
        credentials: "include",
      });
      if (response.ok) {
        return response.json();
      }
      return [];
    },
    enabled: isEditing && !!episode?.id,
    retry: false,
  });

  // Get all encounters for this patient to show unassigned ones
  const { data: allPatientEncounters } = useQuery({
    queryKey: ["/api/patients", patientId, "encounters"],
    enabled: isEditing && !!patientId,
    retry: false,
  });

  // Filter to get unassigned encounters (not in any episode)
  const unassignedEncounters = (Array.isArray(allPatientEncounters) ? allPatientEncounters : [])?.filter((encounter: any) => 
    !encounter.episodeId && 
    (!encounterSearchTerm || 
      encounter.encounterType?.toLowerCase().includes(encounterSearchTerm.toLowerCase()) ||
      new Date(encounter.date).toLocaleDateString().includes(encounterSearchTerm) ||
      encounter.woundAssessment?.toLowerCase().includes(encounterSearchTerm.toLowerCase())
    )
  ) || [];

  // Mutation to assign encounter to episode
  const assignEncounterMutation = useMutation({
    mutationFn: async (encounterId: string) => {
      await apiRequest("PUT", `/api/encounters/${encounterId}`, {
        episodeId: episode.id
      });
    },
    onSuccess: () => {
      refetchCurrentEncounters();
      queryClient.invalidateQueries({ queryKey: ["/api/patients", patientId, "encounters"] });
      toast({
        title: "Success",
        description: "Encounter added to episode",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add encounter to episode",
        variant: "destructive",
      });
    },
  });

  // Mutation to remove encounter from episode
  const removeEncounterMutation = useMutation({
    mutationFn: async (encounterId: string) => {
      await apiRequest("PUT", `/api/encounters/${encounterId}`, {
        episodeId: null
      });
    },
    onSuccess: () => {
      refetchCurrentEncounters();
      queryClient.invalidateQueries({ queryKey: ["/api/patients", patientId, "encounters"] });
      toast({
        title: "Success",
        description: "Encounter removed from episode",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to remove encounter from episode",
        variant: "destructive",
      });
    },
  });

  const form = useForm<EpisodeFormData>({
    resolver: zodResolver(episodeFormSchema),
    defaultValues: isEditing ? {
      patientId: episode.patientId,
      woundType: episode.woundType,
      woundLocation: episode.woundLocation,
      episodeStartDate: new Date(episode.episodeStartDate).toISOString().split('T')[0],
      episodeEndDate: episode.episodeEndDate 
        ? new Date(episode.episodeEndDate).toISOString().split('T')[0] 
        : "",
      status: episode.status || "active",
      primaryDiagnosis: episode.primaryDiagnosis || "",
    } : {
      patientId,
      woundType: "",
      woundLocation: "",
      episodeStartDate: new Date().toISOString().split('T')[0],
      episodeEndDate: "",
      status: "active",
      primaryDiagnosis: "",
    },
  });

  // Update form when episode data changes (for editing mode)
  useEffect(() => {
    if (isEditing && episode) {
      form.reset({
        patientId: episode.patientId,
        woundType: episode.woundType,
        woundLocation: episode.woundLocation,
        episodeStartDate: new Date(episode.episodeStartDate).toISOString().split('T')[0],
        episodeEndDate: episode.episodeEndDate 
          ? new Date(episode.episodeEndDate).toISOString().split('T')[0] 
          : "",
        status: episode.status || "active",
        primaryDiagnosis: episode.primaryDiagnosis || "",
      });
    }
  }, [episode, isEditing, form]);

  const handleSubmit = (data: EpisodeFormData) => {
    // Convert date strings back to Date objects for the API
    const submissionData = {
      ...data,
      episodeStartDate: new Date(data.episodeStartDate).toISOString(),
      episodeEndDate: data.episodeEndDate ? new Date(data.episodeEndDate).toISOString() : undefined,
    };
    onSubmit(submissionData);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6" data-testid="episode-form">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {isEditing ? "Edit Episode" : "Create New Episode"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="woundType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Wound Type *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl>
                        <SelectTrigger data-testid="select-episode-wound-type">
                          <SelectValue placeholder="Select wound type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="DFU">Diabetic Foot Ulcer (DFU)</SelectItem>
                        <SelectItem value="VLU">Venous Leg Ulcer (VLU)</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="woundLocation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Wound Location *</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="e.g., Right foot plantar surface" 
                        {...field} 
                        data-testid="input-episode-wound-location"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="episodeStartDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Episode Start Date *</FormLabel>
                    <FormControl>
                      <Input 
                        type="date"
                        {...field} 
                        data-testid="input-episode-start-date"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="episodeEndDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Episode End Date</FormLabel>
                    <FormControl>
                      <Input 
                        type="date"
                        {...field} 
                        data-testid="input-episode-end-date"
                        placeholder="Leave empty if ongoing"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl>
                        <SelectTrigger data-testid="select-episode-status">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="resolved">Resolved</SelectItem>
                        <SelectItem value="chronic">Chronic</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="primaryDiagnosis"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Primary Diagnosis</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="e.g., E11.621 - Type 2 diabetes with foot ulcer"
                        {...field} 
                        value={field.value || ""}
                        data-testid="input-primary-diagnosis"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Encounter Management Section - Only show in edit mode */}
        {isEditing && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <UserCheck className="h-5 w-5" />
                <span>Manage Encounters</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Current Encounters in Episode */}
              <div>
                <h4 className="text-sm font-medium mb-2">Current Encounters ({currentEncounters?.length || 0})</h4>
                {currentEncounters && currentEncounters.length > 0 ? (
                  <div className="space-y-2">
                    {currentEncounters.map((encounter: any) => (
                      <div key={encounter.id} className="flex items-center justify-between p-3 border rounded-lg bg-muted/50">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <div className="font-medium">{new Date(encounter.date).toLocaleDateString()}</div>
                              <div className="text-sm text-muted-foreground">
                                {encounter.encounterType} • {encounter.woundAssessment || 'No assessment'}
                              </div>
                            </div>
                          </div>
                        </div>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              disabled={removeEncounterMutation.isPending}
                              data-testid={`button-remove-encounter-${encounter.id}`}
                            >
                              <X className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove Encounter</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to remove this encounter from the episode? 
                                The encounter will become unassigned and can be added to another episode.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => removeEncounterMutation.mutate(encounter.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Remove
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 text-muted-foreground">
                    No encounters assigned to this episode yet.
                  </div>
                )}
              </div>

              {/* Add Unassigned Encounters */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium">Add Unassigned Encounters</h4>
                  <Badge variant="outline">{unassignedEncounters.length} available</Badge>
                </div>
                
                {/* Search for encounters */}
                <div className="relative mb-3">
                  <Input
                    placeholder="Search encounters by type, date, or assessment..."
                    value={encounterSearchTerm}
                    onChange={(e) => setEncounterSearchTerm(e.target.value)}
                    className="pl-8"
                    data-testid="input-search-encounters"
                  />
                  <Calendar className="absolute left-2 top-3 h-4 w-4 text-muted-foreground" />
                </div>

                {unassignedEncounters.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {unassignedEncounters.map((encounter: any) => (
                      <div key={encounter.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <div className="font-medium">{new Date(encounter.date).toLocaleDateString()}</div>
                              <div className="text-sm text-muted-foreground">
                                {encounter.encounterType} • {encounter.woundAssessment || 'No assessment'}
                              </div>
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => assignEncounterMutation.mutate(encounter.id)}
                          disabled={assignEncounterMutation.isPending}
                          data-testid={`button-add-encounter-${encounter.id}`}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 text-muted-foreground">
                    {(Array.isArray(allPatientEncounters) ? allPatientEncounters : []).length === 0 
                      ? "No encounters found for this patient."
                      : encounterSearchTerm 
                        ? "No encounters match your search criteria."
                        : "All encounters are already assigned to episodes."
                    }
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex justify-end space-x-2">
          <Button 
            type="button" 
            variant="outline" 
            disabled={isLoading}
            onClick={onCancel}
            data-testid="button-cancel-episode"
          >
            Cancel
          </Button>
          <Button 
            type="submit" 
            disabled={isLoading}
            data-testid="button-submit-episode"
          >
            {isLoading ? (isEditing ? "Updating..." : "Creating...") : (isEditing ? "Update Episode" : "Create Episode")}
          </Button>
        </div>
      </form>
    </Form>
  );
}