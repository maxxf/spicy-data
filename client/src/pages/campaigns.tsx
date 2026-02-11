import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { LocationSelector } from "@/components/location-selector";
import { useClientContext } from "@/contexts/client-context";
import { WeekSelector } from "@/components/week-selector";
import { MetricCard } from "@/components/metric-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, BarChart, Bar, Area, AreaChart, ComposedChart } from "recharts";
import { Percent, Target, TrendingUp, DollarSign, ShoppingCart, TrendingDown, Calculator, BarChart3, MapPin, ArrowUpRight, ArrowDownRight } from "lucide-react";
import type { PromotionMetrics, PaidAdCampaignMetrics, ConsolidatedLocationMetrics } from "@shared/schema";

const statusColors = {
  active: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
  scheduled: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  completed: "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20",
  paused: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20",
};

type WeeklyTrendData = {
  weekStart: string;
  weekEnd: string;
  weekLabel: string;
  totalSales: number;
  totalOrders: number;
  averageAov: number;
  totalMarketingInvestment: number;
  blendedRoas: number;
  netPayoutPercent: number;
  marketingDrivenSales: number;
  organicSales: number;
  ordersFromMarketing: number;
  organicOrders: number;
  adSpend: number;
  offerDiscountValue: number;
  totalMarketingSpend: number;
  marketingSpendPercent: number;
  marketingRoas: number;
  cpo: number;
  netPayout: number;
};

export default function PromosPage() {
  const { selectedClientId, setSelectedClientId, selectedPlatforms, selectedWeek, setSelectedWeek } = useClientContext();
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const selectedPlatform = selectedPlatforms.length < 3 ? selectedPlatforms[0] || null : null;
  const [selectedStatus, setSelectedStatus] = useState<string>("all");

  const { data: weeks } = useQuery<Array<{ weekStart: string; weekEnd: string }>>({
    queryKey: ["/api/analytics/weeks"],
  });

  useEffect(() => {
    if (weeks && weeks.length > 0 && !selectedWeek) {
      setSelectedWeek(weeks[0]);
    }
  }, [weeks, selectedWeek, setSelectedWeek]);

  useEffect(() => {
    setSelectedLocationId(null);
  }, [selectedClientId]);

  const buildQueryParams = () => {
    const params = new URLSearchParams();
    if (selectedClientId) params.append("clientId", selectedClientId);
    if (selectedLocationId) params.append("locationId", selectedLocationId);
    if (selectedPlatform) params.append("platform", selectedPlatform);
    if (selectedWeek) {
      params.append("weekStart", selectedWeek.weekStart);
      params.append("weekEnd", selectedWeek.weekEnd);
    }
    return params.toString() ? `?${params.toString()}` : "";
  };

  const buildTrendParams = () => {
    const params = new URLSearchParams();
    if (selectedClientId) params.append("clientId", selectedClientId);
    if (selectedPlatform) params.append("platform", selectedPlatform);
    return params.toString() ? `?${params.toString()}` : "";
  };

  const buildLocationParams = () => {
    const params = new URLSearchParams();
    if (selectedClientId) params.append("clientId", selectedClientId);
    if (selectedPlatform) params.append("platform", selectedPlatform);
    if (selectedWeek) {
      params.append("weekStart", selectedWeek.weekStart);
      params.append("weekEnd", selectedWeek.weekEnd);
    }
    return params.toString() ? `?${params.toString()}` : "";
  };

  const { data: weeklyTrend, isLoading: trendLoading } = useQuery<WeeklyTrendData[]>({
    queryKey: ["/api/analytics/weekly-trend", selectedClientId, selectedPlatform],
    queryFn: async () => {
      const response = await fetch(`/api/analytics/weekly-trend${buildTrendParams()}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch weekly trend");
      return response.json();
    },
  });

  const { data: promotions, isLoading: promotionsLoading } = useQuery<PromotionMetrics[]>({
    queryKey: ["/api/analytics/promotions", selectedClientId, selectedLocationId, selectedPlatform, selectedWeek],
    queryFn: async () => {
      const response = await fetch(`/api/analytics/promotions${buildQueryParams()}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch promotions");
      return response.json();
    },
  });

  const { data: paidAds, isLoading: paidAdsLoading } = useQuery<PaidAdCampaignMetrics[]>({
    queryKey: ["/api/analytics/paid-ads", selectedClientId, selectedLocationId, selectedPlatform, selectedWeek],
    queryFn: async () => {
      const response = await fetch(`/api/analytics/paid-ads${buildQueryParams()}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch campaigns");
      return response.json();
    },
  });

  const { data: locationMetrics, isLoading: locationsLoading } = useQuery<ConsolidatedLocationMetrics[]>({
    queryKey: ["/api/analytics/locations/consolidated", selectedClientId, selectedPlatform, selectedWeek],
    queryFn: async () => {
      const response = await fetch(`/api/analytics/locations/consolidated${buildLocationParams()}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch location metrics");
      return response.json();
    },
  });

  const filteredPromotions = useMemo(() => {
    if (!promotions) return [];
    if (selectedStatus === "all") return promotions;
    return promotions.filter(p => p.status === selectedStatus);
  }, [promotions, selectedStatus]);

  const filteredPaidAds = useMemo(() => {
    if (!paidAds) return [];
    if (selectedStatus === "all") return paidAds;
    return paidAds.filter(p => p.status === selectedStatus);
  }, [paidAds, selectedStatus]);

  const promotionMetrics = useMemo(() => {
    if (!filteredPromotions || filteredPromotions.length === 0) {
      return { totalOrders: 0, totalRevenue: 0, totalCost: 0, totalDiscountCost: 0, totalMarketingFees: 0, aggregateROAS: 0 };
    }
    const totalOrders = filteredPromotions.reduce((sum, p) => sum + (p.orders || 0), 0);
    const totalRevenue = filteredPromotions.reduce((sum, p) => sum + (p.revenueImpact || 0), 0);
    const totalCost = filteredPromotions.reduce((sum, p) => sum + (p.totalCost || 0), 0);
    const totalDiscountCost = filteredPromotions.reduce((sum, p) => sum + (p.discountCost || 0), 0);
    const totalMarketingFees = filteredPromotions.reduce((sum, p) => sum + (p.marketingFees || 0), 0);
    const aggregateROAS = totalCost > 0 ? totalRevenue / totalCost : 0;
    return { totalOrders, totalRevenue, totalCost, totalDiscountCost, totalMarketingFees, aggregateROAS };
  }, [filteredPromotions]);

  const paidAdMetrics = useMemo(() => {
    if (!filteredPaidAds || filteredPaidAds.length === 0) {
      return { totalSpend: 0, totalRevenue: 0, totalOrders: 0, aggregateROAS: 0, totalClicks: 0, totalImpressions: 0 };
    }
    const totalSpend = filteredPaidAds.reduce((sum, p) => sum + (p.spend || 0), 0);
    const totalRevenue = filteredPaidAds.reduce((sum, p) => sum + (p.revenue || 0), 0);
    const totalOrders = filteredPaidAds.reduce((sum, p) => sum + (p.orders || 0), 0);
    const totalClicks = filteredPaidAds.reduce((sum, p) => sum + (p.clicks || 0), 0);
    const totalImpressions = filteredPaidAds.reduce((sum, p) => sum + (p.impressions || 0), 0);
    const aggregateROAS = totalSpend > 0 ? totalRevenue / totalSpend : 0;
    return { totalSpend, totalRevenue, totalOrders, aggregateROAS, totalClicks, totalImpressions };
  }, [filteredPaidAds]);

  const combinedMetrics = useMemo(() => {
    const totalRevenue = promotionMetrics.totalRevenue + paidAdMetrics.totalRevenue;
    const totalCost = promotionMetrics.totalCost + paidAdMetrics.totalSpend;
    const totalOrders = promotionMetrics.totalOrders + paidAdMetrics.totalOrders;
    const combinedROAS = totalCost > 0 ? totalRevenue / totalCost : 0;
    const trueCPO = totalOrders > 0 ? totalCost / totalOrders : 0;
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    return {
      totalRevenue, totalCost, totalOrders, combinedROAS, trueCPO, avgOrderValue,
      adSpend: paidAdMetrics.totalSpend,
      discountCost: promotionMetrics.totalDiscountCost,
      marketingFees: promotionMetrics.totalMarketingFees,
      promotionTotalCost: promotionMetrics.totalCost,
    };
  }, [promotionMetrics, paidAdMetrics]);

  const latestWeekData = useMemo(() => {
    if (!weeklyTrend || weeklyTrend.length === 0) return null;
    return weeklyTrend[weeklyTrend.length - 1];
  }, [weeklyTrend]);

  const previousWeekData = useMemo(() => {
    if (!weeklyTrend || weeklyTrend.length < 2) return null;
    return weeklyTrend[weeklyTrend.length - 2];
  }, [weeklyTrend]);

  const trendChartData = useMemo(() => {
    if (!weeklyTrend) return [];
    return weeklyTrend.map(w => ({
      week: w.weekLabel,
      marketingDrivenSales: w.marketingDrivenSales,
      organicSales: w.organicSales,
      totalSales: w.totalSales,
      roas: w.marketingRoas,
      cpo: w.cpo,
      spendPercent: w.marketingSpendPercent,
      adSpend: w.adSpend,
      offerDiscountValue: w.offerDiscountValue,
      totalMarketingSpend: w.totalMarketingSpend,
    }));
  }, [weeklyTrend]);

  const chartConfig = {
    marketingDrivenSales: { label: "Marketing Sales", color: "hsl(var(--primary))" },
    organicSales: { label: "Organic Sales", color: "hsl(var(--chart-2))" },
    roas: { label: "ROAS", color: "hsl(var(--primary))" },
    cpo: { label: "CPO", color: "hsl(var(--chart-3))" },
    spendPercent: { label: "Spend %", color: "hsl(var(--chart-4))" },
    adSpend: { label: "Ad Spend", color: "hsl(var(--chart-1))" },
    offerDiscountValue: { label: "Offer Discounts", color: "hsl(var(--chart-5))" },
  };

  const locationMarketingData = useMemo(() => {
    if (!locationMetrics) return [];
    return locationMetrics
      .filter(loc => loc.totalSales > 0)
      .map(loc => {
        const mktSales = loc.marketingDrivenSales || 0;
        const orgSales = loc.totalSales - mktSales;
        const mktInvestment = loc.totalMarketingInvestment || 0;
        const mktSpendPct = loc.totalSales > 0 ? (mktInvestment / loc.totalSales) * 100 : 0;
        return {
          location: loc.canonicalName || loc.location,
          totalSales: loc.totalSales,
          marketingDrivenSales: mktSales,
          organicSales: orgSales,
          marketingPct: loc.totalSales > 0 ? (mktSales / loc.totalSales) * 100 : 0,
          totalOrders: loc.totalOrders,
          roas: loc.marketingRoas,
          marketingInvestment: mktInvestment,
          marketingSpendPct: mktSpendPct,
          netPayout: loc.netPayout,
          netPayoutPercent: loc.netPayoutPercent,
          aov: loc.aov,
        };
      })
      .sort((a, b) => b.totalSales - a.totalSales);
  }, [locationMetrics]);

  const formatCurrency = (value: number | undefined | null) => {
    if (value == null) return '—';
    return new Intl.NumberFormat("en-US", {
      style: "currency", currency: "USD",
      minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(value);
  };

  const formatPercent = (value: number | undefined | null) => {
    return value != null ? `${value.toFixed(1)}%` : '—';
  };

  const formatNumber = (value: number | undefined | null) => {
    return value != null ? value.toLocaleString() : '—';
  };

  const getChangeIndicator = (current: number, previous: number | undefined | null) => {
    if (previous == null || previous === 0) return null;
    const change = ((current - previous) / Math.abs(previous)) * 100;
    const isPositive = change > 0;
    return (
      <span className={`inline-flex items-center gap-0.5 text-xs ${isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
        {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
        {Math.abs(change).toFixed(1)}%
      </span>
    );
  };

  const isLoading = promotionsLoading || paidAdsLoading;

  return (
    <div className="p-8 space-y-8" data-testid="page-campaigns">
      <div className="flex justify-between items-start gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">
            Campaign Tracker
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Marketing attribution, weekly trends, and campaign performance
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <WeekSelector
            weeks={weeks}
            selectedWeek={selectedWeek}
            onWeekChange={setSelectedWeek}
            showAllOption={false}
          />
          <LocationSelector
            clientId={selectedClientId}
            selectedLocationId={selectedLocationId}
            onLocationChange={setSelectedLocationId}
            showAllOption={true}
          />
        </div>
      </div>

      {/* Organic vs Marketing Driven Sales Summary */}
      {trendLoading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4" data-testid="section-marketing-split-loading">
          <Card><CardContent className="p-6"><Skeleton className="h-[80px] w-full" /></CardContent></Card>
          <Card><CardContent className="p-6"><Skeleton className="h-[80px] w-full" /></CardContent></Card>
          <Card><CardContent className="p-6"><Skeleton className="h-[80px] w-full" /></CardContent></Card>
          <Card><CardContent className="p-6"><Skeleton className="h-[80px] w-full" /></CardContent></Card>
        </div>
      ) : latestWeekData ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4" data-testid="section-marketing-split">
          <MetricCard
            label="Marketing Driven Sales"
            value={latestWeekData.marketingDrivenSales}
            format="currency"
            icon={<Target className="w-5 h-5" />}
            subtitle={latestWeekData.totalSales > 0
              ? `${((latestWeekData.marketingDrivenSales / latestWeekData.totalSales) * 100).toFixed(1)}% of total`
              : undefined}
            data-testid="metric-marketing-driven-sales"
          />
          <MetricCard
            label="Organic Sales"
            value={latestWeekData.organicSales}
            format="currency"
            icon={<TrendingUp className="w-5 h-5" />}
            subtitle={latestWeekData.totalSales > 0
              ? `${((latestWeekData.organicSales / latestWeekData.totalSales) * 100).toFixed(1)}% of total`
              : undefined}
            data-testid="metric-organic-sales"
          />
          <MetricCard
            label="Marketing ROAS"
            value={latestWeekData.marketingRoas}
            format="multiplier"
            icon={<BarChart3 className="w-5 h-5" />}
            subtitle={previousWeekData ? undefined : undefined}
            data-testid="metric-marketing-roas"
          />
          <MetricCard
            label="Marketing Spend %"
            value={latestWeekData.marketingSpendPercent}
            format="percent"
            icon={<Percent className="w-5 h-5" />}
            subtitle={`${formatCurrency(latestWeekData.totalMarketingSpend)} of ${formatCurrency(latestWeekData.totalSales)}`}
            data-testid="metric-spend-percent"
          />
        </div>
      ) : null}

      {/* Trending Charts Section */}
      <div className="space-y-6" data-testid="section-trending-charts">
        <h2 className="text-lg font-semibold tracking-tight">Weekly Trends</h2>
        {trendLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card><CardContent className="p-6"><Skeleton className="h-[250px] w-full" /></CardContent></Card>
            <Card><CardContent className="p-6"><Skeleton className="h-[250px] w-full" /></CardContent></Card>
          </div>
        ) : trendChartData.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Marketing vs Organic Sales Stacked Area */}
            <Card data-testid="chart-marketing-vs-organic">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium" data-testid="text-chart-title-marketing-organic">Marketing vs Organic Sales</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="h-[250px]">
                  <AreaChart data={trendChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="week" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                    <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                    <ChartTooltip
                      content={<ChartTooltipContent
                        formatter={(value, name) => {
                          if (name === 'marketingDrivenSales') return [`$${Number(value).toLocaleString()}`, 'Marketing Sales'];
                          if (name === 'organicSales') return [`$${Number(value).toLocaleString()}`, 'Organic Sales'];
                          return [value, String(name)];
                        }}
                      />}
                    />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Area type="monotone" dataKey="organicSales" stackId="1" stroke="hsl(var(--chart-2))" fill="hsl(var(--chart-2))" fillOpacity={0.4} />
                    <Area type="monotone" dataKey="marketingDrivenSales" stackId="1" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.4} />
                  </AreaChart>
                </ChartContainer>
              </CardContent>
            </Card>

            {/* ROAS & CPO Trend */}
            <Card data-testid="chart-roas-cpo">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium" data-testid="text-chart-title-roas-cpo">ROAS & CPO</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="h-[250px]">
                  <LineChart data={trendChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="week" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                    <YAxis yAxisId="left" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v) => `${v.toFixed(1)}x`} />
                    <YAxis yAxisId="right" orientation="right" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v) => `$${v.toFixed(0)}`} />
                    <ChartTooltip
                      content={<ChartTooltipContent
                        formatter={(value, name) => {
                          if (name === 'roas') return [`${Number(value).toFixed(2)}x`, 'ROAS'];
                          if (name === 'cpo') return [`$${Number(value).toFixed(2)}`, 'CPO'];
                          return [value, String(name)];
                        }}
                      />}
                    />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Line yAxisId="left" type="monotone" dataKey="roas" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ fill: 'hsl(var(--primary))' }} />
                    <Line yAxisId="right" type="monotone" dataKey="cpo" stroke="hsl(var(--chart-3))" strokeWidth={2} dot={{ fill: 'hsl(var(--chart-3))' }} />
                  </LineChart>
                </ChartContainer>
              </CardContent>
            </Card>

            {/* Marketing Spend % */}
            <Card data-testid="chart-spend-percent">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium" data-testid="text-chart-title-spend-percent">Marketing Spend % of Sales</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="h-[250px]">
                  <ComposedChart data={trendChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="week" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                    <YAxis yAxisId="left" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v) => `${v.toFixed(1)}%`} />
                    <YAxis yAxisId="right" orientation="right" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                    <ChartTooltip
                      content={<ChartTooltipContent
                        formatter={(value, name) => {
                          if (name === 'spendPercent') return [`${Number(value).toFixed(1)}%`, 'Spend %'];
                          if (name === 'totalMarketingSpend') return [`$${Number(value).toLocaleString()}`, 'Total Spend'];
                          return [value, String(name)];
                        }}
                      />}
                    />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar yAxisId="right" dataKey="totalMarketingSpend" fill="hsl(var(--chart-4))" fillOpacity={0.3} radius={[4, 4, 0, 0]} />
                    <Line yAxisId="left" type="monotone" dataKey="spendPercent" stroke="hsl(var(--chart-4))" strokeWidth={2} dot={{ fill: 'hsl(var(--chart-4))' }} />
                  </ComposedChart>
                </ChartContainer>
              </CardContent>
            </Card>

            {/* Ad Spend vs Offer Discounts Breakdown */}
            <Card data-testid="chart-ad-spend-vs-offers">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium" data-testid="text-chart-title-ad-vs-offers">Ad Spend vs Offer Discounts</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="h-[250px]">
                  <BarChart data={trendChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="week" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                    <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                    <ChartTooltip
                      content={<ChartTooltipContent
                        formatter={(value, name) => {
                          if (name === 'adSpend') return [`$${Number(value).toLocaleString()}`, 'Ad Spend'];
                          if (name === 'offerDiscountValue') return [`$${Number(value).toLocaleString()}`, 'Offer Discounts'];
                          return [value, String(name)];
                        }}
                      />}
                    />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar dataKey="adSpend" stackId="spend" fill="hsl(var(--chart-1))" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="offerDiscountValue" stackId="spend" fill="hsl(var(--chart-5))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <BarChart3 className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">No weekly trend data available</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Tabs: Campaign Performance + Location Performance */}
      <Tabs defaultValue="campaigns" className="space-y-6">
        <TabsList data-testid="tabs-campaign-type">
          <TabsTrigger value="campaigns" data-testid="tab-campaigns">
            <Calculator className="w-4 h-4 mr-2" />
            By Campaign
          </TabsTrigger>
          <TabsTrigger value="locations" data-testid="tab-locations">
            <MapPin className="w-4 h-4 mr-2" />
            By Location
          </TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns" className="space-y-6">
          {/* Combined Performance Metrics */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Total Marketing Revenue"
              value={combinedMetrics.totalRevenue}
              format="currency"
              icon={<DollarSign className="w-5 h-5" />}
              subtitle="From ads + offers"
              data-testid="metric-combined-revenue"
            />
            <MetricCard
              label="Total Marketing Investment"
              value={combinedMetrics.totalCost}
              format="currency"
              icon={<TrendingDown className="w-5 h-5" />}
              subtitle={`${formatCurrency(combinedMetrics.adSpend)} ads + ${formatCurrency(combinedMetrics.promotionTotalCost)} offers`}
              data-testid="metric-combined-cost"
            />
            <MetricCard
              label="Combined ROAS"
              value={combinedMetrics.combinedROAS}
              format="multiplier"
              icon={<Target className="w-5 h-5" />}
              data-testid="metric-combined-roas"
            />
            <MetricCard
              label="True CPO"
              value={combinedMetrics.trueCPO}
              format="currency"
              icon={<Calculator className="w-5 h-5" />}
              subtitle="Total investment / orders"
              data-testid="metric-true-cpo"
            />
          </div>

          {/* Marketing Mix Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>Marketing Mix Breakdown</CardTitle>
              <CardDescription>
                How paid advertising and promotional offers contribute to overall performance
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Target className="w-4 h-4" />
                    Paid Advertising
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Ad Spend</span>
                      <span className="font-mono font-medium">{formatCurrency(paidAdMetrics.totalSpend)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Revenue</span>
                      <span className="font-mono font-medium">{formatCurrency(paidAdMetrics.totalRevenue)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Orders</span>
                      <span className="font-mono font-medium">{formatNumber(paidAdMetrics.totalOrders)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">ROAS</span>
                      <span className="font-mono font-medium text-primary">{paidAdMetrics.aggregateROAS.toFixed(2)}x</span>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Percent className="w-4 h-4" />
                    Promotional Offers
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Total Cost</span>
                      <span className="font-mono font-medium">{formatCurrency(promotionMetrics.totalCost)}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-muted-foreground pl-4">Discounts</span>
                      <span className="font-mono">{formatCurrency(promotionMetrics.totalDiscountCost)}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-muted-foreground pl-4">Marketing Fees</span>
                      <span className="font-mono">{formatCurrency(promotionMetrics.totalMarketingFees)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Revenue</span>
                      <span className="font-mono font-medium">{formatCurrency(promotionMetrics.totalRevenue)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Orders</span>
                      <span className="font-mono font-medium">{formatNumber(promotionMetrics.totalOrders)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">ROAS</span>
                      <span className="font-mono font-medium text-primary">{promotionMetrics.aggregateROAS.toFixed(2)}x</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Promotions Table */}
          {filteredPromotions && filteredPromotions.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center gap-4 flex-wrap">
                  <div>
                    <CardTitle>Promotional Campaigns</CardTitle>
                    <CardDescription>{filteredPromotions.length} campaigns</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant={selectedStatus === "all" ? "default" : "outline"} size="sm" onClick={() => setSelectedStatus("all")} data-testid="button-filter-all">All</Button>
                    <Button variant={selectedStatus === "active" ? "default" : "outline"} size="sm" onClick={() => setSelectedStatus("active")} data-testid="button-filter-active">Active</Button>
                    <Button variant={selectedStatus === "completed" ? "default" : "outline"} size="sm" onClick={() => setSelectedStatus("completed")} data-testid="button-filter-completed">Completed</Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Dates</TableHead>
                      <TableHead className="text-right">Orders</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead className="text-right">ROAS</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPromotions.map((promotion) => {
                      const promoROAS = promotion.totalCost && promotion.totalCost > 0 ? (promotion.revenueImpact || 0) / promotion.totalCost : 0;
                      return (
                        <TableRow key={promotion.id} className="hover-elevate">
                          <TableCell className="font-medium" data-testid={`text-promotion-name-${promotion.id}`}>{promotion.name}</TableCell>
                          <TableCell><Badge variant="outline" className="capitalize">{promotion.type}</Badge></TableCell>
                          <TableCell><Badge variant="outline" className={statusColors[promotion.status as keyof typeof statusColors] || statusColors.scheduled}>{promotion.status}</Badge></TableCell>
                          <TableCell className="text-sm">
                            <div>{promotion.startDate}</div>
                            {promotion.endDate && <div className="text-muted-foreground text-xs">to {promotion.endDate}</div>}
                          </TableCell>
                          <TableCell className="text-right font-mono" data-testid={`text-orders-${promotion.id}`}>{formatNumber(promotion.orders)}</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(promotion.revenueImpact)}</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(promotion.totalCost)}</TableCell>
                          <TableCell className="text-right font-mono">
                            {promoROAS > 0 ? (
                              <span className={promoROAS >= 1 ? "text-green-600 dark:text-green-400 flex items-center justify-end gap-1" : "text-yellow-600 dark:text-yellow-400 flex items-center justify-end gap-1"}>
                                {promoROAS >= 1 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                {promoROAS.toFixed(2)}x
                              </span>
                            ) : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Paid Ads Table */}
          {filteredPaidAds && filteredPaidAds.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center gap-4 flex-wrap">
                  <div>
                    <CardTitle>Paid Advertising Campaigns</CardTitle>
                    <CardDescription>{filteredPaidAds.length} campaigns</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Platform</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Impressions</TableHead>
                      <TableHead className="text-right">Clicks</TableHead>
                      <TableHead className="text-right">Orders</TableHead>
                      <TableHead className="text-right">Spend</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">ROAS</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPaidAds.map((campaign) => (
                      <TableRow key={campaign.id} className="hover-elevate">
                        <TableCell className="font-medium" data-testid={`text-campaign-name-${campaign.id}`}>{campaign.name}</TableCell>
                        <TableCell><Badge variant="outline" className="capitalize">{campaign.platform}</Badge></TableCell>
                        <TableCell><Badge variant="outline" className={statusColors[campaign.status as keyof typeof statusColors] || statusColors.scheduled}>{campaign.status}</Badge></TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatNumber(campaign.impressions)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatNumber(campaign.clicks)}</TableCell>
                        <TableCell className="text-right font-mono" data-testid={`text-orders-${campaign.id}`}>{formatNumber(campaign.orders)}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(campaign.spend)}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(campaign.revenue)}</TableCell>
                        <TableCell className="text-right font-mono">
                          {campaign.roas != null && campaign.roas > 0 ? (
                            <span className={campaign.roas >= 1 ? "text-green-600 dark:text-green-400 flex items-center justify-end gap-1" : "text-yellow-600 dark:text-yellow-400 flex items-center justify-end gap-1"}>
                              {campaign.roas >= 1 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                              {campaign.roas.toFixed(2)}x
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Empty state for no campaign data */}
          {(!filteredPromotions || filteredPromotions.length === 0) && (!filteredPaidAds || filteredPaidAds.length === 0) && !isLoading && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Calculator className="w-12 h-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2" data-testid="text-empty-state-campaigns">No campaign data available</h3>
                <p className="text-sm text-muted-foreground">Upload marketing data files to see campaign performance</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="locations" className="space-y-6">
          {locationsLoading ? (
            <Card><CardContent className="p-6"><Skeleton className="h-[400px] w-full" /></CardContent></Card>
          ) : locationMarketingData.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Marketing Performance by Location</CardTitle>
                <CardDescription>
                  How marketing investment drives sales at each location for the selected week
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[180px]">Location</TableHead>
                        <TableHead className="text-right">Total Sales</TableHead>
                        <TableHead className="text-right">Marketing Sales</TableHead>
                        <TableHead className="text-right">Organic Sales</TableHead>
                        <TableHead className="text-right">Mkt %</TableHead>
                        <TableHead className="text-right">Mkt Spend</TableHead>
                        <TableHead className="text-right">Spend %</TableHead>
                        <TableHead className="text-right">ROAS</TableHead>
                        <TableHead className="text-right">AOV</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {locationMarketingData.map((loc, idx) => (
                        <TableRow key={idx} className="hover-elevate" data-testid={`row-location-${idx}`}>
                          <TableCell className="font-medium text-sm" data-testid={`text-location-name-${idx}`}>
                            <div className="flex items-center gap-2">
                              <MapPin className="w-3 h-3 text-muted-foreground shrink-0" />
                              <span className="truncate max-w-[200px]">{loc.location}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(loc.totalSales)}</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(loc.marketingDrivenSales)}</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(loc.organicSales)}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant="outline" className="font-mono text-xs">
                              {loc.marketingPct.toFixed(1)}%
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(loc.marketingInvestment)}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatPercent(loc.marketingSpendPct)}</TableCell>
                          <TableCell className="text-right font-mono">
                            {loc.roas > 0 ? (
                              <span className={loc.roas >= 1 ? "text-green-600 dark:text-green-400" : "text-yellow-600 dark:text-yellow-400"}>
                                {loc.roas.toFixed(2)}x
                              </span>
                            ) : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(loc.aov)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <MapPin className="w-12 h-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2" data-testid="text-empty-state-locations">No location data available</h3>
                <p className="text-sm text-muted-foreground">Select a client with transaction data to see location-level marketing performance</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
