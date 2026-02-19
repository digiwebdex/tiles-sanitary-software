import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { recordSubscriptionPayment } from "@/services/subscriptionPaymentService";
import { Plus, CalendarPlus, Play, Pause, RefreshCw, Banknote } from "lucide-react";
import { differenceInDays, parseISO, format } from "date-fns";

interface SubRow {
  id: string;
  dealer_id: string;
  plan_id: string;
  status: string;
  start_date: string;
  end_date: string | null;
  dealers: { name: string } | null;
  plans: { name: string; id: string } | null;
}

const GRACE_DAYS = 3;

function getDisplayStatus(sub: SubRow) {
  if (sub.status === "suspended") return "suspended";
  if (sub.status === "active") {
    // Check if expiring within 7 days
    if (sub.end_date) {
      const daysLeft = differenceInDays(parseISO(sub.end_date), new Date());
      if (daysLeft >= 0 && daysLeft <= 7) return "expiring_soon";
    }
    return "active";
  }
  if (sub.status === "expired" && sub.end_date) {
    const daysSinceExpiry = differenceInDays(new Date(), parseISO(sub.end_date));
    if (daysSinceExpiry <= GRACE_DAYS) return "grace";
  }
  return "expired";
}

function getDaysRemaining(sub: SubRow) {
  if (!sub.end_date) return "∞";
  const days = differenceInDays(parseISO(sub.end_date), new Date());
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Today";
  return `${days}d`;
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { variant: "default" | "destructive" | "secondary" | "outline"; className: string }> = {
    active: { variant: "default", className: "bg-green-600 hover:bg-green-700 text-white border-0" },
    expiring_soon: { variant: "outline", className: "border-yellow-500 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400" },
    grace: { variant: "outline", className: "border-yellow-500 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400" },
    expired: { variant: "destructive", className: "" },
    suspended: { variant: "secondary", className: "" },
  };
  const c = config[status] ?? config.expired;
  return (
    <Badge variant={c.variant} className={`capitalize text-xs ${c.className}`}>
      {status === "grace" ? "Grace Period" : status === "expiring_soon" ? "Expiring Soon" : status}
    </Badge>
  );
}

const SubscriptionManagement = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: subscriptions = [], isLoading } = useQuery({
    queryKey: ["admin-subscriptions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*, dealers(name), plans(name, id)")
        .order("start_date", { ascending: false });
      if (error) throw new Error(error.message);
      return data as SubRow[];
    },
  });

  const { data: dealers = [] } = useQuery({
    queryKey: ["admin-dealers-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("dealers").select("id, name").order("name");
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const { data: plans = [] } = useQuery({
    queryKey: ["admin-plans-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("plans").select("id, name").order("name");
      if (error) throw new Error(error.message);
      return data;
    },
  });

  // Assign dialog
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignForm, setAssignForm] = useState({ dealer_id: "", plan_id: "", start_date: "", end_date: "" });

  const assignMutation = useMutation({
    mutationFn: async () => {
      if (!assignForm.dealer_id || !assignForm.plan_id) throw new Error("Dealer and Plan are required");
      const { error } = await supabase.from("subscriptions").insert({
        dealer_id: assignForm.dealer_id,
        plan_id: assignForm.plan_id,
        start_date: assignForm.start_date || undefined,
        end_date: assignForm.end_date || null,
        status: "active" as any,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast({ title: "Subscription assigned" });
      qc.invalidateQueries({ queryKey: ["admin-subscriptions"] });
      setAssignOpen(false);
      setAssignForm({ dealer_id: "", plan_id: "", start_date: "", end_date: "" });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editSub, setEditSub] = useState<SubRow | null>(null);
  const [editForm, setEditForm] = useState({ end_date: "", status: "", plan_id: "" });

  // Payment dialog
  const [payOpen, setPayOpen] = useState(false);
  const [paySub, setPaySub] = useState<SubRow | null>(null);
  const [payForm, setPayForm] = useState({
    amount: "",
    payment_date: format(new Date(), "yyyy-MM-dd"),
    payment_method: "cash" as "cash" | "bank" | "mobile_banking",
    payment_status: "paid" as "paid" | "partial" | "pending",
    extend_months: "1",
    note: "",
  });

  const openPayment = (sub: SubRow) => {
    setPaySub(sub);
    setPayForm({
      amount: "",
      payment_date: format(new Date(), "yyyy-MM-dd"),
      payment_method: "cash",
      payment_status: "paid",
      extend_months: "1",
      note: "",
    });
    setPayOpen(true);
  };

  const paymentMutation = useMutation({
    mutationFn: async () => {
      if (!paySub || !user) throw new Error("Missing context");
      if (!payForm.amount || Number(payForm.amount) <= 0) throw new Error("Amount must be > 0");
      await recordSubscriptionPayment({
        subscription_id: paySub.id,
        dealer_id: paySub.dealer_id,
        amount: Number(payForm.amount),
        payment_date: payForm.payment_date,
        payment_method: payForm.payment_method,
        payment_status: payForm.payment_status,
        collected_by: user.id,
        note: payForm.note || undefined,
        extend_months: payForm.payment_status === "paid" ? Number(payForm.extend_months) || 1 : undefined,
      });
    },
    onSuccess: () => {
      toast({ title: "Payment recorded successfully" });
      qc.invalidateQueries({ queryKey: ["admin-subscriptions"] });
      setPayOpen(false);
      setPaySub(null);
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Payment Error", description: e.message }),
  });

  const openEdit = (sub: SubRow) => {
    setEditSub(sub);
    setEditForm({
      end_date: sub.end_date ?? "",
      status: sub.status,
      plan_id: sub.plan_id,
    });
    setEditOpen(true);
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editSub) return;
      const { error } = await supabase
        .from("subscriptions")
        .update({
          end_date: editForm.end_date || null,
          status: editForm.status as any,
          plan_id: editForm.plan_id,
        })
        .eq("id", editSub.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast({ title: "Subscription updated" });
      qc.invalidateQueries({ queryKey: ["admin-subscriptions"] });
      setEditOpen(false);
      setEditSub(null);
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  // Quick toggle status
  const toggleMutation = useMutation({
    mutationFn: async ({ id, newStatus }: { id: string; newStatus: string }) => {
      const { error } = await supabase
        .from("subscriptions")
        .update({ status: newStatus as any })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast({ title: "Status updated" });
      qc.invalidateQueries({ queryKey: ["admin-subscriptions"] });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const getRowClass = (displayStatus: string) => {
    if (displayStatus === "expired") return "bg-destructive/5";
    if (displayStatus === "grace" || displayStatus === "expiring_soon") return "bg-yellow-500/5";
    return "";
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Subscription Management</CardTitle>
          <Button size="sm" onClick={() => setAssignOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Assign Plan
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
                    <TableHead>Dealer</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>End</TableHead>
                    <TableHead>Remaining</TableHead>
                    <TableHead className="w-56">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subscriptions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">
                        No subscriptions
                      </TableCell>
                    </TableRow>
                  ) : (
                    subscriptions.map((sub) => {
                      const displayStatus = getDisplayStatus(sub);
                      return (
                        <TableRow key={sub.id} className={getRowClass(displayStatus)}>
                          <TableCell className="font-medium">{sub.dealers?.name ?? "—"}</TableCell>
                          <TableCell>{sub.plans?.name ?? "—"}</TableCell>
                          <TableCell><StatusBadge status={displayStatus} /></TableCell>
                          <TableCell className="text-xs">{sub.start_date}</TableCell>
                          <TableCell className="text-xs">{sub.end_date ?? "—"}</TableCell>
                          <TableCell className="text-xs font-mono">{getDaysRemaining(sub)}</TableCell>
                          <TableCell>
                            <div className="flex gap-1 flex-wrap">
                              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openPayment(sub)}>
                                <Banknote className="mr-1 h-3 w-3" /> Payment
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openEdit(sub)}>
                                <CalendarPlus className="mr-1 h-3 w-3" /> Edit
                              </Button>
                              {sub.status === "active" ? (
                                <Button
                                  size="sm" variant="outline" className="h-7 text-xs text-yellow-600"
                                  onClick={() => toggleMutation.mutate({ id: sub.id, newStatus: "suspended" })}
                                >
                                  <Pause className="mr-1 h-3 w-3" /> Suspend
                                </Button>
                              ) : (
                                <Button
                                  size="sm" variant="outline" className="h-7 text-xs text-green-600"
                                  onClick={() => toggleMutation.mutate({ id: sub.id, newStatus: "active" })}
                                >
                                  <Play className="mr-1 h-3 w-3" /> Activate
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Assign Plan Dialog */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign Plan to Dealer</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Dealer *</Label>
              <Select value={assignForm.dealer_id} onValueChange={(v) => setAssignForm({ ...assignForm, dealer_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select dealer" /></SelectTrigger>
                <SelectContent>
                  {dealers.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Plan *</Label>
              <Select value={assignForm.plan_id} onValueChange={(v) => setAssignForm({ ...assignForm, plan_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select plan" /></SelectTrigger>
                <SelectContent>
                  {plans.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input type="date" value={assignForm.start_date} onChange={(e) => setAssignForm({ ...assignForm, start_date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input type="date" value={assignForm.end_date} onChange={(e) => setAssignForm({ ...assignForm, end_date: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button onClick={() => assignMutation.mutate()} disabled={assignMutation.isPending}>Assign</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Subscription Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Subscription — {editSub?.dealers?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Change Plan</Label>
              <Select value={editForm.plan_id} onValueChange={(v) => setEditForm({ ...editForm, plan_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {plans.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>End Date (extend or set)</Label>
              <Input type="date" value={editForm.end_date} onChange={(e) => setEditForm({ ...editForm, end_date: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
              <RefreshCw className="mr-1 h-4 w-4" /> Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record Payment Dialog */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment — {paySub?.dealers?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Amount (৳) *</Label>
                <Input
                  type="number"
                  min="0"
                  value={payForm.amount}
                  onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label>Payment Date *</Label>
                <Input
                  type="date"
                  value={payForm.payment_date}
                  onChange={(e) => setPayForm({ ...payForm, payment_date: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Payment Method *</Label>
                <Select
                  value={payForm.payment_method}
                  onValueChange={(v: "cash" | "bank" | "mobile_banking") =>
                    setPayForm({ ...payForm, payment_method: v })
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="bank">Bank</SelectItem>
                    <SelectItem value="mobile_banking">Mobile Banking</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Payment Status *</Label>
                <Select
                  value={payForm.payment_status}
                  onValueChange={(v: "paid" | "partial" | "pending") =>
                    setPayForm({ ...payForm, payment_status: v })
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="paid">Paid (Full)</SelectItem>
                    <SelectItem value="partial">Partial</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {payForm.payment_status === "paid" && (
              <div className="space-y-2">
                <Label>Extend subscription by (months)</Label>
                <Input
                  type="number"
                  min="1"
                  max="12"
                  value={payForm.extend_months}
                  onChange={(e) => setPayForm({ ...payForm, extend_months: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Full payment will activate the subscription and extend end date.
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label>Note</Label>
              <Textarea
                value={payForm.note}
                onChange={(e) => setPayForm({ ...payForm, note: e.target.value })}
                placeholder="Optional payment note…"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(false)}>Cancel</Button>
            <Button onClick={() => paymentMutation.mutate()} disabled={paymentMutation.isPending}>
              <Banknote className="mr-1 h-4 w-4" /> Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SubscriptionManagement;
