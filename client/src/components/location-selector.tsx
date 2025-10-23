import { useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import type { Location } from "@shared/schema";

interface LocationSelectorProps {
  clientId: string | null;
  selectedLocationId: string | null;
  onLocationChange: (locationId: string | null) => void;
  showAllOption?: boolean;
}

export function LocationSelector({ 
  clientId, 
  selectedLocationId, 
  onLocationChange, 
  showAllOption = true 
}: LocationSelectorProps) {
  // Only fetch locations when a specific client is selected
  const { data: locations, isLoading } = useQuery<Location[]>({
    queryKey: ["/api/locations", clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const response = await fetch(`/api/locations?clientId=${clientId}`);
      if (!response.ok) throw new Error("Failed to fetch locations");
      return response.json();
    },
    enabled: !!clientId,
  });

  // Don't render if no client is selected
  if (!clientId) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <Label className="text-sm text-muted-foreground">Loading locations...</Label>
      </div>
    );
  }

  // Don't render if there are no locations
  if (!locations || locations.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="location-select" className="text-sm font-medium whitespace-nowrap">
        Location:
      </Label>
      <Select
        value={selectedLocationId || "all"}
        onValueChange={(value) => onLocationChange(value === "all" ? null : value)}
      >
        <SelectTrigger id="location-select" className="w-[240px]" data-testid="select-location-filter">
          <SelectValue placeholder="Select location" />
        </SelectTrigger>
        <SelectContent>
          {showAllOption && (
            <SelectItem value="all">All Locations</SelectItem>
          )}
          {locations
            ?.filter((location) => location.canonicalName !== "Unmapped Locations")
            .map((location) => (
              <SelectItem key={location.id} value={location.id}>
                {location.canonicalName}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
    </div>
  );
}
