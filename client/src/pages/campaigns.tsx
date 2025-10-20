import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClientSelector } from "@/components/client-selector";
import { LocationSelector } from "@/components/location-selector";
import { PlatformSelector } from "@/components/platform-selector";
import { WeekSelector } from "@/components/week-selector";
import { MetricCard } from "@/components/metric-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Percent, Target, TrendingUp, DollarSign, ShoppingCart, TrendingDown, Calculator } from "lucide-react";
import type { PromotionMetrics, PaidAdCampaignMetrics } from "@shared/schema";

const statusColors = {
  active: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
  scheduled: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  completed: "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20",
  paused: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20",
};

export default function PromosPage() {
  const [selectedClientId, setSelectedClientId] = useState<string | null>("83506705-b408-4f0a-a9b0-e5b585db3b7d");
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedWeek, setSelectedWeek] = useState<{ weekStart: string; weekEnd: string } | null>(null);

  // Fetch available weeks to default to most recent
  const { data: weeks } = useQuery<Array<{ weekStart: string; weekEnd: string }>>({
    queryKey: ["/api/analytics/weeks"],
  });

  // Default to most recent week when weeks data loads
  useEffect(() => {
    if (weeks && weeks.length > 0 && !selectedWeek) {
      setSelectedWeek(weeks[0]);
    }
  }, [weeks, selectedWeek]);

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

  const { data: promotions, isLoading: promotionsLoading } = useQuery<PromotionMetrics[]>({
    queryKey: ["/api/analytics/promotions", selectedClientId, selectedLocationId, selectedPlatform, selectedWeek],
    queryFn: async () => {
      const response = await fetch(`/api/analytics/promotions${buildQueryParams()}`);
      if (!response.ok) throw new Error("Failed to fetch promotions");
      return response.json();
    },
  });

  const { data: paidAds, isLoading: paidAdsLoading } = useQuery<PaidAdCampaignMetrics[]>({
    queryKey: ["/api/analytics/paid-ads", selectedClientId, selectedLocationId, selectedPlatform, selectedWeek],
    queryFn: async () => {
      const response = await fetch(`/api/analytics/paid-ads${buildQueryParams()}`);
      if (!response.ok) throw new Error("Failed to fetch campaigns");
      return response.json();
    },
  });

  // Filter by status
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

  // Calculate aggregate metrics for promotions
  const promotionMetrics = useMemo(() => {
    if (!filteredPromotions || filteredPromotions.length === 0) {
      return { totalOrders: 0, totalRevenue: 0, totalCost: 0, totalDiscountCost: 0, totalMarketingFees: 0, aggregateROAS: 0 };
    }
    
    const totalOrders = filteredPromotions.reduce((sum, p) => sum + (p.orders || 0), 0);
    const totalRevenue = filteredPromotions.reduce((sum, p) => sum + (p.revenueImpact || 0), 0);
    const totalCost = filteredPromotions.reduce((sum, p) => sum + (p.totalCost || 0), 0);
    const totalDiscountCost = filteredPromotions.reduce((sum, p) => sum + (p.discountCost || 0), 0);
    const totalMarketingFees = filteredPromotions.reduce((sum, p) => sum + (p.marketingFees || 0), 0);
    // Calculate ROAS from aggregate totals: revenue / total cost (discount + marketing fees)
    const aggregateROAS = totalCost > 0 
      ? totalRevenue / totalCost
      : 0;

    return { totalOrders, totalRevenue, totalCost, totalDiscountCost, totalMarketingFees, aggregateROAS };
  }, [filteredPromotions]);

  // Calculate aggregate metrics for paid ads
  const paidAdMetrics = useMemo(() => {
    if (!filteredPaidAds || filteredPaidAds.length === 0) {
      return { totalSpend: 0, totalRevenue: 0, totalOrders: 0, aggregateROAS: 0, totalClicks: 0, totalImpressions: 0 };
    }
    
    const totalSpend = filteredPaidAds.reduce((sum, p) => sum + (p.spend || 0), 0);
    const totalRevenue = filteredPaidAds.reduce((sum, p) => sum + (p.revenue || 0), 0);
    const totalOrders = filteredPaidAds.reduce((sum, p) => sum + (p.orders || 0), 0);
    const totalClicks = filteredPaidAds.reduce((sum, p) => sum + (p.clicks || 0), 0);
    const totalImpressions = filteredPaidAds.reduce((sum, p) => sum + (p.impressions || 0), 0);
    // Calculate ROAS from aggregate totals: revenue / spend
    const aggregateROAS = totalSpend > 0
      ? totalRevenue / totalSpend
      : 0;

    return { totalSpend, totalRevenue, totalOrders, aggregateROAS, totalClicks, totalImpressions };
  }, [filteredPaidAds]);

  // Calculate combined metrics (ads + offers)
  const combinedMetrics = useMemo(() => {
    const totalRevenue = promotionMetrics.totalRevenue + paidAdMetrics.totalRevenue;
    const totalCost = promotionMetrics.totalCost + paidAdMetrics.totalSpend;
    const totalOrders = promotionMetrics.totalOrders + paidAdMetrics.totalOrders;
    
    // Combined ROAS: total revenue / total investment
    const combinedROAS = totalCost > 0 ? totalRevenue / totalCost : 0;
    
    // True Cost Per Order (CPO): total investment / total orders
    const trueCPO = totalOrders > 0 ? totalCost / totalOrders : 0;
    
    // Average order value from marketing
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    return {
      totalRevenue,
      totalCost,
      totalOrders,
      combinedROAS,
      trueCPO,
      avgOrderValue,
      adSpend: paidAdMetrics.totalSpend,
      discountCost: promotionMetrics.totalDiscountCost,
      marketingFees: promotionMetrics.totalMarketingFees,
      promotionTotalCost: promotionMetrics.totalCost,
    };
  }, [promotionMetrics, paidAdMetrics]);

  const formatCurrency = (value: number | undefined | null) => {
    if (value == null) return '—';
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatPercent = (value: number | undefined | null) => {
    return value != null ? `${value.toFixed(2)}%` : '—';
  };

  const formatNumber = (value: number | undefined | null) => {
    return value != null ? value.toLocaleString() : '—';
  };

  const isLoading = promotionsLoading || paidAdsLoading;

  return (
    <div className="p-8 space-y-8" data-testid="page-campaigns">
      <div className="flex justify-between items-start gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight" data-testid="text-page-title">
            Promos
          </h1>
          <p className="text-muted-foreground mt-1">
            Track promotional offers and paid advertising performance
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <WeekSelector
            weeks={weeks}
            selectedWeek={selectedWeek}
            onWeekChange={setSelectedWeek}
            showAllOption={false}
          />
          <ClientSelector
            selectedClientId={selectedClientId}
            onClientChange={(clientId) => {
              setSelectedClientId(clientId);
              setSelectedLocationId(null); // Reset location when client changes
            }}
            showAllOption={true}
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

      <Tabs defaultValue="combined" className="space-y-6">
        <TabsList data-testid="tabs-campaign-type">
          <TabsTrigger value="combined" data-testid="tab-combined">
            <Calculator className="w-4 h-4 mr-2" />
            Combined Overview
          </TabsTrigger>
          <TabsTrigger value="promotions" data-testid="tab-promotions">
            <Percent className="w-4 h-4 mr-2" />
            Promotions
          </TabsTrigger>
          <TabsTrigger value="paid-ads" data-testid="tab-paid-ads">
            <Target className="w-4 h-4 mr-2" />
            Paid Advertising
          </TabsTrigger>
        </TabsList>

        <TabsContent value="combined" className="space-y-6">
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
              subtitle={`$${formatNumber(combinedMetrics.adSpend)} ads + $${formatNumber(combinedMetrics.promotionTotalCost)} offers`}
              data-testid="metric-combined-cost"
            />
            <MetricCard
              label="Total Marketing Orders"
              value={combinedMetrics.totalOrders}
              format="number"
              icon={<ShoppingCart className="w-5 h-5" />}
              data-testid="metric-combined-orders"
            />
            <MetricCard
              label="Combined ROAS"
              value={combinedMetrics.combinedROAS}
              format="multiplier"
              icon={<Target className="w-5 h-5" />}
              data-testid="metric-combined-roas"
            />
          </div>

          {/* Additional Combined Metrics */}
          <div className="grid gap-6 md:grid-cols-3">
            <MetricCard
              label="True Cost Per Order (CPO)"
              value={combinedMetrics.trueCPO}
              format="currency"
              icon={<Calculator className="w-5 h-5" />}
              subtitle="Total investment ÷ orders"
              data-testid="metric-true-cpo"
            />
            <MetricCard
              label="Marketing AOV"
              value={combinedMetrics.avgOrderValue}
              format="currency"
              icon={<DollarSign className="w-5 h-5" />}
              subtitle="Average order from marketing"
              data-testid="metric-marketing-aov"
            />
            <MetricCard
              label="Net Profit Per Order"
              value={combinedMetrics.avgOrderValue - combinedMetrics.trueCPO}
              format="currency"
              icon={<TrendingUp className="w-5 h-5" />}
              subtitle="AOV - CPO"
              data-testid="metric-net-profit-per-order"
            />
          </div>

          {/* Combined Performance Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>Marketing Mix Breakdown</CardTitle>
              <CardDescription>
                How paid advertising and promotional offers contribute to overall performance
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 md:grid-cols-2">
                {/* Paid Advertising Contribution */}
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
                    <div className="flex justify-between items-center pt-3 border-t">
                      <span className="text-sm font-medium">Revenue %</span>
                      <span className="font-mono font-semibold">
                        {combinedMetrics.totalRevenue > 0 
                          ? ((paidAdMetrics.totalRevenue / combinedMetrics.totalRevenue) * 100).toFixed(1)
                          : 0}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Promotional Offers Contribution */}
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
                      <span className="text-muted-foreground pl-4">• Discounts</span>
                      <span className="font-mono">{formatCurrency(promotionMetrics.totalDiscountCost)}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-muted-foreground pl-4">• Marketing Fees</span>
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
                    <div className="flex justify-between items-center pt-3 border-t">
                      <span className="text-sm font-medium">Revenue %</span>
                      <span className="font-mono font-semibold">
                        {combinedMetrics.totalRevenue > 0 
                          ? ((promotionMetrics.totalRevenue / combinedMetrics.totalRevenue) * 100).toFixed(1)
                          : 0}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="promotions" className="space-y-6">
          {/* Promotion Performance Metrics */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Total Orders"
              value={promotionMetrics.totalOrders}
              format="number"
              icon={<ShoppingCart className="w-5 h-5" />}
              data-testid="metric-promo-orders"
            />
            <MetricCard
              label="Revenue Impact"
              value={promotionMetrics.totalRevenue}
              format="currency"
              icon={<DollarSign className="w-5 h-5" />}
              data-testid="metric-promo-revenue"
            />
            <MetricCard
              label="Total Cost"
              value={promotionMetrics.totalCost}
              format="currency"
              icon={<Percent className="w-5 h-5" />}
              subtitle={`$${formatNumber(promotionMetrics.totalDiscountCost)} discounts + $${formatNumber(promotionMetrics.totalMarketingFees)} fees`}
              data-testid="metric-promo-cost"
            />
            <MetricCard
              label="Aggregate ROAS"
              value={promotionMetrics.aggregateROAS}
              format="multiplier"
              icon={<TrendingUp className="w-5 h-5" />}
              data-testid="metric-promo-roas"
            />
          </div>

          {/* Promotions Table */}
          {filteredPromotions && filteredPromotions.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Percent className="w-12 h-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2" data-testid="text-empty-state-promotions">
                  No promotion data available
                </h3>
                <p className="text-sm text-muted-foreground">
                  Upload marketing data files to see promotional campaign performance
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Promotional Campaigns</CardTitle>
                    <CardDescription>
                      {filteredPromotions?.length || 0} promotional campaigns
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant={selectedStatus === "all" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedStatus("all")}
                      data-testid="button-filter-all"
                    >
                      All
                    </Button>
                    <Button
                      variant={selectedStatus === "active" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedStatus("active")}
                      data-testid="button-filter-active"
                    >
                      Active
                    </Button>
                    <Button
                      variant={selectedStatus === "completed" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedStatus("completed")}
                      data-testid="button-filter-completed"
                    >
                      Completed
                    </Button>
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
                      <TableHead className="text-right">Revenue Impact</TableHead>
                      <TableHead className="text-right">Total Cost</TableHead>
                      <TableHead className="text-right">ROAS</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPromotions?.map((promotion) => {
                      // Calculate ROAS for individual promotion using total cost
                      const promoROAS = promotion.totalCost && promotion.totalCost > 0
                        ? (promotion.revenueImpact || 0) / promotion.totalCost
                        : 0;
                      
                      return (
                        <TableRow key={promotion.id} className="hover-elevate">
                          <TableCell className="font-medium" data-testid={`text-promotion-name-${promotion.id}`}>
                            {promotion.name}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {promotion.type}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={statusColors[promotion.status as keyof typeof statusColors] || statusColors.scheduled}
                            >
                              {promotion.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            <div>{promotion.startDate}</div>
                            {promotion.endDate && (
                              <div className="text-muted-foreground text-xs">to {promotion.endDate}</div>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono" data-testid={`text-orders-${promotion.id}`}>
                            {formatNumber(promotion.orders)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatCurrency(promotion.revenueImpact)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatCurrency(promotion.totalCost)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {promoROAS > 0 ? (
                              <span className={promoROAS >= 1 ? "text-green-600 dark:text-green-400 flex items-center justify-end gap-1" : "text-yellow-600 dark:text-yellow-400 flex items-center justify-end gap-1"}>
                                {promoROAS >= 1 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                {promoROAS.toFixed(2)}x
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="paid-ads" className="space-y-6">
          {/* Paid Ads Performance Metrics */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Total Spend"
              value={paidAdMetrics.totalSpend}
              format="currency"
              icon={<DollarSign className="w-5 h-5" />}
              data-testid="metric-ads-spend"
            />
            <MetricCard
              label="Revenue Generated"
              value={paidAdMetrics.totalRevenue}
              format="currency"
              icon={<TrendingUp className="w-5 h-5" />}
              data-testid="metric-ads-revenue"
            />
            <MetricCard
              label="Total Orders"
              value={paidAdMetrics.totalOrders}
              format="number"
              icon={<ShoppingCart className="w-5 h-5" />}
              data-testid="metric-ads-orders"
            />
            <MetricCard
              label="Aggregate ROAS"
              value={paidAdMetrics.aggregateROAS}
              format="multiplier"
              icon={<Target className="w-5 h-5" />}
              data-testid="metric-ads-roas"
            />
          </div>

          {/* Paid Ads Table */}
          {filteredPaidAds && filteredPaidAds.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Target className="w-12 h-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2" data-testid="text-empty-state-ads">
                  No advertising data available
                </h3>
                <p className="text-sm text-muted-foreground">
                  Upload marketing data files to see paid advertising campaign performance
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Paid Advertising Campaigns</CardTitle>
                    <CardDescription>
                      {filteredPaidAds?.length || 0} advertising campaigns
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant={selectedStatus === "all" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedStatus("all")}
                      data-testid="button-filter-all"
                    >
                      All
                    </Button>
                    <Button
                      variant={selectedStatus === "active" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedStatus("active")}
                      data-testid="button-filter-active"
                    >
                      Active
                    </Button>
                    <Button
                      variant={selectedStatus === "completed" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedStatus("completed")}
                      data-testid="button-filter-completed"
                    >
                      Completed
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Platform</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Impressions</TableHead>
                      <TableHead className="text-right">Clicks</TableHead>
                      <TableHead className="text-right">CTR</TableHead>
                      <TableHead className="text-right">Orders</TableHead>
                      <TableHead className="text-right">Spend</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">ROAS</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPaidAds?.map((campaign) => {
                      return (
                        <TableRow key={campaign.id} className="hover-elevate">
                          <TableCell className="font-medium" data-testid={`text-campaign-name-${campaign.id}`}>
                            {campaign.name}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {campaign.platform}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {campaign.type}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={statusColors[campaign.status as keyof typeof statusColors] || statusColors.scheduled}
                            >
                              {campaign.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {formatNumber(campaign.impressions)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {formatNumber(campaign.clicks)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {formatPercent(campaign.ctr)}
                          </TableCell>
                          <TableCell className="text-right font-mono" data-testid={`text-orders-${campaign.id}`}>
                            {formatNumber(campaign.orders)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatCurrency(campaign.spend)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatCurrency(campaign.revenue)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {campaign.roas != null && campaign.roas > 0 ? (
                              <span className={campaign.roas >= 1 ? "text-green-600 dark:text-green-400 flex items-center justify-end gap-1" : "text-yellow-600 dark:text-yellow-400 flex items-center justify-end gap-1"}>
                                {campaign.roas >= 1 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                {campaign.roas.toFixed(2)}x
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
