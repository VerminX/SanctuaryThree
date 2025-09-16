import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const patientFormSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  mrn: z.string().min(1, "MRN is required"),
  dob: z.string().optional(),
  payerType: z.enum(["Original Medicare", "Medicare Advantage"], {
    required_error: "Please select a payer type",
  }),
  planName: z.string().optional(),
  macRegion: z.string().optional(),
});

type PatientFormData = z.infer<typeof patientFormSchema>;

interface PatientFormProps {
  onSubmit: (data: PatientFormData) => void;
  isLoading: boolean;
  initialData?: Partial<PatientFormData>;
}

const MAC_REGIONS = [
  "Noridian Healthcare Solutions (MAC J-E)",
  "CGS Administrators (MAC J-H)",
  "Novitas Solutions (MAC J-L)",
  "First Coast Service Options (MAC J-N)",
  "Palmetto GBA (MAC J-J)",
  "Wisconsin Physicians Service (MAC J-5)",
];

export default function PatientForm({ onSubmit, isLoading, initialData }: PatientFormProps) {
  const form = useForm<PatientFormData>({
    resolver: zodResolver(patientFormSchema),
    defaultValues: {
      firstName: initialData?.firstName || "",
      lastName: initialData?.lastName || "",
      mrn: initialData?.mrn || "",
      dob: initialData?.dob || "",
      payerType: initialData?.payerType || undefined,
      planName: initialData?.planName || "",
      macRegion: initialData?.macRegion || "",
    },
  });

  const payerType = form.watch("payerType");

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" data-testid="patient-form">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Patient Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name *</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Enter first name" 
                        {...field} 
                        data-testid="input-firstName"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Name *</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Enter last name" 
                        {...field} 
                        data-testid="input-lastName"
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
                name="mrn"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Medical Record Number (MRN) *</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Enter MRN" 
                        {...field} 
                        data-testid="input-mrn"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="dob"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date of Birth</FormLabel>
                    <FormControl>
                      <Input 
                        type="date"
                        {...field} 
                        data-testid="input-dob"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Insurance Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="payerType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Payer Type *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-payerType">
                        <SelectValue placeholder="Select payer type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Original Medicare">Original Medicare</SelectItem>
                      <SelectItem value="Medicare Advantage">Medicare Advantage</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {payerType === "Medicare Advantage" && (
              <FormField
                control={form.control}
                name="planName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Plan Name</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Enter Medicare Advantage plan name" 
                        {...field} 
                        data-testid="input-planName"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="macRegion"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>MAC Region</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-macRegion">
                        <SelectValue placeholder="Select MAC region" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {MAC_REGIONS.map((region) => (
                        <SelectItem key={region} value={region}>
                          {region}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
            data-testid="button-submit-patient"
          >
            {isLoading ? "Creating..." : "Create Patient"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
