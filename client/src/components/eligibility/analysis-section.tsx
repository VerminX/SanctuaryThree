import AnalysisPanel from "@/components/eligibility/analysis-panel";
import { Card, CardContent } from "@/components/ui/card";

type EncounterOption = {
  id: string;
  patientId: string;
  patientName: string;
  woundType: string;
  date: string;
} & Record<string, unknown>;

type EpisodeOption = {
  id: string;
  patientId: string;
  patientName: string;
  woundType: string;
  woundLocation: string;
  episodeStartDate: string;
  status: string;
  encounterCount: number;
} & Record<string, unknown>;

interface AnalysisSectionProps {
  isLoading: boolean;
  encounters: ReadonlyArray<EncounterOption>;
  episodes: ReadonlyArray<EpisodeOption>;
  macRegions: ReadonlyArray<{ code: string; label: string }>;
  onAnalyze: (params: { mode: "episode" | "encounter"; id: string; macRegion: string }) => Promise<void>;
  result: unknown;
  isAnalyzing: boolean;
}

export function AnalysisSection({
  isLoading,
  encounters,
  episodes,
  macRegions,
  onAnalyze,
  result,
  isAnalyzing,
}: AnalysisSectionProps) {
  if (isLoading) {
    return (
      <Card data-testid="card-analysis-loading">
        <div className="p-6 border-b border-border">
          <div className="animate-pulse">
            <div className="h-6 bg-muted rounded w-1/3 mb-2"></div>
            <div className="h-4 bg-muted rounded w-2/3"></div>
          </div>
        </div>
        <CardContent className="p-6">
          <div className="space-y-4">
            <div className="animate-pulse">
              <div className="h-4 bg-muted rounded w-1/4 mb-2"></div>
              <div className="h-10 bg-muted rounded w-full"></div>
            </div>
            <div className="animate-pulse">
              <div className="h-4 bg-muted rounded w-1/4 mb-2"></div>
              <div className="h-10 bg-muted rounded w-full"></div>
            </div>
            <div className="animate-pulse">
              <div className="h-4 bg-muted rounded w-1/4 mb-2"></div>
              <div className="h-10 bg-muted rounded w-full"></div>
            </div>
            <div className="animate-pulse">
              <div className="h-10 bg-muted rounded w-32"></div>
            </div>
          </div>
          <div className="mt-6 text-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto mb-2"></div>
            <p className="text-sm text-muted-foreground">Loading patient data for dropdown optimization...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <AnalysisPanel
      encounters={Array.from(encounters) as Array<{ id: string; patientId: string; patientName: string; woundType: string; date: string }>}
      episodes={Array.from(episodes) as Array<{ id: string; patientId: string; patientName: string; woundType: string; woundLocation: string; episodeStartDate: string; status: string; encounterCount: number }>}
      macRegions={Array.from(macRegions)}
      onAnalyze={onAnalyze}
      result={result}
      isLoading={isAnalyzing}
    />
  );
}
