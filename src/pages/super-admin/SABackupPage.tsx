import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { env } from "@/lib/env";
import { vpsAuthedFetch } from "@/lib/vpsAuthClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Database, HardDrive, CheckCircle, XCircle, Clock, Download, RotateCcw, Search,
  Shield, AlertTriangle, FileArchive, RefreshCw, Activity, Play, Cloud, Upload,
} from "lucide-react";
import { format } from "date-fns";
import { GoogleDriveConnectCard } from "./GoogleDriveConnectCard";

const isVps = env.AUTH_BACKEND === "vps";

async function vpsJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await vpsAuthedFetch(path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body as T;
}

const formatBytes = (bytes: number) => {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
  uploaded: { label: "Uploaded", variant: "default", icon: CheckCircle },
  success: { label: "Success", variant: "default", icon: CheckCircle },
  failed: { label: "Failed", variant: "destructive", icon: XCircle },
  pending: { label: "Pending", variant: "secondary", icon: Clock },
  running: { label: "Running", variant: "outline", icon: Activity },
  downloading: { label: "Downloading", variant: "outline", icon: Download },
  restoring: { label: "Restoring", variant: "outline", icon: RotateCcw },
};

const SABackupPage = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [restoreDialog, setRestoreDialog] = useState<any>(null);
  const [confirmText, setConfirmText] = useState("");
  const [restoreLogsDialog, setRestoreLogsDialog] = useState<any>(null);
  const [driveType, setDriveType] = useState<string>("postgresql");
  const [driveRestoreDialog, setDriveRestoreDialog] = useState<any>(null);
  const [driveDbName, setDriveDbName] = useState("");
  const [driveConfirmText, setDriveConfirmText] = useState("");
  const [manualType, setManualType] = useState<string>("all");
  const [uploadDialog, setUploadDialog] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadDbName, setUploadDbName] = useState("");
  const [uploadNotes, setUploadNotes] = useState("");
  const [uploading, setUploading] = useState(false);

  const { data: backups, isLoading: backupsLoading, refetch: refetchBackups } = useQuery({
    queryKey: ["sa-backups"],
    queryFn: async () => {
      const r = await vpsJson<{ backups: any[] }>("/api/backups");
      return r.backups || [];
    },
  });

  const { data: restores, isLoading: restoresLoading, refetch: refetchRestores } = useQuery({
    queryKey: ["sa-restores"],
    queryFn: async () => {
      const r = await vpsJson<{ restores: any[] }>("/api/backups/restores");
      return r.restores || [];
    },
  });

  // Google Drive backup files (VPS only)
  const { data: driveFiles, isLoading: driveLoading, refetch: refetchDrive } = useQuery({
    queryKey: ["sa-drive-files", driveType],
    queryFn: async () => {
      if (!isVps) return [];
      const r = await vpsJson<{ files: any[] }>(
        `/api/backups/drive?type=${encodeURIComponent(driveType)}`,
      );
      return r.files || [];
    },
    enabled: isVps,
  });

  // Manual backup trigger
  const runBackupMutation = useMutation({
    mutationFn: async (type: string) => {
      if (!isVps) throw new Error("Manual backup is only available on the VPS backend.");
      return vpsJson<{ ok: boolean; message: string }>("/api/backups/run", {
        method: "POST",
        body: JSON.stringify({ type }),
      });
    },
    onSuccess: (r) => {
      toast.success(r.message || "Backup started");
      setTimeout(() => refetchBackups(), 5000);
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Drive restore
  const driveRestoreMutation = useMutation({
    mutationFn: async (vars: {
      type: string; database_name: string; remote_path: string; app_name?: string; confirm: string;
    }) => {
      return vpsJson<{ ok: boolean; restore_id: string; message: string }>(
        "/api/backups/restore",
        { method: "POST", body: JSON.stringify(vars) },
      );
    },
    onSuccess: (r) => {
      toast.success(r.message);
      setDriveRestoreDialog(null);
      setDriveDbName("");
      setDriveConfirmText("");
      refetchRestores();
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Local restore (vps_local / uploaded) — P0: now requires a signed token
  // issued by /api/backups/restore-local/token. The token is HMAC-bound to
  // (backup_id, current super_admin user_id) and expires in 2 minutes.
  const localRestoreMutation = useMutation({
    mutationFn: async (vars: {
      backup_id: string; database_name: string; type?: string; confirm: string; notes?: string;
    }) => {
      // Step 1: get signed confirmation token
      const { token } = await vpsJson<{ token: string; expires_at: string }>(
        "/api/backups/restore-local/token",
        { method: "POST", body: JSON.stringify({ backup_id: vars.backup_id }) },
      );
      // Step 2: actually trigger the restore with the token attached
      return vpsJson<{ ok: boolean; restore_id: string; message: string }>(
        "/api/backups/restore-local",
        { method: "POST", body: JSON.stringify({ ...vars, restore_token: token }) },
      );
    },
    onSuccess: (r) => {
      toast.success(r.message);
      setRestoreDialog(null);
      setConfirmText("");
      refetchRestores();
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Upload
  const handleUpload = async () => {
    if (!uploadFile) { toast.error("Choose a backup file first."); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", uploadFile);
      if (uploadDbName) fd.append("database_name", uploadDbName);
      if (uploadNotes) fd.append("notes", uploadNotes);
      const res = await vpsAuthedFetch("/api/backups/upload", {
        method: "POST",
        body: fd,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Upload failed (${res.status})`);
      toast.success(body.message || "Upload complete");
      setUploadDialog(false);
      setUploadFile(null);
      setUploadDbName("");
      setUploadNotes("");
      refetchBackups();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (b: any) => {
    try {
      const res = await vpsAuthedFetch(`/api/backups/download/${b.id}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Download failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = b.file_name || "backup";
      document.body.appendChild(a); a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) { toast.error(err.message); }
  };

  const stats = {
    total: backups?.length || 0,
    successful: backups?.filter((b) => b.status === "uploaded").length || 0,
    failed: backups?.filter((b) => b.status === "failed").length || 0,
    totalSize: backups?.reduce((sum, b) => sum + (b.file_size || 0), 0) || 0,
  };

  const filteredBackups = (backups || []).filter((b) => {
    const matchSearch = !searchTerm ||
      b.database_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.app_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (b.file_name || "").toLowerCase().includes(searchTerm.toLowerCase());
    const matchType = typeFilter === "all" || b.backup_type === typeFilter;
    const matchStatus = statusFilter === "all" || b.status === statusFilter;
    const matchSource = sourceFilter === "all" || (b.source || "auto") === sourceFilter;
    return matchSearch && matchType && matchStatus && matchSource;
  });

  const handleRestoreClick = (backup: any) => {
    setRestoreDialog(backup);
    setConfirmText("");
  };

  const handleRestoreConfirm = async () => {
    if (confirmText !== "RESTORE") {
      toast.error('Type "RESTORE" to confirm');
      return;
    }

    if (isVps) {
      const src = restoreDialog.source || "auto";
      // Local file restore (VPS local copy or uploaded)
      if ((src === "vps_local" || src === "uploaded") && restoreDialog.local_path) {
        localRestoreMutation.mutate({
          backup_id: restoreDialog.id,
          database_name: restoreDialog.database_name || "tilessaas",
          type: restoreDialog.backup_type,
          confirm: "RESTORE",
        });
        return;
      }
      // Otherwise treat as Google Drive remote restore
      const remotePath =
        restoreDialog.remote_path ||
        `${restoreDialog.backup_type}/${restoreDialog.app_name}/${restoreDialog.file_name}`;
      driveRestoreMutation.mutate({
        type: restoreDialog.backup_type,
        database_name: restoreDialog.database_name,
        remote_path: remotePath,
        app_name: restoreDialog.app_name,
        confirm: restoreDialog.database_name,
      });
      setRestoreDialog(null);
      return;
    }

    try {
      const { error } = await supabase.from("restore_logs").insert({
        backup_log_id: restoreDialog.id,
        backup_file_name: restoreDialog.file_name || "unknown",
        backup_type: restoreDialog.backup_type,
        database_name: restoreDialog.database_name,
        app_name: restoreDialog.app_name,
        initiated_by_name: "Super Admin (UI)",
        status: "pending",
        logs: `Restore requested for ${restoreDialog.file_name} at ${new Date().toISOString()}.`,
      });
      if (error) throw error;

      toast.success("Restore request logged. Execute the restore command on VPS.");
      setRestoreDialog(null);
      refetchRestores();
    } catch (err: any) {
      toast.error("Failed to log restore: " + err.message);
    }
  };

  const StatusBadge = ({ status }: { status: string }) => {
    const config = statusConfig[status] || statusConfig.pending;
    const Icon = config.icon;
    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const TypeBadge = ({ type }: { type: string }) => {
    const colors: Record<string, string> = {
      postgresql: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      mysql: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
      mongodb: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    };
    return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${colors[type] || ""}`}>{type.toUpperCase()}</span>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            Backup & Restore
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Database backup management and restore operations</p>
        </div>
        <div className="flex items-center gap-2">
          {isVps && (
            <>
              <Select value={manualType} onValueChange={setManualType}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Databases</SelectItem>
                  <SelectItem value="postgresql">PostgreSQL</SelectItem>
                  <SelectItem value="mysql">MySQL</SelectItem>
                  <SelectItem value="mongodb">MongoDB</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                onClick={() => runBackupMutation.mutate(manualType)}
                disabled={runBackupMutation.isPending}
              >
                <Play className="h-4 w-4 mr-2" />
                {runBackupMutation.isPending ? "Starting…" : "Run Backup Now"}
              </Button>
            </>
          )}
          {isVps && (
            <Button variant="outline" size="sm" onClick={() => setUploadDialog(true)}>
              <Upload className="h-4 w-4 mr-2" /> Upload Backup
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => { refetchBackups(); refetchRestores(); refetchDrive(); }}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Database className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Total Backups</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.successful}</p>
                <p className="text-xs text-muted-foreground">Successful</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-destructive/10">
                <XCircle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.failed}</p>
                <p className="text-xs text-muted-foreground">Failed</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <HardDrive className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatBytes(stats.totalSize)}</p>
                <p className="text-xs text-muted-foreground">Total Size</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="backups" className="space-y-4">
        <TabsList>
          <TabsTrigger value="backups">Backup History</TabsTrigger>
          <TabsTrigger value="restores">Restore History</TabsTrigger>
          {isVps && <TabsTrigger value="drive">Google Drive Restore</TabsTrigger>}
          <TabsTrigger value="guide">Setup Guide</TabsTrigger>
        </TabsList>

        {/* ── Backup History ── */}
        <TabsContent value="backups" className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search backups..." className="pl-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="DB Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="postgresql">PostgreSQL</SelectItem>
                <SelectItem value="mysql">MySQL</SelectItem>
                <SelectItem value="mongodb">MongoDB</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="uploaded">Uploaded</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Source" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                <SelectItem value="auto">Automatic</SelectItem>
                <SelectItem value="vps_local">VPS Local Copy</SelectItem>
                <SelectItem value="uploaded">Manual Upload</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardContent className="p-0">
              {backupsLoading ? (
                <div className="p-8 text-center text-muted-foreground">Loading backups...</div>
              ) : filteredBackups.length === 0 ? (
                <div className="p-8 text-center">
                  <FileArchive className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No backups found</p>
                  <p className="text-xs text-muted-foreground mt-1">Backups will appear here after the cron job runs</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 font-medium">Date</th>
                        <th className="text-left p-3 font-medium">Source</th>
                        <th className="text-left p-3 font-medium">Type</th>
                        <th className="text-left p-3 font-medium">App</th>
                        <th className="text-left p-3 font-medium">Database</th>
                        <th className="text-left p-3 font-medium">File</th>
                        <th className="text-left p-3 font-medium">Size</th>
                        <th className="text-left p-3 font-medium">Status</th>
                        <th className="text-left p-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBackups.map((b) => (
                        <tr key={b.id} className="border-b hover:bg-muted/30">
                          <td className="p-3 text-xs whitespace-nowrap">
                            {b.created_at ? format(new Date(b.created_at), "MMM dd, yyyy HH:mm") : "-"}
                          </td>
                          <td className="p-3 text-xs">
                            <Badge variant="outline" className="text-[10px]">
                              {(b.source || "auto") === "auto" ? "Automatic"
                                : (b.source === "vps_local" ? "VPS Local" : "Uploaded")}
                            </Badge>
                          </td>
                          <td className="p-3"><TypeBadge type={b.backup_type} /></td>
                          <td className="p-3 font-medium">{b.app_name}</td>
                          <td className="p-3">{b.database_name}</td>
                          <td className="p-3 text-xs max-w-[200px] truncate" title={b.file_name || ""}>{b.file_name || "-"}</td>
                          <td className="p-3 text-xs">{formatBytes(b.file_size || 0)}</td>
                          <td className="p-3"><StatusBadge status={b.status} /></td>
                          <td className="p-3 flex gap-1">
                            {isVps && b.local_path && (
                              <Button variant="ghost" size="sm" className="gap-1 text-xs"
                                onClick={() => handleDownload(b)}>
                                <Download className="h-3 w-3" /> Download
                              </Button>
                            )}
                            {(b.status === "uploaded" || b.source === "vps_local" || b.source === "uploaded") && (
                              <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => handleRestoreClick(b)}>
                                <RotateCcw className="h-3 w-3" /> Restore
                              </Button>
                            )}
                            {b.error_message && (
                              <Button variant="ghost" size="sm" className="gap-1 text-xs text-destructive" onClick={() => toast.error(b.error_message)}>
                                <AlertTriangle className="h-3 w-3" /> Error
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Restore History ── */}
        <TabsContent value="restores" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Restore History & Audit Log</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {restoresLoading ? (
                <div className="p-8 text-center text-muted-foreground">Loading restore history...</div>
              ) : (restores || []).length === 0 ? (
                <div className="p-8 text-center">
                  <RotateCcw className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No restore operations yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 font-medium">Date</th>
                        <th className="text-left p-3 font-medium">Type</th>
                        <th className="text-left p-3 font-medium">Database</th>
                        <th className="text-left p-3 font-medium">Backup File</th>
                        <th className="text-left p-3 font-medium">Initiated By</th>
                        <th className="text-left p-3 font-medium">Safety Backup</th>
                        <th className="text-left p-3 font-medium">Status</th>
                        <th className="text-left p-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(restores || []).map((r) => (
                        <tr key={r.id} className="border-b hover:bg-muted/30">
                          <td className="p-3 text-xs whitespace-nowrap">
                            {r.created_at ? format(new Date(r.created_at), "MMM dd, yyyy HH:mm") : "-"}
                          </td>
                          <td className="p-3"><TypeBadge type={r.backup_type} /></td>
                          <td className="p-3">{r.database_name}</td>
                          <td className="p-3 text-xs max-w-[180px] truncate">{r.backup_file_name}</td>
                          <td className="p-3 text-xs">{r.initiated_by_name || "-"}</td>
                          <td className="p-3">
                            {r.pre_restore_backup_taken ? (
                              <Badge variant="outline" className="text-green-600">Yes</Badge>
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground">No</Badge>
                            )}
                          </td>
                          <td className="p-3"><StatusBadge status={r.status} /></td>
                          <td className="p-3">
                            {r.logs && (
                              <Button variant="ghost" size="sm" className="text-xs" onClick={() => setRestoreLogsDialog(r)}>
                                View Logs
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Setup Guide ── */}
        {/* ── Google Drive Restore ── */}
        {isVps && (
          <TabsContent value="drive" className="space-y-4">
            <GoogleDriveConnectCard onRestoreStarted={() => refetchRestores()} />
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Cloud className="h-5 w-5 text-primary" /> Google Drive Backups
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Browse backup files stored on Google Drive (via rclone) and restore directly.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={driveType} onValueChange={setDriveType}>
                    <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="postgresql">PostgreSQL</SelectItem>
                      <SelectItem value="mysql">MySQL</SelectItem>
                      <SelectItem value="mongodb">MongoDB</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={() => refetchDrive()}>
                    <RefreshCw className="h-4 w-4 mr-2" /> Reload
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {driveLoading ? (
                  <div className="p-8 text-center text-muted-foreground">Loading Google Drive…</div>
                ) : (driveFiles || []).length === 0 ? (
                  <div className="p-8 text-center">
                    <Cloud className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                    <p className="text-muted-foreground">No backup files found on Google Drive</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Ensure rclone is configured (remote: gdrive:tileserp-backups)
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left p-3 font-medium">Modified</th>
                          <th className="text-left p-3 font-medium">Path</th>
                          <th className="text-left p-3 font-medium">Size</th>
                          <th className="text-left p-3 font-medium">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(driveFiles || []).map((f: any) => (
                          <tr key={f.path} className="border-b hover:bg-muted/30">
                            <td className="p-3 text-xs whitespace-nowrap">
                              {f.modified_at ? format(new Date(f.modified_at), "MMM dd, yyyy HH:mm") : "-"}
                            </td>
                            <td className="p-3 text-xs font-mono max-w-[420px] truncate" title={f.path}>{f.path}</td>
                            <td className="p-3 text-xs">{formatBytes(f.size || 0)}</td>
                            <td className="p-3">
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-1 text-xs"
                                onClick={() => {
                                  setDriveRestoreDialog({ ...f, type: driveType });
                                  setDriveDbName("");
                                  setDriveConfirmText("");
                                }}
                              >
                                <RotateCcw className="h-3 w-3" /> Restore
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="guide" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">VPS Backup Setup Guide</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="space-y-2">
                <h3 className="font-semibold">1. Install Required Packages</h3>
                <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap">{`sudo apt update && sudo apt install -y rclone mailutils postgresql-client gzip curl python3`}</pre>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold">2. Setup rclone for Google Drive</h3>
                <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap">{`rclone config
# Choose: n (New remote)
# Name: gdrive
# Storage: drive (Google Drive)
# Follow OAuth prompts
# Test: rclone lsd gdrive:`}</pre>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold">3. Deploy Backup Scripts</h3>
                <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap">{`sudo mkdir -p /opt/tileserp-backup/{data,logs,tmp}
# Copy scripts from project's scripts/backup/ folder
sudo cp scripts/backup/backup.sh /opt/tileserp-backup/
sudo cp scripts/backup/restore.sh /opt/tileserp-backup/
sudo cp scripts/backup/backup.env.example /opt/tileserp-backup/.env
# Edit .env with real credentials
sudo nano /opt/tileserp-backup/.env
# Make executable
sudo chmod +x /opt/tileserp-backup/backup.sh
sudo chmod +x /opt/tileserp-backup/restore.sh
sudo chmod 600 /opt/tileserp-backup/.env`}</pre>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold">4. Setup Daily Cron Job</h3>
                <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap">{`# Add to root's crontab
sudo crontab -e
# Add this line (runs at 2:00 AM daily):
0 2 * * * /opt/tileserp-backup/backup.sh >> /opt/tileserp-backup/logs/cron.log 2>&1`}</pre>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold">5. Test Backup</h3>
                <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap">{`sudo /opt/tileserp-backup/backup.sh
# Check logs:
ls -la /opt/tileserp-backup/logs/
# Check Google Drive:
rclone ls gdrive:TilesERP-Backups/`}</pre>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold">6. Manual Restore (VPS CLI)</h3>
                <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap">{`sudo /opt/tileserp-backup/restore.sh postgresql tilessaas \\
  postgresql/tilessaas/2025-01-15/tilessaas_postgresql_tilessaas_2025-01-15_02-00-00.sql.gz`}</pre>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Restore Confirmation Dialog ── */}
      <Dialog open={!!restoreDialog} onOpenChange={() => setRestoreDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Confirm Database Restore
            </DialogTitle>
            <DialogDescription>
              This action will log a restore request. You must execute the restore command on the VPS.
            </DialogDescription>
          </DialogHeader>

          {restoreDialog && (
            <div className="space-y-4">
              <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Type:</span>
                  <span className="font-medium">{restoreDialog.backup_type?.toUpperCase()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Database:</span>
                  <span className="font-medium">{restoreDialog.database_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">App:</span>
                  <span className="font-medium">{restoreDialog.app_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">File:</span>
                  <span className="font-medium text-xs">{restoreDialog.file_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Backup Date:</span>
                  <span className="font-medium">{restoreDialog.created_at ? format(new Date(restoreDialog.created_at), "MMM dd, yyyy HH:mm") : "-"}</span>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-destructive">
                  Type <strong>RESTORE</strong> to confirm:
                </p>
                <Input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="Type RESTORE"
                  className="font-mono"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreDialog(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleRestoreConfirm} disabled={confirmText !== "RESTORE"}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Log Restore Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Drive Restore Dialog ── */}
      <Dialog open={!!driveRestoreDialog} onOpenChange={() => setDriveRestoreDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Restore from Google Drive
            </DialogTitle>
            <DialogDescription>
              This will overwrite the target database. A safety backup will be created automatically by the restore script.
            </DialogDescription>
          </DialogHeader>

          {driveRestoreDialog && (
            <div className="space-y-4">
              <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3 space-y-2 text-xs">
                <div><span className="text-muted-foreground">Type:</span> <span className="font-medium">{driveRestoreDialog.type?.toUpperCase()}</span></div>
                <div><span className="text-muted-foreground">File:</span> <span className="font-mono">{driveRestoreDialog.path}</span></div>
                <div><span className="text-muted-foreground">Size:</span> <span className="font-medium">{formatBytes(driveRestoreDialog.size || 0)}</span></div>
              </div>

              <div className="space-y-1.5">
                <p className="text-sm font-medium">Target database name:</p>
                <Input
                  value={driveDbName}
                  onChange={(e) => setDriveDbName(e.target.value)}
                  placeholder="e.g. tilessaas"
                  className="font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <p className="text-sm font-medium text-destructive">
                  Type the database name again to confirm:
                </p>
                <Input
                  value={driveConfirmText}
                  onChange={(e) => setDriveConfirmText(e.target.value)}
                  placeholder="Re-type database name"
                  className="font-mono"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDriveRestoreDialog(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!driveDbName || driveConfirmText !== driveDbName) {
                  toast.error("Database name and confirmation must match");
                  return;
                }
                driveRestoreMutation.mutate({
                  type: driveRestoreDialog.type,
                  database_name: driveDbName,
                  remote_path: driveRestoreDialog.path,
                  app_name: driveRestoreDialog.path.split("/")[1] || "unknown",
                  confirm: driveConfirmText,
                });
              }}
              disabled={
                driveRestoreMutation.isPending ||
                !driveDbName ||
                driveConfirmText !== driveDbName
              }
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              {driveRestoreMutation.isPending ? "Starting…" : "Start Restore"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Restore Logs Dialog ── */}
      <Dialog open={!!restoreLogsDialog} onOpenChange={() => setRestoreLogsDialog(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Restore Logs</DialogTitle>
            <DialogDescription>
              {restoreLogsDialog?.backup_file_name} → {restoreLogsDialog?.database_name}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[400px] w-full rounded-md border">
            <pre className="p-4 text-xs font-mono whitespace-pre-wrap">
              {restoreLogsDialog?.logs || "No logs available"}
            </pre>
          </ScrollArea>
          {restoreLogsDialog?.error_message && (
            <div className="bg-destructive/10 p-3 rounded-lg text-sm text-destructive">
              <strong>Error:</strong> {restoreLogsDialog.error_message}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Upload Backup Dialog ── */}
      <Dialog open={uploadDialog} onOpenChange={(o) => !uploading && setUploadDialog(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" /> Upload Backup File
            </DialogTitle>
            <DialogDescription>
              Upload a previously downloaded backup (.sql.gz, .dump, .archive.gz). It will be stored in the project's isolated VPS backup directory.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input type="file" accept=".gz,.dump,.tar,.archive"
              onChange={(e) => setUploadFile(e.target.files?.[0] || null)} />
            <Input placeholder="Database name (optional, e.g. tilessaas)"
              value={uploadDbName} onChange={(e) => setUploadDbName(e.target.value)} />
            <Input placeholder="Notes (optional)"
              value={uploadNotes} onChange={(e) => setUploadNotes(e.target.value)} />
            {uploadFile && (
              <p className="text-xs text-muted-foreground">
                {uploadFile.name} — {formatBytes(uploadFile.size)}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadDialog(false)} disabled={uploading}>Cancel</Button>
            <Button onClick={handleUpload} disabled={!uploadFile || uploading}>
              <Upload className="h-4 w-4 mr-2" />
              {uploading ? "Uploading…" : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SABackupPage;
