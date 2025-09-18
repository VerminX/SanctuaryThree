import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Brain, CheckCircle, XCircle, AlertTriangle, ExternalLink, FileText, Calendar, History, TrendingUp, GitBranch, RotateCcw, Activity, UserCheck } from "lucide-react";

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
  macRegions: string[];
  onAnalyze: (params: { 
    mode: 'episode' | 'encounter'; 
    id: string; 
    macRegion: string; 
  }) => Promise<void>;
  result?: EligibilityResult;
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
            <span className="text-xs text-muted-foreground">OpenAI GPT-5 • HIPAA Compliant</span>
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
                        <div className="flex items-center justify-between w-full">
                          <span>
                            {episode.patientName} - {episode.woundType} at {episode.woundLocation}
                          </span>
                          <div className="text-xs text-muted-foreground ml-2">
                            {new Date(episode.episodeStartDate).toLocaleDateString()} • {episode.encounterCount} encounters
                          </div>
                        </div>
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
                  <SelectItem key={region} value={region}>
                    {region}
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
        {result && (
          <div className={`p-4 border rounded-lg ${getStatusColor(result.eligibility)}`} data-testid="analysis-result">
            <div className="flex items-start space-x-3">
              {getStatusIcon(result.eligibility)}
              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-2">
                  <h4 className="font-semibold">Eligibility: {result.eligibility.toUpperCase()}</h4>
                  <Badge variant="outline" className="text-xs">
                    AI Generated
                  </Badge>
                </div>
                <p className="text-sm mb-3">{result.rationale}</p>
                
                {/* Documentation Gaps */}
                {result.requiredDocumentationGaps.length > 0 && (
                  <div className="mb-4">
                    <h5 className="font-medium text-sm mb-2">Required Documentation Gaps:</h5>
                    <ul className="space-y-1">
                      {result.requiredDocumentationGaps.map((gap, index) => (
                        <li key={index} className="flex items-center text-sm">
                          <AlertTriangle className="w-3 h-3 mr-2 flex-shrink-0" />
                          <span>{gap}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Letter Bullets */}
                {result.letterBullets.length > 0 && (
                  <div className="mb-4">
                    <h5 className="font-medium text-sm mb-2">Key Points for Letter:</h5>
                    <ul className="space-y-1">
                      {result.letterBullets.map((bullet, index) => (
                        <li key={index} className="flex items-start text-sm">
                          <CheckCircle className="w-3 h-3 mr-2 mt-0.5 flex-shrink-0" />
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Historical Context */}
                {result.historicalContext && (
                  <div className="pt-3 border-t border-border/20">
                    <h5 className="font-medium text-sm mb-2 flex items-center">
                      <History className="w-4 h-4 mr-1" />
                      Historical Context:
                    </h5>
                    <div className="grid grid-cols-3 gap-4 mb-2">
                      <div className="text-center p-2 bg-muted/30 rounded">
                        <div className="text-lg font-bold text-primary">{result.historicalContext.totalEpisodes}</div>
                        <div className="text-xs text-muted-foreground">Episodes</div>
                      </div>
                      <div className="text-center p-2 bg-muted/30 rounded">
                        <div className="text-lg font-bold text-primary">{result.historicalContext.totalEncounters}</div>
                        <div className="text-xs text-muted-foreground">Encounters</div>
                      </div>
                      <div className="text-center p-2 bg-muted/30 rounded">
                        <div className="text-lg font-bold text-primary">{result.historicalContext.previousEligibilityChecks}</div>
                        <div className="text-xs text-muted-foreground">Previous Checks</div>
                      </div>
                    </div>
                    {result.historicalContext.keyPatterns.length > 0 && (
                      <div>
                        <div className="text-xs font-medium mb-1">Key Patterns:</div>
                        <ul className="space-y-1">
                          {result.historicalContext.keyPatterns.map((pattern, index) => (
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
                {result.episodeTimeline && result.episodeTimeline.length > 0 && (
                  <div className="pt-3 border-t border-border/20">
                    <h5 className="font-medium text-sm mb-2 flex items-center">
                      <Calendar className="w-4 h-4 mr-1" />
                      Episode Timeline:
                    </h5>
                    <div className="space-y-3">
                      {result.episodeTimeline.map((timelineItem, index) => (
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
                {result.crossEpisodePatterns && (
                  <div className="pt-3 border-t border-border/20">
                    <h5 className="font-medium text-sm mb-2 flex items-center">
                      <GitBranch className="w-4 h-4 mr-1" />
                      Cross-Episode Patterns:
                    </h5>
                    <div className="space-y-3">
                      {result.crossEpisodePatterns.woundRecurrence.length > 0 && (
                        <div>
                          <div className="text-xs font-medium mb-1 text-destructive">Wound Recurrence:</div>
                          <ul className="space-y-1">
                            {result.crossEpisodePatterns.woundRecurrence.map((pattern, index) => (
                              <li key={index} className="flex items-center text-xs">
                                <RotateCcw className="w-3 h-3 mr-2 flex-shrink-0 text-destructive" />
                                <span>{pattern}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {result.crossEpisodePatterns.treatmentResponse.length > 0 && (
                        <div>
                          <div className="text-xs font-medium mb-1 text-chart-2">Treatment Response:</div>
                          <ul className="space-y-1">
                            {result.crossEpisodePatterns.treatmentResponse.map((pattern, index) => (
                              <li key={index} className="flex items-center text-xs">
                                <Activity className="w-3 h-3 mr-2 flex-shrink-0 text-chart-2" />
                                <span>{pattern}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {result.crossEpisodePatterns.complianceHistory.length > 0 && (
                        <div>
                          <div className="text-xs font-medium mb-1 text-chart-3">Compliance History:</div>
                          <ul className="space-y-1">
                            {result.crossEpisodePatterns.complianceHistory.map((pattern, index) => (
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
                {result.citations.length > 0 && (
                  <div className="pt-3 border-t border-border/20">
                    <h5 className="font-medium text-sm mb-2">Citations & References:</h5>
                    <div className="space-y-2">
                      {result.citations.map((citation, index) => (
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
        )}
      </CardContent>
    </Card>
  );
}
