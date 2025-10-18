import { useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import type { Client } from "@shared/schema";

interface ClientSelectorProps {
  selectedClientId: string | null;
  onClientChange: (clientId: string | null) => void;
  showAllOption?: boolean;
}

export function ClientSelector({ selectedClientId, onClientChange, showAllOption = true }: ClientSelectorProps) {
  const { data: clients, isLoading } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <Label className="text-sm text-muted-foreground">Loading clients...</Label>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="client-select" className="text-sm font-medium whitespace-nowrap">
        Client:
      </Label>
      <Select
        value={selectedClientId || "all"}
        onValueChange={(value) => onClientChange(value === "all" ? null : value)}
      >
        <SelectTrigger id="client-select" className="w-[200px]" data-testid="select-client-filter">
          <SelectValue placeholder="Select client" />
        </SelectTrigger>
        <SelectContent>
          {showAllOption && (
            <SelectItem value="all">All Clients (Portfolio)</SelectItem>
          )}
          {clients?.map((client) => (
            <SelectItem key={client.id} value={client.id}>
              {client.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
