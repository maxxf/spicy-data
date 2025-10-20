import { useState } from "react";
import { FileUploadZone } from "@/components/file-upload-zone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Upload, CheckCircle2, TrendingUp, Database } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { Client } from "@shared/schema";

type Platform = "ubereats" | "doordash" | "grubhub";
type MarketingDataType = "doordash-promotions" | "doordash-ads" | "uber-campaigns" | "uber-offers";

export default function UploadPage() {
  const [selectedFiles, setSelectedFiles] = useState<Record<Platform, File | null>>({
    ubereats: null,
    doordash: null,
    grubhub: null,
  });
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [marketingFile, setMarketingFile] = useState<File | null>(null);
  const [marketingDataType, setMarketingDataType] = useState<MarketingDataType | "">("");
  const [masterListUrl, setMasterListUrl] = useState<string>("https://docs.google.com/spreadsheets/d/1H-qG7iMx52CTC7HDwsHwTV8YdS60syK6V9V-RKQc5GA/edit?gid=1978235356#gid=1978235356");
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

  const uploadMarketingMutation = useMutation({
    mutationFn: async ({ file, dataType, clientId }: { file: File; dataType: MarketingDataType; clientId: string }) => {
      const formData = new FormData();
      formData.append("file", file);
      
      // Parse platform and dataType from combined selection
      const [platform, type] = dataType.split("-");
      formData.append("platform", platform);
      formData.append("dataType", type);
      formData.append("clientId", clientId);

      return apiRequest("POST", "/api/upload/marketing", formData);
    },
    onSuccess: () => {
      toast({
        title: "Marketing data uploaded",
        description: "Campaign performance data imported successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/promotions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/paid-ads"] });
      setMarketingFile(null);
      setMarketingDataType("");
    },
    onError: (error: any) => {
      toast({
        title: "Upload failed",
        description: error.message || "Failed to process marketing data",
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

  const handleMarketingUpload = async () => {
    if (!selectedClient) {
      toast({
        title: "Client required",
        description: "Please select a client before uploading",
        variant: "destructive",
      });
      return;
    }

    if (!marketingFile || !marketingDataType) {
      toast({
        title: "Missing information",
        description: "Please select both a data type and a file",
        variant: "destructive",
      });
      return;
    }

    await uploadMarketingMutation.mutateAsync({
      file: marketingFile,
      dataType: marketingDataType,
      clientId: selectedClient,
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

      <Card className="border-primary/20 bg-primary/5">
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

      <div className="border-t pt-8">
        <div className="mb-6">
          <h2 className="text-xl font-semibold tracking-tight mb-2 flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Marketing Data Upload
          </h2>
          <p className="text-sm text-muted-foreground">
            Import campaign performance data from promotions and paid advertising
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Select Data Type</CardTitle>
            <CardDescription>
              Choose the type of marketing data you're uploading
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2 max-w-md">
              <Label htmlFor="marketing-type-select">Data Type</Label>
              <Select value={marketingDataType} onValueChange={(val) => setMarketingDataType(val as MarketingDataType)}>
                <SelectTrigger id="marketing-type-select" data-testid="select-marketing-type">
                  <SelectValue placeholder="Choose data type..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="doordash-promotions" data-testid="option-type-doordash-promotions">
                    DoorDash - Promotions
                  </SelectItem>
                  <SelectItem value="doordash-ads" data-testid="option-type-doordash-ads">
                    DoorDash - Paid Ads
                  </SelectItem>
                  <SelectItem value="uber-campaigns" data-testid="option-type-uber-campaigns">
                    Uber Eats - Campaign Location Data
                  </SelectItem>
                  <SelectItem value="uber-offers" data-testid="option-type-uber-offers">
                    Uber Eats - Offers & Campaigns
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {marketingDataType && (
              <div className="space-y-2">
                <Label>Upload CSV File</Label>
                <div
                  className="border-2 border-dashed rounded-lg p-8 text-center hover-elevate cursor-pointer transition-colors"
                  onClick={() => document.getElementById("marketing-file-input")?.click()}
                  data-testid="zone-marketing-upload"
                >
                  <input
                    id="marketing-file-input"
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) setMarketingFile(file);
                    }}
                    data-testid="input-marketing-file"
                  />
                  {marketingFile ? (
                    <div className="space-y-2">
                      <CheckCircle2 className="w-8 h-8 mx-auto text-success" />
                      <p className="font-medium">{marketingFile.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {(marketingFile.size / 1024).toFixed(2)} KB
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMarketingFile(null);
                        }}
                        data-testid="button-clear-marketing-file"
                      >
                        Clear
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Upload className="w-8 h-8 mx-auto text-muted-foreground" />
                      <p className="font-medium">Drop CSV file here or click to browse</p>
                      <p className="text-sm text-muted-foreground">
                        Upload your {marketingDataType.replace("-", " ")} CSV file
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {marketingFile && marketingDataType && (
              <div className="flex justify-end">
                <Button
                  size="lg"
                  onClick={handleMarketingUpload}
                  disabled={uploadMarketingMutation.isPending}
                  data-testid="button-upload-marketing"
                >
                  {uploadMarketingMutation.isPending ? (
                    <>
                      <Upload className="w-4 h-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      Upload Marketing Data
                    </>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
