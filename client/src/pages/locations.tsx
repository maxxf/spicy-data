import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlatformBadge } from "@/components/platform-badge";
import { ClientSelector } from "@/components/client-selector";
import { LocationSelector } from "@/components/location-selector";
import { PlatformSelector } from "@/components/platform-selector";
import { WeekSelector } from "@/components/week-selector";
import { CheckCircle2, AlertCircle, Link as LinkIcon, MapPin, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Location, LocationMatchSuggestion, ConsolidatedLocationMetrics } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TestLocationsReport } from "@/components/test-locations-report";

export default function LocationsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState("overview");
  const [selectedClientId, setSelectedClientId] = useState<string | null>("capriottis");
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<{ weekStart: string; weekEnd: string } | null>(null);

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


  const { data: suggestions, isLoading: suggestionsLoading } = useQuery<LocationMatchSuggestion[]>({
    queryKey: ["/api/locations/suggestions"],
  });

  const { data: consolidatedMetrics, isLoading: metricsLoading } = useQuery<ConsolidatedLocationMetrics[]>({
    queryKey: [
      "/api/analytics/consolidated-locations",
      selectedClientId || "all",
      selectedLocationId || "all",
      selectedPlatform || "all",
      selectedWeek ? `${selectedWeek.weekStart}:${selectedWeek.weekEnd}` : "all"
    ],
    queryFn: async () => {
      const response = await fetch(`/api/analytics/consolidated-locations${buildQueryParams()}`);
      if (!response.ok) throw new Error("Failed to fetch location metrics");
      return response.json();
    },
  });

  const matchMutation = useMutation({
    mutationFn: async ({ locationName, platform, matchedLocationId }: { locationName: string; platform: string; matchedLocationId: string }) => {
      return apiRequest("POST", "/api/locations/match", {
        locationName,
        platform,
        matchedLocationId,
      });
    },
    onSuccess: () => {
      toast({
        title: "Location matched",
        description: "Location successfully linked across platforms",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/locations/suggestions"] });
    },
    onError: (error: any) => {
      toast({
        title: "Match failed",
        description: error.message || "Failed to match location",
        variant: "destructive",
      });
    },
  });

  const exportToCSV = () => {
    if (!consolidatedMetrics || consolidatedMetrics.length === 0) {
      toast({
        title: "No data to export",
        description: "Please select filters to view location data first",
        variant: "destructive",
      });
      return;
    }

    const headers = [
      "Location Name",
      "Total Sales",
      "Total Orders",
      "AOV",
      "Marketing Spend",
      "Marketing ROAS",
      "Net Payout",
      "Net Payout %",
    ];

    const rows = consolidatedMetrics.map((location) => [
      location.locationName,
      location.totalSales?.toFixed(2) || "0.00",
      location.totalOrders || "0",
      location.aov?.toFixed(2) || "0.00",
      location.marketingSpend?.toFixed(2) || "0.00",
      location.marketingRoas?.toFixed(2) || "0.00",
      location.netPayout?.toFixed(2) || "0.00",
      location.netPayoutPercent?.toFixed(1) || "0.0",
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    
    const weekLabel = selectedWeek 
      ? `${selectedWeek.weekStart}_to_${selectedWeek.weekEnd}`
      : "all_weeks";
    const clientLabel = selectedClientId || "all_clients";
    
    link.setAttribute("href", url);
    link.setAttribute("download", `location_performance_${clientLabel}_${weekLabel}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Export successful",
      description: `Downloaded ${consolidatedMetrics.length} locations`,
    });
  };

  const metricsColumns = [
    {
      key: "locationName",
      label: "Location",
      sortable: true,
      render: (value: string) => (
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-muted-foreground" />
          <span className="font-medium">{value}</span>
        </div>
      ),
    },
    {
      key: "totalSales",
      label: "Total Sales",
      sortable: true,
      align: "right" as const,
      render: (value: number | undefined) =>
        value !== undefined
          ? new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: "USD",
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            }).format(value)
          : <span className="text-muted-foreground">—</span>,
    },
    {
      key: "totalOrders",
      label: "Orders",
      sortable: true,
      align: "right" as const,
      render: (value: number | undefined) =>
        value !== undefined ? value.toLocaleString() : <span className="text-muted-foreground">—</span>,
    },
    {
      key: "aov",
      label: "AOV",
      sortable: true,
      align: "right" as const,
      render: (value: number | undefined) =>
        value !== undefined
          ? new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: "USD",
            }).format(value)
          : <span className="text-muted-foreground">—</span>,
    },
    {
      key: "marketingSpend",
      label: "Marketing Spend",
      sortable: true,
      align: "right" as const,
      render: (value: number | undefined) =>
        value !== undefined
          ? new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: "USD",
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            }).format(value)
          : <span className="text-muted-foreground">—</span>,
    },
    {
      key: "marketingRoas",
      label: "ROAS",
      sortable: true,
      align: "right" as const,
      render: (value: number | undefined) =>
        value !== undefined ? `${value.toFixed(2)}x` : <span className="text-muted-foreground">—</span>,
    },
    {
      key: "netPayoutPercent",
      label: "Net Payout %",
      sortable: true,
      align: "right" as const,
      render: (value: number | undefined) => {
        if (value === undefined) return <span className="text-muted-foreground">—</span>;
        
        let colorClass = "";
        if (value < 75) {
          colorClass = "text-red-600 dark:text-red-400";
        } else if (value < 82) {
          colorClass = "text-orange-600 dark:text-orange-400";
        } else if (value < 86) {
          colorClass = "text-yellow-600 dark:text-yellow-400";
        } else {
          colorClass = "text-green-600 dark:text-green-400";
        }
        
        return <span className={colorClass}>{value.toFixed(1)}%</span>;
      },
    },
  ];

  const suggestionColumns = [
    {
      key: "locationName",
      label: "Location Name",
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
      key: "matchedLocationName",
      label: "Suggested Match",
      render: (value: string | undefined) =>
        value || <span className="text-muted-foreground">No match</span>,
    },
    {
      key: "confidence",
      label: "Confidence",
      align: "right" as const,
      sortable: true,
      render: (value: number) => {
        const percentage = (value * 100).toFixed(0);
        const color =
          value >= 0.8
            ? "text-green-600 dark:text-green-500"
            : value >= 0.6
            ? "text-yellow-600 dark:text-yellow-500"
            : "text-red-600 dark:text-red-500";
        return <span className={color}>{percentage}%</span>;
      },
    },
    {
      key: "orderCount",
      label: "Orders",
      align: "right" as const,
      sortable: true,
      render: (value: number) => value.toLocaleString(),
    },
    {
      key: "actions",
      label: "Actions",
      render: (_: any, row: LocationMatchSuggestion) =>
        row.matchedLocationId ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              matchMutation.mutate({
                locationName: row.locationName,
                platform: row.platform,
                matchedLocationId: row.matchedLocationId!,
              })
            }
            disabled={matchMutation.isPending}
            data-testid={`button-match-${row.locationName}-${row.platform}`}
          >
            <LinkIcon className="w-3 h-3 mr-1" />
            Link
          </Button>
        ) : null,
    },
  ];

  if (suggestionsLoading) {
    return (
      <div className="p-8 space-y-8">
        <Skeleton className="h-8 w-64" />
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8" data-testid="page-locations">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight mb-2">
          Location Performance
        </h1>
        <p className="text-sm text-muted-foreground">
          Weekly key metrics breakdown by location
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="test-locations" data-testid="tab-test-locations">Test Locations Report</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-6">
          {weeks && weeks.length > 0 ? (
            <div className="flex flex-wrap gap-4">
              <ClientSelector
                selectedClientId={selectedClientId}
                onClientChange={(clientId) => {
                  setSelectedClientId(clientId);
                  setSelectedLocationId(null); // Reset location when client changes
                }}
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
              <WeekSelector
                weeks={weeks}
                selectedWeek={selectedWeek}
                onWeekChange={setSelectedWeek}
                showAllOption={false}
              />
            </div>
          ) : (
            <div className="flex gap-4">
              <Skeleton className="h-10 w-40" />
              <Skeleton className="h-10 w-40" />
              <Skeleton className="h-10 w-48" />
            </div>
          )}

          {suggestions && suggestions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-yellow-600" />
                  Unmatched Locations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Review and link locations found in uploaded files to existing canonical locations
                </p>
                <DataTable
                  data={suggestions}
                  columns={suggestionColumns}
                />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4">
              <CardTitle>Weekly Performance by Location</CardTitle>
              <Button
                onClick={exportToCSV}
                variant="outline"
                size="sm"
                disabled={!consolidatedMetrics || consolidatedMetrics.length === 0}
                data-testid="button-export-csv"
              >
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
            </CardHeader>
            <CardContent>
              {metricsLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-12" />
                  ))}
                </div>
              ) : consolidatedMetrics && consolidatedMetrics.length > 0 ? (
                <DataTable
                  data={consolidatedMetrics}
                  columns={metricsColumns}
                />
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  No location data available for the selected filters. Try adjusting your filters or upload transaction data.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="test-locations" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Corp Locations Financials</CardTitle>
            </CardHeader>
            <CardContent>
              {selectedClientId ? (
                <TestLocationsReport clientId={selectedClientId} />
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  Please select a client to view test locations report
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
