import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Mail, MessageSquare, Clock, Users, Check, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

import { vpsAuthedFetch } from "@/lib/vpsAuthClient";

async function vpsJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await vpsAuthedFetch(path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as any)?.error || `Request failed (${res.status})`);
  return body as T;
}

interface PlanForm {
  name: string;
  monthly_price: string;
  yearly_price: string;
  max_users: string;
  email_enabled: boolean;
  sms_enabled: boolean;
  daily_summary_enabled: boolean;
  is_active: boolean;
}

const emptyForm: PlanForm = {
  name: "",
  monthly_price: "0",
  yearly_price: "0",
  max_users: "1",
  email_enabled: false,
  sms_enabled: false,
  daily_summary_enabled: false,
  is_active: true,
};

const PlanManagement = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<PlanForm>(emptyForm);

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["admin-subscription-plans"],
    queryFn: async () => {
      const body = await vpsJson<{ plans: any[] }>("/api/plans");
      return body.plans ?? [];
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Plan name is required");
      const payload = {
        name: form.name,
        monthly_price: Number(form.monthly_price) || 0,
        yearly_price: Number(form.yearly_price) || 0,
        max_users: Number(form.max_users) || 1,
        email_enabled: form.email_enabled,
        sms_enabled: form.sms_enabled,
        daily_summary_enabled: form.daily_summary_enabled,
        is_active: form.is_active,
      };
      if (editId) {
        await vpsJson(`/api/plans/${editId}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await vpsJson(`/api/plans`, { method: "POST", body: JSON.stringify(payload) });
      }
    },
    onSuccess: () => {
      toast({ title: editId ? "Plan updated" : "Plan created" });
      qc.invalidateQueries({ queryKey: ["admin-subscription-plans"] });
      closeDialog();
    },
    onError: (e: Error) => {
      toast({ variant: "destructive", title: "Error", description: e.message });
    },
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setEditId(null);
    setForm(emptyForm);
  };

  const openCreate = () => {
    setEditId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (plan: any) => {
    setEditId(plan.id);
    setForm({
      name: plan.name,
      monthly_price: String(plan.monthly_price),
      yearly_price: String(plan.yearly_price),
      max_users: String(plan.max_users),
      email_enabled: plan.email_enabled,
      sms_enabled: plan.sms_enabled,
      daily_summary_enabled: plan.daily_summary_enabled,
      is_active: plan.is_active,
    });
    setDialogOpen(true);
  };

  const FeatureIcon = ({ enabled }: { enabled: boolean }) =>
    enabled ? (
      <Check className="h-4 w-4 text-green-500" />
    ) : (
      <X className="h-4 w-4 text-muted-foreground/40" />
    );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Plan Management</CardTitle>
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-1 h-4 w-4" /> Add Plan
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
                  <TableHead>Name</TableHead>
                  <TableHead>Monthly (৳)</TableHead>
                  <TableHead>Yearly (৳)</TableHead>
                  <TableHead className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Users className="h-3.5 w-3.5" /> Users
                    </div>
                  </TableHead>
                  <TableHead className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Mail className="h-3.5 w-3.5" /> Email
                    </div>
                  </TableHead>
                  <TableHead className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <MessageSquare className="h-3.5 w-3.5" /> SMS
                    </div>
                  </TableHead>
                  <TableHead className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Clock className="h-3.5 w-3.5" /> Daily Summary
                    </div>
                  </TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="w-20">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground">
                      No plans created yet
                    </TableCell>
                  </TableRow>
                ) : (
                  plans.map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell>{formatCurrency(p.monthly_price)}</TableCell>
                      <TableCell>{formatCurrency(p.yearly_price)}</TableCell>
                      <TableCell className="text-center">{p.max_users}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center"><FeatureIcon enabled={p.email_enabled} /></div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center"><FeatureIcon enabled={p.sms_enabled} /></div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center"><FeatureIcon enabled={p.daily_summary_enabled} /></div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={p.is_active ? "default" : "secondary"} className="text-xs">
                          {p.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openEdit(p)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Plan" : "Create Plan"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Plan Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Starter, Pro, Business" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Monthly Price (৳)</Label>
                <Input type="number" value={form.monthly_price} onChange={(e) => setForm({ ...form, monthly_price: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Yearly Price (৳)</Label>
                <Input type="number" value={form.yearly_price} onChange={(e) => setForm({ ...form, yearly_price: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Max Users</Label>
              <Input type="number" value={form.max_users} onChange={(e) => setForm({ ...form, max_users: e.target.value })} />
            </div>
            <div className="space-y-3 pt-2 border-t">
              <Label className="text-sm font-semibold">Features</Label>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <Label className="font-normal">Email Notifications</Label>
                </div>
                <Switch checked={form.email_enabled} onCheckedChange={(v) => setForm({ ...form, email_enabled: v })} />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <Label className="font-normal">SMS Notifications</Label>
                </div>
                <Switch checked={form.sms_enabled} onCheckedChange={(v) => setForm({ ...form, sms_enabled: v })} />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <Label className="font-normal">Daily Summary</Label>
                </div>
                <Switch checked={form.daily_summary_enabled} onCheckedChange={(v) => setForm({ ...form, daily_summary_enabled: v })} />
              </div>
            </div>
            <div className="flex items-center justify-between pt-2 border-t">
              <Label className="font-normal">Plan Active</Label>
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button onClick={() => upsertMutation.mutate()} disabled={upsertMutation.isPending}>
              {editId ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default PlanManagement;
