import { Brain } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function AiInfoCard() {
  return (
    <Card data-testid="card-ai-info">
      <div className="p-6 border-b border-border">
        <div className="flex items-center space-x-2">
          <Brain className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold text-foreground">AI-Powered Analysis</h3>
        </div>
      </div>
      <CardContent className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="font-medium text-foreground mb-2">How It Works</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• Analyzes encounter notes against Medicare LCD policies</li>
              <li>• Retrieves relevant MAC documentation using RAG technology</li>
              <li>• Checks conservative care requirements and wound criteria</li>
              <li>• Provides actionable documentation gap analysis</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-foreground mb-2">Model Information</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• <strong>Model:</strong> OpenAI GPT-4o-mini</li>
              <li>• <strong>Compliance:</strong> HIPAA-eligible configuration</li>
              <li>• <strong>Data Logging:</strong> Disabled for PHI protection</li>
              <li>• <strong>Citations:</strong> Includes source URLs and effective dates</li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
