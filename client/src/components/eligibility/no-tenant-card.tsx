import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function NoTenantCard() {
  return (
    <Card className="bg-muted/30 border-muted" data-testid="card-no-tenant">
      <CardContent className="p-8 text-center">
        <AlertTriangle className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-medium text-foreground mb-2">No Tenant Access</h3>
        <p className="text-sm text-muted-foreground mb-4">
          You don't have access to any tenant organizations. Please contact your administrator to get access to a tenant.
        </p>
        <p className="text-xs text-muted-foreground">
          Tenant access is required to view patient data and perform eligibility analyses.
        </p>
      </CardContent>
    </Card>
  );
}
