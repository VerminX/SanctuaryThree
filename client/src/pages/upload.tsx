import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, FileUp, Upload, AlertCircle, Clock, FileText, ArrowLeft, Users, Calendar, Brain, CreditCard, Code, Heart, Activity, Footprints } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { DataQualityIndicator } from "@/components/data-quality/data-quality-indicator";
import { Link } from "wouter";

interface FileUpload {
  id: string;
  filename: string;
  status: 'uploaded' | 'processing' | 'processed' | 'data_extracted' | 'failed' | 'extraction_failed';
  uploadedAt: string;
  fileSize: number;
  processingError?: string;
}

interface UploadsResponse {
  uploads: FileUpload[];
}

interface ExtractionResult {
  extractionId: string;
  confidence: number;
  validationScore: number;
  isComplete: boolean;
  missingFields: string[];
  warnings: string[];
  patientData: {
    mrn?: string;
    firstName?: string;
    lastName?: string;
    dateOfBirth?: string;
    payerType?: string;
    planName?: string;
    insuranceId?: string;
    // Secondary insurance fields
    secondaryPayerType?: string;
    secondaryPlanName?: string;
    secondaryInsuranceId?: string;
    macRegion?: string;
    phoneNumber?: string;
    address?: string;
  };
  encounterData: {
    encounterDate?: string;
    notes?: string[];
    woundDetails?: any;
    conservativeCare?: any;
    infectionStatus?: string;
    procedureCodes?: Array<{
      code: string;
      description?: string;
      modifier?: string;
      units?: number;
    }>;
    vascularAssessment?: {
      dorsalisPedis?: string;
      posteriorTibial?: string;
      capillaryRefill?: string;
      edema?: string;
      varicosities?: string;
    };
    functionalStatus?: {
      selfCare?: string;
      mobility?: string;
      assistiveDevice?: string;
      adlScore?: number;
    };
    diabeticStatus?: string;
    comorbidities?: string[];
    assessment?: string;
    plan?: string;
  }[];
  canCreateRecords: boolean;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'uploaded': return 'bg-blue-100 text-blue-800';
    case 'processing': return 'bg-yellow-100 text-yellow-800';
    case 'processed': return 'bg-green-100 text-green-800';
    case 'data_extracted': return 'bg-purple-100 text-purple-800';
    case 'failed':
    case 'extraction_failed': return 'bg-red-100 text-red-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'uploaded': return <FileUp className="w-4 h-4" />;
    case 'processing': return <Clock className="w-4 h-4 animate-spin" />;
    case 'processed': 
    case 'data_extracted': return <CheckCircle className="w-4 h-4" />;
    case 'failed':
    case 'extraction_failed': return <AlertCircle className="w-4 h-4" />;
    default: return <FileText className="w-4 h-4" />;
  }
};

export default function UploadPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [extractionResults, setExtractionResults] = useState<Record<string, ExtractionResult>>({});
  const [createdRecords, setCreatedRecords] = useState<Record<string, {patientId: string, encounterIds: string[], episodeId?: string, wasNewPatient: boolean, wasNewEpisode?: boolean}>>({});

  // Fetch recent uploads
  const { data: uploads, refetch: refetchUploads } = useQuery<UploadsResponse>({
    queryKey: ['/api/uploads'],
    enabled: !!user
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('pdf', file);
      
      const response = await fetch(`/api/upload/pdf`, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Upload failed with status ${response.status}`);
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "File uploaded successfully",
        description: `${data.fileUpload.filename} has been uploaded and is ready for processing.`
      });
      refetchUploads();
      setSelectedFiles([]);
    },
    onError: (error: any) => {
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload file",
        variant: "destructive"
      });
    }
  });

  // Text extraction mutation
  const extractTextMutation = useMutation({
    mutationFn: async (uploadId: string) => {
      const response = await apiRequest('POST', `/api/upload/${uploadId}/extract-text`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Text extraction completed",
        description: "PDF text has been extracted successfully."
      });
      refetchUploads();
    },
    onError: (error: any) => {
      // Handle duplicate processing gracefully
      if (error.message?.includes("File is not ready for text extraction") || error.message?.includes("already processed")) {
        toast({
          title: "Text already extracted",
          description: "This file has already been processed. You can proceed to data extraction.",
          variant: "default"
        });
        refetchUploads(); // Refresh to show correct state
      } else {
        toast({
          title: "Text extraction failed",
          description: error.message || "Failed to extract text from PDF",
          variant: "destructive"
        });
      }
    }
  });

  // AI data extraction mutation  
  const extractDataMutation = useMutation({
    mutationFn: async (uploadId: string): Promise<ExtractionResult> => {
      const response = await apiRequest('POST', `/api/upload/${uploadId}/extract-data`);
      return response.json();
    },
    onSuccess: (data: ExtractionResult, uploadId) => {
      setExtractionResults(prev => ({ ...prev, [uploadId]: data }));
      toast({
        title: "Data extraction completed",
        description: `Extracted patient data with ${Math.round(data.confidence * 100)}% confidence.`
      });
      refetchUploads();
    },
    onError: (error: any) => {
      toast({
        title: "Data extraction failed", 
        description: error.message || "Failed to extract structured data",
        variant: "destructive"
      });
    }
  });

  // Create records mutation
  const createRecordsMutation = useMutation({
    mutationFn: async (uploadId: string) => {
      const response = await apiRequest('POST', `/api/upload/${uploadId}/create-records`);
      return response.json();
    },
    onSuccess: (data, uploadId) => {
      // Store the created record information - handle both new multi-encounter and legacy single encounter format
      const encounterIds = data.encounterIds || (data.encounterId ? [data.encounterId] : []);
      const encountersCreated = data.encountersCreated || encounterIds.length || 1;
      
      setCreatedRecords(prev => ({
        ...prev,
        [uploadId]: {
          patientId: data.patientId,
          encounterIds: encounterIds,
          episodeId: data.episodeId,
          wasNewPatient: data.wasNewPatient,
          wasNewEpisode: data.wasNewEpisode
        }
      }));
      refetchUploads();
      
      const patientText = data.wasNewPatient ? "New patient created" : "Existing patient updated";
      const encounterText = encountersCreated > 1 ? `${encountersCreated} encounter records` : "encounter record";
      const episodeText = data.wasNewEpisode && data.episodeId ? ` Episode ID: ${data.episodeId}` : "";
      
      toast({
        title: "Records Created Successfully",
        description: `${patientText} and ${encounterText} added. Patient ID: ${data.patientId}${episodeText}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Create Records",
        description: error.message || "Failed to create patient and encounter records",
        variant: "destructive",
      });
    }
  });

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const pdfFiles = acceptedFiles.filter(file => file.type === 'application/pdf');
    if (pdfFiles.length !== acceptedFiles.length) {
      toast({
        title: "Invalid files",
        description: "Only PDF files are allowed.",
        variant: "destructive"
      });
    }
    setSelectedFiles(pdfFiles);
  }, [toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf']
    },
    maxFiles: 5,
    maxSize: 10 * 1024 * 1024 // 10MB
  });

  const handleUpload = () => {
    selectedFiles.forEach(file => {
      uploadMutation.mutate(file);
    });
  };

  const handleExtractText = (uploadId: string) => {
    extractTextMutation.mutate(uploadId);
  };

  const handleExtractData = (uploadId: string) => {
    extractDataMutation.mutate(uploadId);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">PDF Upload & Data Extraction</h1>
          <p className="text-gray-600 dark:text-gray-300 mt-2">
            Upload patient registration forms and medical records to automatically extract patient and encounter data.
          </p>
        </div>
        <Link href="/">
          <Button variant="outline" className="flex items-center gap-2" data-testid="back-to-dashboard">
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Button>
        </Link>
      </div>

      {/* Upload Area */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Upload PDF Files
          </CardTitle>
          <CardDescription>
            Drag and drop PDF files here, or click to browse. Maximum file size: 10MB per file.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              isDragActive 
                ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20' 
                : 'border-gray-300 hover:border-gray-400'
            }`}
            data-testid="upload-dropzone"
          >
            <input {...getInputProps()} data-testid="file-input" />
            <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            {isDragActive ? (
              <p className="text-lg text-blue-600">Drop PDF files here...</p>
            ) : (
              <>
                <p className="text-lg text-gray-600 dark:text-gray-300">
                  Drag & drop PDF files here, or click to select
                </p>
                <p className="text-sm text-gray-400 mt-2">
                  Supports PDF files up to 10MB each
                </p>
              </>
            )}
          </div>

          {selectedFiles.length > 0 && (
            <div className="mt-4 space-y-2">
              <h3 className="font-medium text-gray-900 dark:text-white">Selected Files:</h3>
              {selectedFiles.map((file, index) => (
                <div key={index} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    <span className="text-sm">{file.name}</span>
                    <Badge variant="outline">{(file.size / 1024 / 1024).toFixed(2)} MB</Badge>
                  </div>
                </div>
              ))}
              <Button 
                onClick={handleUpload} 
                disabled={uploadMutation.isPending}
                className="w-full mt-4"
                data-testid="upload-button"
              >
                {uploadMutation.isPending ? 'Uploading...' : 'Upload Files'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Uploads */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Uploads</CardTitle>
          <CardDescription>
            Track the progress of your uploaded files and extracted data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {uploads?.uploads && Array.isArray(uploads.uploads) && uploads.uploads.length > 0 ? (
            <div className="space-y-4">
              {uploads.uploads.map((upload: FileUpload) => (
                <div key={upload.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(upload.status)}
                      <div>
                        <h3 className="font-medium" data-testid={`filename-${upload.id}`}>
                          {upload.filename}
                        </h3>
                        <p className="text-sm text-gray-500">
                          Uploaded {new Date(upload.uploadedAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <Badge className={getStatusColor(upload.status)} data-testid={`status-${upload.id}`}>
                      {upload.status.replace('_', ' ')}
                    </Badge>
                  </div>

                  {upload.processingError && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{upload.processingError}</AlertDescription>
                    </Alert>
                  )}

                  {/* Workflow Steps Indicator */}
                  <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">Processing Workflow</h4>
                    <div className="flex items-center gap-4 text-sm">
                      <div className={`flex items-center gap-2 ${
                        upload.status === 'uploaded' ? 'text-blue-600 dark:text-blue-400 font-medium' : 
                        upload.status === 'processed' || extractionResults[upload.id] ? 'text-green-600 dark:text-green-400' : 
                        'text-gray-400'
                      }`}>
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                          upload.status === 'uploaded' ? 'bg-blue-100 dark:bg-blue-800 text-blue-600 dark:text-blue-300' :
                          upload.status === 'processed' || extractionResults[upload.id] ? 'bg-green-100 dark:bg-green-800 text-green-600 dark:text-green-300' :
                          'bg-gray-100 dark:bg-gray-700 text-gray-500'
                        }`}>
                          {upload.status === 'processed' || extractionResults[upload.id] ? '✓' : '1'}
                        </div>
                        Step 1: Extract Text
                      </div>
                      <div className="w-8 h-px bg-gray-300 dark:bg-gray-600"></div>
                      <div className={`flex items-center gap-2 ${
                        upload.status === 'processed' && !extractionResults[upload.id] ? 'text-blue-600 dark:text-blue-400 font-medium' :
                        extractionResults[upload.id] ? 'text-green-600 dark:text-green-400' :
                        'text-gray-400'
                      }`}>
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                          upload.status === 'processed' && !extractionResults[upload.id] ? 'bg-blue-100 dark:bg-blue-800 text-blue-600 dark:text-blue-300' :
                          extractionResults[upload.id] ? 'bg-green-100 dark:bg-green-800 text-green-600 dark:text-green-300' :
                          'bg-gray-100 dark:bg-gray-700 text-gray-500'
                        }`}>
                          {extractionResults[upload.id] ? '✓' : '2'}
                        </div>
                        Step 2: AI Analysis
                      </div>
                      <div className="w-8 h-px bg-gray-300 dark:bg-gray-600"></div>
                      <div className={`flex items-center gap-2 ${
                        extractionResults[upload.id] && extractionResults[upload.id].canCreateRecords ? 'text-blue-600 dark:text-blue-400 font-medium' :
                        createdRecords[upload.id] ? 'text-green-600 dark:text-green-400' :
                        'text-gray-400'
                      }`}>
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                          extractionResults[upload.id] && extractionResults[upload.id].canCreateRecords ? 'bg-blue-100 dark:bg-blue-800 text-blue-600 dark:text-blue-300' :
                          createdRecords[upload.id] ? 'bg-green-100 dark:bg-green-800 text-green-600 dark:text-green-300' :
                          'bg-gray-100 dark:bg-gray-700 text-gray-500'
                        }`}>
                          {createdRecords[upload.id] ? '✓' : '3'}
                        </div>
                        Step 3: Create Records
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    {upload.status === 'uploaded' && (
                      <Button
                        size="sm"
                        onClick={() => handleExtractText(upload.id)}
                        disabled={extractTextMutation.isPending}
                        data-testid={`extract-text-${upload.id}`}
                        className="flex items-center gap-2"
                      >
                        {extractTextMutation.isPending ? (
                          <>
                            <Clock className="w-4 h-4 animate-spin" />
                            Step 1: Extracting Text...
                          </>
                        ) : (
                          <>
                            <FileText className="w-4 h-4" />
                            Step 1: Extract Text from PDF
                          </>
                        )}
                      </Button>
                    )}
                    
                    {upload.status === 'processed' && !extractionResults[upload.id] && (
                      <Button
                        size="sm"
                        onClick={() => handleExtractData(upload.id)}
                        disabled={extractDataMutation.isPending}
                        data-testid={`extract-data-${upload.id}`}
                        className="flex items-center gap-2"
                      >
                        {extractDataMutation.isPending ? (
                          <>
                            <Clock className="w-4 h-4 animate-spin" />
                            Step 2: AI Analyzing...
                          </>
                        ) : (
                          <>
                            <Brain className="w-4 h-4" />
                            Step 2: Analyze with AI
                          </>
                        )}
                      </Button>
                    )}
                    
                    {upload.status === 'processed' && extractionResults[upload.id] && !extractionResults[upload.id].canCreateRecords && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled
                        data-testid={`data-extracted-${upload.id}`}
                        className="flex items-center gap-2"
                      >
                        <CheckCircle className="w-4 h-4" />
                        Data Analysis Complete
                      </Button>
                    )}
                  </div>

                  {/* Show extraction results */}
                  {extractionResults[upload.id] && (
                    <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-5 h-5 text-green-600" />
                          <h4 className="font-medium">Extracted Data</h4>
                        </div>
                        <DataQualityIndicator
                          score={extractionResults[upload.id].validationScore * 100}
                          confidence={extractionResults[upload.id].confidence}
                          completeness={extractionResults[upload.id].isComplete ? 100 : 
                            Math.max(0, 100 - (extractionResults[upload.id].missingFields.length * 10))}
                          missingFields={extractionResults[upload.id].missingFields}
                          warnings={extractionResults[upload.id].warnings}
                          validationStatus={
                            extractionResults[upload.id].canCreateRecords ? 'valid' :
                            extractionResults[upload.id].isComplete ? 'partial' : 'invalid'
                          }
                          size="md"
                        />
                      </div>

                      {extractionResults[upload.id].patientData && (
                        <div className="mb-4">
                          <h5 className="font-medium text-sm text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                            <Users className="w-4 h-4" />
                            Patient Information
                          </h5>
                          
                          {/* Basic Information */}
                          <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                            {extractionResults[upload.id].patientData.firstName && (
                              <div data-testid={`patient-name-${upload.id}`}>
                                <strong>Name:</strong> {extractionResults[upload.id].patientData.firstName} {extractionResults[upload.id].patientData.lastName}
                              </div>
                            )}
                            {extractionResults[upload.id].patientData.mrn && (
                              <div data-testid={`patient-mrn-${upload.id}`}>
                                <strong>MRN:</strong> <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">{extractionResults[upload.id].patientData.mrn}</code>
                              </div>
                            )}
                            {extractionResults[upload.id].patientData.dateOfBirth && (
                              <div data-testid={`patient-dob-${upload.id}`}>
                                <strong>DOB:</strong> {extractionResults[upload.id].patientData.dateOfBirth}
                              </div>
                            )}
                            {extractionResults[upload.id].patientData.macRegion && (
                              <div data-testid={`patient-mac-${upload.id}`}>
                                <strong>MAC Region:</strong> {extractionResults[upload.id].patientData.macRegion}
                              </div>
                            )}
                          </div>
                          
                          {/* Primary Insurance */}
                          <div className="bg-blue-50 dark:bg-blue-900/20 p-2 rounded mb-2">
                            <h6 className="font-medium text-xs text-blue-900 dark:text-blue-100 mb-1 flex items-center gap-1">
                              <CreditCard className="w-3 h-3" />
                              Primary Insurance
                            </h6>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              {extractionResults[upload.id].patientData.payerType && (
                                <div data-testid={`patient-payer-${upload.id}`}>
                                  <strong>Payer:</strong> {extractionResults[upload.id].patientData.payerType}
                                </div>
                              )}
                              {extractionResults[upload.id].patientData.planName && (
                                <div data-testid={`patient-plan-${upload.id}`}>
                                  <strong>Plan:</strong> {extractionResults[upload.id].patientData.planName}
                                </div>
                              )}
                              {extractionResults[upload.id].patientData.insuranceId && (
                                <div data-testid={`patient-insurance-id-${upload.id}`} className="col-span-2">
                                  <strong>ID:</strong> <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">{extractionResults[upload.id].patientData.insuranceId}</code>
                                </div>
                              )}
                            </div>
                          </div>
                          
                          {/* Secondary Insurance */}
                          {(extractionResults[upload.id].patientData.secondaryPayerType || 
                            extractionResults[upload.id].patientData.secondaryPlanName || 
                            extractionResults[upload.id].patientData.secondaryInsuranceId) && (
                            <div className="bg-purple-50 dark:bg-purple-900/20 p-2 rounded">
                              <h6 className="font-medium text-xs text-purple-900 dark:text-purple-100 mb-1 flex items-center gap-1">
                                <CreditCard className="w-3 h-3" />
                                Secondary Insurance
                              </h6>
                              <div className="grid grid-cols-2 gap-2 text-sm">
                                {extractionResults[upload.id].patientData.secondaryPayerType && (
                                  <div data-testid={`patient-secondary-payer-${upload.id}`}>
                                    <strong>Payer:</strong> {extractionResults[upload.id].patientData.secondaryPayerType}
                                  </div>
                                )}
                                {extractionResults[upload.id].patientData.secondaryPlanName && (
                                  <div data-testid={`patient-secondary-plan-${upload.id}`}>
                                    <strong>Plan:</strong> {extractionResults[upload.id].patientData.secondaryPlanName}
                                  </div>
                                )}
                                {extractionResults[upload.id].patientData.secondaryInsuranceId && (
                                  <div data-testid={`patient-secondary-insurance-id-${upload.id}`} className="col-span-2">
                                    <strong>ID:</strong> <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">{extractionResults[upload.id].patientData.secondaryInsuranceId}</code>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {extractionResults[upload.id].encounterData && extractionResults[upload.id].encounterData.length > 0 && (
                        <div className="mb-4">
                          <h5 className="font-medium text-sm text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            Encounter Information ({extractionResults[upload.id].encounterData.length} encounter{extractionResults[upload.id].encounterData.length > 1 ? 's' : ''})
                          </h5>
                          <div className="text-sm space-y-3">
                            {extractionResults[upload.id].encounterData.map((encounter, index) => (
                              <div key={index} className={`${index > 0 ? 'border-t border-gray-200 dark:border-gray-600 pt-3' : ''}`}>
                                {extractionResults[upload.id].encounterData.length > 1 && (
                                  <div className="font-medium text-gray-600 dark:text-gray-400 mb-2">
                                    Encounter {index + 1}
                                  </div>
                                )}
                                
                                {/* Basic Encounter Info */}
                                <div className="grid grid-cols-2 gap-2 mb-2">
                                  {encounter.encounterDate && (
                                    <div data-testid={`encounter-date-${upload.id}-${index}`}>
                                      <strong>Date:</strong> {encounter.encounterDate}
                                    </div>
                                  )}
                                  {encounter.diabeticStatus && (
                                    <div data-testid={`diabetic-status-${upload.id}-${index}`}>
                                      <strong>Diabetic Status:</strong> 
                                      <Badge variant={encounter.diabeticStatus === 'diabetic' ? 'destructive' : 'outline'} className="ml-1 text-xs">
                                        <Activity className="w-3 h-3 mr-1" />
                                        {encounter.diabeticStatus}
                                      </Badge>
                                    </div>
                                  )}
                                  {encounter.infectionStatus && (
                                    <div data-testid={`infection-status-${upload.id}-${index}`}>
                                      <strong>Infection:</strong> 
                                      <Badge variant={encounter.infectionStatus === 'None' ? 'outline' : 'destructive'} className="ml-1 text-xs">
                                        {encounter.infectionStatus}
                                      </Badge>
                                    </div>
                                  )}
                                </div>
                                
                                {/* Wound Details */}
                                {encounter.woundDetails && (
                                  <div className="bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded mb-2">
                                    <div className="text-xs font-medium mb-1">Wound Details</div>
                                    <div className="grid grid-cols-2 gap-1 text-xs">
                                      {encounter.woundDetails.type && (
                                        <div data-testid={`wound-type-${upload.id}-${index}`}>
                                          <strong>Type:</strong> {encounter.woundDetails.type}
                                        </div>
                                      )}
                                      {encounter.woundDetails.location && (
                                        <div data-testid={`wound-location-${upload.id}-${index}`}>
                                          <strong>Location:</strong> {encounter.woundDetails.location}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                                
                                {/* CPT Codes */}
                                {encounter.procedureCodes && encounter.procedureCodes.length > 0 && (
                                  <div className="bg-green-50 dark:bg-green-900/20 p-2 rounded mb-2">
                                    <div className="text-xs font-medium mb-1 flex items-center gap-1">
                                      <Code className="w-3 h-3" />
                                      CPT/HCPCS Codes
                                    </div>
                                    <div className="space-y-1">
                                      {encounter.procedureCodes.map((proc, idx) => (
                                        <div key={idx} className="flex items-center gap-2 text-xs" data-testid={`cpt-${upload.id}-${index}-${proc.code}`}>
                                          <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">{proc.code}</code>
                                          {proc.description && <span className="text-gray-600 dark:text-gray-400">{proc.description}</span>}
                                          {proc.units && <Badge variant="outline" className="text-xs">×{proc.units}</Badge>}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                
                                {/* Vascular Assessment */}
                                {encounter.vascularAssessment && (
                                  <div className="bg-red-50 dark:bg-red-900/20 p-2 rounded mb-2">
                                    <div className="text-xs font-medium mb-1 flex items-center gap-1">
                                      <Heart className="w-3 h-3" />
                                      Vascular Assessment
                                    </div>
                                    <div className="grid grid-cols-2 gap-1 text-xs">
                                      {encounter.vascularAssessment.dorsalisPedis && (
                                        <div><strong>DP:</strong> {encounter.vascularAssessment.dorsalisPedis}</div>
                                      )}
                                      {encounter.vascularAssessment.posteriorTibial && (
                                        <div><strong>PT:</strong> {encounter.vascularAssessment.posteriorTibial}</div>
                                      )}
                                      {encounter.vascularAssessment.capillaryRefill && (
                                        <div><strong>Cap Refill:</strong> {encounter.vascularAssessment.capillaryRefill}</div>
                                      )}
                                      {encounter.vascularAssessment.edema && (
                                        <div><strong>Edema:</strong> {encounter.vascularAssessment.edema}</div>
                                      )}
                                    </div>
                                  </div>
                                )}
                                
                                {/* Functional Status */}
                                {encounter.functionalStatus && (
                                  <div className="bg-indigo-50 dark:bg-indigo-900/20 p-2 rounded">
                                    <div className="text-xs font-medium mb-1 flex items-center gap-1">
                                      <Footprints className="w-3 h-3" />
                                      Functional Status
                                    </div>
                                    <div className="grid grid-cols-2 gap-1 text-xs">
                                      {encounter.functionalStatus.mobility && (
                                        <div><strong>Mobility:</strong> {encounter.functionalStatus.mobility}</div>
                                      )}
                                      {encounter.functionalStatus.assistiveDevice && (
                                        <div><strong>Device:</strong> {encounter.functionalStatus.assistiveDevice}</div>
                                      )}
                                      {encounter.functionalStatus.selfCare && (
                                        <div><strong>Self-Care:</strong> {encounter.functionalStatus.selfCare}</div>
                                      )}
                                      {encounter.functionalStatus.adlScore !== undefined && (
                                        <div><strong>ADL Score:</strong> {encounter.functionalStatus.adlScore}</div>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {extractionResults[upload.id].missingFields.length > 0 && (
                        <Alert className="mb-4">
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription>
                            <strong>Missing fields:</strong> {extractionResults[upload.id].missingFields.join(', ')}
                          </AlertDescription>
                        </Alert>
                      )}

                      {extractionResults[upload.id].canCreateRecords && (
                        <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                          <div className="flex items-center gap-2 mb-2">
                            <CheckCircle className="w-5 h-5 text-green-600" />
                            <h4 className="font-medium text-green-800 dark:text-green-200">Ready to Create Records</h4>
                          </div>
                          <p className="text-sm text-green-700 dark:text-green-300 mb-3">
                            Data analysis is complete! Click below to create patient and encounter records in the system.
                          </p>
                          <Button 
                            size="sm" 
                            className="w-full" 
                            data-testid={`create-records-${upload.id}`}
                            onClick={() => createRecordsMutation.mutate(upload.id)}
                            disabled={createRecordsMutation.isPending}
                          >
                            {createRecordsMutation.isPending ? (
                              <>
                                <Clock className="w-4 h-4 mr-2 animate-spin" />
                                Step 3: Creating Records...
                              </>
                            ) : (
                              <>
                                <Users className="w-4 h-4 mr-2" />
                                Step 3: Create Patient & Encounter Records
                              </>
                            )}
                          </Button>
                        </div>
                      )}

                      {/* Success confirmation when records are created */}
                      {createdRecords[upload.id] && (
                        <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                          <div className="flex items-start gap-3">
                            <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                            <div className="flex-1">
                              <h4 className="font-medium text-green-800 dark:text-green-200 mb-2">
                                Records Created Successfully!
                              </h4>
                              <p className="text-sm text-green-700 dark:text-green-300 mb-3">
                                {createdRecords[upload.id].wasNewPatient ? 'New patient' : 'Existing patient'} and encounter records have been added to the system.
                              </p>
                              <div className="flex flex-wrap gap-2">
                                <Link href={`/patients/${createdRecords[upload.id].patientId}`}>
                                  <Button size="sm" variant="outline" className="flex items-center gap-2">
                                    <Users className="w-4 h-4" />
                                    View Patient
                                  </Button>
                                </Link>
                                <Link href={`/patients/${createdRecords[upload.id].patientId}/encounters/${createdRecords[upload.id].encounterIds[0]}`}>
                                  <Button size="sm" variant="outline" className="flex items-center gap-2">
                                    <Calendar className="w-4 h-4" />
                                    View Encounters ({createdRecords[upload.id].encounterIds.length})
                                  </Button>
                                </Link>
                                <Link href="/">
                                  <Button size="sm" variant="default" className="flex items-center gap-2">
                                    <ArrowLeft className="w-4 h-4" />
                                    Dashboard
                                  </Button>
                                </Link>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <FileText className="mx-auto h-12 w-12 text-gray-300 mb-4" />
              <p>No uploads yet. Upload your first PDF file to get started.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}