import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect } from "react";
import { insertEpisodeSchema } from "@shared/schema";

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