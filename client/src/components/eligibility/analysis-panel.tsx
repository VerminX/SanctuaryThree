import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Brain, CheckCircle, XCircle, AlertTriangle, ExternalLink } from "lucide-react";

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
}

interface AnalysisPanelProps {
  encounters: Array<{
    id: string;
    patientId: string;
    patientName: string;
    woundType: string;
    date: string;
  }>;
  macRegions: string[];
  onAnalyze: (encounterId: string, macRegion: string) => Promise<void>;
  result?: EligibilityResult;
  isLoading: boolean;
}

export default function AnalysisPanel({ 
  encounters, 
  macRegions, 
  onAnalyze, 
  result, 
  isLoading 
}: AnalysisPanelProps) {
  const [selectedEncounter, setSelectedEncounter] = useState<string>("");
  const [selectedMacRegion, setSelectedMacRegion] = useState<string>("");

  const handleAnalyze = async () => {
    if (selectedEncounter && selectedMacRegion) {
      await onAnalyze(selectedEncounter, selectedMacRegion);
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
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Select Patient Encounter
            </label>
            <Select 
              value={selectedEncounter} 
              onValueChange={setSelectedEncounter}
            >
              <SelectTrigger data-testid="select-encounter">
                <SelectValue placeholder="Choose an encounter to analyze" />
              </SelectTrigger>
              <SelectContent>
                {encounters.map((encounter) => (
                  <SelectItem key={encounter.id} value={encounter.id}>
                    {encounter.patientName} - {encounter.woundType} ({new Date(encounter.date).toLocaleDateString()})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            disabled={!selectedEncounter || !selectedMacRegion || isLoading}
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
                Analyze Eligibility for Non-Analogous Skin Substitute/CTP
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
