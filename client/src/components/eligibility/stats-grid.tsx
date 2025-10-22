import { Brain, CheckCircle, AlertTriangle, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface StatsGridProps {
  totalAnalyses: number;
  eligible: number;
  notEligible: number;
  unclear: number;
  isLoading: boolean;
}

export function StatsGrid({ totalAnalyses, eligible, notEligible, unclear, isLoading }: StatsGridProps) {
  const displayValue = (value: number) => (isLoading ? "--" : value);

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      <Card data-testid="card-total-analyses">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Analyses</p>
              <p className="text-3xl font-bold text-foreground">{displayValue(totalAnalyses)}</p>
            </div>
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
              <Brain className="text-primary text-xl" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-eligible">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Eligible</p>
              <p className="text-3xl font-bold text-foreground">{displayValue(eligible)}</p>
            </div>
            <div className="w-12 h-12 bg-chart-2/10 rounded-lg flex items-center justify-center">
              <CheckCircle className="text-chart-2 text-xl" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-not-eligible">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Not Eligible</p>
              <p className="text-3xl font-bold text-foreground">{displayValue(notEligible)}</p>
            </div>
            <div className="w-12 h-12 bg-destructive/10 rounded-lg flex items-center justify-center">
              <XCircle className="text-destructive text-xl" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-unclear">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Unclear</p>
              <p className="text-3xl font-bold text-foreground">{displayValue(unclear)}</p>
            </div>
            <div className="w-12 h-12 bg-chart-3/10 rounded-lg flex items-center justify-center">
              <AlertTriangle className="text-chart-3 text-xl" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
