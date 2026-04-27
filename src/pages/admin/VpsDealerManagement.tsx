/**
 * Super Admin → Dealers (VPS-backed).
 *
 * Lists every dealer from the self-hosted backend with their primary admin
 * user, plan, and subscription expiry. Pending sign-ups float to the top
 * with Approve / Reject actions; active dealers can be Suspended/Reactivated.
 *
 * All requests go through vpsAuthedFetch so the super_admin JWT travels
 * automatically and gets re-issued on 401 (the same single-flight refresh
 * used by the rest of the VPS data layer).
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, XCircle, Ban, RefreshCw, Loader2, ExternalLink, KeyRound, Pencil, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { vpsAuthedFetch } from "@/lib/vpsAuthClient";
import { env } from "@/lib/env";
import { saImpersonation } from "@/lib/saImpersonation";
import EditDealerDialog from "./EditDealerDialog";

interface VpsDealer {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  email: string | null;
  owner_name: string | null;
  business_type: string | null;
  city: string | null;
  district: string | null;
  country: string | null;
  postal_code: string | null;
  tax_id: string | null;
  trade_license_no: string | null;
  website: string | null;
  logo_url: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  admin_email: string | null;
  admin_name: string | null;
  admin_user_id: string | null;
  admin_status: string | null;
  subscription_status: string | null;
  subscription_end: string | null;
  plan_name: string | null;
}

async function vpsJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await vpsAuthedFetch(path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body as T;
}

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  active: "default",
  suspended: "destructive",
  rejected: "outline",
};

const VpsDealerManagement = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState<{ action: string; dealer: VpsDealer } | null>(null);
  const [editing, setEditing] = useState<VpsDealer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VpsDealer | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const openErp = (d: VpsDealer) => {
    saImpersonation.start(d.id, d.name, false);
    toast({ title: `Opening ERP as ${d.name}`, description: "Read-only by default. Toggle Edit mode in the banner to make changes." });
    navigate("/dashboard");
  };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["vps-dealers"],
    queryFn: () => vpsJson<{ dealers: VpsDealer[] }>("/api/dealers"),
  });

  const dealers = (data?.dealers ?? []).slice().sort((a, b) => {
    // Pending first, then by created_at desc
    if (a.status === "pending" && b.status !== "pending") return -1;
    if (a.status !== "pending" && b.status === "pending") return 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const decisionMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: string }) => {
      return vpsJson(`/api/dealers/${id}/${action}`, { method: "POST", body: JSON.stringify({}) });
    },
    onSuccess: (_res, vars) => {
      const verb = {
        approve: "approved", reject: "rejected",
        suspend: "suspended", reactivate: "reactivated",
      }[vars.action] || vars.action;
      toast({ title: `Dealer ${verb}` });
      qc.invalidateQueries({ queryKey: ["vps-dealers"] });
      setConfirm(null);
    },
    onError: (e: Error) => {
      toast({ variant: "destructive", title: "Action failed", description: e.message });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ dealer, mode }: { dealer: VpsDealer; mode: "temp" | "link" }) => {
      await vpsJson(`/api/dealers/${dealer.id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ mode }),
      });
      return dealer;
    },
    onSuccess: (dealer) => {
      toast({
        title: "Password reset sent",
        description: `New credentials emailed to ${dealer.admin_email} and SMS sent to ${dealer.phone || "their phone"}.`,
      });
    },
    onError: (e: Error) => {
      toast({ variant: "destructive", title: "Reset failed", description: e.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ dealer, confirmName }: { dealer: VpsDealer; confirmName: string }) => {
      return vpsJson(`/api/dealers/${dealer.id}?confirm=${encodeURIComponent(confirmName)}`, {
        method: "DELETE",
      });
    },
    onSuccess: (_res, vars) => {
      toast({
        title: "Dealer deleted",
        description: `${vars.dealer.name} and all associated data have been permanently removed.`,
      });
      qc.invalidateQueries({ queryKey: ["vps-dealers"] });
      setDeleteTarget(null);
      setDeleteConfirmText("");
    },
    onError: (e: Error) => {
      toast({ variant: "destructive", title: "Delete failed", description: e.message });
    },
  });

  if (env.AUTH_BACKEND !== "vps") {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          This page is connected to the self-hosted backend. Auth backend is currently
          set to <code>{env.AUTH_BACKEND}</code> — switch to <code>vps</code> to use it.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>All Dealers</CardTitle>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 rounded border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {(error as Error).message}
          </div>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Business</TableHead>
              <TableHead>Owner / Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Expiry</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-6"><Loader2 className="h-4 w-4 animate-spin inline" /></TableCell></TableRow>
            ) : dealers.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">No dealers</TableCell></TableRow>
            ) : (
              dealers.map((d) => (
                <TableRow key={d.id} className={d.status === "pending" ? "bg-amber-500/5" : ""}>
                  <TableCell className="font-medium">{d.name}</TableCell>
                  <TableCell>
                    <div className="text-sm">{d.admin_name || "—"}</div>
                    <div className="text-xs text-muted-foreground">{d.admin_email || "—"}</div>
                  </TableCell>
                  <TableCell className="text-sm">{d.phone || "—"}</TableCell>
                  <TableCell className="text-sm">{d.plan_name || "—"}</TableCell>
                  <TableCell className="text-sm">{d.subscription_end || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[d.status] || "outline"}>{d.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditing(d)}
                      title="Edit dealer information"
                    >
                      <Pencil className="h-4 w-4 mr-1" /> Edit
                    </Button>
                    {d.status === "pending" && (
                      <>
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => setConfirm({ action: "approve", dealer: d })}
                          disabled={decisionMutation.isPending}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setConfirm({ action: "reject", dealer: d })}
                          disabled={decisionMutation.isPending}
                        >
                          <XCircle className="h-4 w-4 mr-1" /> Reject
                        </Button>
                      </>
                    )}
                    {(d.status === "active" || d.status === "suspended") && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => openErp(d)}
                        title="Open this dealer's ERP as Super Admin"
                      >
                        <ExternalLink className="h-4 w-4 mr-1" /> Open ERP
                      </Button>
                    )}
                    {d.status === "active" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirm({ action: "suspend", dealer: d })}
                        disabled={decisionMutation.isPending}
                      >
                        <Ban className="h-4 w-4 mr-1" /> Suspend
                      </Button>
                    )}
                    {d.status === "suspended" && (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => setConfirm({ action: "reactivate", dealer: d })}
                        disabled={decisionMutation.isPending}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1" /> Reactivate
                      </Button>
                    )}
                    {(d.status === "active" || d.status === "suspended") && d.admin_email && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (window.confirm(`Reset password for ${d.name}?\n\nA new temporary password will be emailed to ${d.admin_email} and SMS-sent to ${d.phone || "the registered phone"}. All current sessions will be signed out.`)) {
                            resetPasswordMutation.mutate({ dealer: d, mode: "temp" });
                          }
                        }}
                        disabled={resetPasswordMutation.isPending}
                        title="Reset dealer admin password"
                      >
                        <KeyRound className="h-4 w-4 mr-1" /> Reset Password
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => {
                        setDeleteTarget(d);
                        setDeleteConfirmText("");
                      }}
                      disabled={deleteMutation.isPending}
                      title="Permanently delete dealer and all data"
                    >
                      <Trash2 className="h-4 w-4 mr-1" /> Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.action === "approve" && "Approve dealer?"}
              {confirm?.action === "reject" && "Reject dealer?"}
              {confirm?.action === "suspend" && "Suspend dealer?"}
              {confirm?.action === "reactivate" && "Reactivate dealer?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm && (
                <>
                  Business: <b>{confirm.dealer.name}</b>
                  <br />Owner: {confirm.dealer.admin_name || "—"} ({confirm.dealer.admin_email || "—"})
                  <br />Phone: {confirm.dealer.phone || "—"}
                  <br /><br />
                  {confirm.action === "approve" &&
                    "The dealer will be notified by SMS and email and will be able to log in immediately."}
                  {confirm.action === "reject" &&
                    "The dealer will receive a notification that their registration was not approved. They will not be able to log in."}
                  {confirm.action === "suspend" &&
                    "All active sessions will be revoked. The dealer cannot log in until reactivated."}
                  {confirm.action === "reactivate" &&
                    "The dealer will be able to log in again."}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={decisionMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                confirm && decisionMutation.mutate({ id: confirm.dealer.id, action: confirm.action })
              }
              disabled={decisionMutation.isPending}
            >
              {decisionMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) {
            setDeleteTarget(null);
            setDeleteConfirmText("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">
              Permanently delete dealer?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                {deleteTarget && (
                  <div className="text-sm">
                    Business: <b>{deleteTarget.name}</b>
                    <br />Owner: {deleteTarget.admin_name || "—"} ({deleteTarget.admin_email || "—"})
                    <br />Phone: {deleteTarget.phone || "—"}
                  </div>
                )}
                <div className="rounded border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                  This will <b>permanently delete</b> the dealer, their admin user,
                  all sales, purchases, products, customers, suppliers, payments,
                  and every other record tied to this account. This action
                  <b> cannot be undone</b>.
                </div>
                <div className="space-y-2">
                  <Label htmlFor="delete-confirm" className="text-sm">
                    Type the business name <b>{deleteTarget?.name}</b> to confirm:
                  </Label>
                  <Input
                    id="delete-confirm"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder={deleteTarget?.name || ""}
                    autoComplete="off"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={
                deleteMutation.isPending ||
                !deleteTarget ||
                deleteConfirmText.trim().toLowerCase() !==
                  (deleteTarget?.name || "").trim().toLowerCase()
              }
              onClick={() =>
                deleteTarget &&
                deleteMutation.mutate({
                  dealer: deleteTarget,
                  confirmName: deleteTarget.name,
                })
              }
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EditDealerDialog dealer={editing} onClose={() => setEditing(null)} />
    </Card>
  );
};

export default VpsDealerManagement;
