import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useClientContext } from "@/contexts/client-context";
import { WeekSelector } from "@/components/week-selector";
import { ClientSelector } from "@/components/client-selector";
import { PlatformSelector } from "@/components/platform-selector";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart3,
  Download,
  TrendingUp,
  DollarSign,
  ShoppingCart,
  Target,
  AlertCircle,
} from "lucide-react";

export default function ReportingPage() {
  const { selectedClientId, setSelectedClientId } = useClientContext();
  const [selectedWeek, setSelectedWeek] = useState<{ weekStart: string; weekEnd: string } | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<string>("all");

  const { data: weeks } = useQuery<any[]>({
    queryKey: ["/api/analytics/weeks"],
  });

  useEffect(() => {
    if (weeks && weeks.length > 0 && !selectedWeek) {
      setSelectedWeek({ weekStart: weeks[0].weekStart, weekEnd: weeks[0].weekEnd });
    }
  }, [weeks]);

  const { data: overview, isLoading } = useQuery<any>({
    queryKey: ["/api/analytics/overview", selectedWeek, selectedClientId, selectedPlatform],
    enabled: !!selectedWeek,
  });

  const { data: dataQuality } = useQuery<any>({
    queryKey: ["/api/analytics/data-quality"],
  });

  return (
    <div className="p-6 space-y-6" data-testid="reporting-page">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-reporting-title">Reporting</h1>
          <p className="text-sm text-muted-foreground">Data quality and analytics reports</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ClientSelector
            selectedClientId={selectedClientId}
            onClientChange={setSelectedClientId}
            showAllOption={true}
          />
          <WeekSelector
            weeks={weeks}
            selectedWeek={selectedWeek}
            onWeekChange={setSelectedWeek}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Data Quality</CardTitle>
            <BarChart3 className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {dataQuality ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Unmapped Uber Eats</span>
                  <Badge variant="secondary" className="text-xs">
                    {dataQuality.unmappedTransactions?.uberEats || 0}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Unmapped DoorDash</span>
                  <Badge variant="secondary" className="text-xs">
                    {dataQuality.unmappedTransactions?.doorDash || 0}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Unmapped Grubhub</span>
                  <Badge variant="secondary" className="text-xs">
                    {dataQuality.unmappedTransactions?.grubhub || 0}
                  </Badge>
                </div>
              </div>
            ) : (
              <Skeleton className="h-20 w-full" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Total Transactions</CardTitle>
            <ShoppingCart className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <p className="text-2xl font-semibold" data-testid="text-total-transactions">
                {overview?.totalOrders?.toLocaleString() || "0"}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Platforms Active</CardTitle>
            <Target className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Badge variant="secondary">Uber Eats</Badge>
              <Badge variant="secondary">DoorDash</Badge>
              <Badge variant="secondary">Grubhub</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {dataQuality?.anomalies && dataQuality.anomalies.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-sm font-medium">Data Quality Alerts</CardTitle>
            <AlertCircle className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {dataQuality.anomalies.slice(0, 10).map((alert: any, i: number) => (
                <div key={i} className="flex items-start gap-2 text-sm p-2 rounded-md bg-muted/50">
                  <AlertCircle className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <span className="text-muted-foreground">{alert.message || JSON.stringify(alert)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
