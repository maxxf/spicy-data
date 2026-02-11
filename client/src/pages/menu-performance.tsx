import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useClientContext } from "@/contexts/client-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { WeekSelector } from "@/components/week-selector";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingCart,
  ArrowUpRight,
  ArrowDownRight,
  UtensilsCrossed,
  Minus,
} from "lucide-react";
import { SiUbereats, SiDoordash } from "react-icons/si";
import { GiHotMeal } from "react-icons/gi";
import type { ConsolidatedLocationMetrics, DashboardOverview } from "@shared/schema";

const platformIcons: Record<string, typeof SiUbereats> = {
  ubereats: SiUbereats,
  doordash: SiDoordash,
  grubhub: GiHotMeal,
};

const platformLabels: Record<string, string> = {
  ubereats: "Uber Eats",
  doordash: "DoorDash",
  grubhub: "Grubhub",
};

export default function MenuPerformancePage() {
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

  const sortedLocations = useMemo(() => {
    if (!locationMetrics) return [];
    return [...locationMetrics]
      .filter((l) => l.totalSales > 0)
      .sort((a, b) => b.totalSales - a.totalSales);
  }, [locationMetrics]);

  const topPerformers = sortedLocations.slice(0, 5);
  const bottomPerformers = sortedLocations.length > 5
    ? [...sortedLocations].sort((a, b) => a.totalSales - b.totalSales).slice(0, 5)
    : [];

  const platformBreakdown = useMemo(() => {
    if (!overview?.platformBreakdown) return [];
    return overview.platformBreakdown.filter((p) =>
      selectedPlatforms.includes(p.platform)
    );
  }, [overview, selectedPlatforms]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);

  const formatNumber = (value: number) =>
    new Intl.NumberFormat("en-US").format(value);

  const isLoading = overviewLoading || locationsLoading;

  return (
    <div className="p-6 space-y-6" data-testid="page-menu-performance">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">
            Menu Performance
          </h1>
          <p className="text-sm text-muted-foreground">
            Sales rankings, AOV analysis, and platform comparisons by location
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
                  <span className="text-sm text-muted-foreground">Total Sales</span>
                  <DollarSign className="w-4 h-4 text-muted-foreground" />
                </div>
                <p className="text-2xl font-semibold" data-testid="metric-total-sales">
                  {formatCurrency(overview?.totalSales || 0)}
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
                  <span className="text-sm text-muted-foreground">Avg Order Value</span>
                  <UtensilsCrossed className="w-4 h-4 text-muted-foreground" />
                </div>
                <p className="text-2xl font-semibold" data-testid="metric-aov">
                  {formatCurrency(overview?.averageAov || 0)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-sm text-muted-foreground">Active Locations</span>
                  <TrendingUp className="w-4 h-4 text-muted-foreground" />
                </div>
                <p className="text-2xl font-semibold" data-testid="metric-locations">
                  {sortedLocations.length}
                </p>
              </CardContent>
            </Card>
          </div>

          {platformBreakdown.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Platform Comparison</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {platformBreakdown.map((p) => {
                    const Icon = platformIcons[p.platform];
                    return (
                      <div
                        key={p.platform}
                        className="flex flex-col gap-3 p-4 rounded-md border"
                        data-testid={`card-platform-${p.platform}`}
                      >
                        <div className="flex items-center gap-2">
                          {Icon && <Icon className="w-4 h-4" />}
                          <span className="text-sm font-medium">{platformLabels[p.platform]}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <p className="text-xs text-muted-foreground">Sales</p>
                            <p className="text-sm font-semibold">{formatCurrency(p.totalSales)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Orders</p>
                            <p className="text-sm font-semibold">{formatNumber(p.totalOrders)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">AOV</p>
                            <p className="text-sm font-semibold">{formatCurrency(p.aov)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Net Payout %</p>
                            <p className="text-sm font-semibold">{(p.netPayoutPercent * 100).toFixed(1)}%</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ArrowUpRight className="w-4 h-4 text-green-600" />
                  Top Performers
                </CardTitle>
              </CardHeader>
              <CardContent>
                {topPerformers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No location data available</p>
                ) : (
                  <div className="space-y-3">
                    {topPerformers.map((loc, i) => (
                      <div
                        key={loc.location}
                        className="flex items-center justify-between gap-4 py-2 border-b last:border-b-0"
                        data-testid={`row-top-performer-${i}`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-xs font-medium text-muted-foreground w-5">{i + 1}</span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{loc.canonicalName || loc.location}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-xs text-muted-foreground">{formatNumber(loc.totalOrders)} orders</span>
                              <Minus className="w-2 h-2 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">AOV {formatCurrency(loc.aov)}</span>
                            </div>
                          </div>
                        </div>
                        <span className="text-sm font-semibold flex-shrink-0">{formatCurrency(loc.totalSales)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ArrowDownRight className="w-4 h-4 text-red-500" />
                  Needs Attention
                </CardTitle>
              </CardHeader>
              <CardContent>
                {bottomPerformers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Not enough locations to compare</p>
                ) : (
                  <div className="space-y-3">
                    {bottomPerformers.map((loc, i) => (
                      <div
                        key={loc.location}
                        className="flex items-center justify-between gap-4 py-2 border-b last:border-b-0"
                        data-testid={`row-bottom-performer-${i}`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-xs font-medium text-muted-foreground w-5">{i + 1}</span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{loc.canonicalName || loc.location}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-xs text-muted-foreground">{formatNumber(loc.totalOrders)} orders</span>
                              <Minus className="w-2 h-2 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">AOV {formatCurrency(loc.aov)}</span>
                            </div>
                          </div>
                        </div>
                        <span className="text-sm font-semibold flex-shrink-0">{formatCurrency(loc.totalSales)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {sortedLocations.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">All Locations — Sales Ranking</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 pr-4 font-medium text-muted-foreground">#</th>
                        <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Location</th>
                        <th className="text-right py-2 pr-4 font-medium text-muted-foreground">Sales</th>
                        <th className="text-right py-2 pr-4 font-medium text-muted-foreground">Orders</th>
                        <th className="text-right py-2 pr-4 font-medium text-muted-foreground">AOV</th>
                        <th className="text-right py-2 pr-4 font-medium text-muted-foreground">ROAS</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">Net Payout %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedLocations.map((loc, i) => (
                        <tr key={loc.location} className="border-b last:border-b-0" data-testid={`row-location-${i}`}>
                          <td className="py-2 pr-4 text-muted-foreground">{i + 1}</td>
                          <td className="py-2 pr-4 font-medium">{loc.canonicalName || loc.location}</td>
                          <td className="py-2 pr-4 text-right">{formatCurrency(loc.totalSales)}</td>
                          <td className="py-2 pr-4 text-right">{formatNumber(loc.totalOrders)}</td>
                          <td className="py-2 pr-4 text-right">{formatCurrency(loc.aov)}</td>
                          <td className="py-2 pr-4 text-right">{loc.marketingRoas > 0 ? `${loc.marketingRoas.toFixed(1)}x` : "—"}</td>
                          <td className="py-2 text-right">{(loc.netPayoutPercent * 100).toFixed(1)}%</td>
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
