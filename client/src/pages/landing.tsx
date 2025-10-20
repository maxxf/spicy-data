import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BarChart3, TrendingUp, MapPin, DollarSign } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/5">
      <div className="container mx-auto px-4 py-16">
        <div className="flex flex-col items-center text-center space-y-8 max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center justify-center w-16 h-16 rounded-xl overflow-hidden">
              <img 
                src="/attached_assets/a5b36301-f70a-4a41-907e-9f34a1a70b80_1760998717264.png" 
                alt="Spicy Data" 
                className="w-full h-full object-cover" 
              />
            </div>
            <div>
              <h1 className="text-4xl font-bold tracking-tight">Spicy Data Analytics</h1>
              <p className="text-lg text-muted-foreground">Multi-Platform Delivery Insights</p>
            </div>
          </div>

          {/* Hero */}
          <div className="space-y-4">
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight">
              Optimize Your Delivery Performance
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl">
              Comprehensive analytics dashboard for restaurant chains to monitor and optimize performance across Uber Eats, DoorDash, and Grubhub.
            </p>
          </div>

          {/* CTA Button */}
          <div className="flex gap-4 mt-8">
            <Button 
              size="lg" 
              onClick={() => window.location.href = "/api/login"}
              className="text-lg px-8"
              data-testid="button-login"
            >
              Sign In to Continue
            </Button>
          </div>

          {/* Features */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-16 w-full">
            <Card className="hover-elevate">
              <CardContent className="p-6 flex items-start gap-4">
                <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 text-primary">
                  <BarChart3 className="w-6 h-6" />
                </div>
                <div className="flex-1 text-left">
                  <h3 className="font-semibold text-lg mb-2">Real-Time Analytics</h3>
                  <p className="text-sm text-muted-foreground">
                    Track sales, orders, and performance metrics across all delivery platforms in one unified dashboard.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="hover-elevate">
              <CardContent className="p-6 flex items-start gap-4">
                <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 text-primary">
                  <TrendingUp className="w-6 h-6" />
                </div>
                <div className="flex-1 text-left">
                  <h3 className="font-semibold text-lg mb-2">Marketing ROI</h3>
                  <p className="text-sm text-muted-foreground">
                    Calculate ROAS, True CPO, and marketing attribution to optimize your promotional spend.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="hover-elevate">
              <CardContent className="p-6 flex items-start gap-4">
                <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 text-primary">
                  <MapPin className="w-6 h-6" />
                </div>
                <div className="flex-1 text-left">
                  <h3 className="font-semibold text-lg mb-2">Location Intelligence</h3>
                  <p className="text-sm text-muted-foreground">
                    Monitor performance across all locations with automated location matching and consolidation.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="hover-elevate">
              <CardContent className="p-6 flex items-start gap-4">
                <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 text-primary">
                  <DollarSign className="w-6 h-6" />
                </div>
                <div className="flex-1 text-left">
                  <h3 className="font-semibold text-lg mb-2">Financial Reports</h3>
                  <p className="text-sm text-muted-foreground">
                    Generate detailed P&L statements with platform-specific breakdowns and CSV exports.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Footer */}
          <div className="mt-16 text-sm text-muted-foreground">
            <p>Secure authentication powered by your account</p>
          </div>
        </div>
      </div>
    </div>
  );
}
