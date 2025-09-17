import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, FileUp, Upload, AlertCircle, Clock, FileText } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

interface FileUpload {
  id: string;
  filename: string;
  status: 'uploaded' | 'processing' | 'processed' | 'data_extracted' | 'failed' | 'extraction_failed';
  uploadedAt: string;
  fileSize: number;
  processingError?: string;
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
    macRegion?: string;
    phoneNumber?: string;
    address?: string;
    insuranceId?: string;
  };
  encounterData: {
    encounterDate?: string;
    notes?: string[];
    woundDetails?: any;
    conservativeCare?: any;
    infectionStatus?: string;
    comorbidities?: string[];
    assessment?: string;
    plan?: string;
  };
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

  // Fetch recent uploads
  const { data: uploads, refetch: refetchUploads } = useQuery({
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
      toast({
        title: "Text extraction failed",
        description: error.message || "Failed to extract text from PDF",
        variant: "destructive"
      });
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
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">PDF Upload & Data Extraction</h1>
        <p className="text-gray-600 dark:text-gray-300 mt-2">
          Upload patient registration forms and medical records to automatically extract patient and encounter data.
        </p>
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
          {uploads && Array.isArray(uploads) && uploads.length > 0 ? (
            <div className="space-y-4">
              {uploads.map((upload: FileUpload) => (
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

                  <div className="flex gap-2">
                    {upload.status === 'uploaded' && (
                      <Button
                        size="sm"
                        onClick={() => handleExtractText(upload.id)}
                        disabled={extractTextMutation.isPending}
                        data-testid={`extract-text-${upload.id}`}
                      >
                        {extractTextMutation.isPending ? 'Extracting...' : 'Extract Text'}
                      </Button>
                    )}
                    
                    {upload.status === 'processed' && (
                      <Button
                        size="sm"
                        onClick={() => handleExtractData(upload.id)}
                        disabled={extractDataMutation.isPending}
                        data-testid={`extract-data-${upload.id}`}
                      >
                        {extractDataMutation.isPending ? 'Extracting...' : 'Extract Data'}
                      </Button>
                    )}
                  </div>

                  {/* Show extraction results */}
                  {extractionResults[upload.id] && (
                    <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <div className="flex items-center gap-2 mb-3">
                        <CheckCircle className="w-5 h-5 text-green-600" />
                        <h4 className="font-medium">Extracted Data</h4>
                        <Badge variant="outline">
                          {Math.round(extractionResults[upload.id].confidence * 100)}% confidence
                        </Badge>
                      </div>

                      {extractionResults[upload.id].patientData && (
                        <div className="mb-4">
                          <h5 className="font-medium text-sm text-gray-700 dark:text-gray-300 mb-2">Patient Information</h5>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            {extractionResults[upload.id].patientData.firstName && (
                              <div data-testid={`patient-name-${upload.id}`}>
                                <strong>Name:</strong> {extractionResults[upload.id].patientData.firstName} {extractionResults[upload.id].patientData.lastName}
                              </div>
                            )}
                            {extractionResults[upload.id].patientData.mrn && (
                              <div data-testid={`patient-mrn-${upload.id}`}>
                                <strong>MRN:</strong> {extractionResults[upload.id].patientData.mrn}
                              </div>
                            )}
                            {extractionResults[upload.id].patientData.dateOfBirth && (
                              <div data-testid={`patient-dob-${upload.id}`}>
                                <strong>DOB:</strong> {extractionResults[upload.id].patientData.dateOfBirth}
                              </div>
                            )}
                            {extractionResults[upload.id].patientData.payerType && (
                              <div data-testid={`patient-payer-${upload.id}`}>
                                <strong>Payer:</strong> {extractionResults[upload.id].patientData.payerType}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {extractionResults[upload.id].encounterData && (
                        <div className="mb-4">
                          <h5 className="font-medium text-sm text-gray-700 dark:text-gray-300 mb-2">Encounter Information</h5>
                          <div className="text-sm space-y-1">
                            {extractionResults[upload.id].encounterData.encounterDate && (
                              <div data-testid={`encounter-date-${upload.id}`}>
                                <strong>Date:</strong> {extractionResults[upload.id].encounterData.encounterDate}
                              </div>
                            )}
                            {extractionResults[upload.id].encounterData.woundDetails?.type && (
                              <div data-testid={`wound-type-${upload.id}`}>
                                <strong>Wound Type:</strong> {extractionResults[upload.id].encounterData.woundDetails.type}
                              </div>
                            )}
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
                        <Button size="sm" className="w-full" data-testid={`create-records-${upload.id}`}>
                          Create Patient & Encounter Records
                        </Button>
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