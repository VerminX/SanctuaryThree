import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface BulkDataErrorCardProps {
  onRetry: () => void;
}

export function BulkDataErrorCard({ onRetry }: BulkDataErrorCardProps) {
  return (
    <Card className="bg-destructive/5 border-destructive/20" data-testid="card-bulk-data-error">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            <div>
              <h3 className="text-sm font-medium text-foreground">Failed to Load Patient Data</h3>
              <p className="text-xs text-muted-foreground">
                Unable to load encounters and episodes. This may affect dropdown performance.
              </p>
            </div>
          </div>
          <Button
            onClick={onRetry}
            variant="outline"
            size="sm"
            className="border-destructive/20 hover:bg-destructive/10"
            data-testid="button-retry-bulk-data"
          >
            Retry
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
