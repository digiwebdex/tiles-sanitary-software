import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Ban, CheckCircle, UserPlus, Eye, Trash2, ExternalLink, KeyRound } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { saImpersonation } from "@/lib/saImpersonation";
import { vpsAuthedFetch } from "@/lib/vpsAuthClient";

interface DealerForm {
  name: string;
  phone: string;
  address: string;
}

interface AdminUserForm {
  name: string;
  email: string;
  password: string;
}

interface SubscriptionForm {
  plan_id: string;
  start_date: string;
  end_date: string;
}

const emptyDealerForm: DealerForm = { name: "", phone: "", address: "" };
const emptyAdminForm: AdminUserForm = { name: "", email: "", password: "" };
const todayStr = new Date().toISOString().split("T")[0];
const emptySubForm: SubscriptionForm = { plan_id: "", start_date: todayStr, end_date: "" };

const DealerManagement = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const openErp = (d: any) => {
    saImpersonation.start(d.id, d.name, false);
    toast({ title: `Opening ERP as ${d.name}`, description: "Read-only by default. Toggle Edit mode in the banner to make changes." });
    navigate("/dashboard");
  };

  const resetPasswordMutation = useMutation({
    mutationFn: async (dealer: any) => {
      const res = await vpsAuthedFetch(`/api/dealers/${dealer.id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ mode: "temp" }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Reset failed (${res.status})`);
      return dealer;
    },
    onSuccess: (dealer: any) => {
      toast({
        title: "Password reset sent",
        description: `New temporary password emailed and SMS-sent to ${dealer.name}'s admin. Old sessions revoked.`,
      });
    },
    onError: (e: Error) => {
      toast({ variant: "destructive", title: "Reset failed", description: e.message });
    },
  });

  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<DealerForm>(emptyDealerForm);
  const [createAdmin, setCreateAdmin] = useState(true);
  const [adminForm, setAdminForm] = useState<AdminUserForm>(emptyAdminForm);
  const [assignPlan, setAssignPlan] = useState(true);
  const [subForm, setSubForm] = useState<SubscriptionForm>(emptySubForm);

  // Add user dialog
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [addUserDealerId, setAddUserDealerId] = useState("");
  const [addUserForm, setAddUserForm] = useState<AdminUserForm>(emptyAdminForm);


  // Detail sheet
  const [detailDealer, setDetailDealer] = useState<any>(null);

  // Delete dialog
  const [deleteDealer, setDeleteDealer] = useState<any>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");

  // ─── Queries ───
  const { data: dealers = [], isLoading } = useQuery({
    queryKey: ["admin-dealers-full"],
    queryFn: async () => {
      const [dealersRes, subsRes, profilesRes] = await Promise.all([
        supabase.from("dealers").select("*").order("created_at", { ascending: false }),
        supabase.from("subscriptions").select("*, subscription_plans!subscriptions_plan_id_fkey(name)").order("start_date", { ascending: false }),
        supabase.from("profiles").select("id, name, email, dealer_id, status"),
      ]);
      if (dealersRes.error) throw new Error(dealersRes.error.message);
      if (subsRes.error) throw new Error(subsRes.error.message);

      const subs = subsRes.data ?? [];
      const profiles = profilesRes.data ?? [];

      const mapped = (dealersRes.data ?? []).map((d: any) => {
        const latestSub = subs.find((s: any) => s.dealer_id === d.id);
        const dealerUsers = profiles.filter((p: any) => p.dealer_id === d.id);
        return {
          ...d,
          subscription: latestSub ?? null,
          userCount: dealerUsers.length,
          users: dealerUsers,
        };
      });

      // Pending approvals float to the top so super admin sees them first.
      return mapped.sort((a: any, b: any) => {
        const aPending = a.status === "pending" ? 0 : 1;
        const bPending = b.status === "pending" ? 0 : 1;
        return aPending - bPending;
      });
    },
  });

  const { data: plans = [] } = useQuery({
    queryKey: ["admin-plans-select"],
    queryFn: async () => {
      const { data, error } = await supabase.from("subscription_plans").select("id, name, monthly_price, yearly_price").eq("is_active", true).order("monthly_price");
      if (error) throw new Error(error.message);
      return data;
    },
  });

  // ─── Mutations ───
  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["admin-dealers-full"] });
    qc.invalidateQueries({ queryKey: ["admin-dealer-users"] });
    qc.invalidateQueries({ queryKey: ["sa-dashboard-full"] });
    qc.invalidateQueries({ queryKey: ["admin-subscriptions"] });
  };

  const createDealerMutation = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Dealer name is required");

      if (editId) {
        const { error } = await supabase
          .from("dealers")
          .update({ name: form.name, phone: form.phone || null, address: form.address || null })
          .eq("id", editId);
        if (error) throw new Error(error.message);
        return;
      }

      // 1. Create dealer
      const { data: newDealer, error: dealerErr } = await supabase
        .from("dealers")
        .insert({ name: form.name, phone: form.phone || null, address: form.address || null })
        .select("id")
        .single();
      if (dealerErr) throw new Error(dealerErr.message);

      // 2. Create dealer_admin user
      if (createAdmin) {
        if (!adminForm.name.trim()) throw new Error("Admin name is required");
        if (!adminForm.email.trim()) throw new Error("Admin email is required");
        if (adminForm.password.length < 6) throw new Error("Password must be at least 6 characters");

        const res = await supabase.functions.invoke("create-dealer-user", {
          body: {
            name: adminForm.name.trim(),
            email: adminForm.email.trim().toLowerCase(),
            password: adminForm.password,
            dealer_id: newDealer.id,
            role: "dealer_admin",
          },
        });
        if (res.error) throw new Error(res.error.message || "Failed to create admin user");
        if (res.data?.error) throw new Error(res.data.error);
      }

      // 3. Assign plan / create subscription
      if (assignPlan && subForm.plan_id) {
        const { error: subErr } = await supabase.from("subscriptions").insert({
          dealer_id: newDealer.id,
          plan_id: subForm.plan_id,
          start_date: subForm.start_date || todayStr,
          end_date: subForm.end_date || null,
          status: "active" as any,
        });
        if (subErr) throw new Error("Dealer created but subscription failed: " + subErr.message);
      }
    },
    onSuccess: () => {
      const parts = [];
      if (!editId) {
        parts.push("Dealer created");
        if (createAdmin) parts.push("admin user added");
        if (assignPlan && subForm.plan_id) parts.push("subscription assigned");
      } else {
        parts.push("Dealer updated");
      }
      toast({ title: parts.join(", ") });
      invalidateAll();
      closeDialog();
    },
    onError: (e: Error) => {
      toast({ variant: "destructive", title: "Error", description: e.message });
    },
  });

  const addUserMutation = useMutation({
    mutationFn: async () => {
      if (!addUserForm.name.trim()) throw new Error("Name is required");
      if (!addUserForm.email.trim()) throw new Error("Email is required");
      if (addUserForm.password.length < 6) throw new Error("Password must be at least 6 characters");

      const res = await supabase.functions.invoke("create-dealer-user", {
        body: {
          name: addUserForm.name.trim(),
          email: addUserForm.email.trim().toLowerCase(),
          password: addUserForm.password,
          dealer_id: addUserDealerId,
          role: "dealer_admin",
        },
      });
      if (res.error) throw new Error(res.error.message || "Failed to create user");
      if (res.data?.error) throw new Error(res.data.error);
    },
    onSuccess: () => {
      toast({ title: "Dealer admin user created" });
      invalidateAll();
      setAddUserOpen(false);
      setAddUserForm(emptyAdminForm);
    },
    onError: (e: Error) => {
      toast({ variant: "destructive", title: "Error", description: e.message });
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, newStatus }: { id: string; newStatus: string }) => {
      const { error } = await supabase
        .from("dealers")
        .update({ status: newStatus } as any)
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast({ title: "Dealer status updated" });
      invalidateAll();
    },
    onError: (e: Error) => {
      toast({ variant: "destructive", title: "Error", description: e.message });
    },
  });

  const deleteDealerMutation = useMutation({
    mutationFn: async () => {
      if (!deleteDealer) throw new Error("No dealer selected");
      if (deleteConfirmName.trim() !== deleteDealer.name.trim()) {
        throw new Error("Confirmation name does not match");
      }
      const res = await supabase.functions.invoke("delete-dealer", {
        body: { dealer_id: deleteDealer.id, confirm_name: deleteConfirmName.trim() },
      });
      if (res.error) throw new Error(res.error.message || "Failed to delete dealer");
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: (data: any) => {
      toast({
        title: `Dealer "${data?.deleted_dealer ?? ""}" deleted`,
        description: `Removed ${data?.deleted_auth_users ?? 0} user(s) and all related records.`,
      });
      invalidateAll();
      setDeleteDealer(null);
      setDeleteConfirmName("");
    },
    onError: (e: Error) => {
      toast({ variant: "destructive", title: "Delete failed", description: e.message });
    },
  });


  // ─── Helpers ───
  const closeDialog = () => {
    setDialogOpen(false);
    setEditId(null);
    setForm(emptyDealerForm);
    setCreateAdmin(true);
    setAdminForm(emptyAdminForm);
    setAssignPlan(true);
    setSubForm(emptySubForm);
  };

  const openCreate = () => {
    setEditId(null);
    setForm(emptyDealerForm);
    setCreateAdmin(true);
    setAdminForm(emptyAdminForm);
    setAssignPlan(true);
    setSubForm(emptySubForm);
    setDialogOpen(true);
  };

  const openEdit = (dealer: any) => {
    setEditId(dealer.id);
    setForm({ name: dealer.name, phone: dealer.phone ?? "", address: dealer.address ?? "" });
    setCreateAdmin(false);
    setAssignPlan(false);
    setDialogOpen(true);
  };

  const subStatusBadge = (sub: any) => {
    if (!sub) return <Badge variant="outline" className="text-xs">No Plan</Badge>;
    const variant = sub.status === "active" ? "default" : sub.status === "expired" ? "destructive" : "secondary";
    return <Badge variant={variant} className="capitalize text-xs">{sub.status}</Badge>;
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">All Dealers</CardTitle>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" /> Add Dealer
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dealer Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Subscription</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead>Onboarding</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-48">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dealers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">No dealers</TableCell>
                    </TableRow>
                  ) : (
                    dealers.map((d: any) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-medium">{d.name}</TableCell>
                        <TableCell>{d.phone ?? "—"}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            {subStatusBadge(d.subscription)}
                            {d.subscription?.subscription_plans?.name && (
                              <span className="text-xs text-muted-foreground">{d.subscription.subscription_plans.name}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{d.subscription?.end_date ?? "—"}</TableCell>
                        <TableCell>
                          {(() => {
                            const hasSub = !!d.subscription;
                            const hasUsers = d.userCount > 0;
                            if (hasSub && hasUsers) return <Badge variant="default" className="text-xs">Ready</Badge>;
                            if (!hasSub && !hasUsers) return <Badge variant="destructive" className="text-xs">Setup Pending</Badge>;
                            return <Badge variant="secondary" className="text-xs">Incomplete</Badge>;
                          })()}
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const status = (d.status ?? "active") as string;
                            if (status === "pending") {
                              return (
                                <Badge className="bg-amber-500 text-white hover:bg-amber-600 capitalize text-xs">
                                  Pending Approval
                                </Badge>
                              );
                            }
                            return (
                              <Badge
                                variant={status === "active" ? "default" : "destructive"}
                                className="capitalize text-xs"
                              >
                                {status}
                              </Badge>
                            );
                          })()}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setDetailDealer(d)} title="View Details">
                              <Eye className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openEdit(d)} title="Edit">
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => {
                                setAddUserDealerId(d.id);
                                setAddUserForm(emptyAdminForm);
                                setAddUserOpen(true);
                              }}
                              title="Add User"
                            >
                              <UserPlus className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className={`h-7 text-xs ${
                                (d.status ?? "active") === "active"
                                  ? "border-amber-500 text-amber-500 hover:bg-amber-500/10"
                                  : "border-green-500 text-green-500 hover:bg-green-500/10"
                              }`}
                              onClick={() =>
                                toggleStatusMutation.mutate({
                                  id: d.id,
                                  newStatus: (d.status ?? "active") === "active" ? "suspended" : "active",
                                })
                              }
                              title={(d.status ?? "active") === "active" ? "Suspend" : "Activate"}
                            >
                              {(d.status ?? "active") === "active" ? <Ban className="h-3 w-3" /> : <CheckCircle className="h-3 w-3" />}
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-7 text-xs"
                              onClick={() => {
                                setDeleteDealer(d);
                                setDeleteConfirmName("");
                              }}
                              title="Delete Dealer"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Create / Edit Dealer Dialog ─── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Dealer" : "Create Dealer"}</DialogTitle>
            {!editId && (
              <DialogDescription>
                Create a new dealer with admin user and subscription.
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Dealer Info */}
            <div className="space-y-3">
              <p className="text-sm font-semibold text-foreground">Dealer Information</p>
              <div className="space-y-2">
                <Label>Dealer Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Enter dealer name" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone" />
                </div>
                <div className="space-y-2">
                  <Label>Address</Label>
                  <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Address" />
                </div>
              </div>
            </div>

            {/* Admin User — create only */}
            {!editId && (
              <>
                <Separator />
                <div className="flex items-center gap-2">
                  <Checkbox id="create-admin" checked={createAdmin} onCheckedChange={(v) => setCreateAdmin(v === true)} />
                  <Label htmlFor="create-admin" className="cursor-pointer font-semibold text-sm">Create Dealer Admin User</Label>
                </div>
                {createAdmin && (
                  <div className="space-y-3 pl-3 border-l-2 border-primary/20">
                    <div className="space-y-2">
                      <Label>Admin Name *</Label>
                      <Input value={adminForm.name} onChange={(e) => setAdminForm({ ...adminForm, name: e.target.value })} placeholder="Full name" />
                    </div>
                    <div className="space-y-2">
                      <Label>Email *</Label>
                      <Input type="email" value={adminForm.email} onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })} placeholder="admin@example.com" />
                    </div>
                    <div className="space-y-2">
                      <Label>Password *</Label>
                      <Input type="password" value={adminForm.password} onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })} placeholder="Min 6 characters" />
                    </div>
                    <p className="text-xs text-muted-foreground">Role: <Badge variant="secondary" className="text-xs ml-1">dealer_admin</Badge></p>
                  </div>
                )}

                {/* Subscription */}
                <Separator />
                <div className="flex items-center gap-2">
                  <Checkbox id="assign-plan" checked={assignPlan} onCheckedChange={(v) => setAssignPlan(v === true)} />
                  <Label htmlFor="assign-plan" className="cursor-pointer font-semibold text-sm">Assign Subscription Plan</Label>
                </div>
                {assignPlan && (
                  <div className="space-y-3 pl-3 border-l-2 border-primary/20">
                    <div className="space-y-2">
                      <Label>Plan *</Label>
                      <Select value={subForm.plan_id} onValueChange={(v) => setSubForm({ ...subForm, plan_id: v })}>
                        <SelectTrigger><SelectValue placeholder="Select plan" /></SelectTrigger>
                        <SelectContent>
                          {plans.map((p: any) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name} — {formatCurrency(p.monthly_price)}/mo
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Start Date</Label>
                        <Input type="date" value={subForm.start_date} onChange={(e) => setSubForm({ ...subForm, start_date: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>End Date</Label>
                        <Input type="date" value={subForm.end_date} onChange={(e) => setSubForm({ ...subForm, end_date: e.target.value })} />
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button onClick={() => createDealerMutation.mutate()} disabled={createDealerMutation.isPending}>
              {createDealerMutation.isPending ? "Saving…" : editId ? "Update" : "Create Dealer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Add User Dialog ─── */}
      <Dialog open={addUserOpen} onOpenChange={setAddUserOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Dealer Admin User</DialogTitle>
            <DialogDescription>Create a new dealer_admin user for this dealer.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={addUserForm.name} onChange={(e) => setAddUserForm({ ...addUserForm, name: e.target.value })} placeholder="Full name" />
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input type="email" value={addUserForm.email} onChange={(e) => setAddUserForm({ ...addUserForm, email: e.target.value })} placeholder="admin@example.com" />
            </div>
            <div className="space-y-2">
              <Label>Password *</Label>
              <Input type="password" value={addUserForm.password} onChange={(e) => setAddUserForm({ ...addUserForm, password: e.target.value })} placeholder="Min 6 characters" />
            </div>
            <p className="text-xs text-muted-foreground">Role: <Badge variant="secondary" className="text-xs ml-1">dealer_admin</Badge></p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddUserOpen(false)}>Cancel</Button>
            <Button onClick={() => addUserMutation.mutate()} disabled={addUserMutation.isPending}>
              {addUserMutation.isPending ? "Creating…" : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* ─── Dealer Detail Sheet ─── */}
      <Sheet open={!!detailDealer} onOpenChange={(open) => !open && setDetailDealer(null)}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{detailDealer?.name}</SheetTitle>
            <SheetDescription>Dealer details and associated information.</SheetDescription>
          </SheetHeader>
          {detailDealer && (
            <div className="space-y-6 mt-6">
              {/* Info */}
              <div className="space-y-3">
                <p className="text-sm font-semibold text-foreground">General</p>
                <div className="grid grid-cols-2 gap-y-2 text-sm">
                  <span className="text-muted-foreground">Phone</span>
                  <span className="text-foreground">{detailDealer.phone ?? "—"}</span>
                  <span className="text-muted-foreground">Address</span>
                  <span className="text-foreground">{detailDealer.address ?? "—"}</span>
                  <span className="text-muted-foreground">Status</span>
                  <span>
                    <Badge variant={(detailDealer.status ?? "active") === "active" ? "default" : "destructive"} className="capitalize text-xs">
                      {detailDealer.status ?? "active"}
                    </Badge>
                  </span>
                  <span className="text-muted-foreground">Created</span>
                  <span className="text-foreground">{new Date(detailDealer.created_at).toLocaleDateString("en-IN")}</span>
                </div>
              </div>

              <Separator />

              {/* Subscription */}
              <div className="space-y-3">
                <p className="text-sm font-semibold text-foreground">Subscription</p>
                {detailDealer.subscription ? (
                  <div className="grid grid-cols-2 gap-y-2 text-sm">
                    <span className="text-muted-foreground">Plan</span>
                    <span className="text-foreground">{detailDealer.subscription.subscription_plans?.name ?? "—"}</span>
                    <span className="text-muted-foreground">Status</span>
                    <span>{subStatusBadge(detailDealer.subscription)}</span>
                    <span className="text-muted-foreground">Start</span>
                    <span className="text-foreground">{detailDealer.subscription.start_date}</span>
                    <span className="text-muted-foreground">End</span>
                    <span className="text-foreground">{detailDealer.subscription.end_date ?? "—"}</span>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No subscription assigned.</p>
                )}
              </div>

              <Separator />

              {/* Users */}
              <div className="space-y-3">
                <p className="text-sm font-semibold text-foreground">Users ({detailDealer.userCount})</p>
                {detailDealer.users?.length > 0 ? (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Name</TableHead>
                          <TableHead className="text-xs">Email</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detailDealer.users.map((u: any) => (
                          <TableRow key={u.id}>
                            <TableCell className="text-sm">{u.name}</TableCell>
                            <TableCell className="text-sm">{u.email}</TableCell>
                            <TableCell>
                              <Badge variant={u.status === "active" ? "default" : "destructive"} className="text-xs capitalize">{u.status}</Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No users assigned.</p>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ─── Delete Dealer Confirm Dialog ─── */}
      <Dialog
        open={!!deleteDealer}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteDealer(null);
            setDeleteConfirmName("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete Dealer Permanently</DialogTitle>
            <DialogDescription>
              This will permanently delete the dealer <strong>{deleteDealer?.name}</strong> along with
              <strong> ALL </strong> associated data: users, customers, products, sales, purchases,
              quotations, ledgers, and subscriptions. This action <strong>cannot be undone</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-foreground">
              <p>To confirm, type the dealer name exactly:</p>
              <p className="mt-1 font-mono font-semibold">{deleteDealer?.name}</p>
            </div>
            <div className="space-y-2">
              <Label>Confirm dealer name</Label>
              <Input
                value={deleteConfirmName}
                onChange={(e) => setDeleteConfirmName(e.target.value)}
                placeholder="Type dealer name to confirm"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDealer(null);
                setDeleteConfirmName("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteDealerMutation.mutate()}
              disabled={
                deleteDealerMutation.isPending ||
                deleteConfirmName.trim() !== (deleteDealer?.name?.trim() ?? "")
              }
            >
              {deleteDealerMutation.isPending ? "Deleting…" : "Delete Permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default DealerManagement;
