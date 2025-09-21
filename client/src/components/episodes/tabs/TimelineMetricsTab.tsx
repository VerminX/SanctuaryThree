import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Calendar, TrendingUp, Clock } from "lucide-react";
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

interface TimelineMetricsTabProps {
  episode?: Episode;
  encounters: Encounter[];
  patient?: DecryptedPatient;
  isLoading: boolean;
}

export default function TimelineMetricsTab({ episode, encounters, patient, isLoading }: TimelineMetricsTabProps) {
  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="timeline-metrics-loading">
        <div className="h-8 bg-muted animate-pulse rounded"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-40 bg-muted animate-pulse rounded"></div>
          <div className="h-40 bg-muted animate-pulse rounded"></div>
        </div>
        <div className="h-60 bg-muted animate-pulse rounded"></div>
      </div>
    );
  }

  const totalEncounters = encounters.length;
  const recentEncounters = encounters.filter(
    e => new Date(e.date) >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  ).length;

  return (
    <div className="space-y-6" data-testid="timeline-metrics-tab">
      <div className="flex items-center gap-3">
        <Activity className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Timeline & Metrics Overview</h3>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card data-testid="card-total-encounters">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Total Encounters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-encounters">
              {totalEncounters}
            </div>
            <p className="text-xs text-muted-foreground">
              Since episode start
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-recent-encounters">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-recent-encounters">
              {recentEncounters}
            </div>
            <p className="text-xs text-muted-foreground">
              Last 30 days
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-episode-duration">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Episode Duration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-episode-duration">
              {episode?.episodeStartDate ? 
                Math.ceil((Date.now() - new Date(episode.episodeStartDate).getTime()) / (1000 * 60 * 60 * 24)) 
                : 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Days active
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Timeline */}
      <Card data-testid="card-encounter-timeline">
        <CardHeader>
          <CardTitle>Encounter Timeline</CardTitle>
          <CardDescription>
            Chronological view of all encounters for this episode
          </CardDescription>
        </CardHeader>
        <CardContent>
          {encounters.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="no-encounters-message">
              <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No encounters recorded for this episode yet.</p>
            </div>
          ) : (
            <div className="space-y-4" data-testid="encounter-timeline-list">
              {encounters
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .map((encounter, index) => (
                  <div 
                    key={encounter.id} 
                    className="flex items-start gap-4 pb-4 border-b last:border-b-0"
                    data-testid={`timeline-encounter-${index}`}
                  >
                    <div className="flex-shrink-0 w-2 h-2 rounded-full bg-primary mt-2"></div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium" data-testid={`encounter-date-${index}`}>
                          {new Date(encounter.date).toLocaleDateString()}
                        </span>
                        <Badge 
                          variant="outline"
                          data-testid={`encounter-type-${index}`}
                        >
                          {(encounter.woundDetails && typeof encounter.woundDetails === 'object' && 'type' in encounter.woundDetails) 
                            ? String(encounter.woundDetails.type) 
                            : 'Standard Visit'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground" data-testid={`encounter-summary-${index}`}>
                        Assessment and treatment documented
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Placeholder for future metrics charts */}
      <Card data-testid="card-future-metrics">
        <CardHeader>
          <CardTitle>Advanced Metrics</CardTitle>
          <CardDescription>
            Additional clinical metrics and trends will be displayed here
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Advanced metrics and trend analysis coming soon.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}