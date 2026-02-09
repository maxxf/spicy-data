import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { FileUploadZone } from "@/components/file-upload-zone";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Upload,
  Plus,
  Trash2,
  TestTube,
  RefreshCw,
  ShieldCheck,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
  Key,
  Loader2,
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  TrendingUp,
  Zap,
} from "lucide-react";
import { SiUbereats, SiDoordash, SiGrubhub } from "react-icons/si";
import type { PlatformCredential, DataSyncJob, Client } from "@shared/schema";

type Platform = "ubereats" | "doordash" | "grubhub";
type MarketingDataType = "doordash-promotions" | "doordash-ads" | "uber-campaigns" | "uber-offers";

type UploadStatus = {
  status: 'idle' | 'uploading' | 'success' | 'error';
  rowsProcessed?: number;
  error?: string;
};

const platformConfig = {
  ubereats: {
    name: "Uber Eats",
    icon: SiUbereats,
    color: "text-green-600",
    bgColor: "bg-green-50 dark:bg-green-950",
    credentialTypes: [
      { value: "oauth", label: "OAuth 2.0 (API)" },
      { value: "login", label: "Portal Login" },
    ],
  },
  doordash: {
    name: "DoorDash",
    icon: SiDoordash,
    color: "text-red-600",
    bgColor: "bg-red-50 dark:bg-red-950",
    credentialTypes: [
      { value: "api_key", label: "API Key (JWT)" },
      { value: "login", label: "Portal Login" },
    ],
  },
  grubhub: {
    name: "Grubhub",
    icon: SiGrubhub,
    color: "text-orange-600",
    bgColor: "bg-orange-50 dark:bg-orange-950",
    credentialTypes: [
      { value: "login", label: "Portal Login" },
    ],
  },
};

const platformNames: Record<Platform, string> = {
  ubereats: 'Uber Eats',
  doordash: 'DoorDash',
  grubhub: 'Grubhub'
};

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "active":
      return <Badge variant="default" className="bg-green-600" data-testid="badge-status-active"><CheckCircle2 className="w-3 h-3 mr-1" /> Active</Badge>;
    case "error":
      return <Badge variant="destructive" data-testid="badge-status-error"><XCircle className="w-3 h-3 mr-1" /> Error</Badge>;
    case "inactive":
      return <Badge variant="secondary" data-testid="badge-status-inactive"><Clock className="w-3 h-3 mr-1" /> Inactive</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function AddCredentialDialog({ clients }: { clients: Client[] }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<string>("");
  const [credentialType, setCredentialType] = useState<string>("");
  const [clientId, setClientId] = useState<string>("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [storeIds, setStoreIds] = useState("");

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/platform-credentials", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform-credentials"] });
      toast({ title: "Credential added successfully" });
      setOpen(false);
      resetForm();
    },
    onError: (err: any) => {
      toast({ title: "Failed to add credential", description: err.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setPlatform("");
    setCredentialType("");
    setClientId("");
    setUsername("");
    setPassword("");
    setApiKey("");
    setApiSecret("");
    setStoreIds("");
  };

  const handleSubmit = () => {
    if (!platform || !credentialType || !clientId) {
      toast({ title: "Please fill in all required fields", variant: "destructive" });
      return;
    }

    const data: any = {
      platform,
      credentialType,
      clientId,
      status: "active",
    };

    if (credentialType === "login") {
      data.username = username;
      data.encryptedPassword = password;
    } else if (credentialType === "api_key") {
      data.apiKey = apiKey;
      data.apiSecret = apiSecret;
    } else if (credentialType === "oauth") {
      data.apiKey = apiKey;
      data.apiSecret = apiSecret;
    }

    if (storeIds.trim()) {
      data.storeIds = storeIds.split(",").map((s: string) => s.trim()).filter(Boolean);
    }

    createMutation.mutate(data);
  };

  const selectedPlatformConfig = platform ? platformConfig[platform as keyof typeof platformConfig] : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" data-testid="button-add-credential">
          <Plus className="w-4 h-4 mr-2" />
          Add Connection
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md" data-testid="dialog-add-credential">
        <DialogHeader>
          <DialogTitle>Add Platform Connection</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Client</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger data-testid="select-credential-client">
                <SelectValue placeholder="Select client" />
              </SelectTrigger>
              <SelectContent>
                {clients.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Platform</Label>
            <Select value={platform} onValueChange={(v) => { setPlatform(v); setCredentialType(""); }}>
              <SelectTrigger data-testid="select-credential-platform">
                <SelectValue placeholder="Select platform" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ubereats">Uber Eats</SelectItem>
                <SelectItem value="doordash">DoorDash</SelectItem>
                <SelectItem value="grubhub">Grubhub</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {selectedPlatformConfig && (
            <div className="space-y-2">
              <Label>Connection Type</Label>
              <Select value={credentialType} onValueChange={setCredentialType}>
                <SelectTrigger data-testid="select-credential-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {selectedPlatformConfig.credentialTypes.map(ct => (
                    <SelectItem key={ct.value} value={ct.value}>{ct.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {credentialType === "login" && (
            <>
              <div className="space-y-2">
                <Label>Username / Email</Label>
                <Input
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="portal@example.com"
                  data-testid="input-username"
                />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter password"
                  data-testid="input-password"
                />
              </div>
            </>
          )}

          {(credentialType === "api_key" || credentialType === "oauth") && (
            <>
              <div className="space-y-2">
                <Label>{credentialType === "oauth" ? "Client ID" : "API Key"}</Label>
                <Input
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder={credentialType === "oauth" ? "OAuth Client ID" : "API Key"}
                  data-testid="input-api-key"
                />
              </div>
              <div className="space-y-2">
                <Label>{credentialType === "oauth" ? "Client Secret" : "API Secret"}</Label>
                <Input
                  type="password"
                  value={apiSecret}
                  onChange={e => setApiSecret(e.target.value)}
                  placeholder={credentialType === "oauth" ? "OAuth Client Secret" : "API Secret"}
                  data-testid="input-api-secret"
                />
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label>Store IDs (comma-separated, optional)</Label>
            <Input
              value={storeIds}
              onChange={e => setStoreIds(e.target.value)}
              placeholder="STORE001, STORE002"
              data-testid="input-store-ids"
            />
          </div>

          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={createMutation.isPending}
            data-testid="button-submit-credential"
          >
            {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save Connection
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CredentialCard({ credential, onDelete, onTest }: {
  credential: PlatformCredential;
  onDelete: (id: string) => void;
  onTest: (id: string) => void;
}) {
  const config = platformConfig[credential.platform as keyof typeof platformConfig];
  if (!config) return null;

  const PlatformIcon = config.icon;

  return (
    <Card data-testid={`card-credential-${credential.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`p-2 rounded-md ${config.bgColor}`}>
              <PlatformIcon className={`w-5 h-5 ${config.color}`} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{config.name}</span>
                <StatusBadge status={credential.status} />
              </div>
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                <Key className="w-3 h-3" />
                <span>{credential.credentialType === "login" ? "Portal Login" : credential.credentialType === "oauth" ? "OAuth 2.0" : "API Key"}</span>
                {credential.username && (
                  <>
                    <span className="text-muted-foreground/50">|</span>
                    <span>{credential.username}</span>
                  </>
                )}
              </div>
              {credential.storeIds && credential.storeIds.length > 0 && (
                <div className="flex items-center gap-1 mt-1 flex-wrap">
                  {credential.storeIds.slice(0, 3).map((sid, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">{sid}</Badge>
                  ))}
                  {credential.storeIds.length > 3 && (
                    <Badge variant="secondary" className="text-xs">+{credential.storeIds.length - 3} more</Badge>
                  )}
                </div>
              )}
              {credential.lastSyncAt && (
                <p className="text-xs text-muted-foreground mt-1">
                  Last sync: {new Date(credential.lastSyncAt).toLocaleDateString()} {new Date(credential.lastSyncAt).toLocaleTimeString()}
                </p>
              )}
              {credential.lastError && (
                <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {credential.lastError}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => onTest(credential.id)}
              data-testid={`button-test-credential-${credential.id}`}
            >
              <TestTube className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => onDelete(credential.id)}
              data-testid={`button-delete-credential-${credential.id}`}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AutomationsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isSuperAdmin = user?.role === "super_admin";
  const clearTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [automationOpen, setAutomationOpen] = useState(false);

  const [selectedClient, setSelectedClient] = useState<string>("");
  const [uploadStatuses, setUploadStatuses] = useState<Record<Platform, UploadStatus>>({
    ubereats: { status: 'idle' },
    doordash: { status: 'idle' },
    grubhub: { status: 'idle' },
  });
  const [selectedFiles, setSelectedFiles] = useState<Record<Platform, File | null>>({
    ubereats: null,
    doordash: null,
    grubhub: null,
  });

  const [marketingFile, setMarketingFile] = useState<File | null>(null);
  const [marketingDataType, setMarketingDataType] = useState<MarketingDataType | "">("");

  useEffect(() => {
    return () => {
      if (clearTimeoutRef.current) {
        clearTimeout(clearTimeoutRef.current);
      }
    };
  }, []);

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const { data: credentials = [], isLoading: credentialsLoading } = useQuery<PlatformCredential[]>({
    queryKey: ["/api/platform-credentials"],
    enabled: isSuperAdmin,
  });

  useEffect(() => {
    if (clients.length > 0 && !selectedClient) {
      setSelectedClient(clients[0].id);
    }
  }, [clients, selectedClient]);

  const uploadMutation = useMutation({
    mutationFn: async ({ file, platform, clientId }: { file: File; platform: Platform; clientId: string }) => {
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
        return { data, platform };
      } catch (error) {
        throw { error, platform };
      }
    },
    onSuccess: ({ data, platform }: { data: any; platform: Platform }) => {
      setUploadStatuses(prev => ({
        ...prev,
        [platform]: { status: 'success', rowsProcessed: data.rowsProcessed }
      }));

      toast({
        title: `${platformNames[platform]} upload successful`,
        description: `Processed ${data.rowsProcessed} transactions`,
      });

      queryClient.invalidateQueries({ queryKey: ["/api/analytics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });

      if (clearTimeoutRef.current) clearTimeout(clearTimeoutRef.current);
      clearTimeoutRef.current = setTimeout(() => {
        setUploadStatuses(prev => ({
          ...prev,
          [platform]: { status: 'idle' }
        }));
        setSelectedFiles(prev => ({ ...prev, [platform]: null }));
      }, 5000);
    },
    onError: (err: any) => {
      const platform = err?.platform || 'ubereats';
      const errorMessage = err?.error?.message || "Upload failed";

      setUploadStatuses(prev => ({
        ...prev,
        [platform]: { status: 'error', error: errorMessage }
      }));

      toast({
        title: `${platformNames[platform as Platform]} upload failed`,
        description: errorMessage,
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

  const handleFileSelect = (file: File, platform: Platform) => {
    setSelectedFiles(prev => ({ ...prev, [platform]: file }));
    if (selectedClient) {
      uploadMutation.mutate({ file, platform, clientId: selectedClient });
    } else {
      toast({
        title: "Select a client first",
        description: "Please choose a client before uploading files",
        variant: "destructive",
      });
    }
  };

  const handleFileClear = (platform: Platform) => {
    setSelectedFiles(prev => ({ ...prev, [platform]: null }));
    setUploadStatuses(prev => ({
      ...prev,
      [platform]: { status: 'idle' }
    }));
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/platform-credentials/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform-credentials"] });
      toast({ title: "Connection removed" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to remove", description: err.message, variant: "destructive" });
    },
  });

  const testMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/platform-credentials/${id}/test`);
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Connection Test", description: data.message });
    },
    onError: (err: any) => {
      toast({ title: "Connection Test Failed", description: err.message, variant: "destructive" });
    },
  });

  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <Card className="max-w-md w-full">
          <CardContent className="p-6 text-center">
            <ShieldCheck className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold mb-2">Access Restricted</h2>
            <p className="text-sm text-muted-foreground">
              Only super admins can manage data ingestion and platform connections.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const groupedByClient = credentials.reduce((acc, cred) => {
    const key = cred.clientId;
    if (!acc[key]) acc[key] = [];
    acc[key].push(cred);
    return acc;
  }, {} as Record<string, PlatformCredential[]>);

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto overflow-y-auto h-full" data-testid="page-automations">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2" data-testid="heading-data-ingestion">
          <Upload className="w-5 h-5" />
          Data Ingestion
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload transaction and marketing CSV files from your delivery platforms
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Label className="text-sm font-medium whitespace-nowrap">Client</Label>
        <Select value={selectedClient} onValueChange={setSelectedClient}>
          <SelectTrigger className="w-[280px]" data-testid="select-upload-client">
            <SelectValue placeholder="Select client" />
          </SelectTrigger>
          <SelectContent>
            {clients.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-base font-semibold" data-testid="heading-transaction-data">Transaction Data</h2>
        </div>
        <p className="text-sm text-muted-foreground -mt-2">
          Upload payment/transaction CSV reports exported from each delivery platform
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          {(["ubereats", "doordash", "grubhub"] as Platform[]).map(platform => (
            <FileUploadZone
              key={platform}
              platform={platform}
              onFileSelect={handleFileSelect}
              onFileClear={handleFileClear}
              uploadStatus={uploadStatuses[platform]}
              isProcessing={uploadStatuses[platform].status === 'uploading'}
              data-testid={`upload-zone-${platform}`}
            />
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-base font-semibold" data-testid="heading-marketing-data">Marketing Data</h2>
        </div>
        <p className="text-sm text-muted-foreground -mt-2">
          Upload campaign performance and ad spend reports
        </p>

        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-sm">Data Type</Label>
                <Select
                  value={marketingDataType}
                  onValueChange={(v) => setMarketingDataType(v as MarketingDataType)}
                >
                  <SelectTrigger data-testid="select-marketing-type">
                    <SelectValue placeholder="Select report type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="doordash-promotions">DoorDash Promotions</SelectItem>
                    <SelectItem value="doordash-ads">DoorDash Sponsored Listings</SelectItem>
                    <SelectItem value="uber-campaigns">Uber Eats Campaigns</SelectItem>
                    <SelectItem value="uber-offers">Uber Eats Offers</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm">CSV File</Label>
                <Input
                  type="file"
                  accept=".csv"
                  onChange={e => setMarketingFile(e.target.files?.[0] || null)}
                  data-testid="input-marketing-file"
                />
              </div>
            </div>
            <Button
              onClick={() => {
                if (marketingFile && marketingDataType && selectedClient) {
                  uploadMarketingMutation.mutate({
                    file: marketingFile,
                    dataType: marketingDataType,
                    clientId: selectedClient,
                  });
                } else {
                  toast({
                    title: "Missing fields",
                    description: "Please select a client, data type, and file",
                    variant: "destructive",
                  });
                }
              }}
              disabled={!marketingFile || !marketingDataType || !selectedClient || uploadMarketingMutation.isPending}
              data-testid="button-upload-marketing"
            >
              {uploadMarketingMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Upload className="w-4 h-4 mr-2" />
              )}
              Upload Marketing Data
            </Button>
          </CardContent>
        </Card>
      </div>

      <Collapsible open={automationOpen} onOpenChange={setAutomationOpen}>
        <CollapsibleTrigger asChild>
          <button
            className="flex items-center gap-2 w-full text-left py-3 group"
            data-testid="button-toggle-automation"
          >
            {automationOpen ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
            <Zap className="w-4 h-4 text-muted-foreground" />
            <span className="text-base font-semibold">Platform Connections</span>
            <Badge variant="secondary" className="ml-2 text-xs">Coming Soon</Badge>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-4 pt-2 pb-4">
            <p className="text-sm text-muted-foreground">
              Connect delivery platform accounts for automated data collection. This feature will allow automatic syncing of transaction and marketing data without manual CSV uploads.
            </p>

            <div className="grid gap-3 grid-cols-3">
              {Object.entries(platformConfig).map(([key, config]) => {
                const PIcon = config.icon;
                const count = credentials.filter(c => c.platform === key).length;
                const activeCount = credentials.filter(c => c.platform === key && c.status === "active").length;
                return (
                  <Card key={key} data-testid={`card-platform-summary-${key}`}>
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className={`p-2.5 rounded-md ${config.bgColor}`}>
                        <PIcon className={`w-5 h-5 ${config.color}`} />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{config.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {count === 0 ? "No connections" : `${activeCount}/${count} active`}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium">Saved Connections</h3>
              <AddCredentialDialog clients={clients} />
            </div>

            {credentialsLoading ? (
              <Card>
                <CardContent className="p-6 text-center">
                  <Loader2 className="w-5 h-5 mx-auto animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground mt-2">Loading connections...</p>
                </CardContent>
              </Card>
            ) : credentials.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-center">
                  <Key className="w-7 h-7 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No platform connections yet.</p>
                  <p className="text-xs text-muted-foreground mt-1">Add connections to prepare for automated data collection.</p>
                </CardContent>
              </Card>
            ) : (
              Object.entries(groupedByClient).map(([cId, creds]) => {
                const client = clients.find(c => c.id === cId);
                return (
                  <div key={cId} className="space-y-2">
                    <h4 className="text-sm font-medium text-muted-foreground">{client?.name || cId}</h4>
                    <div className="grid gap-2">
                      {creds.map(cred => (
                        <CredentialCard
                          key={cred.id}
                          credential={cred}
                          onDelete={(id) => deleteMutation.mutate(id)}
                          onTest={(id) => testMutation.mutate(id)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
