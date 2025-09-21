import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package, Pill, Bandage, DollarSign } from "lucide-react";
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

interface ProductsTabProps {
  episode?: Episode;
  encounters: Encounter[];
  patient?: DecryptedPatient;
  isLoading: boolean;
}

export default function ProductsTab({ episode, encounters, patient, isLoading }: ProductsTabProps) {
  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="products-loading">
        <div className="h-8 bg-muted animate-pulse rounded"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="h-40 bg-muted animate-pulse rounded"></div>
          <div className="h-40 bg-muted animate-pulse rounded"></div>
          <div className="h-40 bg-muted animate-pulse rounded"></div>
        </div>
        <div className="h-60 bg-muted animate-pulse rounded"></div>
      </div>
    );
  }

  // Extract procedure codes from encounters (these often include products/supplies)
  const allProcedureCodes = encounters
    .filter(encounter => encounter.procedureCodes)
    .reduce((acc: any[], encounter) => {
      if (encounter.procedureCodes && Array.isArray(encounter.procedureCodes)) {
        encounter.procedureCodes.forEach((code: any) => {
          acc.push({
            ...code,
            date: encounter.date,
            encounterId: encounter.id
          });
        });
      }
      return acc;
    }, [])
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Group codes by type (estimated categories)
  const productCategories = {
    dressings: allProcedureCodes.filter(code => 
      code.description?.toLowerCase().includes('dressing') ||
      code.description?.toLowerCase().includes('bandage') ||
      code.code?.includes('A6')
    ),
    medications: allProcedureCodes.filter(code => 
      code.description?.toLowerCase().includes('medication') ||
      code.description?.toLowerCase().includes('drug') ||
      code.code?.includes('J')
    ),
    devices: allProcedureCodes.filter(code => 
      code.description?.toLowerCase().includes('device') ||
      code.description?.toLowerCase().includes('pump') ||
      code.code?.includes('E')
    )
  };

  return (
    <div className="space-y-6" data-testid="products-tab">
      <div className="flex items-center gap-3">
        <Package className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Products & Supplies</h3>
      </div>

      {/* Product Categories Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card data-testid="card-dressings">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Bandage className="h-4 w-4" />
              Dressings & Supplies
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-dressings-count">
              {productCategories.dressings.length}
            </div>
            <p className="text-xs text-muted-foreground">
              Items documented
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-medications">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Pill className="h-4 w-4" />
              Medications
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-medications-count">
              {productCategories.medications.length}
            </div>
            <p className="text-xs text-muted-foreground">
              Items documented
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-devices">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Package className="h-4 w-4" />
              Devices & Equipment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-devices-count">
              {productCategories.devices.length}
            </div>
            <p className="text-xs text-muted-foreground">
              Items documented
            </p>
          </CardContent>
        </Card>
      </div>

      {/* All Products/Procedure Codes */}
      <Card data-testid="card-all-products">
        <CardHeader>
          <CardTitle>Product & Procedure History</CardTitle>
          <CardDescription>
            All documented products, supplies, and procedures used in this episode
          </CardDescription>
        </CardHeader>
        <CardContent>
          {allProcedureCodes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="no-products">
              <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No products or procedures documented yet.</p>
            </div>
          ) : (
            <div className="space-y-4" data-testid="products-list">
              {allProcedureCodes.map((item, index) => (
                <div 
                  key={`${item.encounterId}-${item.code}-${index}`} 
                  className="border rounded-lg p-4"
                  data-testid={`product-item-${index}`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium" data-testid={`product-code-${index}`}>
                          {item.code}
                        </span>
                        {item.modifier && (
                          <Badge variant="outline" data-testid={`product-modifier-${index}`}>
                            {item.modifier}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mb-2" data-testid={`product-description-${index}`}>
                        {item.description || 'No description available'}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span data-testid={`product-date-${index}`}>
                          {new Date(item.date).toLocaleDateString()}
                        </span>
                        {item.units && (
                          <span data-testid={`product-units-${index}`}>
                            Units: {item.units}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cost Analysis */}
      <Card data-testid="card-cost-analysis">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Cost Analysis
          </CardTitle>
          <CardDescription>
            Product cost tracking and Medicare coverage analysis
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p data-testid="cost-analysis-placeholder">
              Product cost analysis and Medicare coverage verification coming soon.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Product Recommendations */}
      <Card data-testid="card-product-recommendations">
        <CardHeader>
          <CardTitle>Product Recommendations</CardTitle>
          <CardDescription>
            Evidence-based product recommendations for wound type and stage
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
              <h4 className="font-medium mb-2" data-testid="wound-specific-title">
                {episode?.woundType} Specific Products
              </h4>
              <p className="text-sm text-muted-foreground" data-testid="wound-specific-description">
                Product recommendations based on current wound type and healing stage will be displayed here.
              </p>
            </div>
            
            <div className="text-center py-4 text-muted-foreground">
              <p data-testid="recommendations-placeholder">
                AI-powered product recommendations and formulary matching coming soon.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}