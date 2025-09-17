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
              TM Technology Services:
              <span className="block text-primary">Technology Support for the Future.</span>
            </h1>
            <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
              Trusted by <strong>healthcare companies</strong> and more across Middle Tennessee.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                size="lg" 
                className="text-lg px-8"
                onClick={() => window.location.href = '/api/login'}
                data-testid="button-login"
              >
                Get in Touch
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
              Technology Consulting Services
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              With fifteen years of technology experience in a range of industries, we are your trusted partner in developing and implementing a robust IT strategy for your business.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <Card className="text-center" data-testid="card-feature-managed-it">
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Shield className="w-6 h-6 text-primary" />
                </div>
                <CardTitle className="text-lg">Managed IT Services</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Comprehensive IT support and management solutions to keep your business running smoothly.
                </p>
              </CardContent>
            </Card>

            <Card className="text-center" data-testid="card-feature-networking">
              <CardHeader>
                <div className="w-12 h-12 bg-chart-2/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-6 h-6 text-chart-2" />
                </div>
                <CardTitle className="text-lg">Networking</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Network design, implementation, and maintenance to ensure reliable connectivity.
                </p>
              </CardContent>
            </Card>

            <Card className="text-center" data-testid="card-feature-security">
              <CardHeader>
                <div className="w-12 h-12 bg-chart-3/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Shield className="w-6 h-6 text-chart-3" />
                </div>
                <CardTitle className="text-lg">Security & Compliance</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Comprehensive security solutions to protect your business from cyber threats.
                </p>
              </CardContent>
            </Card>

            <Card className="text-center" data-testid="card-feature-cloud">
              <CardHeader>
                <div className="w-12 h-12 bg-chart-4/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Heart className="w-6 h-6 text-chart-4" />
                </div>
                <CardTitle className="text-lg">IT Cloud Services</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Cloud migration and management services to modernize your IT infrastructure.
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
                Professional Experience
              </h2>
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 bg-chart-2 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Shield className="w-3 h-3 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Healthcare Technology</h3>
                    <p className="text-muted-foreground">Expert in healthcare IT systems and compliance requirements</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 bg-chart-2 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Shield className="w-3 h-3 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Finance Solutions</h3>
                    <p className="text-muted-foreground">Secure and compliant financial technology implementations</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 bg-chart-2 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Shield className="w-3 h-3 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Hospitality Tech</h3>
                    <p className="text-muted-foreground">Innovative technology solutions for hospitality businesses</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-card rounded-lg p-8 border">
              <div className="text-center">
                <div className="w-16 h-16 bg-chart-2/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Shield className="w-8 h-8 text-chart-2" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-2">Key Industries</h3>
                <p className="text-muted-foreground mb-6">
                  While able to consult with any industry, we are experts in Healthcare, Finance, and Hospitality technology solutions.
                </p>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-chart-2">15+</div>
                    <div className="text-muted-foreground">Years Experience</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-chart-2">100%</div>
                    <div className="text-muted-foreground">Client Satisfaction</div>
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
              <span className="text-lg font-bold text-foreground">TM Technology Services</span>
            </div>
            <p className="text-muted-foreground mb-4">
              Technology Support for the Future - serving Middle Tennessee businesses with expert IT consulting and solutions.
            </p>
            <div className="flex items-center justify-center space-x-4 text-sm text-muted-foreground">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-chart-2 rounded-full"></div>
                <span>Healthcare</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-chart-2 rounded-full"></div>
                <span>Finance</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-chart-2 rounded-full"></div>
                <span>Hospitality</span>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
