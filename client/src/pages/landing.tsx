import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Heart, Shield, FileText, Brain } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="text-center">
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 bg-primary rounded-xl flex items-center justify-center">
                <Heart className="w-8 h-8 text-primary-foreground" />
              </div>
            </div>
            <h1 className="text-4xl sm:text-6xl font-bold text-foreground mb-6">
              WoundCare Portal
            </h1>
            <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
              HIPAA-compliant pre-determination portal with AI-powered eligibility analysis and automated medical letter generation for wound care clinics.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                size="lg" 
                className="text-lg px-8"
                onClick={() => window.location.href = '/api/login'}
                data-testid="button-login"
              >
                Sign In to Continue
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="py-24 bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-foreground mb-4">
              Comprehensive Wound Care Management
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Streamline your pre-determination process with AI-powered analysis, automated documentation, and HIPAA-compliant security.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <Card className="text-center" data-testid="card-feature-ai">
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Brain className="w-6 h-6 text-primary" />
                </div>
                <CardTitle className="text-lg">AI Eligibility Analysis</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Powered by OpenAI with RAG integration for Medicare LCD policy checking and coverage determination.
                </p>
              </CardContent>
            </Card>

            <Card className="text-center" data-testid="card-feature-documents">
              <CardHeader>
                <div className="w-12 h-12 bg-chart-2/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-6 h-6 text-chart-2" />
                </div>
                <CardTitle className="text-lg">Document Generation</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Automated Pre-Determination letters and Letters of Medical Necessity with PDF/DOCX export.
                </p>
              </CardContent>
            </Card>

            <Card className="text-center" data-testid="card-feature-security">
              <CardHeader>
                <div className="w-12 h-12 bg-chart-3/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Shield className="w-6 h-6 text-chart-3" />
                </div>
                <CardTitle className="text-lg">HIPAA Compliance</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  End-to-end encryption, comprehensive audit logging, and role-based access control.
                </p>
              </CardContent>
            </Card>

            <Card className="text-center" data-testid="card-feature-multi-tenant">
              <CardHeader>
                <div className="w-12 h-12 bg-chart-4/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Heart className="w-6 h-6 text-chart-4" />
                </div>
                <CardTitle className="text-lg">Multi-Tenant</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Support for multiple clinics with NPI/TIN management, MAC region configuration, and user roles.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Security & Compliance Section */}
      <div className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold text-foreground mb-6">
                Security & Compliance First
              </h2>
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 bg-chart-2 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Shield className="w-3 h-3 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">PHI Encryption</h3>
                    <p className="text-muted-foreground">AES-256-GCM encryption at rest with TLS in transit</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 bg-chart-2 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Shield className="w-3 h-3 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Audit Logging</h3>
                    <p className="text-muted-foreground">Immutable audit trails with cryptographic integrity</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 bg-chart-2 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Shield className="w-3 h-3 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Access Control</h3>
                    <p className="text-muted-foreground">Role-based permissions with 2FA enforcement</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-card rounded-lg p-8 border">
              <div className="text-center">
                <div className="w-16 h-16 bg-chart-2/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Shield className="w-8 h-8 text-chart-2" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-2">HIPAA Compliant</h3>
                <p className="text-muted-foreground mb-6">
                  Built with healthcare security requirements in mind, ensuring full HIPAA compliance for patient data protection.
                </p>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-chart-2">256-bit</div>
                    <div className="text-muted-foreground">Encryption</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-chart-2">99.9%</div>
                    <div className="text-muted-foreground">Uptime</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-card border-t border-border py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="flex justify-center items-center space-x-3 mb-4">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Heart className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="text-lg font-bold text-foreground">WoundCare Portal</span>
            </div>
            <p className="text-muted-foreground mb-4">
              Streamlining wound care pre-determination with AI-powered analysis and automated documentation.
            </p>
            <div className="flex items-center justify-center space-x-4 text-sm text-muted-foreground">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-chart-2 rounded-full"></div>
                <span>HIPAA Compliant</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-chart-2 rounded-full"></div>
                <span>AI-Powered</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-chart-2 rounded-full"></div>
                <span>Multi-Tenant</span>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
