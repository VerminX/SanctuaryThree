import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { isUnauthorizedError } from "@/lib/authUtils";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { ChevronLeft, Clock, User, MapPin, Calendar, Activity } from "lucide-react";
import { Episode, Encounter } from "@shared/schema";

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
}

// Tab components
import TimelineMetricsTab from "../components/episodes/tabs/TimelineMetricsTab";
import ConservativeCareTab from "../components/episodes/tabs/ConservativeCareTab";
import DiagnosisTab from "../components/episodes/tabs/DiagnosisTab";
import VascularDiabeticTab from "../components/episodes/tabs/VascularDiabeticTab";
import ProductsTab from "../components/episodes/tabs/ProductsTab";
import ComplianceTab from "../components/episodes/tabs/ComplianceTab";
// Analytics widgets
import EpisodeAnalyticsWidgets from "../components/episodes/analytics-widgets";

export default function EpisodeDetailWorkspace() {
  const { episodeId } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { isAuthenticated, isLoading, user } = useAuth();
  const [activeTab, setActiveTab] = useState("timeline");

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

  // Get episode details
  const { data: episode, isLoading: episodeLoading, error: episodeError } = useQuery<Episode>({
    queryKey: ["/api/episodes", episodeId],
    enabled: !!episodeId && !!currentTenant?.id,
    retry: false,
  });

  // Get encounters for this episode
  const { data: encounters, isLoading: encountersLoading } = useQuery<Encounter[]>({
    queryKey: ["/api/episodes", episodeId, "encounters"],
    enabled: !!episodeId && !!currentTenant?.id,
    retry: false,
  });

  // Get patient details once we have episode data
  const { data: patient, isLoading: patientLoading } = useQuery<DecryptedPatient>({
    queryKey: ["/api/patients", episode?.patientId],
    enabled: !!episode?.patientId,
    retry: false,
  });

  // Handle loading states
  if (isLoading || !isAuthenticated || !currentTenant) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center" data-testid="loading-state">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Handle error states
  if (episodeError) {
    if (isUnauthorizedError(episodeError)) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return null;
    }

    return (
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        <div className="flex-1 flex flex-col">
          <Header title="Episode Details" />
          <div className="flex-1 p-6">
            <div className="text-center" data-testid="error-state">
              <div className="text-red-500 mb-4">
                <Activity className="h-12 w-12 mx-auto" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Episode Not Found</h2>
              <p className="text-muted-foreground mb-4">
                The requested episode could not be found or you don't have access to it.
              </p>
              <Button onClick={() => setLocation("/episodes")} data-testid="button-back-to-episodes">
                <ChevronLeft className="h-4 w-4 mr-2" />
                Back to Episodes
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show loading state while data is being fetched
  if (episodeLoading || patientLoading) {
    return (
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        <div className="flex-1 flex flex-col">
          <Header title="Episode Details" />
          <div className="flex-1 p-6">
            <div className="space-y-4">
              <div className="h-8 bg-muted animate-pulse rounded"></div>
              <div className="h-40 bg-muted animate-pulse rounded"></div>
              <div className="h-60 bg-muted animate-pulse rounded"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      case "resolved":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "chronic":
        return "bg-orange-500/10 text-orange-500 border-orange-500/20";
      default:
        return "bg-gray-500/10 text-gray-500 border-gray-500/20";
    }
  };

  const getWoundTypeColor = (type: string) => {
    switch (type) {
      case "DFU":
        return "bg-chart-1/10 text-chart-1 border-chart-1/20";
      case "VLU":
        return "bg-chart-2/10 text-chart-2 border-chart-2/20";
      case "PU":
        return "bg-chart-3/10 text-chart-3 border-chart-3/20";
      default:
        return "bg-chart-4/10 text-chart-4 border-chart-4/20";
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header title="Episode Details" />
        <div className="flex-1 p-6 space-y-6">
          {/* Breadcrumb Navigation */}
          <div className="flex items-center justify-between">
            <Breadcrumb data-testid="breadcrumb-navigation">
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink 
                    href="/episodes" 
                    className="hover:text-foreground"
                    data-testid="link-episodes"
                  >
                    Episodes
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage data-testid="text-current-episode">
                    {episode?.woundType} - {episode?.woundLocation}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            
            <Button 
              variant="outline" 
              onClick={() => setLocation("/episodes")}
              data-testid="button-back-to-episodes"
            >
              <ChevronLeft className="h-4 w-4 mr-2" />
              Back to Episodes
            </Button>
          </div>

          {/* Episode Overview Card */}
          <Card data-testid="card-episode-overview">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-3">
                  <Activity className="h-5 w-5 text-primary" />
                  Episode Overview
                </CardTitle>
                <Badge 
                  variant="outline" 
                  className={getStatusColor(episode?.status || "")}
                  data-testid={`badge-status-${episode?.status}`}
                >
                  {episode?.status?.charAt(0).toUpperCase() + (episode?.status?.slice(1) || "")}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <User className="h-4 w-4" />
                    Patient
                  </div>
                  <div className="font-medium" data-testid="text-patient-name">
                    {patient ? `${patient.firstName} ${patient.lastName}` : 'Loading...'}
                  </div>
                  <div className="text-sm text-muted-foreground" data-testid="text-patient-mrn">
                    MRN: {patient?.mrn || 'Loading...'}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    Wound Type & Location
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant="outline" 
                      className={getWoundTypeColor(episode?.woundType || "")}
                      data-testid={`badge-wound-type-${episode?.woundType}`}
                    >
                      {episode?.woundType}
                    </Badge>
                  </div>
                  <div className="text-sm font-medium" data-testid="text-wound-location">
                    {episode?.woundLocation}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    Episode Duration
                  </div>
                  <div className="font-medium" data-testid="text-episode-start">
                    Started: {episode?.episodeStartDate ? new Date(episode.episodeStartDate).toLocaleDateString() : 'N/A'}
                  </div>
                  {episode?.episodeEndDate && (
                    <div className="text-sm text-muted-foreground" data-testid="text-episode-end">
                      Ended: {new Date(episode.episodeEndDate).toLocaleDateString()}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    Encounters
                  </div>
                  <div className="font-medium" data-testid="text-encounter-count">
                    {encounters?.length || 0} Total
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {encounters?.filter(e => new Date(e.date) >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).length || 0} in last 30 days
                  </div>
                </div>
              </div>

              {episode?.primaryDiagnosis && (
                <div className="mt-6 pt-6 border-t">
                  <div className="space-y-2">
                    <div className="text-sm text-muted-foreground">Primary Diagnosis</div>
                    <div className="font-medium" data-testid="text-primary-diagnosis">
                      {episode.primaryDiagnosis}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Analytics Widgets Section */}
          <EpisodeAnalyticsWidgets
            episodeId={episodeId!}
            episode={episode}
            encounters={encounters || []}
            isLoading={episodeLoading || encountersLoading || patientLoading}
          />

          {/* Tabbed Interface */}
          <Card data-testid="card-episode-tabs">
            <CardContent className="p-0">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <div className="border-b">
                  <TabsList className="grid w-full grid-cols-6 h-auto p-1" data-testid="tabs-list">
                    <TabsTrigger 
                      value="timeline" 
                      className="flex flex-col p-3 text-xs"
                      data-testid="tab-timeline"
                    >
                      <Activity className="h-4 w-4 mb-1" />
                      Timeline & Metrics
                    </TabsTrigger>
                    <TabsTrigger 
                      value="conservative" 
                      className="flex flex-col p-3 text-xs"
                      data-testid="tab-conservative"
                    >
                      <Clock className="h-4 w-4 mb-1" />
                      Conservative Care
                    </TabsTrigger>
                    <TabsTrigger 
                      value="diagnosis" 
                      className="flex flex-col p-3 text-xs"
                      data-testid="tab-diagnosis"
                    >
                      <User className="h-4 w-4 mb-1" />
                      Diagnosis
                    </TabsTrigger>
                    <TabsTrigger 
                      value="vascular" 
                      className="flex flex-col p-3 text-xs"
                      data-testid="tab-vascular"
                    >
                      <Activity className="h-4 w-4 mb-1" />
                      Vascular & Diabetic
                    </TabsTrigger>
                    <TabsTrigger 
                      value="products" 
                      className="flex flex-col p-3 text-xs"
                      data-testid="tab-products"
                    >
                      <MapPin className="h-4 w-4 mb-1" />
                      Products
                    </TabsTrigger>
                    <TabsTrigger 
                      value="compliance" 
                      className="flex flex-col p-3 text-xs"
                      data-testid="tab-compliance"
                    >
                      <Calendar className="h-4 w-4 mb-1" />
                      Compliance
                    </TabsTrigger>
                  </TabsList>
                </div>

                <div className="p-6">
                  <TabsContent value="timeline" className="mt-0" data-testid="tab-content-timeline">
                    <TimelineMetricsTab 
                      episode={episode} 
                      encounters={encounters || []} 
                      patient={patient}
                      isLoading={encountersLoading}
                    />
                  </TabsContent>

                  <TabsContent value="conservative" className="mt-0" data-testid="tab-content-conservative">
                    <ConservativeCareTab 
                      episode={episode} 
                      encounters={encounters || []} 
                      patient={patient}
                      isLoading={encountersLoading}
                    />
                  </TabsContent>

                  <TabsContent value="diagnosis" className="mt-0" data-testid="tab-content-diagnosis">
                    <DiagnosisTab 
                      episode={episode} 
                      encounters={encounters || []} 
                      patient={patient}
                      isLoading={encountersLoading}
                    />
                  </TabsContent>

                  <TabsContent value="vascular" className="mt-0" data-testid="tab-content-vascular">
                    <VascularDiabeticTab 
                      episode={episode} 
                      encounters={encounters || []} 
                      patient={patient}
                      isLoading={encountersLoading}
                    />
                  </TabsContent>

                  <TabsContent value="products" className="mt-0" data-testid="tab-content-products">
                    <ProductsTab 
                      episode={episode} 
                      encounters={encounters || []} 
                      patient={patient}
                      isLoading={encountersLoading}
                    />
                  </TabsContent>

                  <TabsContent value="compliance" className="mt-0" data-testid="tab-content-compliance">
                    <ComplianceTab 
                      episode={episode} 
                      encounters={encounters || []} 
                      patient={patient}
                      isLoading={encountersLoading}
                    />
                  </TabsContent>
                </div>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}