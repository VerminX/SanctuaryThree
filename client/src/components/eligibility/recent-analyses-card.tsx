import { SearchCheck, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface RecentAnalysesCardProps {
  analyses: any[];
  isLoading: boolean;
}

export function RecentAnalysesCard({ analyses, isLoading }: RecentAnalysesCardProps) {
  return (
    <Card data-testid="card-recent-analyses">
      <div className="p-6 border-b border-border">
        <h3 className="text-lg font-semibold text-foreground">Recent Analyses</h3>
        <p className="text-sm text-muted-foreground">Latest eligibility determinations</p>
      </div>
      <CardContent className="p-6">
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-muted rounded w-1/2"></div>
              </div>
            ))}
          </div>
        ) : analyses.length > 0 ? (
          <div className="space-y-4">
            {analyses.slice(0, 5).map((check, index) => (
              <div key={index} className="flex items-start space-x-3 p-3 border border-border rounded-lg">
                <div className="flex-shrink-0">
                  {check.result?.eligibility === "Yes" && <CheckCircle className="w-5 h-5 text-chart-2" />}
                  {check.result?.eligibility === "No" && <XCircle className="w-5 h-5 text-destructive" />}
                  {check.result?.eligibility === "Unclear" && <AlertTriangle className="w-5 h-5 text-chart-3" />}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">Patient Analysis - {check.result?.eligibility}</p>
                  <p className="text-xs text-muted-foreground">{new Date(check.createdAt).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <SearchCheck className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-2 text-sm font-medium text-foreground">No analyses yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">Run your first eligibility analysis to get started.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
