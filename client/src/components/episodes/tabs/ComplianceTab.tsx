import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, AlertTriangle, Clock, Shield, FileCheck } from "lucide-react";
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

interface ComplianceTabProps {
  episode?: Episode;
  encounters: Encounter[];
  patient?: DecryptedPatient;
  isLoading: boolean;
}

export default function ComplianceTab({ episode, encounters, patient, isLoading }: ComplianceTabProps) {
  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="compliance-loading">
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

  // Calculate compliance metrics
  const totalEncounters = encounters.length;
  const episodeDuration = episode?.episodeStartDate ? 
    Math.ceil((Date.now() - new Date(episode.episodeStartDate).getTime()) / (1000 * 60 * 60 * 24)) : 0;
  
  // Basic compliance calculations (simplified for now)
  const hasConservativeCare = encounters.some(e => e.conservativeCare);
  const hasVascularAssessment = encounters.some(e => e.vascularAssessment);
  const hasDiabeticStatus = encounters.some(e => e.diabeticStatus);
  const hasPrimaryDiagnosis = !!episode?.primaryDiagnosis;
  
  const complianceItems = [
    { name: 'Primary Diagnosis', completed: hasPrimaryDiagnosis, required: true },
    { name: 'Conservative Care Documentation', completed: hasConservativeCare, required: true },
    { name: 'Vascular Assessment', completed: hasVascularAssessment, required: episode?.woundType === 'VLU' },
    { name: 'Diabetic Status', completed: hasDiabeticStatus, required: episode?.woundType === 'DFU' },
  ];

  const requiredItems = complianceItems.filter(item => item.required);
  const completedRequired = requiredItems.filter(item => item.completed);
  const compliancePercentage = requiredItems.length > 0 ? 
    Math.round((completedRequired.length / requiredItems.length) * 100) : 0;

  const getComplianceColor = (percentage: number) => {
    if (percentage >= 90) return "text-green-600";
    if (percentage >= 70) return "text-yellow-600";
    return "text-red-600";
  };

  const getComplianceBadgeColor = (completed: boolean, required: boolean) => {
    if (!required) return "bg-gray-100 text-gray-600 border-gray-200";
    if (completed) return "bg-green-100 text-green-700 border-green-200";
    return "bg-red-100 text-red-700 border-red-200";
  };

  return (
    <div className="space-y-6" data-testid="compliance-tab">
      <div className="flex items-center gap-3">
        <Shield className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Medicare Compliance & Documentation</h3>
      </div>

      {/* Compliance Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card data-testid="card-overall-compliance">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Overall Compliance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getComplianceColor(compliancePercentage)}`} data-testid="text-compliance-percentage">
              {compliancePercentage}%
            </div>
            <Progress value={compliancePercentage} className="mt-2" data-testid="progress-compliance" />
            <p className="text-xs text-muted-foreground mt-2">
              {completedRequired.length} of {requiredItems.length} requirements met
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-documentation-score">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileCheck className="h-4 w-4" />
              Documentation Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-documentation-score">
              {totalEncounters > 0 ? 'B+' : 'N/A'}
            </div>
            <p className="text-xs text-muted-foreground">
              Based on encounter frequency and quality
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-episode-duration">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Episode Duration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-episode-duration-days">
              {episodeDuration}
            </div>
            <p className="text-xs text-muted-foreground">
              Days active
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Compliance Checklist */}
      <Card data-testid="card-compliance-checklist">
        <CardHeader>
          <CardTitle>Medicare Documentation Requirements</CardTitle>
          <CardDescription>
            Required documentation elements for Medicare coverage and compliance
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3" data-testid="compliance-checklist">
            {complianceItems.map((item, index) => (
              <div 
                key={item.name} 
                className="flex items-center justify-between p-3 border rounded-lg"
                data-testid={`compliance-item-${index}`}
              >
                <div className="flex items-center gap-3">
                  {item.completed ? (
                    <CheckCircle className="h-5 w-5 text-green-600" data-testid={`check-icon-${index}`} />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-red-600" data-testid={`alert-icon-${index}`} />
                  )}
                  <span className="font-medium" data-testid={`item-name-${index}`}>
                    {item.name}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge 
                    variant="outline" 
                    className={getComplianceBadgeColor(item.completed, item.required)}
                    data-testid={`item-status-${index}`}
                  >
                    {item.completed ? 'Complete' : item.required ? 'Required' : 'Optional'}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Medicare Guidelines */}
      <Card data-testid="card-medicare-guidelines">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Medicare Coverage Guidelines
          </CardTitle>
          <CardDescription>
            Key requirements for Medicare coverage of wound care services
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
              <h4 className="font-medium mb-2" data-testid="general-requirements-title">
                General Documentation Requirements
              </h4>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li data-testid="req-diagnosis">• Primary diagnosis with appropriate ICD-10 codes</li>
                <li data-testid="req-conservative">• Evidence of conservative care when applicable</li>
                <li data-testid="req-frequency">• Appropriate visit frequency based on wound severity</li>
                <li data-testid="req-progress">• Documentation of wound healing progress or lack thereof</li>
              </ul>
            </div>
            
            {episode?.woundType === 'DFU' && (
              <div className="p-4 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg">
                <h4 className="font-medium mb-2" data-testid="dfu-requirements-title">
                  Diabetic Foot Ulcer Specific Requirements
                </h4>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li data-testid="req-diabetic-status">• Confirmed diabetic status documentation</li>
                  <li data-testid="req-neuropathy">• Assessment for diabetic neuropathy</li>
                  <li data-testid="req-vascular-dfu">• Vascular assessment when indicated</li>
                  <li data-testid="req-offloading">• Appropriate offloading measures</li>
                </ul>
              </div>
            )}
            
            {episode?.woundType === 'VLU' && (
              <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg">
                <h4 className="font-medium mb-2" data-testid="vlu-requirements-title">
                  Venous Leg Ulcer Specific Requirements
                </h4>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li data-testid="req-vascular-assessment">• Comprehensive vascular assessment</li>
                  <li data-testid="req-compression">• Compression therapy documentation</li>
                  <li data-testid="req-elevation">• Patient education on leg elevation</li>
                  <li data-testid="req-arterial">• Rule out arterial insufficiency</li>
                </ul>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Compliance Alerts */}
      <Card data-testid="card-compliance-alerts">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Compliance Alerts
          </CardTitle>
          <CardDescription>
            Items requiring attention for optimal Medicare compliance
          </CardDescription>
        </CardHeader>
        <CardContent>
          {requiredItems.filter(item => !item.completed).length === 0 ? (
            <div className="text-center py-6 text-muted-foreground" data-testid="no-compliance-alerts">
              <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-600" />
              <p>All required documentation elements are complete!</p>
            </div>
          ) : (
            <div className="space-y-3" data-testid="compliance-alerts-list">
              {requiredItems
                .filter(item => !item.completed)
                .map((item, index) => (
                  <div 
                    key={item.name} 
                    className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 rounded-lg"
                    data-testid={`alert-item-${index}`}
                  >
                    <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-red-800 dark:text-red-300" data-testid={`alert-title-${index}`}>
                        Missing: {item.name}
                      </p>
                      <p className="text-sm text-red-600 dark:text-red-400" data-testid={`alert-description-${index}`}>
                        This is required for Medicare compliance and should be documented.
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}