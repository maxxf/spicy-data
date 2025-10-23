import { useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
      <div className="text-sm text-muted-foreground">Loading clients...</div>
    );
  }

  return (
    <Select
      value={selectedClientId || "all"}
      onValueChange={(value) => onClientChange(value === "all" ? null : value)}
    >
      <SelectTrigger id="client-select" className="w-full" data-testid="select-client-filter">
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
  );
}
