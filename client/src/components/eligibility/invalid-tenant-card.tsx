import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function InvalidTenantCard() {
  return (
    <Card className="bg-destructive/5 border-destructive/20" data-testid="card-invalid-tenant">
      <CardContent className="p-8 text-center">
        <AlertTriangle className="mx-auto h-12 w-12 text-destructive/70 mb-4" />
        <h3 className="text-lg font-medium text-foreground mb-2">Invalid Tenant Configuration</h3>
        <p className="text-sm text-muted-foreground mb-4">
          There's an issue with your tenant configuration. Please contact support.
        </p>
        <p className="text-xs text-muted-foreground">Error: Invalid tenant ID format</p>
      </CardContent>
    </Card>
  );
}
