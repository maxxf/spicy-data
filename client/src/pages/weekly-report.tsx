import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useClientContext } from "@/contexts/client-context";
import { useToast } from "@/hooks/use-toast";
import { WeekSelector } from "@/components/week-selector";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DollarSign,
  ShoppingCart,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Percent,
  Target,
  Copy,
  Download,
  Printer,
  Sparkles,
  RefreshCw,
  MapPin,
  ArrowUp,
  ArrowDown,
  FileText,
  BarChart3,
  Minus,
} from "lucide-react";
import type { ConsolidatedLocationMetrics } from "@shared/schema";

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

type OverviewData = {
  totalSales: number;
  totalOrders: number;
  averageAov: number;
  totalMarketingInvestment: number;
  blendedRoas: number;
  netPayoutPercent: number;
  platformBreakdown: Array<{
    platform: string;
    totalSales: number;
    totalOrders: number;
    netPayout: number;
    netPayoutPercent: number;
    marketingDrivenSales: number;
    organicSales: number;
    ordersFromMarketing: number;
    organicOrders: number;
    adSpend: number;
    offerDiscountValue: number;
  }>;
  comparison?: {
    totalSales: number | null;
    totalOrders: number | null;
    averageAov: number | null;
    totalMarketingInvestment: number | null;
    blendedRoas: number | null;
    netPayout: number | null;
    trueCpo: number | null;
  };
};

type AISummary = {
  executiveSummary: string;
  actionItems: string[];
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);

const formatNumber = (value: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);

const formatPercent = (value: number) => `${value.toFixed(1)}%`;

const formatMultiplier = (value: number) => `${value.toFixed(2)}x`;

function ChangeIndicator({ value, inverse = false }: { value: number | null | undefined; inverse?: boolean }) {
  if (value === null || value === undefined) return <span className="text-xs text-muted-foreground">--</span>;
  const isPositive = inverse ? value < 0 : value > 0;
  const isNeutral = Math.abs(value) < 0.5;
  if (isNeutral) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
        <Minus className="w-3 h-3" />
        {Math.abs(value).toFixed(1)}%
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs ${isPositive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
      {value > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

type SortField = "sales" | "orders" | "aov" | "roas" | "payout" | "marketingSpend";
type SortDir = "asc" | "desc";

export default function WeeklyReportPage() {
  const { selectedClientId, selectedPlatforms, selectedWeek, setSelectedWeek } = useClientContext();
  const { toast } = useToast();
  const selectedPlatform = selectedPlatforms.length < 3 ? selectedPlatforms[0] || null : null;
  const [sortField, setSortField] = useState<SortField>("sales");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const reportRef = useRef<HTMLDivElement>(null);

  const { data: weeks } = useQuery<Array<{ weekStart: string; weekEnd: string }>>({
    queryKey: ["/api/analytics/weeks"],
  });

  const { data: clients } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["/api/clients"],
  });

  useEffect(() => {
    if (weeks && weeks.length > 0 && !selectedWeek) {
      setSelectedWeek(weeks[0]);
    }
  }, [weeks, selectedWeek, setSelectedWeek]);

  const buildOverviewParams = () => {
    const params = new URLSearchParams();
    if (selectedClientId) params.append("clientId", selectedClientId);
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

  const { data: overview, isLoading: overviewLoading } = useQuery<OverviewData>({
    queryKey: ["/api/analytics/overview", selectedClientId, selectedPlatform, selectedWeek],
    queryFn: async () => {
      const response = await fetch(`/api/analytics/overview${buildOverviewParams()}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch overview");
      return response.json();
    },
    enabled: !!selectedWeek,
  });

  const { data: weeklyTrend } = useQuery<WeeklyTrendData[]>({
    queryKey: ["/api/analytics/weekly-trend", selectedClientId, selectedPlatform],
    queryFn: async () => {
      const response = await fetch(`/api/analytics/weekly-trend${buildTrendParams()}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch weekly trend");
      return response.json();
    },
  });

  const { data: locationMetrics, isLoading: locationsLoading } = useQuery<ConsolidatedLocationMetrics[]>({
    queryKey: ["/api/analytics/locations/consolidated", selectedClientId, selectedPlatform, selectedWeek],
    queryFn: async () => {
      const response = await fetch(`/api/analytics/locations/consolidated${buildOverviewParams()}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch location metrics");
      return response.json();
    },
    enabled: !!selectedWeek,
  });

  const currentWeekTrend = useMemo(() => {
    if (!weeklyTrend || !selectedWeek) return null;
    return weeklyTrend.find(w => w.weekStart === selectedWeek.weekStart) || null;
  }, [weeklyTrend, selectedWeek]);

  const previousWeekTrend = useMemo(() => {
    if (!weeklyTrend || !selectedWeek) return null;
    const currentIdx = weeklyTrend.findIndex(w => w.weekStart === selectedWeek.weekStart);
    if (currentIdx < 0 || currentIdx >= weeklyTrend.length - 1) return null;
    return weeklyTrend[currentIdx + 1] || null;
  }, [weeklyTrend, selectedWeek]);

  const wowChange = useMemo(() => {
    if (!currentWeekTrend || !previousWeekTrend) return null;
    const calc = (curr: number, prev: number) => prev === 0 ? null : ((curr - prev) / prev) * 100;
    return {
      totalSales: calc(currentWeekTrend.totalSales, previousWeekTrend.totalSales),
      totalOrders: calc(currentWeekTrend.totalOrders, previousWeekTrend.totalOrders),
      averageAov: calc(currentWeekTrend.averageAov, previousWeekTrend.averageAov),
      blendedRoas: calc(currentWeekTrend.blendedRoas, previousWeekTrend.blendedRoas),
      netPayoutPercent: calc(currentWeekTrend.netPayoutPercent, previousWeekTrend.netPayoutPercent),
      marketingSpendPercent: calc(currentWeekTrend.marketingSpendPercent, previousWeekTrend.marketingSpendPercent),
      marketingDrivenSales: calc(currentWeekTrend.marketingDrivenSales, previousWeekTrend.marketingDrivenSales),
      organicSales: calc(currentWeekTrend.organicSales, previousWeekTrend.organicSales),
    };
  }, [currentWeekTrend, previousWeekTrend]);

  const sortedLocations = useMemo(() => {
    if (!locationMetrics) return [];
    const sorted = [...locationMetrics].sort((a, b) => {
      let aVal = 0, bVal = 0;
      switch (sortField) {
        case "sales": aVal = a.totalSales; bVal = b.totalSales; break;
        case "orders": aVal = a.totalOrders; bVal = b.totalOrders; break;
        case "aov": aVal = a.aov; bVal = b.aov; break;
        case "roas": aVal = a.marketingRoas; bVal = b.marketingRoas; break;
        case "payout": aVal = a.netPayoutPercent; bVal = b.netPayoutPercent; break;
        case "marketingSpend": aVal = a.totalMarketingInvestment; bVal = b.totalMarketingInvestment; break;
      }
      return sortDir === "desc" ? bVal - aVal : aVal - bVal;
    });
    return sorted;
  }, [locationMetrics, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === "desc" ? "asc" : "desc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDir === "desc" ? <ArrowDown className="w-3 h-3 inline ml-0.5" /> : <ArrowUp className="w-3 h-3 inline ml-0.5" />;
  };

  const { data: aiSummary, isPending: aiLoading, mutate: generateSummary } = useMutation<AISummary, Error>({
    mutationFn: async () => {
      const payload = {
        clientName: clients?.find(c => c.id === selectedClientId)?.name || "All Clients",
        weekStart: selectedWeek?.weekStart,
        weekEnd: selectedWeek?.weekEnd,
        overview: currentWeekTrend,
        previousWeek: previousWeekTrend,
        wowChanges: wowChange,
        topLocations: sortedLocations.slice(0, 5).map(l => ({
          name: l.canonicalName || l.location,
          sales: l.totalSales,
          orders: l.totalOrders,
          roas: l.marketingRoas,
          payoutPercent: l.netPayoutPercent,
        })),
        bottomLocations: sortedLocations.slice(-3).map(l => ({
          name: l.canonicalName || l.location,
          sales: l.totalSales,
          orders: l.totalOrders,
          roas: l.marketingRoas,
          payoutPercent: l.netPayoutPercent,
        })),
        platformBreakdown: overview?.platformBreakdown,
      };
      const response = await fetch("/api/reports/weekly-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("Failed to generate summary");
      return response.json();
    },
    onError: (error: Error) => {
      toast({
        title: "Summary generation failed",
        description: error.message || "Could not generate the AI summary. Please try again.",
        variant: "destructive",
      });
    },
  });

  const clientName = clients?.find(c => c.id === selectedClientId)?.name || "All Clients";
  const weekLabel = selectedWeek
    ? `${new Date(selectedWeek.weekStart + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${new Date(selectedWeek.weekEnd + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
    : "";

  const handleCopyToClipboard = () => {
    const lines: string[] = [];
    lines.push(`Weekly Report: ${clientName}`);
    lines.push(`Week of ${weekLabel}`);
    lines.push("");

    if (aiSummary) {
      lines.push("EXECUTIVE SUMMARY");
      lines.push(aiSummary.executiveSummary);
      lines.push("");
      lines.push("ACTION ITEMS");
      aiSummary.actionItems.forEach((item, i) => lines.push(`${i + 1}. ${item}`));
      lines.push("");
    }

    if (currentWeekTrend) {
      lines.push("KEY METRICS");
      lines.push(`Total Sales: ${formatCurrency(currentWeekTrend.totalSales)}${wowChange?.totalSales != null ? ` (${wowChange.totalSales > 0 ? "+" : ""}${wowChange.totalSales.toFixed(1)}% WoW)` : ""}`);
      lines.push(`Total Orders: ${formatNumber(currentWeekTrend.totalOrders)}${wowChange?.totalOrders != null ? ` (${wowChange.totalOrders > 0 ? "+" : ""}${wowChange.totalOrders.toFixed(1)}% WoW)` : ""}`);
      lines.push(`AOV: ${formatCurrency(currentWeekTrend.averageAov)}`);
      lines.push(`ROAS: ${formatMultiplier(currentWeekTrend.blendedRoas)}`);
      lines.push(`Net Payout %: ${formatPercent(currentWeekTrend.netPayoutPercent)}`);
      lines.push(`Marketing Spend %: ${formatPercent(currentWeekTrend.marketingSpendPercent)}`);
      lines.push("");
      lines.push("MARKETING SPLIT");
      lines.push(`Marketing Driven Sales: ${formatCurrency(currentWeekTrend.marketingDrivenSales)}`);
      lines.push(`Organic Sales: ${formatCurrency(currentWeekTrend.organicSales)}`);
      lines.push(`Ad Spend: ${formatCurrency(currentWeekTrend.adSpend)}`);
      lines.push(`Offer Discounts: ${formatCurrency(currentWeekTrend.offerDiscountValue)}`);
      lines.push("");
    }

    if (sortedLocations.length > 0) {
      lines.push("TOP LOCATIONS BY SALES");
      sortedLocations.slice(0, 10).forEach((loc, i) => {
        lines.push(`${i + 1}. ${loc.canonicalName || loc.location} - Sales: ${formatCurrency(loc.totalSales)}, Orders: ${formatNumber(loc.totalOrders)}, ROAS: ${formatMultiplier(loc.marketingRoas)}, Payout: ${formatPercent(loc.netPayoutPercent)}`);
      });
    }

    navigator.clipboard.writeText(lines.join("\n"));
    toast({ title: "Report copied to clipboard" });
  };

  const handleDownloadCSV = () => {
    if (!sortedLocations.length) return;
    const headers = ["Rank", "Location", "Total Sales", "Orders", "AOV", "Marketing Spend", "ROAS", "Net Payout %", "Marketing Driven Sales", "Organic Sales"];
    const rows = sortedLocations.map((loc, i) => [
      i + 1,
      loc.canonicalName || loc.location,
      loc.totalSales.toFixed(2),
      loc.totalOrders,
      loc.aov.toFixed(2),
      loc.totalMarketingInvestment.toFixed(2),
      loc.marketingRoas.toFixed(2),
      loc.netPayoutPercent.toFixed(1),
      (loc.marketingDrivenSales || 0).toFixed(2),
      (loc.totalSales - (loc.marketingDrivenSales || 0)).toFixed(2),
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `weekly-report-${selectedWeek?.weekStart || "all"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  const isLoading = overviewLoading;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto" data-testid="page-weekly-report" ref={reportRef}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Weekly Report</h1>
          <p className="text-sm text-muted-foreground" data-testid="text-report-subtitle">
            {clientName} {weekLabel && <span>| {weekLabel}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <WeekSelector
            weeks={weeks || []}
            selectedWeek={selectedWeek}
            onWeekChange={setSelectedWeek}
          />
          <div className="flex items-center gap-1 print:hidden">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyToClipboard}
              data-testid="button-copy-report"
            >
              <Copy className="w-4 h-4 mr-1.5" />
              Copy
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadCSV}
              data-testid="button-download-csv"
            >
              <Download className="w-4 h-4 mr-1.5" />
              CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              data-testid="button-print-report"
            >
              <Printer className="w-4 h-4 mr-1.5" />
              Print
            </Button>
          </div>
        </div>
      </div>

      {/* AI Executive Summary */}
      <Card data-testid="section-ai-summary">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <CardTitle className="text-base">Executive Summary & Action Items</CardTitle>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => generateSummary()}
            disabled={aiLoading || !currentWeekTrend}
            data-testid="button-generate-summary"
            className="print:hidden"
          >
            {aiLoading ? (
              <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 mr-1.5" />
            )}
            {aiLoading ? "Generating..." : aiSummary ? "Regenerate" : "Generate with AI"}
          </Button>
        </CardHeader>
        <CardContent>
          {aiLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/6" />
              <div className="mt-4 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-4/5" />
              </div>
            </div>
          ) : aiSummary ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm leading-relaxed" data-testid="text-executive-summary">{aiSummary.executiveSummary}</p>
              </div>
              {aiSummary.actionItems.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Recommended Actions</h4>
                  <ul className="space-y-1.5" data-testid="list-action-items">
                    {aiSummary.actionItems.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <Badge variant="outline" className="mt-0.5 shrink-0 text-xs">{i + 1}</Badge>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground" data-testid="text-ai-placeholder">
              Click "Generate with AI" to create an executive summary and recommended actions based on this week's data.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Key Metrics Overview */}
      <div data-testid="section-key-metrics">
        <h2 className="text-lg font-semibold tracking-tight mb-3">Key Metrics</h2>
        {isLoading ? (
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}><CardContent className="p-4"><Skeleton className="h-[60px] w-full" /></CardContent></Card>
            ))}
          </div>
        ) : currentWeekTrend ? (
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <Card data-testid="metric-total-sales">
              <CardContent className="p-4">
                <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                  <DollarSign className="w-4 h-4" />
                  <span className="text-xs font-medium">Total Sales</span>
                </div>
                <p className="text-xl font-bold" data-testid="text-value-total-sales">{formatCurrency(currentWeekTrend.totalSales)}</p>
                <ChangeIndicator value={wowChange?.totalSales} />
              </CardContent>
            </Card>
            <Card data-testid="metric-total-orders">
              <CardContent className="p-4">
                <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                  <ShoppingCart className="w-4 h-4" />
                  <span className="text-xs font-medium">Orders</span>
                </div>
                <p className="text-xl font-bold" data-testid="text-value-total-orders">{formatNumber(currentWeekTrend.totalOrders)}</p>
                <ChangeIndicator value={wowChange?.totalOrders} />
              </CardContent>
            </Card>
            <Card data-testid="metric-aov">
              <CardContent className="p-4">
                <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                  <BarChart3 className="w-4 h-4" />
                  <span className="text-xs font-medium">AOV</span>
                </div>
                <p className="text-xl font-bold" data-testid="text-value-aov">{formatCurrency(currentWeekTrend.averageAov)}</p>
                <ChangeIndicator value={wowChange?.averageAov} />
              </CardContent>
            </Card>
            <Card data-testid="metric-roas">
              <CardContent className="p-4">
                <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                  <Target className="w-4 h-4" />
                  <span className="text-xs font-medium">ROAS</span>
                </div>
                <p className="text-xl font-bold" data-testid="text-value-roas">{formatMultiplier(currentWeekTrend.blendedRoas)}</p>
                <ChangeIndicator value={wowChange?.blendedRoas} />
              </CardContent>
            </Card>
            <Card data-testid="metric-payout">
              <CardContent className="p-4">
                <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                  <TrendingUp className="w-4 h-4" />
                  <span className="text-xs font-medium">Net Payout %</span>
                </div>
                <p className="text-xl font-bold" data-testid="text-value-payout">{formatPercent(currentWeekTrend.netPayoutPercent)}</p>
                <ChangeIndicator value={wowChange?.netPayoutPercent} />
              </CardContent>
            </Card>
            <Card data-testid="metric-spend-percent">
              <CardContent className="p-4">
                <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                  <Percent className="w-4 h-4" />
                  <span className="text-xs font-medium">Mkt Spend %</span>
                </div>
                <p className="text-xl font-bold" data-testid="text-value-spend-percent">{formatPercent(currentWeekTrend.marketingSpendPercent)}</p>
                <ChangeIndicator value={wowChange?.marketingSpendPercent} inverse />
              </CardContent>
            </Card>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Select a client and week to view metrics.</p>
        )}
      </div>

      {/* Marketing Performance */}
      <div data-testid="section-marketing-performance">
        <h2 className="text-lg font-semibold tracking-tight mb-3">Marketing Performance</h2>
        {isLoading ? (
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
            <Card><CardContent className="p-4"><Skeleton className="h-[120px] w-full" /></CardContent></Card>
            <Card><CardContent className="p-4"><Skeleton className="h-[120px] w-full" /></CardContent></Card>
          </div>
        ) : currentWeekTrend ? (
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
            <Card data-testid="card-sales-split">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Sales Attribution</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Marketing Driven</span>
                  <div className="text-right">
                    <span className="font-semibold text-sm" data-testid="text-marketing-sales">{formatCurrency(currentWeekTrend.marketingDrivenSales)}</span>
                    <span className="text-xs text-muted-foreground ml-1.5">
                      ({currentWeekTrend.totalSales > 0 ? ((currentWeekTrend.marketingDrivenSales / currentWeekTrend.totalSales) * 100).toFixed(0) : 0}%)
                    </span>
                  </div>
                </div>
                <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-primary h-full rounded-full transition-all"
                    style={{ width: `${currentWeekTrend.totalSales > 0 ? (currentWeekTrend.marketingDrivenSales / currentWeekTrend.totalSales) * 100 : 0}%` }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Organic</span>
                  <div className="text-right">
                    <span className="font-semibold text-sm" data-testid="text-organic-sales">{formatCurrency(currentWeekTrend.organicSales)}</span>
                    <span className="text-xs text-muted-foreground ml-1.5">
                      ({currentWeekTrend.totalSales > 0 ? ((currentWeekTrend.organicSales / currentWeekTrend.totalSales) * 100).toFixed(0) : 0}%)
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2 border-t text-xs text-muted-foreground">
                  <span>Marketing Orders: {formatNumber(currentWeekTrend.ordersFromMarketing)}</span>
                  <span>Organic Orders: {formatNumber(currentWeekTrend.organicOrders)}</span>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-spend-breakdown">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Spend Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Ad Spend</span>
                  <span className="font-semibold text-sm" data-testid="text-ad-spend">{formatCurrency(currentWeekTrend.adSpend)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Offer Discounts</span>
                  <span className="font-semibold text-sm" data-testid="text-offer-discounts">{formatCurrency(currentWeekTrend.offerDiscountValue)}</span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="text-sm font-medium">Total Marketing Spend</span>
                  <span className="font-bold text-sm" data-testid="text-total-spend">{formatCurrency(currentWeekTrend.totalMarketingSpend)}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>CPO: {formatCurrency(currentWeekTrend.cpo)}</span>
                  <span>Net Payout: {formatCurrency(currentWeekTrend.netPayout)}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>

      {/* Platform Breakdown */}
      {overview && overview.platformBreakdown.length > 0 && (
        <div data-testid="section-platform-breakdown">
          <h2 className="text-lg font-semibold tracking-tight mb-3">Platform Breakdown</h2>
          <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
            {overview.platformBreakdown.map((p) => {
              const platformLabel = p.platform === "ubereats" ? "Uber Eats" : p.platform === "doordash" ? "DoorDash" : "Grubhub";
              return (
                <Card key={p.platform} data-testid={`card-platform-${p.platform}`}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">{platformLabel}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Sales</span>
                      <span className="font-medium">{formatCurrency(p.totalSales)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Orders</span>
                      <span className="font-medium">{formatNumber(p.totalOrders)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Net Payout %</span>
                      <span className="font-medium">{formatPercent(p.netPayoutPercent)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Marketing Sales</span>
                      <span className="font-medium">{formatCurrency(p.marketingDrivenSales || 0)}</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Location Leaderboard */}
      <div data-testid="section-location-leaderboard">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold tracking-tight">Location Leaderboard</h2>
            {sortedLocations.length > 0 && (
              <Badge variant="secondary" className="text-xs">{sortedLocations.length} locations</Badge>
            )}
          </div>
        </div>
        {locationsLoading ? (
          <Card><CardContent className="p-4"><Skeleton className="h-[200px] w-full" /></CardContent></Card>
        ) : sortedLocations.length > 0 ? (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10 text-center">#</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead className="text-right cursor-pointer select-none" onClick={() => toggleSort("sales")} data-testid="sort-sales">
                        Sales <SortIcon field="sales" />
                      </TableHead>
                      <TableHead className="text-right cursor-pointer select-none" onClick={() => toggleSort("orders")} data-testid="sort-orders">
                        Orders <SortIcon field="orders" />
                      </TableHead>
                      <TableHead className="text-right cursor-pointer select-none" onClick={() => toggleSort("aov")} data-testid="sort-aov">
                        AOV <SortIcon field="aov" />
                      </TableHead>
                      <TableHead className="text-right cursor-pointer select-none" onClick={() => toggleSort("marketingSpend")} data-testid="sort-marketing-spend">
                        Mkt Spend <SortIcon field="marketingSpend" />
                      </TableHead>
                      <TableHead className="text-right cursor-pointer select-none" onClick={() => toggleSort("roas")} data-testid="sort-roas">
                        ROAS <SortIcon field="roas" />
                      </TableHead>
                      <TableHead className="text-right cursor-pointer select-none" onClick={() => toggleSort("payout")} data-testid="sort-payout">
                        Payout % <SortIcon field="payout" />
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedLocations.map((loc, i) => (
                      <TableRow key={loc.location} data-testid={`row-location-${i}`}>
                        <TableCell className="text-center text-muted-foreground font-medium">{i + 1}</TableCell>
                        <TableCell className="font-medium text-sm max-w-[200px] truncate" title={loc.canonicalName || loc.location}>
                          {loc.canonicalName || loc.location}
                        </TableCell>
                        <TableCell className="text-right text-sm">{formatCurrency(loc.totalSales)}</TableCell>
                        <TableCell className="text-right text-sm">{formatNumber(loc.totalOrders)}</TableCell>
                        <TableCell className="text-right text-sm">{formatCurrency(loc.aov)}</TableCell>
                        <TableCell className="text-right text-sm">{formatCurrency(loc.totalMarketingInvestment)}</TableCell>
                        <TableCell className="text-right text-sm">{formatMultiplier(loc.marketingRoas)}</TableCell>
                        <TableCell className="text-right text-sm">
                          <span className={loc.netPayoutPercent < 40 ? "text-red-600 dark:text-red-400" : loc.netPayoutPercent > 60 ? "text-green-600 dark:text-green-400" : ""}>
                            {formatPercent(loc.netPayoutPercent)}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground text-center" data-testid="text-empty-locations">
                No location data available for the selected filters.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
