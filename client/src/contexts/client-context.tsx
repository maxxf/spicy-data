import { createContext, useContext, useState, ReactNode } from "react";

export type Platform = "ubereats" | "doordash" | "grubhub";

interface ClientContextType {
  selectedClientId: string | null;
  setSelectedClientId: (clientId: string | null) => void;
  selectedPlatforms: Platform[];
  togglePlatform: (platform: Platform) => void;
  setSelectedPlatforms: (platforms: Platform[]) => void;
  selectedWeek: { weekStart: string; weekEnd: string } | null;
  setSelectedWeek: (week: { weekStart: string; weekEnd: string } | null) => void;
}

const ClientContext = createContext<ClientContextType | undefined>(undefined);

const ALL_PLATFORMS: Platform[] = ["ubereats", "doordash", "grubhub"];

export function ClientProvider({ children }: { children: ReactNode }) {
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>(ALL_PLATFORMS);
  const [selectedWeek, setSelectedWeek] = useState<{ weekStart: string; weekEnd: string } | null>(null);

  const togglePlatform = (platform: Platform) => {
    setSelectedPlatforms((prev) => {
      if (prev.includes(platform)) {
        const next = prev.filter((p) => p !== platform);
        return next.length === 0 ? ALL_PLATFORMS : next;
      }
      return [...prev, platform];
    });
  };

  return (
    <ClientContext.Provider
      value={{
        selectedClientId,
        setSelectedClientId,
        selectedPlatforms,
        togglePlatform,
        setSelectedPlatforms,
        selectedWeek,
        setSelectedWeek,
      }}
    >
      {children}
    </ClientContext.Provider>
  );
}

export function useClientContext() {
  const context = useContext(ClientContext);
  if (context === undefined) {
    throw new Error("useClientContext must be used within a ClientProvider");
  }
  return context;
}
