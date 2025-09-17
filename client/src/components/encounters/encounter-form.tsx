import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, X } from "lucide-react";
import { useState, useEffect } from "react";

const encounterFormSchema = z.object({
  date: z.string().min(1, "Encounter date is required"),
  notes: z.array(z.string()).min(1, "At least one encounter note is required"),
  woundDetails: z.object({
    type: z.enum(["DFU", "VLU", "Other"], {
      required_error: "Please select wound type",
    }),
    location: z.string().min(1, "Wound location is required"),
    measurements: z.object({
      length: z.string().min(1, "Length is required"),
      width: z.string().min(1, "Width is required"),
      depth: z.string().optional(),
    }),
    duration: z.string().min(1, "Wound duration is required"),
  }),
  conservativeCare: z.object({
    offloading: z.boolean().optional(),
    compression: z.boolean().optional(),
    debridement: z.boolean().optional(),
    moistureBalance: z.boolean().optional(),
    infectionControl: z.boolean().optional(),
    duration: z.string().min(1, "Conservative care duration is required"),
    details: z.string().optional(),
  }),
  infectionStatus: z.string().optional(),
  comorbidities: z.array(z.string()).optional(),
});

type EncounterFormData = z.infer<typeof encounterFormSchema>;

interface EncounterFormProps {
  onSubmit: (data: EncounterFormData) => void;
  isLoading: boolean;
  patientId: string;
  encounter?: any; // For editing mode
  mode?: 'create' | 'edit';
}

export default function EncounterForm({ onSubmit, isLoading, patientId, encounter, mode = 'create' }: EncounterFormProps) {
  const isEditing = mode === 'edit' && encounter;
  
  // Initialize notes and comorbidities from encounter data if editing
  const [notes, setNotes] = useState<string[]>(
    isEditing && encounter.notes ? encounter.notes : [""]
  );
  const [comorbidities, setComorbidities] = useState<string[]>(
    isEditing && encounter.comorbidities ? encounter.comorbidities : []
  );

  const form = useForm<EncounterFormData>({
    resolver: zodResolver(encounterFormSchema),
    defaultValues: isEditing ? {
      date: new Date(encounter.date).toISOString().split('T')[0],
      notes: encounter.notes || [""],
      woundDetails: encounter.woundDetails || {
        type: undefined,
        location: "",
        measurements: {
          length: "",
          width: "",
          depth: "",
        },
        duration: "",
      },
      conservativeCare: encounter.conservativeCare || {
        offloading: false,
        compression: false,
        debridement: false,
        moistureBalance: false,
        infectionControl: false,
        duration: "",
        details: "",
      },
      infectionStatus: encounter.infectionStatus || "",
      comorbidities: encounter.comorbidities || [],
    } : {
      date: new Date().toISOString().split('T')[0],
      notes: [""],
      woundDetails: {
        type: undefined,
        location: "",
        measurements: {
          length: "",
          width: "",
          depth: "",
        },
        duration: "",
      },
      conservativeCare: {
        offloading: false,
        compression: false,
        debridement: false,
        moistureBalance: false,
        infectionControl: false,
        duration: "",
        details: "",
      },
      infectionStatus: "",
      comorbidities: [],
    },
  });

  // Update form when encounter data changes (for editing mode)
  useEffect(() => {
    if (isEditing && encounter) {
      const encounterNotes = encounter.notes || [""];
      const encounterComorbidities = encounter.comorbidities || [];
      
      setNotes(encounterNotes);
      setComorbidities(encounterComorbidities);
      
      form.reset({
        date: new Date(encounter.date).toISOString().split('T')[0],
        notes: encounterNotes,
        woundDetails: encounter.woundDetails,
        conservativeCare: encounter.conservativeCare,
        infectionStatus: encounter.infectionStatus || "",
        comorbidities: encounterComorbidities,
      });
    }
  }, [encounter, isEditing, form]);

  const addNote = () => {
    const newNotes = [...notes, ""];
    setNotes(newNotes);
    form.setValue("notes", newNotes);
  };

  const removeNote = (index: number) => {
    if (notes.length > 1) {
      const newNotes = notes.filter((_, i) => i !== index);
      setNotes(newNotes);
      form.setValue("notes", newNotes);
    }
  };

  const updateNote = (index: number, value: string) => {
    const newNotes = [...notes];
    newNotes[index] = value;
    setNotes(newNotes);
    form.setValue("notes", newNotes);
  };

  const addComorbidity = (comorbidity: string) => {
    if (comorbidity && !comorbidities.includes(comorbidity)) {
      const newComorbidities = [...comorbidities, comorbidity];
      setComorbidities(newComorbidities);
      form.setValue("comorbidities", newComorbidities);
    }
  };

  const removeComorbidity = (comorbidity: string) => {
    const newComorbidities = comorbidities.filter(c => c !== comorbidity);
    setComorbidities(newComorbidities);
    form.setValue("comorbidities", newComorbidities);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" data-testid="encounter-form">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Encounter Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Encounter Date *</FormLabel>
                  <FormControl>
                    <Input 
                      type="date"
                      {...field} 
                      data-testid="input-encounter-date"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center justify-between">
              Encounter Notes
              <Button 
                type="button" 
                variant="outline" 
                size="sm" 
                onClick={addNote}
                data-testid="button-add-note"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Note
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {notes.map((note, index) => (
              <div key={index} className="flex items-start space-x-2">
                <div className="flex-1">
                  <Textarea
                    placeholder={`Encounter note ${index + 1}...`}
                    value={note}
                    onChange={(e) => updateNote(index, e.target.value)}
                    data-testid={`textarea-note-${index}`}
                  />
                </div>
                {notes.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeNote(index)}
                    data-testid={`button-remove-note-${index}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Wound Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="woundDetails.type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Wound Type *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-wound-type">
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
                name="woundDetails.location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Wound Location *</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="e.g., Right foot plantar surface" 
                        {...field} 
                        data-testid="input-wound-location"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="woundDetails.measurements.length"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Length (cm) *</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="0.0" 
                        type="number"
                        step="0.1"
                        {...field} 
                        data-testid="input-wound-length"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="woundDetails.measurements.width"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Width (cm) *</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="0.0" 
                        type="number"
                        step="0.1"
                        {...field} 
                        data-testid="input-wound-width"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="woundDetails.measurements.depth"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Depth (cm)</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="0.0" 
                        type="number"
                        step="0.1"
                        {...field} 
                        data-testid="input-wound-depth"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="woundDetails.duration"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Wound Duration *</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="e.g., 6 weeks, 3 months" 
                      {...field} 
                      data-testid="input-wound-duration"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Conservative Care</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[
                { name: "offloading", label: "Offloading" },
                { name: "compression", label: "Compression Therapy" },
                { name: "debridement", label: "Debridement" },
                { name: "moistureBalance", label: "Moisture Balance" },
                { name: "infectionControl", label: "Infection Control" },
              ].map(({ name, label }) => (
                <FormField
                  key={name}
                  control={form.control}
                  name={`conservativeCare.${name}` as any}
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <input
                          type="checkbox"
                          checked={field.value}
                          onChange={field.onChange}
                          data-testid={`checkbox-${name}`}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel className="text-sm font-normal">{label}</FormLabel>
                      </div>
                    </FormItem>
                  )}
                />
              ))}
            </div>

            <FormField
              control={form.control}
              name="conservativeCare.duration"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Conservative Care Duration *</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="e.g., 4 weeks, 2 months" 
                      {...field} 
                      data-testid="input-conservative-duration"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="conservativeCare.details"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Additional Details</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Additional conservative care details..." 
                      {...field} 
                      data-testid="textarea-conservative-details"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end space-x-2">
          <Button type="button" variant="outline" disabled={isLoading}>
            Cancel
          </Button>
          <Button 
            type="submit" 
            disabled={isLoading}
            data-testid="button-submit-encounter"
          >
            {isLoading ? (isEditing ? "Updating..." : "Creating...") : (isEditing ? "Update Encounter" : "Create Encounter")}
          </Button>
        </div>
      </form>
    </Form>
  );
}
