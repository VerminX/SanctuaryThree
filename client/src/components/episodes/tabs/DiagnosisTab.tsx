import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, AlertTriangle, CheckCircle, Stethoscope } from "lucide-react";
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

interface DiagnosisTabProps {
  episode?: Episode;
  encounters: Encounter[];
  patient?: DecryptedPatient;
  isLoading: boolean;
}

export default function DiagnosisTab({ episode, encounters, patient, isLoading }: DiagnosisTabProps) {
  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="diagnosis-loading">
        <div className="h-8 bg-muted animate-pulse rounded"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-40 bg-muted animate-pulse rounded"></div>
          <div className="h-40 bg-muted animate-pulse rounded"></div>
        </div>
        <div className="h-60 bg-muted animate-pulse rounded"></div>
      </div>
    );
  }

  // Extract comorbidities from encounters
  const allComorbidities = encounters
    .filter(encounter => encounter.comorbidities)
    .reduce((acc: any[], encounter) => {
      if (encounter.comorbidities && typeof encounter.comorbidities === 'object') {
        Object.entries(encounter.comorbidities).forEach(([key, value]) => {
          if (!acc.find(item => item.key === key)) {
            acc.push({ key, value, firstDocumented: encounter.date });
          }
        });
      }
      return acc;
    }, []);

  return (
    <div className="space-y-6" data-testid="diagnosis-tab">
      <div className="flex items-center gap-3">
        <Stethoscope className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Diagnosis & Clinical Assessment</h3>
      </div>

      {/* Primary Diagnosis */}
      <Card data-testid="card-primary-diagnosis">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Primary Diagnosis
          </CardTitle>
        </CardHeader>
        <CardContent>
          {episode?.primaryDiagnosis ? (
            <div className="space-y-2">
              <div className="text-lg font-medium" data-testid="text-primary-diagnosis">
                {episode.primaryDiagnosis}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Documented
                </Badge>
              </div>
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground" data-testid="no-primary-diagnosis">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Primary diagnosis not yet documented</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Wound Classification */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card data-testid="card-wound-type">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Wound Type</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-medium" data-testid="text-wound-type">
              {episode?.woundType || 'Not specified'}
            </div>
            <p className="text-sm text-muted-foreground">
              Primary wound classification
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-wound-location">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Anatomical Location</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-medium" data-testid="text-wound-location">
              {episode?.woundLocation || 'Not specified'}
            </div>
            <p className="text-sm text-muted-foreground">
              Specific anatomical site
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Comorbidities */}
      <Card data-testid="card-comorbidities">
        <CardHeader>
          <CardTitle>Comorbidities & Related Conditions</CardTitle>
          <CardDescription>
            Additional conditions that may impact wound healing and treatment
          </CardDescription>
        </CardHeader>
        <CardContent>
          {allComorbidities.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="no-comorbidities">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No comorbidities documented yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="comorbidities-list">
              {allComorbidities.map((comorbidity, index) => (
                <div 
                  key={comorbidity.key} 
                  className="border rounded-lg p-4"
                  data-testid={`comorbidity-${index}`}
                >
                  <div className="font-medium mb-1" data-testid={`comorbidity-name-${index}`}>
                    {comorbidity.key.replace(/([A-Z])/g, ' $1').trim()}
                  </div>
                  <div className="text-sm text-muted-foreground mb-2" data-testid={`comorbidity-value-${index}`}>
                    {typeof comorbidity.value === 'string' ? comorbidity.value : String(comorbidity.value || '')}
                  </div>
                  <div className="text-xs text-muted-foreground" data-testid={`comorbidity-date-${index}`}>
                    First documented: {new Date(comorbidity.firstDocumented).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ICD-10 Codes */}
      <Card data-testid="card-icd-codes">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            ICD-10 Diagnostic Codes
          </CardTitle>
          <CardDescription>
            Relevant diagnostic codes for billing and documentation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p data-testid="icd-codes-placeholder">
              ICD-10 code mapping and diagnostic code recommendations coming soon.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Clinical Assessment Notes */}
      <Card data-testid="card-clinical-assessment">
        <CardHeader>
          <CardTitle>Clinical Assessment Summary</CardTitle>
          <CardDescription>
            Key clinical findings and assessment notes from encounters
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Stethoscope className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p data-testid="clinical-assessment-placeholder">
              Comprehensive clinical assessment analysis and trending coming soon.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}