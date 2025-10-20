import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Database, Settings, Upload } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { Client } from "@shared/schema";

export default function AdminPage() {
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [masterListUrl, setMasterListUrl] = useState<string>("https://docs.google.com/spreadsheets/d/1H-qG7iMx52CTC7HDwsHwTV8YdS60syK6V9V-RKQc5GA/edit?gid=1978235356#gid=1978235356");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: clients } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const importMasterListMutation = useMutation({
    mutationFn: async ({ spreadsheetUrl, clientId }: { spreadsheetUrl: string; clientId: string }) => {
      return apiRequest("POST", "/api/locations/import-master-list", {
        spreadsheetUrl,
        clientId,
      });
    },
    onSuccess: (data: any) => {
      toast({
        title: "Master list imported",
        description: `Created ${data.created} locations, updated ${data.updated}, skipped ${data.skipped}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/locations"] });
    },
    onError: (error: any) => {
      toast({
        title: "Import failed",
        description: error.message || "Failed to import master location list",
        variant: "destructive",
      });
    },
  });

  const handleImportMasterList = async () => {
    if (!selectedClient) {
      toast({
        title: "Client required",
        description: "Please select a client before importing",
        variant: "destructive",
      });
      return;
    }

    if (!masterListUrl) {
      toast({
        title: "URL required",
        description: "Please enter the Google Sheets URL",
        variant: "destructive",
      });
      return;
    }

    await importMasterListMutation.mutateAsync({
      spreadsheetUrl: masterListUrl,
      clientId: selectedClient,
    });
  };

  return (
    <div className="p-8 space-y-8" data-testid="page-admin">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight mb-2 flex items-center gap-2">
          <Settings className="w-6 h-6" />
          Admin Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          One-time setup tasks for onboarding new clients
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Select Client</CardTitle>
          <CardDescription>
            Choose the client you're setting up
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-w-md">
            <Label htmlFor="client-select">Client</Label>
            <Select value={selectedClient} onValueChange={setSelectedClient}>
              <SelectTrigger id="client-select" data-testid="select-client">
                <SelectValue placeholder="Choose a client..." />
              </SelectTrigger>
              <SelectContent>
                {clients?.map((client) => (
                  <SelectItem key={client.id} value={client.id} data-testid={`option-client-${client.id}`}>
                    {client.name}
                  </SelectItem>
                ))}
                <SelectItem value="new" data-testid="option-client-new">
                  + Create new client
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            Import Master Location List
          </CardTitle>
          <CardDescription>
            Import canonical location data with Store IDs from Google Sheets. This enables automatic location matching across all platforms.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="master-list-url">Google Sheets URL</Label>
            <Input
              id="master-list-url"
              type="text"
              placeholder="https://docs.google.com/spreadsheets/d/..."
              value={masterListUrl}
              onChange={(e) => setMasterListUrl(e.target.value)}
              data-testid="input-master-list-url"
            />
            <p className="text-xs text-muted-foreground">
              Column C should contain Store IDs that match across all delivery platforms
            </p>
          </div>
          <Button
            onClick={handleImportMasterList}
            disabled={!masterListUrl || !selectedClient || importMasterListMutation.isPending}
            data-testid="button-import-master-list"
          >
            {importMasterListMutation.isPending ? (
              <>
                <Upload className="w-4 h-4 mr-2 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Database className="w-4 h-4 mr-2" />
                Import Master List
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
