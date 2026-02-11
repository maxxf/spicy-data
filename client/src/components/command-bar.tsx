import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useClientContext, type Platform } from "@/contexts/client-context";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, X, Check } from "lucide-react";
import { SiUbereats, SiDoordash } from "react-icons/si";
import { GiHotMeal } from "react-icons/gi";
import { cn } from "@/lib/utils";
import type { Client } from "@shared/schema";

const platformConfig: {
  key: Platform;
  label: string;
  shortLabel: string;
  icon: typeof SiUbereats;
  activeClass: string;
}[] = [
  {
    key: "ubereats",
    label: "Uber Eats",
    shortLabel: "UE",
    icon: SiUbereats,
    activeClass: "bg-green-600 text-white border-green-600",
  },
  {
    key: "doordash",
    label: "DoorDash",
    shortLabel: "DD",
    icon: SiDoordash,
    activeClass: "bg-red-600 text-white border-red-600",
  },
  {
    key: "grubhub",
    label: "Grubhub",
    shortLabel: "GH",
    icon: GiHotMeal,
    activeClass: "bg-orange-600 text-white border-orange-600",
  },
];

export function CommandBar() {
  const {
    selectedClientId,
    setSelectedClientId,
    selectedPlatforms,
    togglePlatform,
  } = useClientContext();

  const [searchValue, setSearchValue] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: clients } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const selectedClient = clients?.find((c) => c.id === selectedClientId);

  const filteredClients = clients?.filter((c) =>
    c.name.toLowerCase().includes(searchValue.toLowerCase())
  );

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelectClient = (client: Client) => {
    setSelectedClientId(client.id);
    setSearchValue("");
    setIsOpen(false);
  };

  const handleClearClient = () => {
    setSelectedClientId(null);
    setSearchValue("");
  };

  const allPlatformsActive = selectedPlatforms.length === 3;

  return (
    <div className="flex items-center gap-3 flex-1 min-w-0" data-testid="command-bar">
      <div ref={containerRef} className="relative flex-1 max-w-md">
        <div className="flex items-center gap-2 border rounded-md bg-card px-3 py-1.5">
          <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          {selectedClient ? (
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <Badge variant="secondary" className="gap-1 flex-shrink-0" data-testid="badge-locked-client">
                {selectedClient.name}
                <button
                  onClick={handleClearClient}
                  className="ml-0.5"
                  data-testid="button-clear-client"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            </div>
          ) : (
            <Input
              ref={inputRef}
              value={searchValue}
              onChange={(e) => {
                setSearchValue(e.target.value);
                setIsOpen(true);
              }}
              onFocus={() => setIsOpen(true)}
              placeholder="Search client..."
              className="border-0 shadow-none focus-visible:ring-0 px-0 text-sm h-7"
              data-testid="input-client-search"
            />
          )}
        </div>

        {isOpen && !selectedClient && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-md z-50 max-h-60 overflow-y-auto" data-testid="dropdown-client-results">
            {filteredClients && filteredClients.length > 0 ? (
              filteredClients.map((client) => (
                <button
                  key={client.id}
                  onClick={() => handleSelectClient(client)}
                  className="w-full text-left px-3 py-2 text-sm hover-elevate flex items-center gap-2"
                  data-testid={`option-client-${client.id}`}
                >
                  <span className="truncate">{client.name}</span>
                </button>
              ))
            ) : (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                {searchValue ? "No clients found" : "Type to search clients"}
              </div>
            )}
            {!searchValue && (
              <button
                onClick={() => { setSelectedClientId(null); setIsOpen(false); }}
                className="w-full text-left px-3 py-2 text-sm hover-elevate flex items-center gap-2 border-t text-muted-foreground"
                data-testid="option-all-clients"
              >
                All Clients (Portfolio)
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 flex-shrink-0" data-testid="platform-toggles">
        {platformConfig.map((p) => {
          const isActive = selectedPlatforms.includes(p.key);
          const Icon = p.icon;
          return (
            <Button
              key={p.key}
              variant="outline"
              size="sm"
              onClick={() => togglePlatform(p.key)}
              className={cn(
                "gap-1 px-2 text-xs",
                isActive && p.activeClass
              )}
              data-testid={`toggle-platform-${p.key}`}
            >
              <Icon className="w-3 h-3" />
              <span className="hidden sm:inline">{p.shortLabel}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
