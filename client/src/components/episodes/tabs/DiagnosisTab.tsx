import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, AlertTriangle, CheckCircle, Stethoscope, Shield, BookOpen, User, MapPin } from "lucide-react";
import { Episode, Encounter } from "@shared/schema";
import { ICD10_DATABASE, getCodeByCode, validateICD10Format } from "@shared/icd10Database";
import type { ICD10Code } from "@shared/icd10Database";
import { useState, useMemo } from "react";
import RecommendationsEngine from "@/components/clinical/recommendations-engine";

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

  // Process primary diagnosis to extract ICD-10 information
  const primaryDiagnosisInfo = useMemo(() => {
    if (!episode?.primaryDiagnosis) return null;

    // Try to extract ICD-10 code from the diagnosis string
    const diagnosisText = episode.primaryDiagnosis;
    const icd10CodeMatch = diagnosisText.match(/[A-Z]\d{2}(\.?\d{1,4})?/);
    
    if (icd10CodeMatch) {
      const code = icd10CodeMatch[0];
      const codeData = getCodeByCode(code);
      const validation = validateICD10Format(code);
      
      return {
        originalText: diagnosisText,
        code,
        codeData,
        validation,
        isValid: validation.isValid
      };
    }

    // If no valid ICD-10 code found, treat as free text diagnosis
    return {
      originalText: diagnosisText,
      code: null,
      codeData: null,
      validation: { isValid: false, errors: ['No valid ICD-10 code found'], warnings: [] },
      isValid: false
    };
  }, [episode?.primaryDiagnosis]);

  // Get all available diagnosis codes for recommendations
  const allDiagnosisCodes = useMemo(() => {
    const codes = [];
    if (primaryDiagnosisInfo?.code) {
      codes.push(primaryDiagnosisInfo.code);
    }
    return codes;
  }, [primaryDiagnosisInfo]);

  // Generate patient history for recommendations engine
  const patientHistory = useMemo(() => ({
    diabetes: allComorbidities.some(c => c.key.toLowerCase().includes('diabetes')),
    vascularDisease: allComorbidities.some(c => 
      c.key.toLowerCase().includes('vascular') || 
      c.key.toLowerCase().includes('circulation')
    ),
    previousUlcers: true, // Assume true since this is wound care
    currentMedications: []
  }), [allComorbidities]);

  // Generate conservative care history (simplified - could be enhanced with encounter data)
  const conservativeCareHistory = useMemo(() => ({
    offloading: { tried: false, duration: undefined, effective: undefined },
    compression: { tried: false, duration: undefined, effective: undefined },
    debridement: { tried: false, duration: undefined, effective: undefined },
    woundCare: { tried: false, duration: undefined, effective: undefined }
  }), []);

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
            <Stethoscope className="h-5 w-5" />
            Primary Diagnosis
          </CardTitle>
        </CardHeader>
        <CardContent>
          {primaryDiagnosisInfo ? (
            <div className="space-y-4">
              {/* ICD-10 Code and Description */}
              {primaryDiagnosisInfo.codeData ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="flex-1">
                      <div className="text-lg font-semibold text-primary" data-testid="text-icd-code">
                        {primaryDiagnosisInfo.code}
                      </div>
                      <div className="text-base font-medium mb-2" data-testid="text-diagnosis-description">
                        {primaryDiagnosisInfo.codeData.description}
                      </div>
                      <div className="text-sm text-muted-foreground" data-testid="text-diagnosis-category">
                        Category: {primaryDiagnosisInfo.codeData.category}
                      </div>
                    </div>
                  </div>

                  {/* Status Badges */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Valid ICD-10
                    </Badge>
                    
                    {primaryDiagnosisInfo.codeData.medicareCompliance?.isLCDCovered && (
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                        <Shield className="h-3 w-3 mr-1" />
                        Medicare LCD Covered
                      </Badge>
                    )}

                    {primaryDiagnosisInfo.codeData.severity && (
                      <Badge variant="outline" className={
                        primaryDiagnosisInfo.codeData.severity === 'severe' 
                          ? "bg-red-50 text-red-700 border-red-200"
                          : primaryDiagnosisInfo.codeData.severity === 'moderate'
                          ? "bg-yellow-50 text-yellow-700 border-yellow-200"
                          : "bg-gray-50 text-gray-700 border-gray-200"
                      }>
                        Severity: {primaryDiagnosisInfo.codeData.severity}
                      </Badge>
                    )}
                  </div>

                  {/* Validation Errors/Warnings */}
                  {!primaryDiagnosisInfo.isValid && (
                    <div className="space-y-2" data-testid="diagnosis-validation-issues">
                      {primaryDiagnosisInfo.validation.errors.map((error: string, index: number) => (
                        <div key={`error-${index}`} className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                          <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                          <div className="text-sm text-red-700">{error}</div>
                        </div>
                      ))}
                      {primaryDiagnosisInfo.validation.warnings.map((warning: string, index: number) => (
                        <div key={`warning-${index}`} className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                          <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                          <div className="text-sm text-yellow-700">{warning}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-lg font-medium" data-testid="text-primary-diagnosis">
                    {primaryDiagnosisInfo.originalText}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Free Text - No ICD-10 Code
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Consider adding a valid ICD-10 code for better clinical documentation and billing accuracy.
                  </div>
                </div>
              )}
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

      {/* ICD-10 Codes Analysis */}
      <Card data-testid="card-icd-codes">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            ICD-10 Code Analysis
          </CardTitle>
          <CardDescription>
            Detailed analysis of documented diagnosis codes and Medicare compliance
          </CardDescription>
        </CardHeader>
        <CardContent>
          {primaryDiagnosisInfo?.codeData ? (
            <div className="space-y-6">
              {/* Code Structure Analysis */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="border rounded-lg p-4">
                  <div className="text-sm font-medium text-muted-foreground mb-1">Code Structure</div>
                  <div className="text-lg font-semibold" data-testid="code-structure">
                    {primaryDiagnosisInfo.code}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {primaryDiagnosisInfo.validation.isValid ? 'Valid Format' : 'Invalid Format'}
                  </div>
                </div>

                <div className="border rounded-lg p-4">
                  <div className="text-sm font-medium text-muted-foreground mb-1">Category</div>
                  <div className="text-lg font-semibold" data-testid="diagnosis-category">
                    {primaryDiagnosisInfo.codeData.category}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Classification
                  </div>
                </div>

                <div className="border rounded-lg p-4">
                  <div className="text-sm font-medium text-muted-foreground mb-1">Severity</div>
                  <div className="text-lg font-semibold" data-testid="diagnosis-severity">
                    {primaryDiagnosisInfo.codeData.severity || 'Not specified'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Clinical Priority
                  </div>
                </div>
              </div>

              {/* Medicare LCD Compliance Details */}
              {primaryDiagnosisInfo.codeData.medicareCompliance && (
                <div className="border rounded-lg p-4 space-y-3" data-testid="medicare-compliance-details">
                  <div className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-blue-600" />
                    <h4 className="font-medium">Medicare LCD Compliance</h4>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium">Coverage Status:</span>{" "}
                      <Badge variant={primaryDiagnosisInfo.codeData.medicareCompliance.isLCDCovered ? "default" : "destructive"}>
                        {primaryDiagnosisInfo.codeData.medicareCompliance.isLCDCovered ? "Covered" : "Not Covered"}
                      </Badge>
                    </div>
                    <div>
                      <span className="font-medium">MAC Regions:</span>{" "}
                      {primaryDiagnosisInfo.codeData.medicareCompliance.lcdNumbers?.join(", ") || "All regions"}
                    </div>
                  </div>

                  {primaryDiagnosisInfo.codeData.medicareCompliance.documentation_requirements && 
                   primaryDiagnosisInfo.codeData.medicareCompliance.documentation_requirements.length > 0 && (
                    <div>
                      <div className="font-medium text-sm mb-2">Required Documentation:</div>
                      <div className="space-y-1">
                        {primaryDiagnosisInfo.codeData.medicareCompliance.documentation_requirements.map((doc: string, index: number) => (
                          <div key={index} className="text-xs bg-blue-50 p-2 rounded border">
                            • {doc}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {primaryDiagnosisInfo.codeData.medicareCompliance.coverage_conditions && 
                   primaryDiagnosisInfo.codeData.medicareCompliance.coverage_conditions.length > 0 && (
                    <div>
                      <div className="font-medium text-sm mb-2">Coverage Limitations:</div>
                      <div className="space-y-1">
                        {primaryDiagnosisInfo.codeData.medicareCompliance.coverage_conditions.map((limitation: string, index: number) => (
                          <div key={index} className="text-xs bg-yellow-50 p-2 rounded border">
                            ⚠ {limitation}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Related Codes */}
              {primaryDiagnosisInfo.codeData.relatedCodes && primaryDiagnosisInfo.codeData.relatedCodes.length > 0 && (
                <div className="space-y-3">
                  <h4 className="font-medium flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Related ICD-10 Codes
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {primaryDiagnosisInfo.codeData.relatedCodes.map((relatedCode: string, index: number) => (
                      <div key={index} className="text-sm border rounded p-3" data-testid={`related-code-${index}`}>
                        <div className="font-medium text-primary">{relatedCode}</div>
                        <div className="text-xs text-muted-foreground">Related diagnosis code</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p data-testid="no-icd-analysis">
                No valid ICD-10 codes found for analysis. Please ensure primary diagnosis contains a valid ICD-10 code.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Clinical Recommendations */}
      {allDiagnosisCodes.length > 0 && (
        <RecommendationsEngine
          diagnosisCodes={allDiagnosisCodes}
          woundType={episode?.woundType}
          woundLocation={episode?.woundLocation}
          patientHistory={patientHistory}
          conservativeCareHistory={conservativeCareHistory}
          onComplianceAlert={() => {}} // Read-only mode for this tab
          className="mt-4"
          data-testid="diagnosis-tab-recommendations"
        />
      )}

      {/* Clinical Assessment Summary */}
      <Card data-testid="card-clinical-assessment">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Clinical Assessment Summary
          </CardTitle>
          <CardDescription>
            Key clinical findings and assessment notes based on diagnosis and encounters
          </CardDescription>
        </CardHeader>
        <CardContent>
          {primaryDiagnosisInfo?.codeData ? (
            <div className="space-y-4">
              {/* Assessment based on primary diagnosis */}
              <div className="border rounded-lg p-4 space-y-3">
                <h4 className="font-medium">Assessment Based on Primary Diagnosis</h4>
                <div className="text-sm space-y-2">
                  <div>
                    <span className="font-medium">Primary Condition:</span>{" "}
                    {primaryDiagnosisInfo.codeData.description}
                  </div>
                  <div>
                    <span className="font-medium">Clinical Category:</span>{" "}
                    {primaryDiagnosisInfo.codeData.category}
                  </div>
                  {primaryDiagnosisInfo.codeData.severity && (
                    <div>
                      <span className="font-medium">Severity Level:</span>{" "}
                      <Badge variant={
                        primaryDiagnosisInfo.codeData.severity === 'severe' ? 'destructive' :
                        primaryDiagnosisInfo.codeData.severity === 'moderate' ? 'secondary' : 'outline'
                      }>
                        {primaryDiagnosisInfo.codeData.severity.charAt(0).toUpperCase() + primaryDiagnosisInfo.codeData.severity.slice(1)}
                      </Badge>
                    </div>
                  )}
                </div>
              </div>

              {/* Episode progression */}
              <div className="border rounded-lg p-4 space-y-3">
                <h4 className="font-medium">Episode Progression</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="font-medium text-muted-foreground">Episode Start</div>
                    <div>{episode?.episodeStartDate ? new Date(episode.episodeStartDate).toLocaleDateString() : 'Not specified'}</div>
                  </div>
                  <div>
                    <div className="font-medium text-muted-foreground">Status</div>
                    <Badge variant="outline">
                      {episode?.status || 'Active'}
                    </Badge>
                  </div>
                  <div>
                    <div className="font-medium text-muted-foreground">Total Encounters</div>
                    <div>{encounters.length} encounters</div>
                  </div>
                </div>
              </div>

              {/* Comorbidity Impact */}
              {allComorbidities.length > 0 && (
                <div className="border rounded-lg p-4 space-y-3">
                  <h4 className="font-medium">Comorbidity Impact Assessment</h4>
                  <div className="text-sm space-y-2">
                    <div>
                      <span className="font-medium">Documented Comorbidities:</span>{" "}
                      {allComorbidities.length} conditions
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {allComorbidities.slice(0, 5).map((comorbidity, index) => (
                        <Badge key={index} variant="secondary" className="text-xs">
                          {comorbidity.key.replace(/([A-Z])/g, ' $1').trim()}
                        </Badge>
                      ))}
                      {allComorbidities.length > 5 && (
                        <Badge variant="outline" className="text-xs">
                          +{allComorbidities.length - 5} more
                        </Badge>
                      )}
                    </div>
                    {(patientHistory.diabetes || patientHistory.vascularDisease) && (
                      <div className="text-xs text-amber-700 bg-amber-50 p-2 rounded border">
                        ⚠ Comorbidities may impact wound healing and treatment response
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Stethoscope className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p data-testid="no-clinical-assessment">
                Clinical assessment will be available once a valid primary diagnosis is documented.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}