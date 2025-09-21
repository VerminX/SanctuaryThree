import { useState, useEffect } from "react";
import { AlertTriangle, Shield, FileText, Clock, CheckCircle, XCircle, Info, Heart, Activity } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { type ICD10Code, getClinicalRecommendations, getMedicareCompliance } from "@shared/icd10Database";

interface RecommendationsEngineProps {
  diagnosisCodes: string[];
  woundType?: string;
  woundLocation?: string;
  patientHistory?: {
    diabetes?: boolean;
    vascularDisease?: boolean;
    previousUlcers?: boolean;
    currentMedications?: string[];
  };
  conservativeCareHistory?: {
    offloading?: { tried: boolean; duration?: string; effective?: boolean };
    compression?: { tried: boolean; duration?: string; effective?: boolean };
    debridement?: { tried: boolean; duration?: string; effective?: boolean };
    woundCare?: { tried: boolean; duration?: string; effective?: boolean };
  };
  onRecommendationSelect?: (recommendation: string, type: 'immediate' | 'conservative' | 'monitoring') => void;
  onComplianceAlert?: (alert: ComplianceAlert) => void;
  className?: string;
  "data-testid"?: string;
}

interface ComplianceAlert {
  type: 'error' | 'warning' | 'info';
  title: string;
  description: string;
  actionRequired: boolean;
  lcdReference?: string;
  documentationRequired?: string[];
}

interface ClinicalDecision {
  id: string;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  category: 'immediate' | 'conservative' | 'monitoring' | 'documentation';
  evidenceLevel: 'A' | 'B' | 'C';
  actionItems: string[];
  contraindications?: string[];
  medicareRequirements?: string[];
}

export default function RecommendationsEngine({
  diagnosisCodes,
  woundType,
  woundLocation,
  patientHistory,
  conservativeCareHistory,
  onRecommendationSelect,
  onComplianceAlert,
  className,
  "data-testid": testId = "recommendations-engine"
}: RecommendationsEngineProps) {
  const [clinicalDecisions, setClinicalDecisions] = useState<ClinicalDecision[]>([]);
  const [complianceAlerts, setComplianceAlerts] = useState<ComplianceAlert[]>([]);
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    if (diagnosisCodes.length === 0) {
      setClinicalDecisions([]);
      setComplianceAlerts([]);
      return;
    }

    const decisions: ClinicalDecision[] = [];
    const alerts: ComplianceAlert[] = [];

    diagnosisCodes.forEach(code => {
      const recommendations = getClinicalRecommendations(code);
      const compliance = getMedicareCompliance(code);

      if (recommendations) {
        // Generate clinical decisions based on recommendations
        if (recommendations.immediate_care) {
          decisions.push({
            id: `immediate-${code}`,
            title: `Immediate Care for ${code}`,
            description: `Critical immediate interventions required for diagnosis ${code}`,
            priority: 'high',
            category: 'immediate',
            evidenceLevel: recommendations.evidence_level || 'B',
            actionItems: recommendations.immediate_care,
            contraindications: recommendations.contraindications
          });
        }

        if (recommendations.conservative_care) {
          // Check if conservative care has been tried based on history
          const hasTriedConservativeCare = conservativeCareHistory && Object.values(conservativeCareHistory).some(care => care?.tried);
          
          decisions.push({
            id: `conservative-${code}`,
            title: hasTriedConservativeCare ? `Advanced Care for ${code}` : `Conservative Care for ${code}`,
            description: hasTriedConservativeCare 
              ? `Conservative care attempted - consider advanced interventions for ${code}`
              : `Standard conservative care protocol for ${code}`,
            priority: hasTriedConservativeCare ? 'high' : 'medium',
            category: 'conservative',
            evidenceLevel: recommendations.evidence_level || 'B',
            actionItems: recommendations.conservative_care,
            contraindications: recommendations.contraindications
          });
        }

        if (recommendations.monitoring_requirements) {
          decisions.push({
            id: `monitoring-${code}`,
            title: `Monitoring Protocol for ${code}`,
            description: `Required monitoring and follow-up schedule for ${code}`,
            priority: 'medium',
            category: 'monitoring',
            evidenceLevel: recommendations.evidence_level || 'B',
            actionItems: recommendations.monitoring_requirements
          });
        }
      }

      if (compliance) {
        // Generate compliance alerts
        if (!compliance.isLCDCovered) {
          alerts.push({
            type: 'error',
            title: `Medicare Coverage Alert - ${code}`,
            description: `Diagnosis ${code} may not be covered under current Medicare LCDs. Verify coverage before proceeding.`,
            actionRequired: true,
            lcdReference: compliance.lcdNumbers?.[0]
          });
        } else {
          // Check coverage conditions
          if (compliance.coverage_conditions) {
            const failedConditions = checkCoverageConditions(compliance.coverage_conditions, conservativeCareHistory, patientHistory);
            if (failedConditions.length > 0) {
              alerts.push({
                type: 'warning',
                title: `Coverage Conditions Not Met - ${code}`,
                description: `The following coverage conditions must be satisfied for ${code}: ${failedConditions.join(', ')}`,
                actionRequired: true,
                lcdReference: compliance.lcdNumbers?.[0]
              });
            }
          }

          // Documentation requirements
          if (compliance.documentation_requirements) {
            alerts.push({
              type: 'info',
              title: `Documentation Required - ${code}`,
              description: `Ensure the following documentation is complete for ${code}`,
              actionRequired: false,
              documentationRequired: compliance.documentation_requirements,
              lcdReference: compliance.lcdNumbers?.[0]
            });
          }

          // Frequency limitations
          if (compliance.frequencyLimitations) {
            alerts.push({
              type: 'info',
              title: `Visit Frequency Guidelines - ${code}`,
              description: compliance.frequencyLimitations,
              actionRequired: false,
              lcdReference: compliance.lcdNumbers?.[0]
            });
          }
        }
      }
    });

    // Add wound-specific recommendations
    if (woundType && woundLocation) {
      const woundSpecificDecisions = generateWoundSpecificRecommendations(woundType, woundLocation, patientHistory);
      decisions.push(...woundSpecificDecisions);
    }

    // Sort decisions by priority
    decisions.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });

    setClinicalDecisions(decisions);
    setComplianceAlerts(alerts);

    // Notify parent of compliance alerts
    alerts.forEach(alert => {
      onComplianceAlert?.(alert);
    });
  }, [diagnosisCodes, woundType, woundLocation, patientHistory, conservativeCareHistory, onComplianceAlert]);

  const checkCoverageConditions = (
    conditions: string[],
    conservativeHistory?: RecommendationsEngineProps['conservativeCareHistory'],
    patientHist?: RecommendationsEngineProps['patientHistory']
  ): string[] => {
    const failedConditions: string[] = [];

    conditions.forEach(condition => {
      const lowerCondition = condition.toLowerCase();
      
      if (lowerCondition.includes('conservative care') && lowerCondition.includes('30 days')) {
        const hasConservativeCare = conservativeHistory && Object.values(conservativeHistory).some(care => care?.tried);
        if (!hasConservativeCare) {
          failedConditions.push('30-day conservative care trial');
        }
      }

      if (lowerCondition.includes('vascular') && lowerCondition.includes('assessment')) {
        // Could check if vascular assessment is documented
        // For now, we'll assume it needs to be verified
      }

      if (lowerCondition.includes('infection') && lowerCondition.includes('controlled')) {
        // Could check infection status
      }
    });

    return failedConditions;
  };

  const generateWoundSpecificRecommendations = (
    woundType: string,
    location: string,
    patientHist?: RecommendationsEngineProps['patientHistory']
  ): ClinicalDecision[] => {
    const recommendations: ClinicalDecision[] = [];

    if (woundType === 'DFU') {
      recommendations.push({
        id: 'dfu-specific',
        title: 'Diabetic Foot Ulcer Protocol',
        description: 'Specialized care protocol for diabetic foot ulcers',
        priority: 'high',
        category: 'immediate',
        evidenceLevel: 'A',
        actionItems: [
          'Assess glycemic control (HbA1c)',
          'Evaluate vascular status (ABI)',
          'Implement total contact casting or offloading boot',
          'Screen for infection and osteomyelitis',
          'Assess diabetic neuropathy'
        ],
        medicareRequirements: [
          'Document diabetic status',
          'Record HbA1c within 90 days',
          'Document offloading measures',
          'Photo documentation required'
        ]
      });
    }

    if (woundType === 'VLU') {
      recommendations.push({
        id: 'vlu-specific',
        title: 'Venous Leg Ulcer Protocol',
        description: 'Evidence-based care for venous leg ulcers',
        priority: 'high',
        category: 'conservative',
        evidenceLevel: 'A',
        actionItems: [
          'Implement compression therapy (30-40mmHg)',
          'Assess venous insufficiency with duplex ultrasound',
          'Encourage ambulation and leg elevation',
          'Evaluate for underlying venous disease',
          'Consider venous ablation if appropriate'
        ],
        contraindications: [
          'Arterial insufficiency (ABI < 0.8)',
          'Severe heart failure',
          'Severe peripheral arterial disease'
        ]
      });
    }

    if (patientHist?.diabetes) {
      recommendations.push({
        id: 'diabetes-management',
        title: 'Diabetes Management in Wound Care',
        description: 'Optimize diabetes management for wound healing',
        priority: 'medium',
        category: 'monitoring',
        evidenceLevel: 'A',
        actionItems: [
          'Target HbA1c < 7% if achievable',
          'Monitor blood glucose closely',
          'Assess diabetic complications',
          'Coordinate with endocrinologist if needed',
          'Provide diabetes education'
        ]
      });
    }

    return recommendations;
  };

  const getPriorityColor = (priority: ClinicalDecision['priority']) => {
    switch (priority) {
      case 'high': return 'text-red-600 border-red-200 bg-red-50';
      case 'medium': return 'text-yellow-600 border-yellow-200 bg-yellow-50';
      case 'low': return 'text-blue-600 border-blue-200 bg-blue-50';
    }
  };

  const getPriorityIcon = (priority: ClinicalDecision['priority']) => {
    switch (priority) {
      case 'high': return <AlertTriangle className="h-4 w-4 text-red-600" />;
      case 'medium': return <Clock className="h-4 w-4 text-yellow-600" />;
      case 'low': return <Info className="h-4 w-4 text-blue-600" />;
    }
  };

  const getCategoryIcon = (category: ClinicalDecision['category']) => {
    switch (category) {
      case 'immediate': return <Heart className="h-4 w-4 text-red-500" />;
      case 'conservative': return <Activity className="h-4 w-4 text-blue-500" />;
      case 'monitoring': return <Clock className="h-4 w-4 text-green-500" />;
      case 'documentation': return <FileText className="h-4 w-4 text-purple-500" />;
    }
  };

  const getAlertIcon = (type: ComplianceAlert['type']) => {
    switch (type) {
      case 'error': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'info': return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const getAlertVariant = (type: ComplianceAlert['type']) => {
    switch (type) {
      case 'error': return 'destructive';
      case 'warning': return 'default';
      case 'info': return 'default';
    }
  };

  if (diagnosisCodes.length === 0) {
    return (
      <div className={cn("text-center py-8 text-muted-foreground", className)} data-testid={`${testId}-empty`}>
        <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>Enter a diagnosis code to see clinical recommendations</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)} data-testid={testId}>
      {/* Compliance Alerts */}
      {complianceAlerts.length > 0 && (
        <Card data-testid={`${testId}-compliance-alerts`}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Medicare LCD Compliance Alerts
              <Badge variant="outline" className="ml-auto">
                {complianceAlerts.length} alert{complianceAlerts.length !== 1 ? 's' : ''}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {complianceAlerts.map((alert, index) => (
              <Alert key={index} variant={getAlertVariant(alert.type)} className="py-3">
                <div className="flex items-start gap-3">
                  {getAlertIcon(alert.type)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium text-sm">{alert.title}</h4>
                      {alert.actionRequired && (
                        <Badge variant="outline" className="text-xs">
                          Action Required
                        </Badge>
                      )}
                    </div>
                    <AlertDescription className="text-sm">
                      {alert.description}
                    </AlertDescription>
                    
                    {alert.documentationRequired && (
                      <div className="mt-2">
                        <p className="text-xs font-medium mb-1">Required Documentation:</p>
                        <ul className="text-xs text-muted-foreground space-y-0.5">
                          {alert.documentationRequired.map((doc, docIndex) => (
                            <li key={docIndex} className="flex items-start gap-1">
                              <CheckCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                              {doc}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {alert.lcdReference && (
                      <div className="mt-2">
                        <Badge variant="outline" className="text-xs">
                          LCD: {alert.lcdReference}
                        </Badge>
                      </div>
                    )}
                  </div>
                </div>
              </Alert>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Clinical Decisions */}
      <Card data-testid={`${testId}-clinical-decisions`}>
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CollapsibleTrigger asChild>
            <CardHeader className="pb-3 cursor-pointer hover:bg-muted/50 transition-colors">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Clinical Decision Support
                <Badge variant="outline" className="ml-auto">
                  {clinicalDecisions.length} recommendation{clinicalDecisions.length !== 1 ? 's' : ''}
                </Badge>
              </CardTitle>
              <CardDescription>
                Evidence-based recommendations for selected diagnoses
              </CardDescription>
            </CardHeader>
          </CollapsibleTrigger>
          
          <CollapsibleContent>
            <CardContent>
              <ScrollArea className="max-h-96">
                <div className="space-y-4">
                  {clinicalDecisions.map((decision, index) => (
                    <div key={decision.id} className="space-y-3">
                      <div className={cn(
                        "p-4 rounded-lg border-l-4",
                        getPriorityColor(decision.priority)
                      )}>
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex items-center gap-2">
                            {getPriorityIcon(decision.priority)}
                            <h4 className="font-medium text-sm">{decision.title}</h4>
                            {getCategoryIcon(decision.category)}
                          </div>
                          <div className="flex items-center gap-1">
                            <Badge variant="outline" className="text-xs capitalize">
                              {decision.priority} priority
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              Level {decision.evidenceLevel}
                            </Badge>
                          </div>
                        </div>
                        
                        <p className="text-sm text-muted-foreground mb-3">
                          {decision.description}
                        </p>

                        <div className="space-y-3">
                          <div>
                            <h5 className="text-xs font-medium mb-2">Action Items:</h5>
                            <ul className="text-xs space-y-1">
                              {decision.actionItems.map((item, itemIndex) => (
                                <li key={itemIndex} className="flex items-start gap-2">
                                  <CheckCircle className="h-3 w-3 mt-0.5 text-green-500 flex-shrink-0" />
                                  <span>{item}</span>
                                  {onRecommendationSelect && (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-auto p-0 text-xs text-blue-600 hover:text-blue-800"
                                      onClick={() => onRecommendationSelect(item, decision.category as any)}
                                    >
                                      Apply
                                    </Button>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>

                          {decision.contraindications && (
                            <div>
                              <h5 className="text-xs font-medium mb-2 text-red-600">Contraindications:</h5>
                              <ul className="text-xs space-y-1">
                                {decision.contraindications.map((contra, contraIndex) => (
                                  <li key={contraIndex} className="flex items-start gap-2">
                                    <AlertTriangle className="h-3 w-3 mt-0.5 text-red-500 flex-shrink-0" />
                                    <span className="text-red-600">{contra}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {decision.medicareRequirements && (
                            <div>
                              <h5 className="text-xs font-medium mb-2 flex items-center gap-1">
                                <Shield className="h-3 w-3" />
                                Medicare Requirements:
                              </h5>
                              <ul className="text-xs space-y-1">
                                {decision.medicareRequirements.map((req, reqIndex) => (
                                  <li key={reqIndex} className="flex items-start gap-2">
                                    <FileText className="h-3 w-3 mt-0.5 text-blue-500 flex-shrink-0" />
                                    <span>{req}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {index < clinicalDecisions.length - 1 && <Separator />}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    </div>
  );
}