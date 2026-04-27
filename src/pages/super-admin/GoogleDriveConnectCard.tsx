/**
 * GoogleDriveConnectCard
 * ------------------------------------------------------------------
 * Per-Super-Admin Google Drive OAuth + Picker integration.
 *
 * - Shows Connect / Disconnect state via /api/google-drive/status.
 * - "Connect Google Drive" opens the Google consent screen in a popup.
 *   The popup posts back via window.opener.postMessage on success.
 * - "Pick Backup File" opens Google Picker, scoped to drive.file —
 *   the user explicitly picks a file from their own Drive.
 * - On pick, the file is sent to /api/google-drive/restore which
 *   downloads it server-side and runs the restore script.
 */
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { vpsAuthedFetch } from "@/lib/vpsAuthClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Cloud, AlertTriangle, RotateCcw, LinkIcon, Unlink, FileSearch } from "lucide-react";

declare global {
  interface Window {
    google?: any;
    gapi?: any;
  }
}

async function vpsJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await vpsAuthedFetch(path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body as T;
}

function loadScript(src: string, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById(id)) return resolve();
    const s = document.createElement("script");
    s.id = id;
    s.src = src;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

interface PickedFile {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

export function GoogleDriveConnectCard({ onRestoreStarted }: { onRestoreStarted?: () => void }) {
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<PickedFile | null>(null);
  const [type, setType] = useState<"postgresql" | "mysql" | "mongodb">("postgresql");
  const [dbName, setDbName] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const accessTokenRef = useRef<string | null>(null);

  const { data: status, refetch: refetchStatus, isLoading } = useQuery({
    queryKey: ["gdrive-status"],
    queryFn: () =>
      vpsJson<{
        connected: boolean;
        email: string | null;
        configured: boolean;
        client_id: string | null;
      }>("/api/google-drive/status"),
  });

  // Listen for OAuth popup callback
  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      if (ev.data?.type === "gdrive_oauth") {
        if (ev.data.ok) {
          toast.success(ev.data.message || "Google Drive connected");
          refetchStatus();
        } else {
          toast.error(ev.data.message || "Failed to connect Google Drive");
        }
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [refetchStatus]);

  const connect = async () => {
    try {
      const r = await vpsJson<{ url: string }>("/api/google-drive/auth-url");
      const w = window.open(
        r.url,
        "gdrive-oauth",
        "width=520,height=640,menubar=no,toolbar=no",
      );
      if (!w) toast.error("Popup blocked. Please allow popups for this site.");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const disconnectMut = useMutation({
    mutationFn: () => vpsJson("/api/google-drive/disconnect", { method: "POST" }),
    onSuccess: () => {
      toast.success("Google Drive disconnected");
      setPicked(null);
      accessTokenRef.current = null;
      refetchStatus();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const restoreMut = useMutation({
    mutationFn: (vars: {
      file_id: string;
      file_name: string;
      type: string;
      database_name: string;
      confirm: string;
    }) =>
      vpsJson<{ ok: boolean; restore_id: string; message: string }>(
        "/api/google-drive/restore",
        { method: "POST", body: JSON.stringify(vars) },
      ),
    onSuccess: (r) => {
      toast.success(r.message);
      setPicked(null);
      setDbName("");
      setConfirmText("");
      onRestoreStarted?.();
    },
    onError: (e: any) => toast.error(e.message),
  });

  // ─── Google Picker ───
  const openPicker = async () => {
    if (!status?.client_id) {
      toast.error("Google client ID not configured on server.");
      return;
    }
    setPicking(true);
    try {
      // Load Google APIs
      await loadScript("https://accounts.google.com/gsi/client", "g-gsi");
      await loadScript("https://apis.google.com/js/api.js", "g-api");

      // Load Picker module
      await new Promise<void>((resolve, reject) => {
        window.gapi.load("picker", { callback: resolve, onerror: reject });
      });

      // Get an access token via GIS for Picker scope (drive.file)
      // Picker needs an OAuth token to filter to user's own files.
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: status.client_id,
        scope: "https://www.googleapis.com/auth/drive.file",
        callback: (resp: any) => {
          if (resp.error) {
            toast.error(`Google: ${resp.error}`);
            setPicking(false);
            return;
          }
          accessTokenRef.current = resp.access_token;
          showPicker(resp.access_token);
        },
      });
      tokenClient.requestAccessToken({ prompt: "" });
    } catch (err: any) {
      toast.error(err.message || "Failed to open Picker");
      setPicking(false);
    }
  };

  const showPicker = (accessToken: string) => {
    const view = new window.google.picker.DocsView(window.google.picker.ViewId.DOCS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(false);

    const picker = new window.google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(accessToken)
      // Optional: only set if you have a Google API key — Picker works without it for most use-cases
      .setCallback((data: any) => {
        if (data.action === window.google.picker.Action.PICKED) {
          const doc = data.docs[0];
          setPicked({
            id: doc.id,
            name: doc.name,
            mimeType: doc.mimeType,
            sizeBytes: Number(doc.sizeBytes || 0),
          });
          // Pre-fill db name guess from filename if it matches our pattern
          // e.g. tilessaas_postgresql_tilessaas_2026-04-27_02-00-01.sql.gz → tilessaas
          const m = doc.name.match(/^[^_]+_(postgresql|mysql|mongodb)_([^_]+)_/i);
          if (m) {
            setType(m[1].toLowerCase() as any);
            setDbName(m[2]);
          }
          setPicking(false);
        } else if (data.action === window.google.picker.Action.CANCEL) {
          setPicking(false);
        }
      })
      .build();
    picker.setVisible(true);
  };

  const formatBytes = (n: number) => {
    if (!n) return "—";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(n) / Math.log(k));
    return `${(n / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Cloud className="h-5 w-5 text-primary" />
          Connect Your Google Drive
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Sign in with your own Google account to pick a backup file from your
          Drive and restore it. Each Super Admin connects independently.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Checking connection…</div>
        ) : !status?.configured ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <strong>OAuth not configured.</strong> Server is missing
            <code className="mx-1 px-1 bg-muted rounded text-xs">GOOGLE_OAUTH_CLIENT_ID</code>
            and
            <code className="mx-1 px-1 bg-muted rounded text-xs">GOOGLE_OAUTH_CLIENT_SECRET</code>.
          </div>
        ) : status.connected ? (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Badge variant="default" className="gap-1">
                <LinkIcon className="h-3 w-3" /> Connected
              </Badge>
              <span className="text-sm font-medium">{status.email || "Google account"}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={openPicker} disabled={picking}>
                <FileSearch className="h-4 w-4 mr-2" />
                {picking ? "Opening Picker…" : "Pick Backup File"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => disconnectMut.mutate()}
                disabled={disconnectMut.isPending}
              >
                <Unlink className="h-4 w-4 mr-2" />
                Disconnect
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-muted-foreground">
              Not connected. Click connect to authorize this app to access files
              you pick from your Google Drive.
            </div>
            <Button size="sm" onClick={connect}>
              <Cloud className="h-4 w-4 mr-2" />
              Connect Google Drive
            </Button>
          </div>
        )}

        {/* Picked file confirmation */}
        {picked && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
            <div className="text-sm">
              <div className="font-medium">{picked.name}</div>
              <div className="text-xs text-muted-foreground">
                {formatBytes(picked.sizeBytes)} • {picked.mimeType}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">DB Type</label>
                <Select value={type} onValueChange={(v) => setType(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="postgresql">PostgreSQL</SelectItem>
                    <SelectItem value="mysql">MySQL</SelectItem>
                    <SelectItem value="mongodb">MongoDB</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Target Database</label>
                <Input
                  value={dbName}
                  onChange={(e) => setDbName(e.target.value)}
                  placeholder="e.g. tilessaas"
                  className="font-mono"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Re-type the database name to confirm
              </label>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="Re-type database name"
                className="font-mono"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setPicked(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={
                  !dbName ||
                  confirmText !== dbName ||
                  restoreMut.isPending
                }
                onClick={() =>
                  restoreMut.mutate({
                    file_id: picked.id,
                    file_name: picked.name,
                    type,
                    database_name: dbName,
                    confirm: confirmText,
                  })
                }
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                {restoreMut.isPending ? "Starting…" : "Restore from Drive"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
