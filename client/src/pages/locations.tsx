import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlatformBadge } from "@/components/platform-badge";
import { CheckCircle2, AlertCircle, Link as LinkIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Location, LocationMatchSuggestion } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";

export default function LocationsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: locations, isLoading: locationsLoading } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
  });

  const { data: suggestions, isLoading: suggestionsLoading } = useQuery<LocationMatchSuggestion[]>({
    queryKey: ["/api/locations/suggestions"],
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

  return (
    <div className="p-8 space-y-8" data-testid="page-locations">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight mb-2">
          Location Management
        </h1>
        <p className="text-sm text-muted-foreground">
          Match and verify locations across delivery platforms
        </p>
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
