import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { MetricCard } from "@/components/metric-card";
import { LocationSelector } from "@/components/location-selector";
import { PlatformSelector } from "@/components/platform-selector";
import { WeekSelector } from "@/components/week-selector";
import { useClientContext } from "@/contexts/client-context";
import { DataTable } from "@/components/data-table";
import { PlatformBadge } from "@/components/platform-badge";
import {
  TrendingUp,
  DollarSign,
  ShoppingCart,
  Target,
  TrendingDown,
  Percent,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, BarChart, Bar, Legend } from "recharts";
import type { DashboardOverview, ConsolidatedLocationMetrics } from "@shared/schema";
import { formatWeekRange } from "@shared/week-utils";

interface ClientPerformance {
  clientId: string;
  clientName: string;
  totalSales: number;
  totalOrders: number;
  roas: number;
}

export default function Dashboard() {
  const { selectedClientId, setSelectedClientId } = useClientContext();
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<{ weekStart: string; weekEnd: string } | null>(null);
  const [showLocationDetails, setShowLocationDetails] = useState(false);

  // Fetch available weeks to default to most recent
  const { data: weeks } = useQuery<Array<{ weekStart: string; weekEnd: string }>>({
    queryKey: ["/api/analytics/weeks"],
  });

  // Default to most recent week when weeks data loads
  useEffect(() => {
    if (weeks && weeks.length > 0 && !selectedWeek) {
      setSelectedWeek(weeks[0]); // First week is most recent (sorted desc)
    }
  }, [weeks, selectedWeek]);

  // Reset location when client changes
  useEffect(() => {
    setSelectedLocationId(null);
  }, [selectedClientId]);

  // Build query params for filters
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

  const { data: overview, isLoading: overviewLoading } = useQuery<DashboardOverview>({
    queryKey: ["/api/analytics/overview", selectedClientId, selectedLocationId, selectedPlatform, selectedWeek],
    queryFn: async () => {
      const response = await fetch(`/api/analytics/overview${buildQueryParams()}`);
      if (!response.ok) throw new Error("Failed to fetch overview");
      return response.json();
    },
  });

  const { data: locationMetrics, isLoading: locationsLoading } = useQuery<ConsolidatedLocationMetrics[]>({
    queryKey: ["/api/analytics/locations/consolidated", selectedClientId, selectedLocationId, selectedPlatform, selectedWeek],
    queryFn: async () => {
      const response = await fetch(`/api/analytics/locations/consolidated${buildQueryParams()}`);
      if (!response.ok) throw new Error("Failed to fetch locations");
      return response.json();
    },
    enabled: showLocationDetails,
  });

  const { data: clientPerformance, isLoading: clientPerfLoading } = useQuery<ClientPerformance[]>({
    queryKey: ["/api/analytics/client-performance"],
  });

  const { data: weeklyTrend } = useQuery<Array<{
    weekStart: string;
    weekEnd: string;
    weekLabel: string;
    totalSales: number;
    totalOrders: number;
    averageAov: number;
    totalMarketingInvestment: number;
    blendedRoas: number;
    netPayoutPercent: number;
  }>>({
    queryKey: ["/api/analytics/weekly-trend", selectedClientId, selectedLocationId, selectedPlatform],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedClientId) params.append("clientId", selectedClientId);
      if (selectedLocationId) params.append("locationId", selectedLocationId);
      if (selectedPlatform) params.append("platform", selectedPlatform);
      const queryString = params.toString() ? `?${params.toString()}` : "";
      const response = await fetch(`/api/analytics/weekly-trend${queryString}`);
      if (!response.ok) throw new Error("Failed to fetch weekly trend");
      return response.json();
    },
  });

  const { data: dataQuality } = useQuery<{
    unmappedTransactions: {
      ubereats: number;
      doordash: number;
      grubhub: number;
    };
  }>({
    queryKey: ["/api/analytics/data-quality", selectedClientId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedClientId) params.append("clientId", selectedClientId);
      const queryString = params.toString() ? `?${params.toString()}` : "";
      const response = await fetch(`/api/analytics/data-quality${queryString}`);
      if (!response.ok) throw new Error("Failed to fetch data quality");
      return response.json();
    },
    enabled: !!selectedClientId,
  });

  if (overviewLoading) {
    return (
      <div className="p-8 space-y-8">
        <div>
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  const platformColumns = [
    {
      key: "platform",
      label: "Platform",
      sortable: true,
      render: (value: string) => (
        <PlatformBadge platform={value as "ubereats" | "doordash" | "grubhub"} />
      ),
    },
    {
      key: "totalSales",
      label: "Total Sales",
      sortable: true,
      align: "right" as const,
      render: (value: number) =>
        new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
        }).format(value),
    },
    {
      key: "totalOrders",
      label: "Orders",
      sortable: true,
      align: "right" as const,
      render: (value: number) => value.toLocaleString(),
    },
    {
      key: "aov",
      label: "AOV",
      sortable: true,
      align: "right" as const,
      render: (value: number) =>
        new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
        }).format(value),
    },
    {
      key: "totalMarketingInvestment",
      label: "Marketing Spend",
      sortable: true,
      align: "right" as const,
      render: (value: number) =>
        new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
        }).format(value),
    },
    {
      key: "marketingRoas",
      label: "ROAS",
      sortable: true,
      align: "right" as const,
      render: (value: number | null) => value != null ? `${value.toFixed(2)}x` : 'N/A',
    },
    {
      key: "netPayout",
      label: "Net Payout $",
      sortable: true,
      align: "right" as const,
      render: (value: number) =>
        new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
        }).format(value),
    },
    {
      key: "netPayoutPercent",
      label: "Net Payout %",
      sortable: true,
      align: "right" as const,
      render: (value: number | null) => value != null ? `${value.toFixed(2)}%` : 'N/A',
    },
  ];

  const locationColumns = [
    {
      key: "location",
      label: "Location",
      sortable: true,
    },
    {
      key: "totalSales",
      label: "Sales",
      sortable: true,
      align: "right" as const,
      render: (value: number) =>
        new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
        }).format(value),
    },
    {
      key: "totalOrders",
      label: "Orders",
      sortable: true,
      align: "right" as const,
      render: (value: number) => value.toLocaleString(),
    },
    {
      key: "aov",
      label: "AOV",
      sortable: true,
      align: "right" as const,
      render: (value: number) =>
        new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
        }).format(value),
    },
    {
      key: "totalMarketingInvestment",
      label: "Marketing Spend",
      sortable: true,
      align: "right" as const,
      render: (value: number) =>
        new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
        }).format(value),
    },
    {
      key: "marketingRoas",
      label: "ROAS",
      sortable: true,
      align: "right" as const,
      render: (value: number | null) => value != null ? `${value.toFixed(2)}x` : 'N/A',
    },
    {
      key: "netPayout",
      label: "Payout $",
      sortable: true,
      align: "right" as const,
      render: (value: number) =>
        new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
        }).format(value),
    },
  ];

  // Platform colors for charts
  const platformColors = {
    ubereats: "#46A05E",
    doordash: "#DC2626",
    grubhub: "#EA7125",
  };

  // Prepare chart data
  const platformChartData = overview?.platformBreakdown?.map(platform => ({
    name: platform.platform === "ubereats" ? "Uber Eats" : 
          platform.platform === "doordash" ? "DoorDash" : "Grubhub",
    platform: platform.platform,
    value: platform.totalSales,
  })) || [];

  const chartConfig = {
    ubereats: {
      label: "Uber Eats",
      color: platformColors.ubereats,
    },
    doordash: {
      label: "DoorDash",
      color: platformColors.doordash,
    },
    grubhub: {
      label: "Grubhub",
      color: platformColors.grubhub,
    },
  };

  // Weekly trend data from API (in chronological order, oldest to newest)
  const weeklyTrendData = weeklyTrend?.map((week, index) => ({
    week: week.weekLabel,
    weekStart: week.weekStart,
    sales: week.totalSales,
    orders: week.totalOrders,
    aov: week.averageAov,
    marketing: week.totalMarketingInvestment,
    roas: week.blendedRoas,
  })) ?? [];

  // Prepare client performance data for the chart
  const clientPerformanceData = clientPerformance?.map(client => ({
    client: client.clientName,
    sales: client.totalSales,
    orders: client.totalOrders,
    roas: client.roas * 10000, // Scale for visualization
  })) || [];

  const isPortfolioView = !selectedClientId;

  // Calculate marketing sales and orders from platform breakdown
  const totalMarketingSales = overview?.platformBreakdown?.reduce((sum, p) => sum + p.marketingDrivenSales, 0) || 0;
  const totalMarketingOrders = overview?.platformBreakdown?.reduce((sum, p) => sum + p.ordersFromMarketing, 0) || 0;
  
  // Get comparison data from API
  const comparison = overview?.comparison;

  // Format date range for display (UTC-safe)
  const formattedDateRange = selectedWeek 
    ? formatWeekRange(selectedWeek.weekStart, selectedWeek.weekEnd)
    : "Loading...";

  return (
    <div className="p-8 space-y-8" data-testid="page-dashboard">
      <div className="flex justify-between items-start gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight mb-2">
            {isPortfolioView ? "Portfolio Overview" : "Client Dashboard"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isPortfolioView ? "Multi-platform delivery performance overview" : "Client-specific performance metrics"}
          </p>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
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
          <PlatformSelector
            selectedPlatform={selectedPlatform}
            onPlatformChange={setSelectedPlatform}
          />
        </div>
      </div>

      {/* Prominent Date Range Header */}
      {selectedWeek && (
        <Card className="bg-muted/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Reporting Period</p>
                <p className="text-lg font-semibold" data-testid="text-date-range">{formattedDateRange}</p>
              </div>
              {comparison && (
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">vs. Previous Week</p>
                  <p className={`text-sm font-medium ${comparison.totalSales > 0 ? 'text-green-600 dark:text-green-500' : comparison.totalSales < 0 ? 'text-red-600 dark:text-red-500' : 'text-muted-foreground'}`}>
                    {comparison.totalSales > 0 ? '+' : ''}{comparison.totalSales?.toFixed(1)}%
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Portfolio-Level Metrics - Only shown in "All Clients" view */}
      {isPortfolioView && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <MetricCard
            label="Portfolio Sales"
            value={overview?.totalSales || 0}
            format="currency"
            icon={<DollarSign className="w-5 h-5" />}
            change={comparison?.totalSales}
            changeLabel="vs. previous period"
            data-testid="metric-portfolio-sales"
          />
          <MetricCard
            label="Active Clients"
            value={clientPerformance?.length || 0}
            format="number"
            icon={<Users className="w-5 h-5" />}
            subtitle="All performing"
            data-testid="metric-active-clients"
          />
          <MetricCard
            label="Portfolio ROAS"
            value={overview?.blendedRoas || 0}
            format="multiplier"
            icon={<Target className="w-5 h-5" />}
            change={comparison?.blendedRoas}
            changeLabel="vs. previous"
            data-testid="metric-portfolio-roas"
            tooltip="Portfolio-wide Return on Ad Spend: Total marketing-attributed sales divided by total marketing investment across all clients."
          />
          <MetricCard
            label="Net Payout Rate"
            value={overview?.netPayoutPercent || 0}
            format="percent"
            icon={<Percent className="w-5 h-5" />}
            subtitle="weighted average"
            data-testid="metric-net-payout-rate"
          />
        </div>
      )}

      {/* Key Performance Indicators */}
      <Card>
        <CardHeader>
          <CardTitle>Key Performance Indicators</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <MetricCard
              label="Total Sales"
              value={overview?.totalSales || 0}
              format="currency"
              icon={<DollarSign className="w-5 h-5" />}
              change={comparison?.totalSales}
              changeLabel="vs. previous period"
            />
            <MetricCard
              label="Sales from Marketing"
              value={totalMarketingSales}
              format="currency"
              icon={<TrendingUp className="w-5 h-5" />}
              subtitle={`${(totalMarketingSales / (overview?.totalSales || 1) * 100).toFixed(0)}% of total sales`}
              tooltip="Revenue generated from orders attributed to marketing activity (paid ads or promotions). Orders with any marketing investment are counted."
            />
            <MetricCard
              label="Total Orders"
              value={overview?.totalOrders || 0}
              format="number"
              icon={<ShoppingCart className="w-5 h-5" />}
              change={comparison?.totalOrders}
              changeLabel="vs. previous period"
            />
            <MetricCard
              label="Average Order Value"
              value={overview?.averageAov || 0}
              format="currency"
              icon={<TrendingUp className="w-5 h-5" />}
              change={comparison?.averageAov}
              changeLabel="vs. previous period"
            />
            <MetricCard
              label="True CPO"
              value={totalMarketingOrders > 0 ? (overview?.totalMarketingInvestment || 0) / totalMarketingOrders : 0}
              format="currency"
              icon={<Target className="w-5 h-5" />}
              change={comparison?.trueCpo}
              changeLabel="vs. previous period"
              tooltip="True Cost Per Order: Total marketing investment (ads + promotions) divided by orders attributed to marketing. Shows actual cost to acquire each marketing-driven order."
            />
            <MetricCard
              label="Marketing Spend"
              value={overview?.totalMarketingInvestment || 0}
              format="currency"
              icon={<TrendingDown className="w-5 h-5" />}
              change={comparison?.totalMarketingInvestment}
              changeLabel="vs. previous period"
              tooltip="Total marketing investment including paid advertising and promotional discounts across all platforms."
            />
            <MetricCard
              label="Marketing ROAS"
              value={overview?.blendedRoas || 0}
              format="multiplier"
              icon={<Target className="w-5 h-5" />}
              change={comparison?.blendedRoas}
              changeLabel="vs. previous period"
              tooltip="Return on Ad Spend: Revenue generated from marketing-attributed orders divided by total marketing investment. Higher is better (e.g., 3.5x means every $1 spent generates $3.50 in sales)."
            />
            <MetricCard
              label="Net Payout"
              value={(overview?.totalSales || 0) * ((overview?.netPayoutPercent || 0) / 100)}
              format="currency"
              icon={<DollarSign className="w-5 h-5" />}
              change={comparison?.netPayout}
              changeLabel="vs. previous period"
            />
          </div>
        </CardContent>
      </Card>

      {/* Client Performance Matrix - Only show in portfolio view */}
      {isPortfolioView && (
        <Card>
          <CardHeader>
            <CardTitle>Client Performance Matrix</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[300px]">
              <BarChart data={clientPerformanceData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="client" 
                  className="text-xs"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                />
                <YAxis 
                  className="text-xs"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Legend />
                <Bar dataKey="sales" fill="hsl(var(--primary))" name="Sales ($)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="orders" fill="hsl(var(--chart-2))" name="Orders" radius={[4, 4, 0, 0]} />
                <Bar dataKey="roas" fill="hsl(var(--chart-3))" name="ROAS (scaled)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weekly Sales Trend */}
        <Card>
          <CardHeader>
            <CardTitle>Weekly Sales Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[300px]">
              <LineChart data={weeklyTrendData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="week" 
                  className="text-xs"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                />
                <YAxis 
                  className="text-xs"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line 
                  type="monotone" 
                  dataKey="sales" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={2}
                  dot={{ fill: 'hsl(var(--primary))' }}
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Platform Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Platform Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {platformChartData.length > 0 ? (
              <ChartContainer config={chartConfig} className="h-[300px]">
                <PieChart>
                  <Pie
                    data={platformChartData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name}: $${(value / 1000).toFixed(0)}k`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {platformChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={platformColors[entry.platform as keyof typeof platformColors]} />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                </PieChart>
              </ChartContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No platform data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Platform Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          {overview?.platformBreakdown && overview.platformBreakdown.length > 0 ? (
            <DataTable
              data={overview.platformBreakdown}
              columns={platformColumns}
            />
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              No platform data available. Upload files to see analytics.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Location Performance</CardTitle>
          {!showLocationDetails && (
            <Button 
              onClick={() => setShowLocationDetails(true)}
              variant="outline"
              size="sm"
              data-testid="button-load-location-details"
            >
              Load Location Details
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {!showLocationDetails ? (
            <div className="text-center py-12 text-muted-foreground">
              Click "Load Location Details" to view consolidated location metrics
            </div>
          ) : locationsLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : locationMetrics && locationMetrics.length > 0 ? (
            <DataTable
              data={locationMetrics}
              columns={locationColumns}
            />
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              No location data available. Upload files to see analytics.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Data Quality Issues */}
      {selectedClientId && dataQuality && (
        dataQuality.unmappedTransactions.ubereats > 0 || 
        dataQuality.unmappedTransactions.doordash > 0 || 
        dataQuality.unmappedTransactions.grubhub > 0
      ) && (
        <Card className="border-yellow-500/50 bg-yellow-50/50 dark:bg-yellow-950/20" data-testid="card-data-quality">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-700 dark:text-yellow-500">
              <TrendingDown className="w-5 h-5" />
              Data Quality Issues
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                The following transactions could not be matched to master locations and are assigned to "Unmapped Locations":
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {dataQuality.unmappedTransactions.ubereats > 0 && (
                  <div className="flex items-center justify-between p-3 rounded-md bg-background border" data-testid="unmapped-ubereats">
                    <div className="flex items-center gap-2">
                      <PlatformBadge platform="ubereats" />
                      <span className="text-sm">Unmapped</span>
                    </div>
                    <span className="text-sm font-semibold">{dataQuality.unmappedTransactions.ubereats.toLocaleString()}</span>
                  </div>
                )}
                {dataQuality.unmappedTransactions.doordash > 0 && (
                  <div className="flex items-center justify-between p-3 rounded-md bg-background border" data-testid="unmapped-doordash">
                    <div className="flex items-center gap-2">
                      <PlatformBadge platform="doordash" />
                      <span className="text-sm">Unmapped</span>
                    </div>
                    <span className="text-sm font-semibold">{dataQuality.unmappedTransactions.doordash.toLocaleString()}</span>
                  </div>
                )}
                {dataQuality.unmappedTransactions.grubhub > 0 && (
                  <div className="flex items-center justify-between p-3 rounded-md bg-background border" data-testid="unmapped-grubhub">
                    <div className="flex items-center gap-2">
                      <PlatformBadge platform="grubhub" />
                      <span className="text-sm">Unmapped</span>
                    </div>
                    <span className="text-sm font-semibold">{dataQuality.unmappedTransactions.grubhub.toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
