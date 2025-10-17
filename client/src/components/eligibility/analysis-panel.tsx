import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Brain, CheckCircle, XCircle, AlertTriangle, ExternalLink, FileText, Calendar, History, TrendingUp, GitBranch, RotateCcw, Activity, UserCheck, ChevronDown, ChevronRight, Shield, Clock, MapPin, Building2, Gavel } from "lucide-react";

interface SelectedPolicy {
  id: string;
  mac: string;
  lcdId: string;
  title: string;
  url: string;
  effectiveDate: string;
  effectiveThrough?: string;
  status: string;
  policyType: string;
}

interface SelectionAudit {
  policiesConsidered: number;
  filtersApplied: string[];
  topPolicyScores?: Array<{
    policyId: string;
    lcdId: string;
    title: string;
    score: number;
    reasons: string[];
  }>;
  selectedReason: string;
  fallbackUsed?: boolean;
  selectionCriteria?: {
    woundCareRelevance: boolean;
    supersededExclusion: boolean;
    dateRelevance: boolean;
    macRegionMatch: boolean;
  };
}

interface EligibilityResult {
  eligibility: "Yes" | "No" | "Unclear";
  rationale: string;
  requiredDocumentationGaps: string[];
  citations: Array<{
    title: string;
    url: string;
    section: string;
    effectiveDate: string;
  }>;
  letterBullets: string[];
  // Enhanced fields for historical context and episode timeline
  historicalContext?: {
    totalEpisodes: number;
    totalEncounters: number;
    previousEligibilityChecks: number;
    keyPatterns: string[];
  };
  episodeTimeline?: Array<{
    date: string;
    encounterType: string;
    keyFindings: string[];
    woundProgression: string;
    careCompliance: string;
  }>;
  crossEpisodePatterns?: {
    woundRecurrence: string[];
    treatmentResponse: string[];
    complianceHistory: string[];
  };
}

interface AnalysisResultData {
  result?: EligibilityResult;
  selectedPolicy?: SelectedPolicy;
  selectionAudit?: SelectionAudit;
}

interface AnalysisPanelProps {
  encounters: Array<{
    id: string;
    patientId: string;
    patientName: string;
    woundType: string;
    date: string;
  }>;
  episodes: Array<{
    id: string;
    patientId: string;
    patientName: string;
    woundType: string;
    woundLocation: string;
    episodeStartDate: string;
    status: string;
    encounterCount: number;
  }>;
  macRegions: Array<{ code: string; label: string }>;
  onAnalyze: (params: { 
    mode: 'episode' | 'encounter'; 
    id: string; 
    macRegion: string; 
  }) => Promise<void>;
  result?: AnalysisResultData;
  isLoading: boolean;
}

export default function AnalysisPanel({ 
  encounters, 
  episodes,
  macRegions, 
  onAnalyze, 
  result, 
  isLoading 
}: AnalysisPanelProps) {
  const [analysisMode, setAnalysisMode] = useState<'episode' | 'encounter'>('episode'); // Default to episode
  const [selectedEncounter, setSelectedEncounter] = useState<string>("");
  const [selectedEpisode, setSelectedEpisode] = useState<string>("");
  const [selectedMacRegion, setSelectedMacRegion] = useState<string>("");
  const [auditTrailOpen, setAuditTrailOpen] = useState<boolean>(false);

  const handleAnalyze = async () => {
    const selectedId = analysisMode === 'episode' ? selectedEpisode : selectedEncounter;
    if (selectedId && selectedMacRegion) {
      await onAnalyze({ mode: analysisMode, id: selectedId, macRegion: selectedMacRegion });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "Yes":
        return <CheckCircle className="w-6 h-6 text-chart-2" />;
      case "No":
        return <XCircle className="w-6 h-6 text-destructive" />;
      case "Unclear":
        return <AlertTriangle className="w-6 h-6 text-chart-3" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Yes":
        return "bg-chart-2/10 border-chart-2/20 text-chart-2";
      case "No":
        return "bg-destructive/10 border-destructive/20 text-destructive";
      case "Unclear":
        return "bg-chart-3/10 border-chart-3/20 text-chart-3";
      default:
        return "bg-muted border-border text-muted-foreground";
    }
  };

  return (
    <Card data-testid="eligibility-analysis-panel">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center space-x-2">
            <Brain className="w-5 h-5 text-primary" />
            <span>AI Eligibility Analysis</span>
          </span>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-chart-2 rounded-full"></div>
            <span className="text-xs text-muted-foreground">OpenAI GPT-4o-mini • HIPAA Compliant</span>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Analysis Form */}
        <div className="space-y-4">
          {/* Analysis Mode Selection */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-3">
              Analysis Type
            </label>
            <Tabs value={analysisMode} onValueChange={(value) => setAnalysisMode(value as 'episode' | 'encounter')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="episode" data-testid="tab-episode-analysis" className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Episode Analysis
                  <Badge variant="secondary" className="text-xs ml-1">Recommended</Badge>
                </TabsTrigger>
                <TabsTrigger value="encounter" data-testid="tab-encounter-analysis" className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Single Encounter
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="episode" className="mt-4">
                <div className="bg-muted/30 p-3 rounded-lg mb-4">
                  <p className="text-sm text-muted-foreground">
                    <strong>Episode Analysis (Default):</strong> Analyzes complete patient history across all episodes and encounters, 
                    including previous eligibility decisions for comprehensive medical necessity assessment.
                  </p>
                </div>
                <Select 
                  value={selectedEpisode} 
                  onValueChange={setSelectedEpisode}
                >
                  <SelectTrigger data-testid="select-episode">
                    <SelectValue placeholder="Choose an episode to analyze with full patient history" />
                  </SelectTrigger>
                  <SelectContent>
                    {episodes.map((episode) => (
                      <SelectItem key={episode.id} value={episode.id}>
                        {episode.patientName} - {episode.woundType} at {episode.woundLocation} ({new Date(episode.episodeStartDate).toLocaleDateString()} • {episode.encounterCount} encounters)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TabsContent>
              
              <TabsContent value="encounter" className="mt-4">
                <div className="bg-muted/30 p-3 rounded-lg mb-4">
                  <p className="text-sm text-muted-foreground">
                    <strong>Single Encounter Analysis:</strong> Analyzes only the selected encounter in isolation. 
                    Use when specific encounter-level analysis is needed.
                  </p>
                </div>
                <Select 
                  value={selectedEncounter} 
                  onValueChange={setSelectedEncounter}
                >
                  <SelectTrigger data-testid="select-encounter">
                    <SelectValue placeholder="Choose a single encounter to analyze" />
                  </SelectTrigger>
                  <SelectContent>
                    {encounters.map((encounter) => (
                      <SelectItem key={encounter.id} value={encounter.id}>
                        {encounter.patientName} - {encounter.woundType} ({new Date(encounter.date).toLocaleDateString()})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TabsContent>
            </Tabs>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              MAC Region
            </label>
            <Select 
              value={selectedMacRegion} 
              onValueChange={setSelectedMacRegion}
            >
              <SelectTrigger data-testid="select-mac-region">
                <SelectValue placeholder="Select MAC region" />
              </SelectTrigger>
              <SelectContent>
                {macRegions.map((region) => (
                  <SelectItem key={region.code} value={region.code}>
                    {region.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleAnalyze}
            disabled={
              (!selectedEpisode && analysisMode === 'episode') || 
              (!selectedEncounter && analysisMode === 'encounter') || 
              !selectedMacRegion || 
              isLoading
            }
            className="w-full"
            data-testid="button-analyze-eligibility"
          >
            {isLoading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Analyzing...
              </>
            ) : (
              <>
                <Brain className="w-4 h-4 mr-2" />
                Analyze {analysisMode === 'episode' ? 'Episode' : 'Encounter'} Eligibility
                <Badge variant="outline" className="ml-2 text-xs">
                  {analysisMode === 'episode' ? 'Full History' : 'Single'}
                </Badge>
              </>
            )}
          </Button>
        </div>

        {/* Analysis Results */}
        {result?.result && (
          <div className="space-y-4">
            {/* Selected LCD Information */}
            {result.selectedPolicy ? (
              <div className="p-4 border rounded-lg bg-primary/5 border-primary/20" data-testid="selected-lcd-info">
                <div className="flex items-start space-x-3">
                  <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                    <Shield className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <h4 className="font-semibold text-primary">Selected LCD Policy</h4>
                      <Badge variant="outline" className="text-xs border-primary/30">
                        {result.selectedPolicy.status}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      <div>
                        <div className="text-muted-foreground mb-1">Policy Title</div>
                        <div className="font-medium" data-testid="lcd-title">{result.selectedPolicy.title}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground mb-1">LCD ID</div>
                        <div className="font-medium" data-testid="lcd-id">{result.selectedPolicy.lcdId}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground mb-1">MAC Region</div>
                        <div className="font-medium flex items-center" data-testid="lcd-mac-region">
                          <MapPin className="w-3 h-3 mr-1" />
                          {result.selectedPolicy.mac}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground mb-1">Effective Date</div>
                        <div className="font-medium flex items-center" data-testid="lcd-effective-date">
                          <Clock className="w-3 h-3 mr-1" />
                          {new Date(result.selectedPolicy.effectiveDate).toLocaleDateString()}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground mb-1">Policy Type</div>
                        <div className="font-medium flex items-center" data-testid="lcd-policy-type">
                          <Gavel className="w-3 h-3 mr-1" />
                          {result.selectedPolicy.policyType === 'final' ? 'Final' : 'Proposed'}
                        </div>
                      </div>
                      {result.selectedPolicy.url && (
                        <div>
                          <div className="text-muted-foreground mb-1">Full Policy</div>
                          <a 
                            href={result.selectedPolicy.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="font-medium text-primary hover:underline flex items-center"
                            data-testid="lcd-policy-link"
                          >
                            <ExternalLink className="w-3 h-3 mr-1" />
                            View Policy
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 border rounded-lg bg-muted/5 border-muted" data-testid="no-lcd-selected">
                <div className="flex items-center space-x-3">
                  <AlertTriangle className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <h4 className="font-medium text-muted-foreground">No LCD Policy Selected</h4>
                    <p className="text-sm text-muted-foreground">No specific LCD policy was identified for this analysis. The AI used general Medicare guidelines.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Eligibility Result */}
            <div className={`p-4 border rounded-lg ${getStatusColor(result.result.eligibility)}`} data-testid="analysis-result">
              <div className="flex items-start space-x-3">
                {getStatusIcon(result.result.eligibility)}
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    <h4 className="font-semibold">Eligibility: {result.result.eligibility.toUpperCase()}</h4>
                    <Badge variant="outline" className="text-xs">
                      AI Generated
                    </Badge>
                  </div>
                  <p className="text-sm mb-3">{result.result.rationale}</p>
                
                  {/* Documentation Gaps */}
                  {result.result.requiredDocumentationGaps.length > 0 && (
                    <div className="mb-4">
                      <h5 className="font-medium text-sm mb-2">Required Documentation Gaps:</h5>
                      <ul className="space-y-1">
                        {result.result.requiredDocumentationGaps.map((gap, index) => (
                          <li key={index} className="flex items-center text-sm">
                            <AlertTriangle className="w-3 h-3 mr-2 flex-shrink-0" />
                            <span>{gap}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Letter Bullets */}
                  {result.result.letterBullets.length > 0 && (
                    <div className="mb-4">
                      <h5 className="font-medium text-sm mb-2">Key Points for Letter:</h5>
                      <ul className="space-y-1">
                        {result.result.letterBullets.map((bullet, index) => (
                          <li key={index} className="flex items-start text-sm">
                            <CheckCircle className="w-3 h-3 mr-2 mt-0.5 flex-shrink-0" />
                            <span>{bullet}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Historical Context */}
                  {result.result.historicalContext && (
                    <div className="pt-3 border-t border-border/20">
                      <h5 className="font-medium text-sm mb-2 flex items-center">
                        <History className="w-4 h-4 mr-1" />
                        Historical Context:
                      </h5>
                      <div className="grid grid-cols-3 gap-4 mb-2">
                        <div className="text-center p-2 bg-muted/30 rounded">
                          <div className="text-lg font-bold text-primary">{result.result.historicalContext.totalEpisodes}</div>
                          <div className="text-xs text-muted-foreground">Episodes</div>
                        </div>
                        <div className="text-center p-2 bg-muted/30 rounded">
                          <div className="text-lg font-bold text-primary">{result.result.historicalContext.totalEncounters}</div>
                          <div className="text-xs text-muted-foreground">Encounters</div>
                        </div>
                        <div className="text-center p-2 bg-muted/30 rounded">
                          <div className="text-lg font-bold text-primary">{result.result.historicalContext.previousEligibilityChecks}</div>
                          <div className="text-xs text-muted-foreground">Previous Checks</div>
                        </div>
                      </div>
                      {result.result.historicalContext.keyPatterns.length > 0 && (
                        <div>
                          <div className="text-xs font-medium mb-1">Key Patterns:</div>
                          <ul className="space-y-1">
                            {result.result.historicalContext.keyPatterns.map((pattern, index) => (
                              <li key={index} className="flex items-center text-xs">
                                <TrendingUp className="w-3 h-3 mr-2 flex-shrink-0" />
                                <span>{pattern}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Episode Timeline */}
                  {result.result.episodeTimeline && result.result.episodeTimeline.length > 0 && (
                    <div className="pt-3 border-t border-border/20">
                      <h5 className="font-medium text-sm mb-2 flex items-center">
                        <Calendar className="w-4 h-4 mr-1" />
                        Episode Timeline:
                      </h5>
                      <div className="space-y-3">
                        {result.result.episodeTimeline.map((timelineItem, index) => (
                          <div key={index} className="relative pl-6 border-l-2 border-muted last:border-l-0">
                            <div className="absolute -left-1.5 top-1 w-3 h-3 bg-primary rounded-full"></div>
                            <div className="pb-3">
                              <div className="flex items-center space-x-2 mb-1">
                                <span className="text-xs font-semibold">{timelineItem.date}</span>
                                <Badge variant="outline" className="text-xs">{timelineItem.encounterType}</Badge>
                              </div>
                              <div className="text-xs text-muted-foreground mb-2">
                                <div><strong>Progression:</strong> {timelineItem.woundProgression}</div>
                                <div><strong>Compliance:</strong> {timelineItem.careCompliance}</div>
                              </div>
                              {timelineItem.keyFindings.length > 0 && (
                                <ul className="space-y-1">
                                  {timelineItem.keyFindings.map((finding, findingIndex) => (
                                    <li key={findingIndex} className="flex items-start text-xs">
                                      <FileText className="w-3 h-3 mr-2 mt-0.5 flex-shrink-0" />
                                      <span>{finding}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Cross-Episode Patterns */}
                  {result.result.crossEpisodePatterns && (
                    <div className="pt-3 border-t border-border/20">
                      <h5 className="font-medium text-sm mb-2 flex items-center">
                        <GitBranch className="w-4 h-4 mr-1" />
                        Cross-Episode Patterns:
                      </h5>
                      <div className="space-y-3">
                        {result.result.crossEpisodePatterns.woundRecurrence.length > 0 && (
                          <div>
                            <div className="text-xs font-medium mb-1 text-destructive">Wound Recurrence:</div>
                            <ul className="space-y-1">
                              {result.result.crossEpisodePatterns.woundRecurrence.map((pattern, index) => (
                                <li key={index} className="flex items-center text-xs">
                                  <RotateCcw className="w-3 h-3 mr-2 flex-shrink-0 text-destructive" />
                                  <span>{pattern}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {result.result.crossEpisodePatterns.treatmentResponse.length > 0 && (
                          <div>
                            <div className="text-xs font-medium mb-1 text-chart-2">Treatment Response:</div>
                            <ul className="space-y-1">
                              {result.result.crossEpisodePatterns.treatmentResponse.map((pattern, index) => (
                                <li key={index} className="flex items-center text-xs">
                                  <Activity className="w-3 h-3 mr-2 flex-shrink-0 text-chart-2" />
                                  <span>{pattern}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {result.result.crossEpisodePatterns.complianceHistory.length > 0 && (
                          <div>
                            <div className="text-xs font-medium mb-1 text-chart-3">Compliance History:</div>
                            <ul className="space-y-1">
                              {result.result.crossEpisodePatterns.complianceHistory.map((pattern, index) => (
                                <li key={index} className="flex items-center text-xs">
                                  <UserCheck className="w-3 h-3 mr-2 flex-shrink-0 text-chart-3" />
                                  <span>{pattern}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Citations */}
                  {result.result.citations.length > 0 && (
                    <div className="pt-3 border-t border-border/20">
                      <h5 className="font-medium text-sm mb-2">Citations & References:</h5>
                      <div className="space-y-2">
                        {result.result.citations.map((citation, index) => (
                          <div key={index} className="text-xs">
                            <div className="flex items-center space-x-2">
                              <strong>{citation.title}</strong>
                              <a 
                                href={citation.url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-primary hover:underline"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                            <div className="text-muted-foreground">
                              {citation.section && `Section: ${citation.section} • `}
                              Effective: {citation.effectiveDate}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Collapsible Selection Audit Trail */}
            {result.selectionAudit && (
              <Collapsible open={auditTrailOpen} onOpenChange={setAuditTrailOpen}>
                <div className="p-4 border rounded-lg bg-muted/5 border-muted" data-testid="selection-audit-trail">
                  <CollapsibleTrigger asChild>
                    <Button 
                      variant="ghost" 
                      className="w-full justify-between p-0 h-auto hover:bg-transparent"
                      data-testid="audit-toggle"
                    >
                      <div className="flex items-center space-x-2">
                        <Building2 className="w-4 h-4 text-muted-foreground" />
                        <h4 className="font-medium text-foreground">Selection Audit Trail</h4>
                        <Badge variant="outline" className="text-xs" data-testid="badge-policies-considered">
                          {result.selectionAudit.policiesConsidered} policies considered
                        </Badge>
                        {result.selectionAudit.filtersApplied.length > 0 && (
                          <Badge variant="outline" className="text-xs" data-testid="badge-filters-applied">
                            {result.selectionAudit.filtersApplied.length} filters applied
                          </Badge>
                        )}
                      </div>
                      {auditTrailOpen ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      )}
                    </Button>
                  </CollapsibleTrigger>
                  
                  <CollapsibleContent className="mt-3 space-y-3" data-testid="audit-details">
                    {/* Summary Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="text-center p-2 bg-muted/30 rounded" data-testid="stat-policies-considered">
                        <div className="text-lg font-bold text-primary">{result.selectionAudit.policiesConsidered}</div>
                        <div className="text-xs text-muted-foreground">Policies Considered</div>
                      </div>
                      <div className="text-center p-2 bg-muted/30 rounded" data-testid="stat-filters-applied">
                        <div className="text-lg font-bold text-primary">{result.selectionAudit.filtersApplied.length}</div>
                        <div className="text-xs text-muted-foreground">Filters Applied</div>
                      </div>
                      <div className="text-center p-2 bg-muted/30 rounded" data-testid="stat-top-candidates">
                        <div className="text-lg font-bold text-primary">{result.selectionAudit.topPolicyScores?.length || 0}</div>
                        <div className="text-xs text-muted-foreground">Top Candidates</div>
                      </div>
                      <div className="text-center p-2 bg-muted/30 rounded" data-testid="stat-fallback-used">
                        <div className={`text-lg font-bold ${result.selectionAudit.fallbackUsed ? 'text-chart-3' : 'text-chart-2'}`}>
                          {result.selectionAudit.fallbackUsed ? 'Yes' : 'No'}
                        </div>
                        <div className="text-xs text-muted-foreground">Fallback Used</div>
                      </div>
                    </div>

                    {/* Filters Applied */}
                    {result.selectionAudit.filtersApplied.length > 0 && (
                      <div data-testid="filters-applied-section">
                        <h5 className="font-medium text-sm mb-2">Filters Applied:</h5>
                        <div className="flex flex-wrap gap-2">
                          {result.selectionAudit.filtersApplied.map((filter, index) => (
                            <Badge key={index} variant="secondary" className="text-xs" data-testid={`filter-${index}`}>
                              {filter}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Selection Criteria */}
                    {result.selectionAudit.selectionCriteria && (
                      <div data-testid="selection-criteria-section">
                        <h5 className="font-medium text-sm mb-2">Selection Criteria Checks:</h5>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div className={`flex items-center space-x-2 ${result.selectionAudit.selectionCriteria.woundCareRelevance ? 'text-chart-2' : 'text-destructive'}`} data-testid="criteria-wound-care">
                            {result.selectionAudit.selectionCriteria.woundCareRelevance ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                            <span>Wound Care Relevance</span>
                          </div>
                          <div className={`flex items-center space-x-2 ${result.selectionAudit.selectionCriteria.supersededExclusion ? 'text-chart-2' : 'text-destructive'}`} data-testid="criteria-superseded">
                            {result.selectionAudit.selectionCriteria.supersededExclusion ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                            <span>Superseded Exclusion</span>
                          </div>
                          <div className={`flex items-center space-x-2 ${result.selectionAudit.selectionCriteria.dateRelevance ? 'text-chart-2' : 'text-destructive'}`} data-testid="criteria-date-relevance">
                            {result.selectionAudit.selectionCriteria.dateRelevance ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                            <span>Date Relevance</span>
                          </div>
                          <div className={`flex items-center space-x-2 ${result.selectionAudit.selectionCriteria.macRegionMatch ? 'text-chart-2' : 'text-destructive'}`} data-testid="criteria-mac-region">
                            {result.selectionAudit.selectionCriteria.macRegionMatch ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                            <span>MAC Region Match</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Top Policy Scores */}
                    {result.selectionAudit.topPolicyScores && result.selectionAudit.topPolicyScores.length > 0 && (
                      <div data-testid="top-candidates-section">
                        <h5 className="font-medium text-sm mb-2">Top Policy Candidates:</h5>
                        <div className="space-y-2">
                          {result.selectionAudit.topPolicyScores.map((policy, index) => (
                            <div key={index} className="p-3 border border-border rounded text-sm bg-muted/20" data-testid={`candidate-${index}`}>
                              <div className="flex items-center justify-between mb-2">
                                <div className="font-medium" data-testid={`candidate-title-${index}`}>{policy.title}</div>
                                <div className="flex items-center space-x-2">
                                  <Badge variant="outline" className="text-xs" data-testid={`candidate-lcd-${index}`}>
                                    {policy.lcdId}
                                  </Badge>
                                  <div className="text-xs bg-primary/10 text-primary px-2 py-1 rounded font-bold" data-testid={`candidate-score-${index}`}>
                                    Score: {(policy.score * 100).toFixed(1)}%
                                  </div>
                                  <div className={`w-3 h-3 rounded-full ${
                                    policy.score >= 0.8 ? 'bg-chart-2' : 
                                    policy.score >= 0.6 ? 'bg-chart-3' : 
                                    'bg-destructive'
                                  }`}></div>
                                </div>
                              </div>
                              {policy.reasons.length > 0 && (
                                <div className="text-xs">
                                  <div className="font-medium mb-1">Scoring Factors:</div>
                                  <ul className="space-y-1">
                                    {policy.reasons.map((reason, reasonIndex) => (
                                      <li key={reasonIndex} className="flex items-start" data-testid={`candidate-reason-${index}-${reasonIndex}`}>
                                        <div className="w-1 h-1 bg-muted-foreground rounded-full mt-1.5 mr-2 flex-shrink-0"></div>
                                        <span>{reason}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Selection Explanation */}
                    <div data-testid="selection-explanation-section">
                      <h5 className="font-medium text-sm mb-2">Selection Explanation:</h5>
                      <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
                        <p className="text-sm" data-testid="selection-reason">
                          {result.selectionAudit.selectedReason}
                        </p>
                        {result.selectionAudit.fallbackUsed && (
                          <div className="mt-2 flex items-center space-x-2 text-chart-3" data-testid="fallback-indicator">
                            <AlertTriangle className="w-4 h-4" />
                            <span className="text-xs font-medium">Fallback mechanism was used for policy selection</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
