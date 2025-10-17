import { useState } from "react";
import { FileUploadZone } from "@/components/file-upload-zone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Upload, CheckCircle2 } from "lucide-react";
import type { Client } from "@shared/schema";

type Platform = "ubereats" | "doordash" | "grubhub";

export default function UploadPage() {
  const [selectedFiles, setSelectedFiles] = useState<Record<Platform, File | null>>({
    ubereats: null,
    doordash: null,
    grubhub: null,
  });
  const [selectedClient, setSelectedClient] = useState<string>("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: clients } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ file, platform, clientId }: { file: File; platform: Platform; clientId: string }) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("platform", platform);
      formData.append("clientId", clientId);

      return apiRequest("POST", "/api/upload", formData);
    },
    onSuccess: () => {
      toast({
        title: "Upload successful",
        description: "File processed and data imported successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/overview"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/locations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/locations/suggestions"] });
    },
    onError: (error: any) => {
      toast({
        title: "Upload failed",
        description: error.message || "Failed to process file",
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (file: File, platform: Platform) => {
    setSelectedFiles((prev) => ({ ...prev, [platform]: file }));
  };

  const handleFileClear = (platform: Platform) => {
    setSelectedFiles((prev) => ({ ...prev, [platform]: null }));
  };

  const handleUpload = async () => {
    if (!selectedClient) {
      toast({
        title: "Client required",
        description: "Please select a client before uploading",
        variant: "destructive",
      });
      return;
    }

    const filesToUpload = Object.entries(selectedFiles).filter(
      ([_, file]) => file !== null
    ) as [Platform, File][];

    if (filesToUpload.length === 0) {
      toast({
        title: "No files selected",
        description: "Please select at least one file to upload",
        variant: "destructive",
      });
      return;
    }

    for (const [platform, file] of filesToUpload) {
      await uploadMutation.mutateAsync({
        file,
        platform,
        clientId: selectedClient,
      });
    }

    setSelectedFiles({
      ubereats: null,
      doordash: null,
      grubhub: null,
    });
  };

  const hasSelectedFiles = Object.values(selectedFiles).some((file) => file !== null);

  return (
    <div className="p-8 space-y-8" data-testid="page-upload">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight mb-2">
          Upload Data
        </h1>
        <p className="text-sm text-muted-foreground">
          Import CSV files from delivery platforms to analyze performance
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Select Client</CardTitle>
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <FileUploadZone
          platform="ubereats"
          onFileSelect={handleFileSelect}
          onFileClear={handleFileClear}
          isProcessing={uploadMutation.isPending}
        />
        <FileUploadZone
          platform="doordash"
          onFileSelect={handleFileSelect}
          onFileClear={handleFileClear}
          isProcessing={uploadMutation.isPending}
        />
        <FileUploadZone
          platform="grubhub"
          onFileSelect={handleFileSelect}
          onFileClear={handleFileClear}
          isProcessing={uploadMutation.isPending}
        />
      </div>

      <div className="flex justify-end gap-4">
        <Button
          size="lg"
          onClick={handleUpload}
          disabled={!hasSelectedFiles || !selectedClient || uploadMutation.isPending}
          data-testid="button-upload-all"
        >
          {uploadMutation.isPending ? (
            <>
              <Upload className="w-4 h-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Upload & Process
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
