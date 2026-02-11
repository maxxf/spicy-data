import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useClientContext } from "@/contexts/client-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { WeekSelector } from "@/components/week-selector";
import {
  Activity,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  ShoppingCart,
  XCircle,
  CheckCircle2,
  ArrowDown,
  ArrowUp,
} from "lucide-react";
import type { ConsolidatedLocationMetrics, DashboardOverview } from "@shared/schema";

interface OpsMetrics {
  totalOrders: number;
  totalSales: number;
  refundRate: number;
  errorChargeRate: number;
  avgPayoutPercent: number;
  locationCount: number;
  signals: Signal[];
}

interface Signal {
  type: "warning" | "critical" | "info";
  title: string;
  description: string;
  location?: string;
  metric?: string;
}

export default function OpsSignalsPage() {
  const { selectedClientId, selectedPlatforms, selectedWeek, setSelectedWeek } = useClientContext();

  const { data: weeks } = useQuery<Array<{ weekStart: string; weekEnd: string }>>({
    queryKey: ["/api/analytics/weeks"],
  });

  useEffect(() => {
    if (weeks && weeks.length > 0 && !selectedWeek) {
      setSelectedWeek(weeks[0]);
    }
  }, [weeks, selectedWeek, setSelectedWeek]);

  const buildQueryParams = () => {
    const params = new URLSearchParams();
    if (selectedClientId) params.append("clientId", selectedClientId);
    if (selectedPlatforms.length < 3) {
      params.append("platform", selectedPlatforms[0] || "");
    }
    if (selectedWeek) {
      params.append("weekStart", selectedWeek.weekStart);
      params.append("weekEnd", selectedWeek.weekEnd);
    }
    return params.toString() ? `?${params.toString()}` : "";
  };

  const { data: overview, isLoading: overviewLoading } = useQuery<DashboardOverview>({
    queryKey: ["/api/analytics/overview", selectedClientId, selectedPlatforms, selectedWeek],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/overview${buildQueryParams()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch overview");
      return res.json();
    },
    enabled: !!selectedWeek,
  });

  const { data: locationMetrics, isLoading: locationsLoading } = useQuery<ConsolidatedLocationMetrics[]>({
    queryKey: ["/api/analytics/locations", selectedClientId, selectedPlatforms, selectedWeek],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/locations${buildQueryParams()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch locations");
      return res.json();
    },
    enabled: !!selectedWeek,
  });

  const { data: dataQuality } = useQuery<any>({
    queryKey: ["/api/analytics/data-quality", selectedClientId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedClientId) params.append("clientId", selectedClientId);
      const qs = params.toString() ? `?${params.toString()}` : "";
      const res = await fetch(`/api/analytics/data-quality${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch data quality");
      return res.json();
    },
  });

  const signals = useMemo<Signal[]>(() => {
    const result: Signal[] = [];
    if (!locationMetrics) return result;

    locationMetrics.forEach((loc) => {
      if (loc.netPayoutPercent < 0.3 && loc.totalSales > 0) {
        result.push({
          type: "warning",
          title: "Low Payout %",
          description: `Net payout is only ${(loc.netPayoutPercent * 100).toFixed(1)}% of sales`,
          location: loc.canonicalName || loc.location,
          metric: `${(loc.netPayoutPercent * 100).toFixed(1)}%`,
        });
      }

      if (loc.marketingRoas > 0 && loc.marketingRoas < 2) {
        result.push({
          type: "warning",
          title: "Low ROAS",
          description: `Marketing return is only ${loc.marketingRoas.toFixed(1)}x — below 2x target`,
          location: loc.canonicalName || loc.location,
          metric: `${loc.marketingRoas.toFixed(1)}x`,
        });
      }

      if (loc.marketingRoas > 20 && loc.totalMarketingInvestment > 0) {
        result.push({
          type: "info",
          title: "Unusually High ROAS",
          description: `ROAS of ${loc.marketingRoas.toFixed(1)}x may indicate data quality issue`,
          location: loc.canonicalName || loc.location,
          metric: `${loc.marketingRoas.toFixed(1)}x`,
        });
      }

      if (loc.totalSales === 0 && loc.totalOrders > 0) {
        result.push({
          type: "critical",
          title: "Zero Sales with Orders",
          description: `${loc.totalOrders} orders recorded but $0 in sales`,
          location: loc.canonicalName || loc.location,
        });
      }
    });

    if (dataQuality?.alerts) {
      dataQuality.alerts.forEach((alert: any) => {
        result.push({
          type: alert.severity === "high" ? "critical" : "warning",
          title: alert.type?.replace(/_/g, " ") || "Data Alert",
          description: alert.message || alert.description || "",
          location: alert.location,
        });
      });
    }

    return result.sort((a, b) => {
      const priority = { critical: 0, warning: 1, info: 2 };
      return priority[a.type] - priority[b.type];
    });
  }, [locationMetrics, dataQuality]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);

  const formatNumber = (value: number) =>
    new Intl.NumberFormat("en-US").format(value);

  const isLoading = overviewLoading || locationsLoading;

  const activeLocations = locationMetrics?.filter((l) => l.totalOrders > 0) || [];
  const avgPayout = activeLocations.length > 0
    ? activeLocations.reduce((sum, l) => sum + (l.netPayoutPercent || 0), 0) / activeLocations.length
    : 0;

  const platformBreakdown = useMemo(() => {
    if (!overview?.platformBreakdown) return [];
    return overview.platformBreakdown.filter((p) =>
      selectedPlatforms.includes(p.platform)
    );
  }, [overview, selectedPlatforms]);

  return (
    <div className="p-6 space-y-6" data-testid="page-ops-signals">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">
            Operations Signals
          </h1>
          <p className="text-sm text-muted-foreground">
            Operational health indicators, anomaly detection, and data quality alerts
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <WeekSelector
            weeks={weeks}
            selectedWeek={selectedWeek}
            onWeekChange={setSelectedWeek}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-16" /></CardContent></Card>
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-sm text-muted-foreground">Active Locations</span>
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                </div>
                <p className="text-2xl font-semibold" data-testid="metric-active-locations">
                  {activeLocations.length}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-sm text-muted-foreground">Total Orders</span>
                  <ShoppingCart className="w-4 h-4 text-muted-foreground" />
                </div>
                <p className="text-2xl font-semibold" data-testid="metric-total-orders">
                  {formatNumber(overview?.totalOrders || 0)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-sm text-muted-foreground">Avg Net Payout</span>
                  <Activity className="w-4 h-4 text-muted-foreground" />
                </div>
                <p className="text-2xl font-semibold" data-testid="metric-avg-payout">
                  {(avgPayout * 100).toFixed(1)}%
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-sm text-muted-foreground">Signals</span>
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                </div>
                <p className="text-2xl font-semibold" data-testid="metric-signal-count">
                  {signals.length}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  {signals.filter((s) => s.type === "critical").length > 0 && (
                    <Badge variant="destructive" className="text-xs">
                      {signals.filter((s) => s.type === "critical").length} critical
                    </Badge>
                  )}
                  {signals.filter((s) => s.type === "warning").length > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {signals.filter((s) => s.type === "warning").length} warnings
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {signals.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Active Signals
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {signals.map((signal, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 p-3 rounded-md border"
                      data-testid={`signal-${i}`}
                    >
                      <div className="flex-shrink-0 mt-0.5">
                        {signal.type === "critical" && <XCircle className="w-4 h-4 text-red-500" />}
                        {signal.type === "warning" && <AlertTriangle className="w-4 h-4 text-amber-500" />}
                        {signal.type === "info" && <Activity className="w-4 h-4 text-blue-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{signal.title}</span>
                          {signal.metric && (
                            <Badge variant="secondary" className="text-xs">{signal.metric}</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">{signal.description}</p>
                        {signal.location && (
                          <p className="text-xs text-muted-foreground mt-1">{signal.location}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {signals.length === 0 && (
            <Card>
              <CardContent className="p-8 text-center">
                <CheckCircle2 className="w-8 h-8 text-green-600 mx-auto mb-3" />
                <p className="text-sm font-medium">All Clear</p>
                <p className="text-sm text-muted-foreground mt-1">No operational signals detected for this period</p>
              </CardContent>
            </Card>
          )}

          {platformBreakdown.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Platform Health</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Platform</th>
                        <th className="text-right py-2 pr-4 font-medium text-muted-foreground">Orders</th>
                        <th className="text-right py-2 pr-4 font-medium text-muted-foreground">Sales</th>
                        <th className="text-right py-2 pr-4 font-medium text-muted-foreground">AOV</th>
                        <th className="text-right py-2 pr-4 font-medium text-muted-foreground">Net Payout %</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">Mktg Invest %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {platformBreakdown.map((p) => (
                        <tr key={p.platform} className="border-b last:border-b-0">
                          <td className="py-2 pr-4 font-medium capitalize">{p.platform === "ubereats" ? "Uber Eats" : p.platform === "doordash" ? "DoorDash" : "Grubhub"}</td>
                          <td className="py-2 pr-4 text-right">{formatNumber(p.totalOrders)}</td>
                          <td className="py-2 pr-4 text-right">{formatCurrency(p.totalSales)}</td>
                          <td className="py-2 pr-4 text-right">{formatCurrency(p.aov)}</td>
                          <td className="py-2 pr-4 text-right">
                            <span className={p.netPayoutPercent < 0.3 ? "text-red-500" : ""}>
                              {(p.netPayoutPercent * 100).toFixed(1)}%
                            </span>
                          </td>
                          <td className="py-2 text-right">{(p.marketingInvestmentPercent * 100).toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
