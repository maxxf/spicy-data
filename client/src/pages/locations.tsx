import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlatformBadge } from "@/components/platform-badge";
import { CheckCircle2, AlertCircle, Link as LinkIcon, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Location, LocationMatchSuggestion, LocationWeeklyFinancial } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { useMemo } from "react";

export default function LocationsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: locations, isLoading: locationsLoading } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
  });

  const { data: suggestions, isLoading: suggestionsLoading } = useQuery<LocationMatchSuggestion[]>({
    queryKey: ["/api/locations/suggestions"],
  });

  const { data: weeklyFinancials, isLoading: financialsLoading } = useQuery<LocationWeeklyFinancial[]>({
    queryKey: ["/api/analytics/location-weekly-financials"],
    queryFn: async () => {
      const params = new URLSearchParams({ clientId: "capriottis" });
      const response = await fetch(`/api/analytics/location-weekly-financials?${params}`);
      if (!response.ok) throw new Error("Failed to fetch weekly financials");
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

  const locationColumns = [
    {
      key: "canonicalName",
      label: "Canonical Name",
      sortable: true,
    },
    {
      key: "uberEatsName",
      label: "Uber Eats",
      render: (value: string | null) => value || <span className="text-muted-foreground">—</span>,
    },
    {
      key: "doordashName",
      label: "DoorDash",
      render: (value: string | null) => value || <span className="text-muted-foreground">—</span>,
    },
    {
      key: "grubhubName",
      label: "Grubhub",
      render: (value: string | null) => value || <span className="text-muted-foreground">—</span>,
    },
    {
      key: "isVerified",
      label: "Status",
      render: (value: boolean) =>
        value ? (
          <Badge variant="outline" className="bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800 no-default-hover-elevate">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Verified
          </Badge>
        ) : (
          <Badge variant="outline" className="bg-yellow-50 dark:bg-yellow-950/20 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800 no-default-hover-elevate">
            <AlertCircle className="w-3 h-3 mr-1" />
            Unverified
          </Badge>
        ),
    },
  ];

  // Group weekly financials by location
  const locationFinancials = useMemo(() => {
    if (!weeklyFinancials || !locations) return new Map();
    
    const grouped = new Map<string, { location: Location; weeks: LocationWeeklyFinancial[] }>();
    
    weeklyFinancials.forEach(wf => {
      const location = locations.find(l => l.id === wf.locationId);
      if (!location) return;
      
      if (!grouped.has(wf.locationId)) {
        grouped.set(wf.locationId, { location, weeks: [] });
      }
      grouped.get(wf.locationId)!.weeks.push(wf);
    });
    
    // Sort weeks by date for each location
    grouped.forEach(data => {
      data.weeks.sort((a, b) => a.weekStartDate.localeCompare(b.weekStartDate));
    });
    
    return grouped;
  }, [weeklyFinancials, locations]);

  // Get all unique weeks across all locations
  const allWeeks = useMemo(() => {
    if (!weeklyFinancials) return [];
    const weeks = Array.from(new Set(weeklyFinancials.map(wf => wf.weekStartDate)));
    return weeks.sort();
  }, [weeklyFinancials]);

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

  if (locationsLoading || suggestionsLoading) {
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

  const handleExport = async (aggregation: "by-location" | "overview") => {
    try {
      const params = new URLSearchParams({ clientId: "capriottis", aggregation });
      const response = await fetch(`/api/export/weekly-financials?${params}`);
      
      if (!response.ok) {
        throw new Error("Export failed");
      }
      
      // Get the filename from Content-Disposition header or use a default
      const contentDisposition = response.headers.get('Content-Disposition');
      const filename = contentDisposition 
        ? contentDisposition.split('filename=')[1].replace(/"/g, '')
        : `weekly-financials-${aggregation}-${new Date().toISOString().split('T')[0]}.csv`;
      
      // Download the file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Export successful",
        description: `Downloaded ${filename}`,
      });
    } catch (error: any) {
      toast({
        title: "Export failed",
        description: error.message || "Failed to export data",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="p-8 space-y-8" data-testid="page-locations">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight mb-2">
            Location Management
          </h1>
          <p className="text-sm text-muted-foreground">
            Match and verify locations across delivery platforms
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExport("overview")}
            data-testid="button-export-overview"
          >
            <Download className="w-4 h-4 mr-2" />
            Export Overview
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExport("by-location")}
            data-testid="button-export-by-location"
          >
            <Download className="w-4 h-4 mr-2" />
            Export by Location
          </Button>
        </div>
      </div>

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

      {locationFinancials.size > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Weekly Financial Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm" data-testid="table-weekly-financials">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3 font-semibold bg-muted/50">Location</th>
                    <th className="text-left p-3 font-semibold bg-muted/50">Metric</th>
                    {allWeeks.map(week => (
                      <th key={week} className="text-right p-3 font-semibold bg-muted/50 whitespace-nowrap">
                        {new Date(week).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from(locationFinancials.values()).map(({ location, weeks }) => {
                    // Create a map of week data for easy lookup
                    const weekMap = new Map<string, LocationWeeklyFinancial>(weeks.map((w: LocationWeeklyFinancial) => [w.weekStartDate, w]));
                    
                    const metrics = [
                      { label: "Sales (excl. tax)", key: "sales", format: (v: number) => `$${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` },
                      { label: "Marketing Sales", key: "marketingSales", format: (v: number) => `$${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` },
                      { label: "Marketing Spend", key: "marketingSpend", format: (v: number) => `$${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` },
                      { label: "Marketing %", key: "marketingPercent", format: (v: number) => `${Math.round(v)}%` },
                      { label: "ROAS", key: "roas", format: (v: number) => v.toFixed(1) },
                      { label: "Payout $", key: "payout", format: (v: number) => `$${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` },
                      { label: "Payout %", key: "payoutPercent", format: (v: number) => `${Math.round(v)}%` },
                      { label: "Payout with COGS (46%)", key: "payoutWithCogs", format: (v: number) => `$${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` },
                    ];

                    return metrics.map((metric, idx) => (
                      <tr key={`${location.id}-${metric.key}`} className={idx === 0 ? "border-t-2" : ""}>
                        {idx === 0 && (
                          <td 
                            rowSpan={metrics.length} 
                            className="p-3 font-medium bg-muted/30 border-r align-top"
                            data-testid={`location-name-${location.canonicalName}`}
                          >
                            {location.canonicalName}
                          </td>
                        )}
                        <td className="p-3 text-muted-foreground">{metric.label}</td>
                        {allWeeks.map(week => {
                          const data: LocationWeeklyFinancial | undefined = weekMap.get(week);
                          if (!data) {
                            return <td key={week} className="p-3 text-center text-muted-foreground">—</td>;
                          }
                          const value = data[metric.key as keyof LocationWeeklyFinancial] as number;
                          
                          // Apply color coding based on metric type and value
                          let cellClassName = "p-3 text-right font-mono";
                          if (metric.key === "marketingPercent") {
                            cellClassName += " bg-yellow-100 dark:bg-yellow-950/30";
                          } else if (metric.key === "payoutPercent") {
                            if (value < 75) {
                              cellClassName += " bg-red-100 dark:bg-red-950/30";
                            } else if (value < 82) {
                              cellClassName += " bg-orange-100 dark:bg-orange-950/30";
                            } else if (value < 86) {
                              cellClassName += " bg-yellow-100 dark:bg-yellow-950/30";
                            } else {
                              cellClassName += " bg-green-100 dark:bg-green-950/30";
                            }
                          }
                          
                          return (
                            <td 
                              key={week} 
                              className={cellClassName}
                              data-testid={`cell-${location.canonicalName}-${metric.key}-${week}`}
                            >
                              {metric.format(value)}
                            </td>
                          );
                        })}
                      </tr>
                    ));
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>All Locations</CardTitle>
        </CardHeader>
        <CardContent>
          {locations && locations.length > 0 ? (
            <DataTable
              data={locations}
              columns={locationColumns}
            />
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              No locations found. Upload data files to create locations.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
