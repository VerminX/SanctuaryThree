import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { AlertTriangle, CheckCircle, Clock, DollarSign, FileText, Package, Plus, Search, Shield, Star, TrendingUp, XCircle, Zap } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Episode, Encounter, type Product, type ProductLcdCoverage, insertProductApplicationSchema } from "@shared/schema";

// Interface for decrypted patient data
interface DecryptedPatient {
  id: string;
  firstName: string;
  lastName: string;
  mrn: string;
  tenantId: string;
  payerType: string;
  planName?: string;
  macRegion?: string;
  dob?: string; // Fixed field name to match decryption service
}

interface ProductsTabProps {
  episode?: Episode;
  encounters: Encounter[];
  patient?: DecryptedPatient;
  isLoading: boolean;
}

// Product Application Form Schema - Remove applicantUserId since server derives it from auth
const productApplicationFormSchema = insertProductApplicationSchema
  .omit({ applicantUserId: true })
  .extend({
    clinicalJustification: z.string().min(50, "Clinical justification must be at least 50 characters"),
    medicalNecessity: z.string().min(30, "Medical necessity documentation required"),
    woundSize: z.number().min(0, "Wound size must be positive"),
    woundDepth: z.number().min(0, "Wound depth must be positive"),
    diagnosisCodes: z.array(z.string()).min(1, "At least one diagnosis code required"),
  });

type ProductApplicationForm = z.infer<typeof productApplicationFormSchema>;

export default function ProductsTab({ episode, encounters, patient, isLoading }: ProductsTabProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showApplicationForm, setShowApplicationForm] = useState(false);

  // Form for product application - Initialize with empty values to prevent validation errors
  const form = useForm<ProductApplicationForm>({
    resolver: zodResolver(productApplicationFormSchema),
    defaultValues: {
      episodeId: "",
      patientId: "",
      tenantId: "",
      clinicalJustification: "",
      medicalNecessity: "",
      woundSize: 0,
      woundDepth: 0,
      diagnosisCodes: [episode?.primaryDiagnosis].filter(Boolean),
      urgencyLevel: "routine",
      status: "pending"
    }
  });

  // Update form when episode/patient data loads
  useEffect(() => {
    if (episode && patient) {
      form.reset({
        episodeId: episode.id,
        patientId: patient.id,
        tenantId: patient.tenantId,
        clinicalJustification: "",
        medicalNecessity: "",
        woundSize: 0,
        woundDepth: 0,
        diagnosisCodes: [episode.primaryDiagnosis].filter(Boolean),
        urgencyLevel: "routine",
        status: "pending"
      });
    }
  }, [episode, patient, form]);

  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="products-loading">
        <div className="h-8 bg-muted animate-pulse rounded"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="h-40 bg-muted animate-pulse rounded"></div>
          <div className="h-40 bg-muted animate-pulse rounded"></div>
          <div className="h-40 bg-muted animate-pulse rounded"></div>
        </div>
        <div className="h-60 bg-muted animate-pulse rounded"></div>
      </div>
    );
  }

  // Query for product search
  const { data: productSearchResults, isLoading: isSearching } = useQuery({
    queryKey: ['/api/products/search', {
      category: selectedCategory,
      woundTypes: episode?.woundType ? [episode.woundType] : undefined,
      tenantId: patient?.tenantId
    }],
    queryFn: async () => {
      if (!patient?.tenantId) return { products: [] };
      
      const params = new URLSearchParams();
      if (selectedCategory) params.append('category', selectedCategory);
      if (episode?.woundType) params.append('woundTypes', episode.woundType);
      params.append('tenantId', patient.tenantId);
      
      const response = await fetch(`/api/products/search?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch products');
      return response.json();
    },
    enabled: !!patient?.tenantId
  });

  // Query for existing product applications
  const { data: existingApplications, isLoading: isLoadingApplications } = useQuery({
    queryKey: ['/api/episodes', episode?.id, 'product-applications'],
    queryFn: async () => {
      if (!episode?.id) return { applications: [] };
      
      const response = await fetch(`/api/episodes/${episode.id}/product-applications`);
      if (!response.ok) throw new Error('Failed to fetch applications');
      return response.json();
    },
    enabled: !!episode?.id
  });

  // Query for product recommendations
  const { data: recommendations, isLoading: isLoadingRecommendations } = useQuery({
    queryKey: ['/api/products/recommendations'],
    queryFn: async () => {
      if (!episode?.woundType || !patient?.tenantId) return [];
      
      const latestEncounter = [...encounters]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
      
      const woundSize = latestEncounter?.woundDetails?.size || 5; // Default size
      const diagnosisCodes = [episode.primaryDiagnosis].filter(Boolean);
      
      const response = await fetch('/api/products/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          woundType: episode.woundType,
          woundSize,
          diagnosisCodes,
          patientFactors: {
            age: calculateAge(patient?.dob),
            diabetic: latestEncounter?.diabeticStatus === 'diabetic',
          },
          tenantId: patient.tenantId
        })
      });
      
      if (!response.ok) throw new Error('Failed to fetch recommendations');
      const result = await response.json();
      return result.recommendations || [];
    },
    enabled: !!episode?.woundType && !!patient?.tenantId
  });

  // Product Application Mutation
  const createApplicationMutation = useMutation({
    mutationFn: async (data: ProductApplicationForm) => {
      const response = await fetch('/api/products/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      
      if (!response.ok) throw new Error('Failed to submit application');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/episodes', episode?.id, 'product-applications'] });
      queryClient.invalidateQueries({ queryKey: ['/api/products/search'] });
      queryClient.invalidateQueries({ queryKey: ['/api/products/recommendations'] });
      toast({
        title: "Application Submitted",
        description: "Product application has been submitted for review."
      });
      setShowApplicationForm(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Submission Failed", 
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Extract procedure codes from encounters (these often include products/supplies)
  const allProcedureCodes = encounters
    .filter(encounter => encounter.procedureCodes)
    .reduce((acc: any[], encounter) => {
      if (encounter.procedureCodes && Array.isArray(encounter.procedureCodes)) {
        encounter.procedureCodes.forEach((code: any) => {
          acc.push({
            ...code,
            date: encounter.date,
            encounterId: encounter.id
          });
        });
      }
      return acc;
    }, [])
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Filtered products based on search
  const filteredProducts = useMemo(() => {
    if (!productSearchResults?.products) return [];
    
    return productSearchResults.products.filter((product: Product) => {
      const matchesSearch = !searchQuery || 
        product.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.hcpcsCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.manufacturerName.toLowerCase().includes(searchQuery.toLowerCase());
      
      return matchesSearch;
    });
  }, [productSearchResults?.products, searchQuery]);

  // Helper function to calculate age safely
  const calculateAge = (dob?: string) => {
    if (!dob || typeof dob !== 'string') return undefined;
    
    try {
      const today = new Date();
      const birthDate = new Date(dob);
      
      // Validate the date is valid
      if (isNaN(birthDate.getTime())) {
        console.warn('Invalid date of birth provided to calculateAge:', dob);
        return undefined;
      }
      
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDifference = today.getMonth() - birthDate.getMonth();
      
      // Adjust age if birthday hasn't occurred this year
      if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      
      // Sanity check for reasonable age range (0-150)
      if (age < 0 || age > 150) {
        console.warn('Calculated age outside reasonable range:', age, 'for DOB:', dob);
        return undefined;
      }
      
      return age;
    } catch (error) {
      console.error('Error calculating age for DOB:', dob, error);
      return undefined;
    }
  };

  // Handle product application submission
  const handleSubmitApplication = (data: ProductApplicationForm) => {
    createApplicationMutation.mutate(data);
  };

  return (
    <div className="space-y-6" data-testid="products-tab">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Package className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Product Application Workflow</h3>
        </div>
        <Button 
          onClick={() => setShowApplicationForm(true)}
          className="flex items-center gap-2"
          data-testid="button-new-application"
        >
          <Plus className="h-4 w-4" />
          New Application
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4" data-testid="tabs-list">
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="catalog" data-testid="tab-catalog">Product Catalog</TabsTrigger>
          <TabsTrigger value="applications" data-testid="tab-applications">Applications</TabsTrigger>
          <TabsTrigger value="recommendations" data-testid="tab-recommendations">Recommendations</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6" data-testid="content-overview">

          {/* Episode Summary & Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card data-testid="card-episode-summary">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Episode Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="text-lg font-semibold" data-testid="text-wound-type">
                    {episode?.woundType || 'Not specified'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {episode?.woundLocation || 'Location not specified'}
                  </div>
                  <Badge variant={episode?.status === 'active' ? 'default' : 'secondary'} data-testid="badge-episode-status">
                    {episode?.status || 'Unknown'}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-applications-count">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Applications
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-applications-count">
                  {existingApplications?.applications?.length || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  Submitted this episode
                </p>
              </CardContent>
            </Card>

            <Card data-testid="card-coverage-status">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Coverage Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="text-sm font-medium" data-testid="text-coverage-status">
                    {patient?.payerType === 'Original Medicare' ? 'Medicare Eligible' : 'Verify Coverage'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  MAC Region: {patient?.macRegion || 'Unknown'}
                </p>
              </CardContent>
            </Card>

            <Card data-testid="card-conservative-care">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Conservative Care
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  {encounters.length >= 4 ? (
                    <>
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span className="text-sm font-medium" data-testid="text-conservative-status">
                        Compliant
                      </span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                      <span className="text-sm font-medium" data-testid="text-conservative-status">
                        {encounters.length}/4 weeks
                      </span>
                    </>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  30-day requirement
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Recent Applications */}
          <Card data-testid="card-recent-applications">
            <CardHeader>
              <CardTitle>Recent Product Applications</CardTitle>
              <CardDescription>
                Latest product applications for this episode
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingApplications ? (
                <div className="space-y-3">
                  <div className="h-16 bg-muted animate-pulse rounded"></div>
                  <div className="h-16 bg-muted animate-pulse rounded"></div>
                </div>
              ) : existingApplications?.applications?.length > 0 ? (
                <div className="space-y-4" data-testid="applications-list">
                  {existingApplications.applications.slice(0, 3).map((app: any, index: number) => (
                    <div 
                      key={app.id} 
                      className="border rounded-lg p-4"
                      data-testid={`application-item-${index}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-medium" data-testid={`application-product-${index}`}>
                              {app.productId || 'Unknown Product'}
                            </span>
                            <Badge 
                              variant={app.status === 'approved' ? 'default' : 
                                      app.status === 'rejected' ? 'destructive' : 'secondary'}
                              data-testid={`application-status-${index}`}
                            >
                              {app.status}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">
                            {app.clinicalJustification?.slice(0, 100)}...
                          </p>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span data-testid={`application-date-${index}`}>
                              Applied: {new Date(app.applicationDate).toLocaleDateString()}
                            </span>
                            <span data-testid={`application-urgency-${index}`}>
                              Urgency: {app.urgencyLevel}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground" data-testid="no-applications">
                  <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No product applications submitted yet.</p>
                  <Button 
                    variant="outline" 
                    className="mt-4"
                    onClick={() => setActiveTab("catalog")}
                    data-testid="button-browse-products"
                  >
                    Browse Product Catalog
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="catalog" className="space-y-6" data-testid="content-catalog">
          {/* Product Search and Filters */}
          <Card data-testid="card-product-search">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Product Catalog
              </CardTitle>
              <CardDescription>
                Search and browse wound care products with LCD coverage information
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4 mb-6">
                <div className="flex-1">
                  <Label htmlFor="search-products">Search Products</Label>
                  <Input 
                    id="search-products"
                    placeholder="Search by product name, HCPCS code, or manufacturer..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    data-testid="input-product-search"
                  />
                </div>
                <div className="w-48">
                  <Label htmlFor="category-filter">Category</Label>
                  <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger data-testid="select-category">
                      <SelectValue placeholder="All Categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All Categories</SelectItem>
                      <SelectItem value="skin_substitute">Skin Substitutes</SelectItem>
                      <SelectItem value="cellular_tissue">Cellular Tissue</SelectItem>
                      <SelectItem value="advanced_dressing">Advanced Dressings</SelectItem>
                      <SelectItem value="biomaterial">Biomaterials</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Product Results */}
              {isSearching ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="h-32 bg-muted animate-pulse rounded"></div>
                  <div className="h-32 bg-muted animate-pulse rounded"></div>
                  <div className="h-32 bg-muted animate-pulse rounded"></div>
                  <div className="h-32 bg-muted animate-pulse rounded"></div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="products-grid">
                  {filteredProducts.length > 0 ? filteredProducts.map((product: Product, index: number) => (
                    <Card 
                      key={product.id} 
                      className="cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => setSelectedProduct(product)}
                      data-testid={`product-card-${index}`}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-base" data-testid={`product-name-${index}`}>
                              {product.productName}
                            </CardTitle>
                            <CardDescription data-testid={`product-hcpcs-${index}`}>
                              {product.hcpcsCode} • {product.manufacturerName}
                            </CardDescription>
                          </div>
                          <Badge variant="outline" data-testid={`product-category-${index}`}>
                            {product.category}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Star className="h-4 w-4 text-yellow-500" />
                            <span className="text-sm" data-testid={`product-evidence-${index}`}>
                              {product.clinicalEvidenceLevel} Evidence
                            </span>
                          </div>
                          <div className="text-sm font-medium" data-testid={`product-price-${index}`}>
                            ${product.basePrice}
                          </div>
                        </div>
                        <div className="mt-3">
                          <div className="flex flex-wrap gap-1">
                            {product.woundTypeIndications?.slice(0, 3).map((indication: string, i: number) => (
                              <Badge key={i} variant="secondary" className="text-xs" data-testid={`product-indication-${index}-${i}`}>
                                {indication}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )) : (
                    <div className="col-span-2 text-center py-8 text-muted-foreground" data-testid="no-products-found">
                      <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No products found matching your criteria.</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="applications" className="space-y-6" data-testid="content-applications">
          {/* All Applications List */}
          <Card data-testid="card-all-applications">
            <CardHeader>
              <CardTitle>Product Applications</CardTitle>
              <CardDescription>
                All product applications for this episode with status tracking
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingApplications ? (
                <div className="space-y-3">
                  <div className="h-20 bg-muted animate-pulse rounded"></div>
                  <div className="h-20 bg-muted animate-pulse rounded"></div>
                  <div className="h-20 bg-muted animate-pulse rounded"></div>
                </div>
              ) : existingApplications?.applications?.length > 0 ? (
                <div className="space-y-4" data-testid="all-applications-list">
                  {existingApplications.applications.map((app: any, index: number) => (
                    <div 
                      key={app.id} 
                      className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                      data-testid={`full-application-item-${index}`}
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h4 className="font-medium" data-testid={`full-application-product-${index}`}>
                              {app.productId || 'Unknown Product'}
                            </h4>
                            <Badge 
                              variant={app.status === 'approved' ? 'default' : 
                                      app.status === 'rejected' ? 'destructive' : 'secondary'}
                              data-testid={`full-application-status-${index}`}
                            >
                              {app.status}
                            </Badge>
                            <Badge variant="outline" data-testid={`full-application-urgency-${index}`}>
                              {app.urgencyLevel}
                            </Badge>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                            <div>
                              <p className="text-sm font-medium text-muted-foreground">Clinical Justification</p>
                              <p className="text-sm mt-1">{app.clinicalJustification}</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-muted-foreground">Medical Necessity</p>
                              <p className="text-sm mt-1">{app.medicalNecessity}</p>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-6 text-xs text-muted-foreground">
                            <span data-testid={`full-application-date-${index}`}>
                              Applied: {new Date(app.applicationDate).toLocaleDateString()}
                            </span>
                            {app.reviewDate && (
                              <span data-testid={`full-application-review-${index}`}>
                                Reviewed: {new Date(app.reviewDate).toLocaleDateString()}
                              </span>
                            )}
                            {app.expectedDeliveryDate && (
                              <span data-testid={`full-application-delivery-${index}`}>
                                Expected: {new Date(app.expectedDeliveryDate).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {app.status === 'approved' && <CheckCircle className="h-5 w-5 text-green-500" />}
                          {app.status === 'rejected' && <XCircle className="h-5 w-5 text-red-500" />}
                          {app.status === 'pending' && <Clock className="h-5 w-5 text-yellow-500" />}
                        </div>
                      </div>
                      
                      {app.reviewComments && (
                        <div className="mt-3 p-3 bg-muted rounded-lg">
                          <p className="text-sm font-medium text-muted-foreground mb-1">Review Comments</p>
                          <p className="text-sm">{app.reviewComments}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground" data-testid="no-applications-all">
                  <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No product applications found for this episode.</p>
                  <Button 
                    variant="outline" 
                    className="mt-4"
                    onClick={() => setActiveTab("catalog")}
                    data-testid="button-start-application"
                  >
                    Start New Application
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recommendations" className="space-y-6" data-testid="content-recommendations">
          {/* AI-Powered Recommendations */}
          <Card data-testid="card-ai-recommendations">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Clinical Decision Support
              </CardTitle>
              <CardDescription>
                AI-powered product recommendations based on wound characteristics and clinical evidence
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingRecommendations ? (
                <div className="space-y-4">
                  <div className="h-24 bg-muted animate-pulse rounded"></div>
                  <div className="h-24 bg-muted animate-pulse rounded"></div>
                  <div className="h-24 bg-muted animate-pulse rounded"></div>
                </div>
              ) : recommendations?.length > 0 ? (
                <div className="space-y-4" data-testid="recommendations-list">
                  {recommendations.map((rec: any, index: number) => (
                    <div 
                      key={`${rec.product.id}-${index}`} 
                      className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                      data-testid={`recommendation-item-${index}`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h4 className="font-medium" data-testid={`recommendation-name-${index}`}>
                              {rec.product.productName}
                            </h4>
                            <div className="flex items-center gap-1">
                              <TrendingUp className="h-4 w-4 text-green-500" />
                              <span className="text-sm font-medium text-green-600" data-testid={`recommendation-score-${index}`}>
                                {Math.round(rec.recommendationScore * 100)}% Match
                              </span>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
                            <div>
                              <p className="text-sm font-medium text-muted-foreground">Success Rate</p>
                              <p className="text-sm mt-1">{Math.round(rec.successRate * 100)}%</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-muted-foreground">Cost Effectiveness</p>
                              <p className="text-sm mt-1">{rec.costEffectiveness === 1 ? 'Excellent' : rec.costEffectiveness > 0.7 ? 'Good' : 'Fair'}</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-muted-foreground">Evidence Level</p>
                              <p className="text-sm mt-1">{rec.product.clinicalEvidenceLevel}</p>
                            </div>
                          </div>
                          
                          <div className="mb-3">
                            <p className="text-sm font-medium text-muted-foreground mb-1">Recommendation Reasons</p>
                            <div className="flex flex-wrap gap-1">
                              {rec.reasons.slice(0, 3).map((reason: string, i: number) => (
                                <Badge key={i} variant="secondary" className="text-xs" data-testid={`recommendation-reason-${index}-${i}`}>
                                  {reason}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          
                          {rec.contraindications.length > 0 && (
                            <div className="mb-3">
                              <p className="text-sm font-medium text-red-600 mb-1">⚠️ Contraindications</p>
                              <div className="flex flex-wrap gap-1">
                                {rec.contraindications.slice(0, 2).map((contra: string, i: number) => (
                                  <Badge key={i} variant="destructive" className="text-xs" data-testid={`recommendation-contraindication-${index}-${i}`}>
                                    {contra}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        <Button 
                          size="sm"
                          onClick={() => {
                            setSelectedProduct(rec.product);
                            setShowApplicationForm(true);
                          }}
                          data-testid={`button-apply-recommendation-${index}`}
                        >
                          Apply
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground" data-testid="no-recommendations">
                  <Zap className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No recommendations available.</p>
                  <p className="text-sm mt-1">Complete episode data to get personalized product recommendations.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Product Application Dialog */}
      <Dialog open={showApplicationForm} onOpenChange={setShowApplicationForm}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="dialog-product-application">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Product Application
            </DialogTitle>
            <DialogDescription>
              Submit a new product application with clinical justification and medical necessity documentation
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmitApplication)} className="space-y-6" data-testid="form-product-application">
              {selectedProduct && (
                <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                  <h4 className="font-medium mb-2" data-testid="selected-product-name">
                    {selectedProduct.productName}
                  </h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">HCPCS Code:</span>
                      <span className="ml-2 font-mono" data-testid="selected-product-hcpcs">{selectedProduct.hcpcsCode}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Manufacturer:</span>
                      <span className="ml-2" data-testid="selected-product-manufacturer">{selectedProduct.manufacturerName}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Category:</span>
                      <span className="ml-2" data-testid="selected-product-category">{selectedProduct.category}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Base Price:</span>
                      <span className="ml-2 font-medium" data-testid="selected-product-price">${selectedProduct.basePrice}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="clinicalJustification"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Clinical Justification *</FormLabel>
                        <FormControl>
                          <Textarea 
                            {...field} 
                            placeholder="Provide detailed clinical justification for this product application..."
                            className="min-h-32"
                            data-testid="textarea-clinical-justification"
                          />
                        </FormControl>
                        <FormDescription>
                          Minimum 50 characters required. Include wound characteristics, treatment history, and clinical rationale.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="medicalNecessity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Medical Necessity Documentation *</FormLabel>
                        <FormControl>
                          <Textarea 
                            {...field} 
                            placeholder="Document medical necessity for Medicare coverage..."
                            className="min-h-24"
                            data-testid="textarea-medical-necessity"
                          />
                        </FormControl>
                        <FormDescription>
                          Explain why this product is medically necessary for patient care and healing outcomes.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="woundSize"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Wound Size (cm²)</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              type="number"
                              step="0.1"
                              min="0"
                              onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                              data-testid="input-wound-size"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="woundDepth"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Wound Depth (mm)</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              type="number"
                              step="0.1"
                              min="0"
                              onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
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
                    name="urgencyLevel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Urgency Level</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-urgency">
                              <SelectValue placeholder="Select urgency level" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="routine">Routine</SelectItem>
                            <SelectItem value="urgent">Urgent</SelectItem>
                            <SelectItem value="stat">STAT</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="p-3 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-medium text-yellow-800 dark:text-yellow-300">LCD Compliance Check</p>
                        <p className="text-yellow-700 dark:text-yellow-400 mt-1">
                          Application will be automatically validated against Medicare LCD coverage criteria for {patient?.macRegion || 'your'} MAC region.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-6 border-t">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setShowApplicationForm(false)}
                  data-testid="button-cancel-application"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={createApplicationMutation.isPending}
                  data-testid="button-submit-application"
                >
                  {createApplicationMutation.isPending ? 'Submitting...' : 'Submit Application'}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}