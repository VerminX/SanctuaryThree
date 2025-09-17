import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import DocumentGenerator from "@/components/documents/document-generator";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, Download, Search, Filter, File } from "lucide-react";

export default function Documents() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading, user } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");

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

  // Get patients with eligibility checks
  const { data: patientsWithEligibility, isLoading: eligibilityLoading } = useQuery({
    queryKey: ["/api/patients-with-eligibility"],
    queryFn: async () => {
      if (!patients || !Array.isArray(patients) || patients.length === 0) return [];
      
      const patientsPromises = patients.map(async (patient: any) => {
        try {
          // Get encounters for patient
          const encountersResponse = await fetch(`/api/patients/${patient.id}/encounters`, {
            credentials: "include",
          });
          
          let eligibilityChecks: any[] = [];
          if (encountersResponse.ok) {
            const encounters = await encountersResponse.json();
            
            // Get eligibility checks for each encounter
            if (Array.isArray(encounters)) {
              const checkPromises = encounters.map(async (encounter: any) => {
                try {
                  // Get eligibility checks for this encounter
                  const eligibilityResponse = await fetch(`/api/encounters/${encounter.id}/eligibility-checks`, {
                    credentials: "include",
                  });
                  if (eligibilityResponse.ok) {
                    return await eligibilityResponse.json();
                  }
                  return [];
                } catch (error) {
                  return [];
                }
              });
              
              const checkArrays = await Promise.all(checkPromises);
              eligibilityChecks = checkArrays.flat();
            }
          }
          
          return {
            id: patient.id,
            name: `${patient.firstName} ${patient.lastName}`,
            mrn: patient.mrn,
            eligibilityChecks,
          };
        } catch (error) {
          return {
            id: patient.id,
            name: `${patient.firstName || ''} ${patient.lastName || ''}`,
            mrn: patient.mrn || '',
            eligibilityChecks: [],
          };
        }
      });
      
      return await Promise.all(patientsPromises);
    },
    enabled: !!patients && Array.isArray(patients) && patients.length > 0,
    retry: false,
  });

  // Get all documents
  const { data: allDocuments, isLoading: documentsLoading } = useQuery({
    queryKey: ["/api/all-documents"],
    queryFn: async () => {
      if (!patients || !Array.isArray(patients) || patients.length === 0) return [];
      
      const documentPromises = patients.map(async (patient: any) => {
        try {
          const response = await fetch(`/api/patients/${patient.id}/documents`, {
            credentials: "include",
          });
          if (response.ok) {
            const documents = await response.json();
            return Array.isArray(documents) ? documents.map((doc: any) => ({
              ...doc,
              patientName: `${patient.firstName || ''} ${patient.lastName || ''}`,
              patientMrn: patient.mrn || '',
            })) : [];
          }
          return [];
        } catch (error) {
          return [];
        }
      });
      
      const documentArrays = await Promise.all(documentPromises);
      return documentArrays.flat().sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    },
    enabled: !!patients && Array.isArray(patients) && patients.length > 0,
    retry: false,
  });

  const generateDocumentMutation = useMutation({
    mutationFn: async ({ type, patientId, eligibilityCheckId }: { 
      type: 'PreDetermination' | 'LMN'; 
      patientId: string; 
      eligibilityCheckId: string; 
    }) => {
      const response = await apiRequest("POST", `/api/patients/${patientId}/documents`, {
        type,
        eligibilityCheckId,
      });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/all-documents"] });
      toast({
        title: "Document Generated",
        description: "Document has been generated successfully",
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
        title: "Generation Failed",
        description: "Failed to generate document. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleGenerateDocument = async (type: 'PreDetermination' | 'LMN', patientId: string, eligibilityCheckId: string) => {
    await generateDocumentMutation.mutateAsync({ type, patientId, eligibilityCheckId });
  };

  const handleExportDocument = (documentId: string, format: 'PDF' | 'DOCX') => {
    // This would trigger a download in a real implementation
    toast({
      title: "Export Started",
      description: `${format} export has been initiated`,
    });
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

  // Filter documents based on search term
  const filteredDocuments = allDocuments?.filter((doc: any) =>
    doc.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    doc.patientMrn.toLowerCase().includes(searchTerm.toLowerCase()) ||
    doc.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
    doc.title.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const getDocumentTypeColor = (type: string) => {
    switch (type) {
      case "PreDetermination":
        return "bg-primary/10 text-primary border-primary/20";
      case "LMN":
        return "bg-chart-2/10 text-chart-2 border-chart-2/20";
      default:
        return "bg-muted text-muted-foreground border-border";
    }
  };

  // Calculate stats
  const totalDocuments = allDocuments?.length || 0;
  const predeterminationLetters = allDocuments?.filter((d: any) => d.type === 'PreDetermination').length || 0;
  const lmnLetters = allDocuments?.filter((d: any) => d.type === 'LMN').length || 0;
  const thisWeekDocuments = allDocuments?.filter((d: any) => {
    const docDate = new Date(d.createdAt);
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    return docDate >= oneWeekAgo;
  }).length || 0;

  return (
    <div className="min-h-screen flex bg-background" data-testid="page-documents">
      <Sidebar />
      
      <main className="flex-1">
        <Header title="Document Generation" subtitle="Create Pre-Determination letters and Letters of Medical Necessity" />
        
        <div className="p-6 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card data-testid="card-total-documents">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Documents</p>
                    <p className="text-3xl font-bold text-foreground">
                      {documentsLoading ? "--" : totalDocuments}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <FileText className="text-primary text-xl" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-predetermination-letters">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Pre-Determination</p>
                    <p className="text-3xl font-bold text-foreground">
                      {documentsLoading ? "--" : predeterminationLetters}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-chart-1/10 rounded-lg flex items-center justify-center">
                    <File className="text-chart-1 text-xl" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-lmn-letters">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">LMN Letters</p>
                    <p className="text-3xl font-bold text-foreground">
                      {documentsLoading ? "--" : lmnLetters}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-chart-2/10 rounded-lg flex items-center justify-center">
                    <FileText className="text-chart-2 text-xl" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-this-week">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">This Week</p>
                    <p className="text-3xl font-bold text-foreground">
                      {documentsLoading ? "--" : thisWeekDocuments}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-chart-3/10 rounded-lg flex items-center justify-center">
                    <FileText className="text-chart-3 text-xl" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Document Generator */}
          <DocumentGenerator
            patients={patientsWithEligibility || []}
            onGenerateDocument={handleGenerateDocument}
            onExportDocument={handleExportDocument}
            recentDocuments={allDocuments?.slice(0, 5) || []}
            isLoading={generateDocumentMutation.isPending}
          />

          {/* Documents Table */}
          <Card data-testid="card-documents-table">
            <div className="p-6 border-b border-border">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-foreground">Generated Documents</h3>
                <div className="flex items-center space-x-4">
                  <span className="text-sm text-muted-foreground">
                    {filteredDocuments.length} of {allDocuments?.length || 0} documents
                  </span>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                    <Input
                      placeholder="Search documents..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 w-64"
                      data-testid="input-search-documents"
                    />
                  </div>
                  <Button variant="outline" size="sm">
                    <Filter className="h-4 w-4 mr-2" />
                    Filter
                  </Button>
                </div>
              </div>
            </div>
            <CardContent className="p-0">
              {documentsLoading ? (
                <div className="p-6 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                  <p className="text-muted-foreground">Loading documents...</p>
                </div>
              ) : filteredDocuments.length === 0 ? (
                <div className="p-6 text-center">
                  <FileText className="mx-auto h-12 w-12 text-muted-foreground/50" />
                  <h3 className="mt-2 text-sm font-medium text-foreground">No documents found</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {searchTerm ? "Try adjusting your search criteria." : "Generate your first document to get started."}
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Document</TableHead>
                      <TableHead>Patient</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Version</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDocuments.map((document: any) => (
                      <TableRow key={document.id} data-testid={`row-document-${document.id}`}>
                        <TableCell>
                          <div>
                            <div className="font-medium text-foreground">
                              {document.title}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {document.citations?.length || 0} citations
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium text-foreground">
                              {document.patientName}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              MRN: {document.patientMrn}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={getDocumentTypeColor(document.type)}>
                            {document.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(document.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          v{document.version}
                        </TableCell>
                        <TableCell>
                          <div className="flex space-x-2">
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => handleExportDocument(document.id, 'PDF')}
                              data-testid={`button-export-pdf-${document.id}`}
                            >
                              <Download className="h-3 w-3 mr-1" />
                              PDF
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => handleExportDocument(document.id, 'DOCX')}
                              data-testid={`button-export-docx-${document.id}`}
                            >
                              <Download className="h-3 w-3 mr-1" />
                              DOCX
                            </Button>
                          </div>
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
