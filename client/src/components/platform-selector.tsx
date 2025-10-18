import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface PlatformSelectorProps {
  selectedPlatform: string | null;
  onPlatformChange: (platform: string | null) => void;
}

export function PlatformSelector({ selectedPlatform, onPlatformChange }: PlatformSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="platform-select" className="text-sm font-medium whitespace-nowrap">
        Platform:
      </Label>
      <Select
        value={selectedPlatform || "all"}
        onValueChange={(value) => onPlatformChange(value === "all" ? null : value)}
      >
        <SelectTrigger id="platform-select" className="w-[180px]" data-testid="select-platform-filter">
          <SelectValue placeholder="Select platform" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Platforms</SelectItem>
          <SelectItem value="ubereats">Uber Eats</SelectItem>
          <SelectItem value="doordash">DoorDash</SelectItem>
          <SelectItem value="grubhub">Grubhub</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
