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
import { Plus, X, Stethoscope, AlertTriangle } from "lucide-react";
import { useState, useEffect } from "react";
import DiagnosisInput from "@/components/ui/diagnosis-input";
import RecommendationsEngine from "@/components/clinical/recommendations-engine";
import type { ICD10Code } from "@shared/icd10Database";

const encounterFormSchema = z.object({
  date: z.string().min(1, "Encounter date is required"),
  notes: z.array(z.string()).min(1, "At least one encounter note is required"),
  // Diagnosis codes
  primaryDiagnosis: z.string().min(1, "Primary diagnosis is required"),
  secondaryDiagnoses: z.array(z.string()).optional(),
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
  
  // Diagnosis validation and recommendations state
  const [primaryDiagnosisData, setPrimaryDiagnosisData] = useState<ICD10Code | null>(null);
  const [secondaryDiagnoses, setSecondaryDiagnoses] = useState<string[]>([]);
  const [diagnosisValidation, setDiagnosisValidation] = useState<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }>({ isValid: true, errors: [], warnings: [] });
  const [clinicalRecommendations, setClinicalRecommendations] = useState<ICD10Code['clinicalRecommendations'] | null>(null);
  const [complianceAlerts, setComplianceAlerts] = useState<any[]>([]);

  const form = useForm<EncounterFormData>({
    resolver: zodResolver(encounterFormSchema),
    defaultValues: isEditing ? {
      date: new Date(encounter.date).toISOString().split('T')[0],
      notes: encounter.notes || [""],
      primaryDiagnosis: encounter.primaryDiagnosis || "",
      secondaryDiagnoses: encounter.secondaryDiagnoses || [],
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
      primaryDiagnosis: "",
      secondaryDiagnoses: [],
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
      const encounterSecondaryDiagnoses = encounter.secondaryDiagnoses || [];
      
      setNotes(encounterNotes);
      setComorbidities(encounterComorbidities);
      setSecondaryDiagnoses(encounterSecondaryDiagnoses);
      
      form.reset({
        date: new Date(encounter.date).toISOString().split('T')[0],
        notes: encounterNotes,
        primaryDiagnosis: encounter.primaryDiagnosis || "",
        secondaryDiagnoses: encounterSecondaryDiagnoses,
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

  // Diagnosis management functions
  const handlePrimaryDiagnosisChange = (code: string, codeData?: ICD10Code) => {
    form.setValue("primaryDiagnosis", code);
    setPrimaryDiagnosisData(codeData || null);
    
    // Set clinical recommendations for the recommendations engine
    if (codeData?.clinicalRecommendations) {
      setClinicalRecommendations(codeData.clinicalRecommendations);
    }
  };

  const handleDiagnosisValidation = (isValid: boolean, errors: string[], warnings: string[]) => {
    setDiagnosisValidation({ isValid, errors, warnings });
  };

  const addSecondaryDiagnosis = () => {
    const newSecondaryDiagnoses = [...secondaryDiagnoses, ""];
    setSecondaryDiagnoses(newSecondaryDiagnoses);
    form.setValue("secondaryDiagnoses", newSecondaryDiagnoses);
  };

  const removeSecondaryDiagnosis = (index: number) => {
    const newSecondaryDiagnoses = secondaryDiagnoses.filter((_, i) => i !== index);
    setSecondaryDiagnoses(newSecondaryDiagnoses);
    form.setValue("secondaryDiagnoses", newSecondaryDiagnoses);
  };

  const updateSecondaryDiagnosis = (index: number, code: string) => {
    const newSecondaryDiagnoses = [...secondaryDiagnoses];
    newSecondaryDiagnoses[index] = code;
    setSecondaryDiagnoses(newSecondaryDiagnoses);
    form.setValue("secondaryDiagnoses", newSecondaryDiagnoses);
  };

  const handleComplianceAlert = (alert: any) => {
    setComplianceAlerts(prev => [...prev, alert]);
  };

  // Get all diagnosis codes for recommendations engine
  const allDiagnosisCodes = [
    form.watch("primaryDiagnosis"),
    ...secondaryDiagnoses
  ].filter(Boolean);

  // Generate patient history object for recommendations
  const patientHistory = {
    diabetes: comorbidities.some(c => c.toLowerCase().includes('diabetes') || c.toLowerCase().includes('diabetic')),
    vascularDisease: comorbidities.some(c => c.toLowerCase().includes('vascular') || c.toLowerCase().includes('arterial')),
    previousUlcers: true, // Assume true since this is an encounter form
    currentMedications: [] // Could be enhanced to include medications
  };

  // Generate conservative care history from form data
  const conservativeCareHistory = {
    offloading: {
      tried: form.watch("conservativeCare.offloading") || false,
      duration: form.watch("conservativeCare.duration"),
      effective: undefined // Could be enhanced
    },
    compression: {
      tried: form.watch("conservativeCare.compression") || false,
      duration: form.watch("conservativeCare.duration"),
      effective: undefined
    },
    debridement: {
      tried: form.watch("conservativeCare.debridement") || false,
      duration: form.watch("conservativeCare.duration"),
      effective: undefined
    },
    woundCare: {
      tried: form.watch("conservativeCare.moistureBalance") || form.watch("conservativeCare.infectionControl") || false,
      duration: form.watch("conservativeCare.duration"),
      effective: undefined
    }
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

        {/* Diagnosis Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Stethoscope className="h-5 w-5" />
              Diagnosis & Clinical Assessment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Primary Diagnosis */}
            <FormField
              control={form.control}
              name="primaryDiagnosis"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Primary Diagnosis *</FormLabel>
                  <FormControl>
                    <DiagnosisInput
                      value={field.value}
                      onChange={handlePrimaryDiagnosisChange}
                      onValidation={handleDiagnosisValidation}
                      onComplianceChange={(compliance) => {
                        // Handle compliance alerts
                        if (compliance && !compliance.isLCDCovered) {
                          handleComplianceAlert({
                            type: 'error',
                            title: 'Coverage Alert',
                            description: `Primary diagnosis may not be covered under current Medicare LCDs`,
                            actionRequired: true
                          });
                        }
                      }}
                      placeholder="Search primary diagnosis (e.g., E11.621, diabetic foot ulcer)"
                      showRecommendations={false} // Will show in recommendations engine below
                      showCompliance={false} // Will show in recommendations engine below
                      data-testid="input-primary-diagnosis"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Secondary Diagnoses */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <FormLabel>Secondary Diagnoses</FormLabel>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addSecondaryDiagnosis}
                  data-testid="button-add-secondary-diagnosis"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Secondary Diagnosis
                </Button>
              </div>

              {secondaryDiagnoses.map((diagnosis, index) => (
                <div key={index} className="flex items-start gap-2">
                  <div className="flex-1">
                    <DiagnosisInput
                      value={diagnosis}
                      onChange={(code) => updateSecondaryDiagnosis(index, code)}
                      placeholder={`Secondary diagnosis ${index + 1} (optional)`}
                      showRecommendations={false}
                      showCompliance={false}
                      data-testid={`input-secondary-diagnosis-${index}`}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeSecondaryDiagnosis(index)}
                    data-testid={`button-remove-secondary-diagnosis-${index}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}

              {secondaryDiagnoses.length === 0 && (
                <div className="text-center py-6 text-muted-foreground border-2 border-dashed border-gray-200 rounded-lg">
                  <Stethoscope className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No secondary diagnoses added</p>
                  <p className="text-xs">Click "Add Secondary Diagnosis" to add additional diagnosis codes</p>
                </div>
              )}
            </div>

            {/* Validation Messages */}
            {!diagnosisValidation.isValid && (
              <div className="space-y-2" data-testid="diagnosis-validation-alerts">
                {diagnosisValidation.errors.map((error, index) => (
                  <div key={`error-${index}`} className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-red-700">{error}</div>
                  </div>
                ))}
                {diagnosisValidation.warnings.map((warning, index) => (
                  <div key={`warning-${index}`} className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-yellow-700">{warning}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Clinical Recommendations Engine */}
        {allDiagnosisCodes.length > 0 && (
          <RecommendationsEngine
            diagnosisCodes={allDiagnosisCodes}
            woundType={form.watch("woundDetails.type")}
            woundLocation={form.watch("woundDetails.location")}
            patientHistory={patientHistory}
            conservativeCareHistory={conservativeCareHistory}
            onComplianceAlert={handleComplianceAlert}
            className="mt-4"
            data-testid="recommendations-engine"
          />
        )}

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
