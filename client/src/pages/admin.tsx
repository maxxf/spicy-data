import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Database, Settings, Upload, CheckCircle2, AlertCircle, TrendingUp, Download, Users, FileSpreadsheet, MapPin, Calendar } from "lucide-react";
import { Input } from "@/components/ui/input";
import { FileUploadZone } from "@/components/file-upload-zone";
import { UserManagement } from "@/components/user-management";
import type { Client } from "@shared/schema";

type Platform = "ubereats" | "doordash" | "grubhub";
type MarketingDataType = "doordash-promotions" | "doordash-ads" | "uber-campaigns" | "uber-offers";

type UploadStatus = {
  status: 'idle' | 'uploading' | 'success' | 'error';
  rowsProcessed?: number;
  error?: string;
};

export default function AdminPage() {
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [masterListUrl, setMasterListUrl] = useState<string>("");
  const [selectedFiles, setSelectedFiles] = useState<Record<Platform, File | null>>({
    ubereats: null,
    doordash: null,
    grubhub: null,
  });
  const [uploadStatuses, setUploadStatuses] = useState<Record<Platform, UploadStatus>>({
    ubereats: { status: 'idle' },
    doordash: { status: 'idle' },
    grubhub: { status: 'idle' },
  });
  const [marketingFile, setMarketingFile] = useState<File | null>(null);
  const [marketingDataType, setMarketingDataType] = useState<MarketingDataType | "">("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const clearTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (clearTimeoutRef.current) {
        clearTimeout(clearTimeoutRef.current);
      }
    };
  }, []);

  const { data: currentUser } = useQuery<any>({
    queryKey: ["/api/auth/user"],
  });

  const { data: clients } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  useEffect(() => {
    if (clients?.length && !selectedClient) {
      setSelectedClient(clients[0].id);
    }
  }, [clients, selectedClient]);

  type DataStatus = {
    platforms: Array<{ platform: string; count: number; dateRange: { minDate: string | null; maxDate: string | null } }>;
    locationCount: number;
    totalTransactions: number;
  };

  const { data: dataStatus } = useQuery<DataStatus>({
    queryKey: ["/api/admin/data-status", selectedClient],
    queryFn: async () => {
      const res = await fetch(`/api/admin/data-status?clientId=${selectedClient}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch data status");
      return res.json();
    },
    enabled: !!selectedClient,
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ file, platform, clientId }: { file: File; platform: Platform; clientId: string }) => {
      console.log(`Starting upload for ${platform}:`, file.name, file.size);
      
      setUploadStatuses(prev => ({
        ...prev,
        [platform]: { status: 'uploading' }
      }));

      const formData = new FormData();
      formData.append("file", file);
      formData.append("platform", platform);
      formData.append("clientId", clientId);

      try {
        const response = await apiRequest("POST", "/api/upload", formData);
        const data = await response.json();
        console.log(`Upload response for ${platform}:`, data);
        return { data, platform };
      } catch (error) {
        console.error(`Upload error for ${platform}:`, error);
        throw { error, platform };
      }
    },
    onSuccess: ({ data, platform }: { data: any; platform: Platform }) => {
      const platformNames: Record<Platform, string> = {
        ubereats: 'Uber Eats',
        doordash: 'DoorDash',
        grubhub: 'Grubhub'
      };

      setUploadStatuses(prev => ({
        ...prev,
        [platform]: { status: 'success', rowsProcessed: data.rowsProcessed }
      }));

      toast({
        title: `${platformNames[platform]} upload successful`,
        description: `Processed ${data.rowsProcessed} transactions`,
      });
      
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/overview"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/locations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/locations/suggestions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/data-status", selectedClient] });
    },
    onError: ({ error, platform }: { error: any; platform: Platform }) => {
      const platformNames: Record<Platform, string> = {
        ubereats: 'Uber Eats',
        doordash: 'DoorDash',
        grubhub: 'Grubhub'
      };

      console.error("Upload mutation error:", error);
      
      setUploadStatuses(prev => ({
        ...prev,
        [platform]: { status: 'error', error: error.message }
      }));

      toast({
        title: `${platformNames[platform]} upload failed`,
        description: error.message || "Failed to process file",
        variant: "destructive",
      });
    },
  });

  const uploadMarketingMutation = useMutation({
    mutationFn: async ({ file, dataType, clientId }: { file: File; dataType: MarketingDataType; clientId: string }) => {
      const formData = new FormData();
      formData.append("file", file);
      
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
      setMasterListUrl("");
    },
    onError: (error: any) => {
      toast({
        title: "Import failed",
        description: error.message || "Failed to import master location list",
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (file: File, platform: Platform) => {
    setSelectedFiles((prev) => ({ ...prev, [platform]: file }));
  };

  const handleFileClear = (platform: Platform) => {
    setSelectedFiles((prev) => ({ ...prev, [platform]: null }));
    setUploadStatuses(prev => ({ ...prev, [platform]: { status: 'idle' } }));
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

    // Clear any existing timeout
    if (clearTimeoutRef.current) {
      clearTimeout(clearTimeoutRef.current);
    }

    // Clear files after all uploads complete
    clearTimeoutRef.current = setTimeout(() => {
      setSelectedFiles({
        ubereats: null,
        doordash: null,
        grubhub: null,
      });
      setUploadStatuses({
        ubereats: { status: 'idle' },
        doordash: { status: 'idle' },
        grubhub: { status: 'idle' },
      });
      clearTimeoutRef.current = null;
    }, 5000); // Keep success state visible for 5 seconds
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

  const hasSelectedFiles = Object.values(selectedFiles).some((file) => file !== null);

  if (!currentUser) {
    return (
      <div className="p-8 space-y-8" data-testid="page-admin">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight mb-2 flex items-center gap-2">
            <Settings className="w-6 h-6" />
            Admin Settings
          </h1>
          <p className="text-sm text-muted-foreground">
            Data upload and system management
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-yellow-500" />
              Login Required
            </CardTitle>
            <CardDescription>
              You need to log in to access admin features
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild data-testid="button-login">
              <a href="/api/login">Log in with Replit</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8" data-testid="page-admin">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight mb-2 flex items-center gap-2">
          <Settings className="w-6 h-6" />
          Admin Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Data upload and system management
        </p>
      </div>

      {/* Client Selector */}
      <Card>
        <CardHeader>
          <CardTitle>Select Client</CardTitle>
          <CardDescription>
            Choose which client you're working with
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
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {selectedClient && dataStatus && (
        <Card data-testid="card-data-status">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="w-4 h-4" />
              Data Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {dataStatus.platforms.map((p) => (
                <div key={p.platform} className="space-y-1" data-testid={`status-${p.platform.toLowerCase().replace(/\s/g, "-")}`}>
                  <p className="text-xs text-muted-foreground">{p.platform}</p>
                  <p className="text-lg font-semibold tabular-nums">
                    {p.count.toLocaleString()}
                  </p>
                  {p.count > 0 && p.dateRange?.minDate && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(p.dateRange.minDate + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", year: "2-digit" })}
                      {" - "}
                      {new Date(p.dateRange.maxDate! + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", year: "2-digit" })}
                    </p>
                  )}
                  {p.count === 0 && (
                    <Badge variant="outline" className="text-xs">No data</Badge>
                  )}
                </div>
              ))}
              <div className="space-y-1" data-testid="status-locations">
                <p className="text-xs text-muted-foreground">Locations</p>
                <p className="text-lg font-semibold tabular-nums flex items-center gap-1">
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                  {dataStatus.locationCount}
                </p>
              </div>
              <div className="space-y-1" data-testid="status-total">
                <p className="text-xs text-muted-foreground">Total Transactions</p>
                <p className="text-lg font-semibold tabular-nums">
                  {dataStatus.totalTransactions.toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabbed Interface */}
      <Tabs defaultValue="transactions" className="space-y-4" data-testid="tabs-admin">
        <TabsList className="grid w-full grid-cols-2 lg:grid-cols-5" data-testid="tabs-list-admin">
          <TabsTrigger value="transactions" data-testid="tab-transactions">
            <Upload className="w-4 h-4 mr-2" />
            Transactions
          </TabsTrigger>
          <TabsTrigger value="marketing" data-testid="tab-marketing">
            <TrendingUp className="w-4 h-4 mr-2" />
            Marketing
          </TabsTrigger>
          <TabsTrigger value="locations" data-testid="tab-locations">
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Locations
          </TabsTrigger>
          {currentUser?.role === "super_admin" && (
            <>
              <TabsTrigger value="migration" data-testid="tab-migration">
                <Database className="w-4 h-4 mr-2" />
                Migration
              </TabsTrigger>
              <TabsTrigger value="users" data-testid="tab-users">
                <Users className="w-4 h-4 mr-2" />
                Users
              </TabsTrigger>
            </>
          )}
        </TabsList>

        {/* Transaction Upload Tab */}
        <TabsContent value="transactions" className="space-y-4" data-testid="content-transactions">
          <div>
            <h2 className="text-xl font-semibold tracking-tight mb-2 flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Upload Transaction Data
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              Import CSV payment reports from delivery platforms to analyze sales performance
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <FileUploadZone
              platform="ubereats"
              onFileSelect={handleFileSelect}
              onFileClear={handleFileClear}
              isProcessing={uploadStatuses.ubereats.status === 'uploading'}
              uploadStatus={uploadStatuses.ubereats}
            />
            <FileUploadZone
              platform="doordash"
              onFileSelect={handleFileSelect}
              onFileClear={handleFileClear}
              isProcessing={uploadStatuses.doordash.status === 'uploading'}
              uploadStatus={uploadStatuses.doordash}
            />
            <FileUploadZone
              platform="grubhub"
              onFileSelect={handleFileSelect}
              onFileClear={handleFileClear}
              isProcessing={uploadStatuses.grubhub.status === 'uploading'}
              uploadStatus={uploadStatuses.grubhub}
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
        </TabsContent>

        {/* Marketing Upload Tab */}
        <TabsContent value="marketing" className="space-y-4" data-testid="content-marketing">
          <div>
            <h2 className="text-xl font-semibold tracking-tight mb-2 flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Upload Marketing Data
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              Import promotion and paid advertising performance data to track ROI and ROAS
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
        </TabsContent>

        {/* Master Locations Tab */}
        <TabsContent value="locations" className="space-y-4" data-testid="content-locations">
          <div>
            <h2 className="text-xl font-semibold tracking-tight mb-2 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5" />
              Import Master Location List
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              One-time setup: Import your complete list of store locations from Google Sheets
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Google Sheets Master List</CardTitle>
              <CardDescription>
                Your master location list should contain all restaurant locations with their official Store IDs
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 border rounded-lg bg-muted/50 space-y-2">
                <h4 className="font-medium text-sm">What is this?</h4>
                <p className="text-sm text-muted-foreground">
                  The master location list is your single source of truth for all restaurant locations. It contains the official Store IDs that match across Uber Eats, DoorDash, and Grubhub.
                </p>
                <p className="text-sm text-muted-foreground">
                  Once imported, the system will automatically match transaction data from all platforms to the correct locations using these Store IDs.
                </p>
              </div>

              <div className="p-4 border-l-4 border-primary bg-primary/5 rounded-lg">
                <p className="text-sm font-medium mb-2">📋 Required Sheet Format:</p>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Column A: Location name (e.g., "Las Vegas - Spring Mountain")</li>
                  <li>Column B: Address (optional, for reference)</li>
                  <li>Column C: Store ID (e.g., "NV008") - Must match platform reports</li>
                </ul>
              </div>

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
                  Make sure your Google Sheet is shared with "Anyone with the link can view"
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
        </TabsContent>

        {/* Data Migration Tab - Super Admin Only */}
        {currentUser?.role === "super_admin" && (
          <TabsContent value="migration" className="space-y-4" data-testid="content-migration">
            <div>
              <h2 className="text-xl font-semibold tracking-tight mb-2 flex items-center gap-2">
                <Database className="w-5 h-5" />
                Data Migration
              </h2>
              <p className="text-sm text-muted-foreground mb-4">
                Export data from development and import into production to sync databases
              </p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Database Migration Tools</CardTitle>
                <CardDescription>
                  Transfer all data (clients, locations, transactions) between environments
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="p-4 border rounded-lg space-y-3 bg-muted/50">
                    <h4 className="font-medium">Step 1: Export Data</h4>
                    <p className="text-sm text-muted-foreground">
                      Download all database data (clients, locations, transactions) as a JSON file.
                    </p>
                    <Button
                      onClick={() => window.open('/api/admin/export-data', '_blank')}
                      variant="outline"
                      data-testid="button-export-data"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Export Database
                    </Button>
                  </div>

                  <div className="p-4 border rounded-lg space-y-3 bg-muted/50">
                    <h4 className="font-medium">Step 2: Import Data</h4>
                    <p className="text-sm text-muted-foreground">
                      Upload the exported JSON file to production to import all data.
                    </p>
                    <div className="space-y-2">
                      <Input
                        id="migration-file-input"
                        type="file"
                        accept=".json"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const formData = new FormData();
                            formData.append('file', file);
                            
                            fetch('/api/admin/import-data', {
                              method: 'POST',
                              body: formData,
                            })
                              .then(res => res.json())
                              .then(data => {
                                if (data.success) {
                                  const summary = data.summary;
                                  toast({
                                    title: "Import successful",
                                    description: `Imported: ${summary.clientsImported} clients, ${summary.locationsImported} locations, ${summary.transactionsImported} transactions. Skipped ${summary.orphanedRecordsSkipped} orphaned records.`,
                                  });
                                  queryClient.invalidateQueries();
                                } else {
                                  throw new Error(data.error || 'Import failed');
                                }
                              })
                              .catch(error => {
                                toast({
                                  title: "Import failed",
                                  description: error.message,
                                  variant: "destructive",
                                });
                              });
                          }
                        }}
                        data-testid="input-migration-file"
                      />
                      <p className="text-xs text-muted-foreground">
                        Only upload JSON files exported from this system
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-4 border-l-4 border-warning bg-warning/10 rounded-lg">
                  <p className="text-sm font-medium mb-2">⚠️ Important Notes:</p>
                  <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                    <li>Export data from development environment</li>
                    <li>Import the file into production environment</li>
                    <li>This will add missing data without affecting existing records</li>
                    <li>Only super admins can access migration tools</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* User Management Tab - Super Admin Only */}
        {currentUser?.role === "super_admin" && (
          <TabsContent value="users" className="space-y-4" data-testid="content-users">
            <div>
              <h2 className="text-xl font-semibold tracking-tight mb-2 flex items-center gap-2">
                <Users className="w-5 h-5" />
                User Management
              </h2>
              <p className="text-sm text-muted-foreground mb-4">
                Manage user accounts, roles, and client assignments
              </p>
            </div>
            
            <UserManagement />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
