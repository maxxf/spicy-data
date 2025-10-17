import { useQuery } from "@tanstack/react-query";
import { MetricCard } from "@/components/metric-card";
import { DataTable } from "@/components/data-table";
import { PlatformBadge } from "@/components/platform-badge";
import {
  TrendingUp,
  DollarSign,
  ShoppingCart,
  Target,
  TrendingDown,
  Percent,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { DashboardOverview, LocationMetrics } from "@shared/schema";

export default function Dashboard() {
  const { data: overview, isLoading: overviewLoading } = useQuery<DashboardOverview>({
    queryKey: ["/api/analytics/overview"],
  });

  const { data: locationMetrics, isLoading: locationsLoading } = useQuery<LocationMetrics[]>({
    queryKey: ["/api/analytics/locations"],
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
      key: "marketingRoas",
      label: "ROAS",
      sortable: true,
      align: "right" as const,
      render: (value: number) => `${value.toFixed(2)}x`,
    },
    {
      key: "netPayoutPercent",
      label: "Net Payout %",
      sortable: true,
      align: "right" as const,
      render: (value: number) => `${value.toFixed(2)}%`,
    },
  ];

  const locationColumns = [
    {
      key: "locationName",
      label: "Location",
      sortable: true,
    },
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
      key: "marketingRoas",
      label: "ROAS",
      sortable: true,
      align: "right" as const,
      render: (value: number) => `${value.toFixed(2)}x`,
    },
  ];

  return (
    <div className="p-8 space-y-8" data-testid="page-dashboard">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight mb-2">
          Analytics Dashboard
        </h1>
        <p className="text-sm text-muted-foreground">
          Multi-platform delivery performance overview
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          label="Total Sales"
          value={overview?.totalSales || 0}
          format="currency"
          icon={<DollarSign className="w-5 h-5" />}
        />
        <MetricCard
          label="Total Orders"
          value={overview?.totalOrders || 0}
          format="number"
          icon={<ShoppingCart className="w-5 h-5" />}
        />
        <MetricCard
          label="Average AOV"
          value={overview?.averageAov || 0}
          format="currency"
          icon={<TrendingUp className="w-5 h-5" />}
        />
        <MetricCard
          label="Blended ROAS"
          value={overview?.blendedRoas || 0}
          format="multiplier"
          icon={<Target className="w-5 h-5" />}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <MetricCard
          label="Marketing Investment"
          value={overview?.totalMarketingInvestment || 0}
          format="currency"
          icon={<TrendingDown className="w-5 h-5" />}
        />
        <MetricCard
          label="Net Payout %"
          value={overview?.netPayoutPercent || 0}
          format="percent"
          icon={<Percent className="w-5 h-5" />}
        />
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
        <CardHeader>
          <CardTitle>Location Performance</CardTitle>
        </CardHeader>
        <CardContent>
          {locationsLoading ? (
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
    </div>
  );
}
