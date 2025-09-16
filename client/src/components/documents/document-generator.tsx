import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FileText, File, Download, FileDown } from "lucide-react";

interface DocumentGeneratorProps {
  patients: Array<{
    id: string;
    name: string;
    mrn: string;
    eligibilityChecks: Array<{
      id: string;
      result: {
        eligibility: string;
        rationale: string;
      };
      createdAt: string;
    }>;
  }>;
  onGenerateDocument: (type: 'PreDetermination' | 'LMN', patientId: string, eligibilityCheckId: string) => Promise<void>;
  onExportDocument: (documentId: string, format: 'PDF' | 'DOCX') => void;
  recentDocuments: Array<{
    id: string;
    type: string;
    title: string;
    createdAt: string;
    pdfUrl?: string;
    docxUrl?: string;
  }>;
  isLoading: boolean;
}

const DOCUMENT_TEMPLATES = [
  {
    id: "medicare-original",
    name: "Medicare Original",
    description: "Standard LCD template",
  },
  {
    id: "medicare-advantage",
    name: "Medicare Advantage", 
    description: "Plan-specific requirements",
  },
  {
    id: "custom",
    name: "Custom Template",
    description: "Clinic-specific format",
  },
];

export default function DocumentGenerator({
  patients,
  onGenerateDocument,
  onExportDocument,
  recentDocuments,
  isLoading,
}: DocumentGeneratorProps) {
  const [selectedPatient, setSelectedPatient] = useState<string>("");
  const [selectedEligibilityCheck, setSelectedEligibilityCheck] = useState<string>("");
  const [selectedTemplate, setSelectedTemplate] = useState<string>("medicare-original");

  const selectedPatientData = patients.find(p => p.id === selectedPatient);

  const handleGenerate = async (type: 'PreDetermination' | 'LMN') => {
    if (selectedPatient && selectedEligibilityCheck) {
      await onGenerateDocument(type, selectedPatient, selectedEligibilityCheck);
    }
  };

  return (
    <Card data-testid="document-generator">
      <CardHeader>
        <CardTitle>Document Generation</CardTitle>
        <p className="text-sm text-muted-foreground">
          Generate Pre-Determination Letters and Letters of Medical Necessity
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Patient & Eligibility Selection */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Select Patient
            </label>
            <Select value={selectedPatient} onValueChange={setSelectedPatient}>
              <SelectTrigger data-testid="select-patient">
                <SelectValue placeholder="Choose a patient" />
              </SelectTrigger>
              <SelectContent>
                {patients.map((patient) => (
                  <SelectItem key={patient.id} value={patient.id}>
                    {patient.name} (MRN: {patient.mrn})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedPatientData && selectedPatientData.eligibilityChecks.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Select Eligibility Analysis
              </label>
              <Select value={selectedEligibilityCheck} onValueChange={setSelectedEligibilityCheck}>
                <SelectTrigger data-testid="select-eligibility">
                  <SelectValue placeholder="Choose an eligibility analysis" />
                </SelectTrigger>
                <SelectContent>
                  {selectedPatientData.eligibilityChecks.map((check) => (
                    <SelectItem key={check.id} value={check.id}>
                      <div className="flex items-center space-x-2">
                        <Badge variant={check.result.eligibility === 'Yes' ? 'default' : 'secondary'}>
                          {check.result.eligibility}
                        </Badge>
                        <span>{new Date(check.createdAt).toLocaleDateString()}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Document Template
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {DOCUMENT_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  onClick={() => setSelectedTemplate(template.id)}
                  className={`p-3 border rounded-lg text-left transition-colors ${
                    selectedTemplate === template.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  }`}
                  data-testid={`template-${template.id}`}
                >
                  <p className="text-sm font-medium text-foreground">{template.name}</p>
                  <p className="text-xs text-muted-foreground">{template.description}</p>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Document Generation Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border border-border">
            <CardContent className="p-4">
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                  <File className="text-primary" />
                </div>
                <div>
                  <h4 className="font-semibold text-foreground">Pre-Determination Letter</h4>
                  <p className="text-sm text-muted-foreground">For payer submission</p>
                </div>
              </div>
              <div className="space-y-3">
                <Button
                  onClick={() => handleGenerate('PreDetermination')}
                  disabled={!selectedPatient || !selectedEligibilityCheck || isLoading}
                  className="w-full"
                  data-testid="button-generate-predetermination"
                >
                  {isLoading ? "Generating..." : "Draft New Letter"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border">
            <CardContent className="p-4">
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-10 h-10 bg-chart-2/10 rounded-lg flex items-center justify-center">
                  <FileText className="text-chart-2" />
                </div>
                <div>
                  <h4 className="font-semibold text-foreground">Letter of Medical Necessity</h4>
                  <p className="text-sm text-muted-foreground">Clinical documentation</p>
                </div>
              </div>
              <div className="space-y-3">
                <Button
                  onClick={() => handleGenerate('LMN')}
                  disabled={!selectedPatient || !selectedEligibilityCheck || isLoading}
                  className="w-full bg-chart-2 hover:bg-chart-2/90"
                  data-testid="button-generate-lmn"
                >
                  {isLoading ? "Generating..." : "Draft New LMN"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Documents */}
        {recentDocuments.length > 0 && (
          <div>
            <h4 className="font-medium text-foreground mb-3">Recent Documents</h4>
            <div className="space-y-2">
              {recentDocuments.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-3 border border-border rounded-lg"
                  data-testid={`document-${doc.id}`}
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-muted rounded-lg flex items-center justify-center">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{doc.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {doc.type} • {new Date(doc.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    {doc.pdfUrl && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onExportDocument(doc.id, 'PDF')}
                        data-testid={`button-export-pdf-${doc.id}`}
                      >
                        <Download className="w-3 h-3 mr-1" />
                        PDF
                      </Button>
                    )}
                    {doc.docxUrl && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onExportDocument(doc.id, 'DOCX')}
                        data-testid={`button-export-docx-${doc.id}`}
                      >
                        <FileDown className="w-3 h-3 mr-1" />
                        DOCX
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
