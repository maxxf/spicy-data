import { useState } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Zap,
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
} from "lucide-react";
import { SiUbereats, SiDoordash, SiGrubhub } from "react-icons/si";
import type { PlatformCredential, DataSyncJob, Client } from "@shared/schema";

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
        <Button data-testid="button-add-credential">
          <Plus className="w-4 h-4 mr-2" />
          Add Platform Connection
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
              <SelectTrigger data-testid="select-client">
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
              <SelectTrigger data-testid="select-platform">
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

function SyncJobRow({ job }: { job: DataSyncJob }) {
  const statusIcon = {
    pending: <Clock className="w-3.5 h-3.5 text-muted-foreground" />,
    running: <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />,
    completed: <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />,
    failed: <XCircle className="w-3.5 h-3.5 text-destructive" />,
  };

  return (
    <div className="flex items-center gap-3 py-2 px-3 text-sm border-b last:border-b-0" data-testid={`row-sync-job-${job.id}`}>
      {statusIcon[job.status as keyof typeof statusIcon] || <Clock className="w-3.5 h-3.5" />}
      <span className="font-medium capitalize">{job.platform}</span>
      <Badge variant="secondary" className="text-xs">{job.reportType}</Badge>
      {job.dateRangeStart && job.dateRangeEnd && (
        <span className="text-xs text-muted-foreground">{job.dateRangeStart} - {job.dateRangeEnd}</span>
      )}
      <span className="ml-auto text-xs text-muted-foreground">
        {job.recordsProcessed ? `${job.recordsProcessed} records` : ""}
      </span>
      {job.errorMessage && (
        <span className="text-xs text-destructive truncate max-w-[200px]">{job.errorMessage}</span>
      )}
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {job.createdAt ? new Date(job.createdAt).toLocaleDateString() : ""}
      </span>
    </div>
  );
}

export default function AutomationsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isSuperAdmin = user?.role === "super_admin";

  const { data: credentials = [], isLoading: credentialsLoading } = useQuery<PlatformCredential[]>({
    queryKey: ["/api/platform-credentials"],
    enabled: isSuperAdmin,
  });

  const { data: syncJobs = [], isLoading: jobsLoading } = useQuery<DataSyncJob[]>({
    queryKey: ["/api/sync-jobs"],
    enabled: isSuperAdmin,
  });

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

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
              Only super admins can manage platform automations and credentials.
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
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Zap className="w-5 h-5" />
            Automations
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Connect delivery platforms for automated data collection
          </p>
        </div>
        <AddCredentialDialog clients={clients} />
      </div>

      <div className="grid gap-4 grid-cols-3">
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

      <div className="space-y-4">
        <h2 className="text-base font-semibold">Platform Connections</h2>
        {credentialsLoading ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Loader2 className="w-6 h-6 mx-auto animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground mt-2">Loading connections...</p>
            </CardContent>
          </Card>
        ) : credentials.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Key className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">No platform connections yet.</p>
              <p className="text-xs text-muted-foreground mt-1">Add connections to start automated data collection.</p>
            </CardContent>
          </Card>
        ) : (
          Object.entries(groupedByClient).map(([cId, creds]) => {
            const client = clients.find(c => c.id === cId);
            return (
              <div key={cId} className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground">{client?.name || cId}</h3>
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

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Sync History</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/sync-jobs"] })}
            data-testid="button-refresh-sync-jobs"
          >
            <RefreshCw className="w-4 h-4 mr-1" />
            Refresh
          </Button>
        </div>
        <Card>
          <CardContent className="p-0">
            {jobsLoading ? (
              <div className="p-6 text-center">
                <Loader2 className="w-5 h-5 mx-auto animate-spin text-muted-foreground" />
              </div>
            ) : syncJobs.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No sync jobs have run yet. Add platform connections to begin.
              </div>
            ) : (
              syncJobs.map(job => <SyncJobRow key={job.id} job={job} />)
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
