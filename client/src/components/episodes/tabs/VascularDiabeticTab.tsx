import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Heart, Activity, AlertCircle, TrendingDown, TrendingUp } from "lucide-react";
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

interface VascularDiabeticTabProps {
  episode?: Episode;
  encounters: Encounter[];
  patient?: DecryptedPatient;
  isLoading: boolean;
}

export default function VascularDiabeticTab({ episode, encounters, patient, isLoading }: VascularDiabeticTabProps) {
  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="vascular-diabetic-loading">
        <div className="h-8 bg-muted animate-pulse rounded"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-40 bg-muted animate-pulse rounded"></div>
          <div className="h-40 bg-muted animate-pulse rounded"></div>
        </div>
        <div className="h-60 bg-muted animate-pulse rounded"></div>
      </div>
    );
  }

  // Extract vascular assessments from encounters
  const vascularAssessments = encounters
    .filter(encounter => encounter.vascularAssessment)
    .map(encounter => ({
      date: encounter.date,
      assessment: encounter.vascularAssessment,
      encounterId: encounter.id
    }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Extract diabetic status from encounters
  const diabeticHistory = encounters
    .filter(encounter => encounter.diabeticStatus)
    .map(encounter => ({
      date: encounter.date,
      status: encounter.diabeticStatus,
      encounterId: encounter.id
    }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const latestDiabeticStatus = diabeticHistory[0]?.status;

  const getDiabeticStatusColor = (status: string) => {
    switch (status) {
      case "diabetic":
        return "bg-red-50 text-red-700 border-red-200";
      case "nondiabetic":
        return "bg-green-50 text-green-700 border-green-200";
      case "prediabetic":
        return "bg-yellow-50 text-yellow-700 border-yellow-200";
      default:
        return "bg-gray-50 text-gray-700 border-gray-200";
    }
  };

  return (
    <div className="space-y-6" data-testid="vascular-diabetic-tab">
      <div className="flex items-center gap-3">
        <Heart className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Vascular & Diabetic Assessment</h3>
      </div>

      {/* Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card data-testid="card-diabetic-status">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Diabetic Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {latestDiabeticStatus ? (
              <div className="space-y-2">
                <Badge 
                  variant="outline" 
                  className={getDiabeticStatusColor(latestDiabeticStatus)}
                  data-testid={`badge-diabetic-${latestDiabeticStatus}`}
                >
                  {latestDiabeticStatus.charAt(0).toUpperCase() + latestDiabeticStatus.slice(1)}
                </Badge>
                <p className="text-xs text-muted-foreground">
                  Last updated: {new Date(diabeticHistory[0].date).toLocaleDateString()}
                </p>
              </div>
            ) : (
              <div className="text-muted-foreground" data-testid="no-diabetic-status">
                Not assessed
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-vascular-assessments">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Heart className="h-4 w-4" />
              Vascular Assessments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-vascular-count">
              {vascularAssessments.length}
            </div>
            <p className="text-xs text-muted-foreground">
              Total assessments
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Vascular Assessment History */}
      <Card data-testid="card-vascular-history">
        <CardHeader>
          <CardTitle>Vascular Assessment History</CardTitle>
          <CardDescription>
            Detailed vascular circulation assessments and findings
          </CardDescription>
        </CardHeader>
        <CardContent>
          {vascularAssessments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="no-vascular-assessments">
              <Heart className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No vascular assessments documented yet.</p>
            </div>
          ) : (
            <div className="space-y-4" data-testid="vascular-assessment-list">
              {vascularAssessments.map((assessment, index) => (
                <div 
                  key={assessment.encounterId} 
                  className="border rounded-lg p-4"
                  data-testid={`vascular-assessment-${index}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-medium" data-testid={`assessment-date-${index}`}>
                      {new Date(assessment.date).toLocaleDateString()}
                    </span>
                    <Badge variant="outline" data-testid={`assessment-status-${index}`}>
                      Documented
                    </Badge>
                  </div>
                  
                  {assessment.assessment && typeof assessment.assessment === 'object' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid={`assessment-details-${index}`}>
                      {(Object.entries(assessment.assessment as Record<string, any>).map(([key, value]: [string, any]) => (
                          <div key={key} className="space-y-1">
                            <div className="text-sm font-medium text-muted-foreground capitalize">
                              {key.replace(/([A-Z])/g, ' $1').trim()}
                            </div>
                            <div className="text-sm" data-testid={`assessment-${key}-${index}`}>
                              {typeof value === 'string' ? value : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value || '')}
                            </div>
                          </div>
                      )) as JSX.Element[])}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Diabetic Management */}
      <Card data-testid="card-diabetic-management">
        <CardHeader>
          <CardTitle>Diabetic Status History</CardTitle>
          <CardDescription>
            Changes in diabetic status over time
          </CardDescription>
        </CardHeader>
        <CardContent>
          {diabeticHistory.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="no-diabetic-history">
              <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No diabetic status assessments documented yet.</p>
            </div>
          ) : (
            <div className="space-y-3" data-testid="diabetic-history-list">
              {diabeticHistory.map((entry, index) => (
                <div 
                  key={entry.encounterId} 
                  className="flex items-center justify-between p-3 border rounded-lg"
                  data-testid={`diabetic-entry-${index}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium" data-testid={`diabetic-date-${index}`}>
                      {new Date(entry.date).toLocaleDateString()}
                    </span>
                    <Badge 
                      variant="outline" 
                      className={getDiabeticStatusColor(entry.status || '')}
                      data-testid={`diabetic-status-${index}`}
                    >
                      {entry.status ? entry.status.charAt(0).toUpperCase() + entry.status.slice(1) : 'Unknown'}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Assessment #{diabeticHistory.length - index}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Clinical Guidelines */}
      <Card data-testid="card-clinical-guidelines">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Clinical Guidelines
          </CardTitle>
          <CardDescription>
            Vascular and diabetic assessment guidelines for wound care
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
              <h4 className="font-medium mb-2" data-testid="vascular-guidelines-title">
                Vascular Assessment Requirements
              </h4>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li data-testid="guideline-pulse">• Document dorsalis pedis and posterior tibial pulses</li>
                <li data-testid="guideline-capillary">• Assess capillary refill time</li>
                <li data-testid="guideline-edema">• Evaluate for edema and varicosities</li>
                <li data-testid="guideline-abi">• Consider ABI (Ankle-Brachial Index) when indicated</li>
              </ul>
            </div>
            
            <div className="p-4 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg">
              <h4 className="font-medium mb-2" data-testid="diabetic-guidelines-title">
                Diabetic Assessment Guidelines
              </h4>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li data-testid="guideline-glucose">• Document current glucose control status</li>
                <li data-testid="guideline-hba1c">• Review HbA1c levels when available</li>
                <li data-testid="guideline-neuropathy">• Assess for diabetic neuropathy</li>
                <li data-testid="guideline-compliance">• Evaluate medication compliance</li>
              </ul>
            </div>
            
            <div className="text-center py-4 text-muted-foreground">
              <p data-testid="advanced-vascular-placeholder">
                Advanced vascular assessment tools and diabetic management tracking coming soon.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}