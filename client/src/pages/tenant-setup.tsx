import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { insertTenantSchema, type InsertTenant } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Building2, ArrowLeft } from "lucide-react";
import { z } from "zod";

const tenantSetupSchema = insertTenantSchema.extend({
  confirmNpi: z.string().min(10, "NPI must be 10 digits").max(10, "NPI must be 10 digits"),
  confirmTin: z.string().min(9, "TIN must be 9 digits").max(9, "TIN must be 9 digits"),
}).refine((data) => data.npi === data.confirmNpi, {
  message: "NPI confirmation doesn't match",
  path: ["confirmNpi"],
}).refine((data) => data.tin === data.confirmTin, {
  message: "TIN confirmation doesn't match", 
  path: ["confirmTin"],
});

type TenantSetupForm = z.infer<typeof tenantSetupSchema>;

const MAC_REGIONS = [
  { value: "Noridian Healthcare Solutions (MAC J-E)", label: "Noridian (MAC J-E) - AK, AZ, ID, MT, ND, OR, SD, UT, WA, WY" },
  { value: "Noridian Healthcare Solutions (MAC J-F)", label: "Noridian (MAC J-F) - CA, HI, NV, AS, GU" },
  { value: "CGS Administrators (MAC J-H)", label: "CGS (MAC J-H) - IL, IN, KY, MI, MN, OH, WI" },
  { value: "Novitas Solutions (MAC J-L)", label: "Novitas (MAC J-L) - DE, DC, MD, NJ, PA" },
  { value: "Palmetto GBA (MAC J-M)", label: "Palmetto (MAC J-M) - SC, NC, VA, WV" },
  { value: "First Coast Service Options (MAC J-N)", label: "First Coast (MAC J-N) - FL, PR, VI" },
  { value: "WPS Health Solutions (MAC J-5)", label: "WPS (MAC J-5) - IA, KS, MO, NE" },
  { value: "WPS Health Solutions (MAC J-8)", label: "WPS (MAC J-8) - IN, MI" },
  { value: "Cahaba GBA (MAC J-6)", label: "Cahaba (MAC J-6) - AL, GA, TN" },
  { value: "Novitas Solutions (MAC J-12)", label: "Novitas (MAC J-12) - CO, NM, OK, TX, UT" },
  { value: "CGS Administrators (MAC J-15)", label: "CGS (MAC J-15) - CT, MA, ME, NH, RI, VT" },
  { value: "National Government Services (MAC J-6)", label: "NGS (MAC J-6) - CT, IL, MA, ME, MN, NH, NY, RI, VT, WI" }
];

export default function TenantSetup() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<TenantSetupForm>({
    resolver: zodResolver(tenantSetupSchema),
    defaultValues: {
      name: "",
      npi: "",
      confirmNpi: "",
      tin: "",
      confirmTin: "",
      macRegion: "",
      address: "",
      phone: "",
    },
  });

  const createTenantMutation = useMutation({
    mutationFn: async (data: InsertTenant) => {
      return await apiRequest("POST", "/api/tenants", data);
    },
    onSuccess: () => {
      toast({
        title: "Clinic Created Successfully!",
        description: "Your clinic has been set up and you can now manage wound care pre-determinations.",
        variant: "default",
      });
      
      // Invalidate user query to refresh tenants
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      
      // Navigate to dashboard
      setLocation("/");
    },
    onError: (error: any) => {
      console.error("Failed to create tenant:", error);
      toast({
        title: "Failed to Create Clinic",
        description: error.message || "An error occurred while setting up your clinic. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: TenantSetupForm) => {
    // Remove confirmation fields before submitting
    const { confirmNpi, confirmTin, ...tenantData } = data;
    createTenantMutation.mutate(tenantData);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary rounded-xl flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Set Up Your Clinic</h1>
          <p className="text-muted-foreground">
            Create your secure, HIPAA-compliant workspace for wound care pre-determinations
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Clinic Information</CardTitle>
            <CardDescription>
              Enter your clinic details to create your WoundCare Portal workspace. 
              All information is encrypted and stored securely.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Clinic Name *</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="e.g., Advanced Wound Care Center" 
                          data-testid="input-clinic-name"
                          {...field} 
                        />
                      </FormControl>
                      <FormDescription>
                        The official name of your clinic or practice
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="npi"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>NPI Number *</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="1234567890" 
                            maxLength={10}
                            data-testid="input-npi"
                            {...field} 
                          />
                        </FormControl>
                        <FormDescription>10-digit National Provider Identifier</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="confirmNpi"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirm NPI *</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="1234567890" 
                            maxLength={10}
                            data-testid="input-confirm-npi"
                            {...field} 
                          />
                        </FormControl>
                        <FormDescription>Re-enter your NPI to confirm</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="tin"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>TIN Number *</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="123456789" 
                            maxLength={9}
                            data-testid="input-tin"
                            {...field} 
                          />
                        </FormControl>
                        <FormDescription>9-digit Taxpayer Identification Number</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="confirmTin"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirm TIN *</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="123456789" 
                            maxLength={9}
                            data-testid="input-confirm-tin"
                            {...field} 
                          />
                        </FormControl>
                        <FormDescription>Re-enter your TIN to confirm</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="macRegion"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>MAC Region *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-mac-region">
                            <SelectValue placeholder="Select your Medicare Administrative Contractor region" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {MAC_REGIONS.map((region) => (
                            <SelectItem key={region.value} value={region.value}>
                              {region.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Choose the MAC region where your clinic operates for accurate policy compliance
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Clinic Address</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="123 Medical Center Drive&#10;Suite 200&#10;City, State 12345"
                          rows={3}
                          data-testid="textarea-address"
                          {...field} 
                        />
                      </FormControl>
                      <FormDescription>
                        Your clinic's physical address (optional but recommended)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="(555) 123-4567" 
                          data-testid="input-phone"
                          {...field} 
                        />
                      </FormControl>
                      <FormDescription>
                        Your clinic's main phone number (optional)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex flex-col sm:flex-row gap-4 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setLocation("/")}
                    className="sm:w-auto"
                    data-testid="button-back"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back
                  </Button>
                  <Button
                    type="submit"
                    disabled={createTenantMutation.isPending}
                    className="sm:flex-1"
                    data-testid="button-create-clinic"
                  >
                    {createTenantMutation.isPending ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                        Creating Clinic...
                      </>
                    ) : (
                      <>
                        <Building2 className="w-4 h-4 mr-2" />
                        Create My Clinic
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}