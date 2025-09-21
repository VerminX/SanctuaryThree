import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, CheckCircle, AlertCircle, Heart } from "lucide-react";
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

interface ConservativeCareTabProps {
  episode?: Episode;
  encounters: Encounter[];
  patient?: DecryptedPatient;
  isLoading: boolean;
}

export default function ConservativeCareTab({ episode, encounters, patient, isLoading }: ConservativeCareTabProps) {
  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="conservative-care-loading">
        <div className="h-8 bg-muted animate-pulse rounded"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-40 bg-muted animate-pulse rounded"></div>
          <div className="h-40 bg-muted animate-pulse rounded"></div>
        </div>
        <div className="h-60 bg-muted animate-pulse rounded"></div>
      </div>
    );
  }

  // Extract conservative care data from encounters
  const conservativeCareHistory = encounters
    .filter(encounter => encounter.conservativeCare)
    .map(encounter => ({
      date: encounter.date,
      care: encounter.conservativeCare,
      encounterId: encounter.id
    }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="space-y-6" data-testid="conservative-care-tab">
      <div className="flex items-center gap-3">
        <Heart className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Conservative Care Management</h3>
      </div>

      {/* Conservative Care Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card data-testid="card-care-duration">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Treatment Duration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-care-duration">
              {episode?.episodeStartDate ? 
                Math.ceil((Date.now() - new Date(episode.episodeStartDate).getTime()) / (1000 * 60 * 60 * 24)) 
                : 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Days of care
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-care-interventions">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Care Interventions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-care-interventions">
              {conservativeCareHistory.length}
            </div>
            <p className="text-xs text-muted-foreground">
              Documented sessions
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Conservative Care History */}
      <Card data-testid="card-care-history">
        <CardHeader>
          <CardTitle>Conservative Care History</CardTitle>
          <CardDescription>
            Detailed record of all conservative care interventions and their outcomes
          </CardDescription>
        </CardHeader>
        <CardContent>
          {conservativeCareHistory.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="no-care-history">
              <Heart className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No conservative care interventions documented yet.</p>
            </div>
          ) : (
            <div className="space-y-4" data-testid="care-history-list">
              {conservativeCareHistory.map((entry, index) => (
                <div 
                  key={entry.encounterId} 
                  className="border rounded-lg p-4"
                  data-testid={`care-entry-${index}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium" data-testid={`care-date-${index}`}>
                        {new Date(entry.date).toLocaleDateString()}
                      </span>
                    </div>
                    <Badge variant="outline" data-testid={`care-status-${index}`}>
                      Documented
                    </Badge>
                  </div>
                  
                  <div className="space-y-2" data-testid={`care-details-${index}`}>
                    {entry.care && typeof entry.care === 'object' && (
                      <div className="text-sm">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {(Object.entries(entry.care as Record<string, any>).map(([key, value]: [string, any]) => (
                              <div key={key} className="space-y-1">
                                <div className="font-medium text-muted-foreground capitalize">
                                  {key.replace(/([A-Z])/g, ' $1').trim()}
                                </div>
                                <div data-testid={`care-${key}-${index}`}>
                                  {typeof value === 'string' ? value : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value || '')}
                                </div>
                              </div>
                          )) as JSX.Element[])}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Medicare Requirements */}
      <Card data-testid="card-medicare-requirements">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Medicare Requirements
          </CardTitle>
          <CardDescription>
            Conservative care documentation requirements for Medicare coverage
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
              <h4 className="font-medium mb-2" data-testid="medicare-requirements-title">
                Conservative Care Documentation Requirements
              </h4>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li data-testid="requirement-duration">• Minimum 30 days of conservative care for most wound types</li>
                <li data-testid="requirement-documentation">• Detailed documentation of interventions and patient response</li>
                <li data-testid="requirement-assessment">• Regular assessment of wound healing progress</li>
                <li data-testid="requirement-compliance">• Patient compliance with treatment plan</li>
              </ul>
            </div>
            
            <div className="text-center py-4 text-muted-foreground">
              <p data-testid="advanced-analysis-placeholder">
                Advanced conservative care analysis and Medicare compliance tracking coming soon.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}