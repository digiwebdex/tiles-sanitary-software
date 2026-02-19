import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface PlanForm {
  name: string;
  price_monthly: string;
  price_yearly: string;
  max_users: string;
}

const emptyForm: PlanForm = { name: "", price_monthly: "0", price_yearly: "0", max_users: "1" };

const PlanManagement = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<PlanForm>(emptyForm);

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["admin-plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plans")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Plan name is required");
      const payload = {
        name: form.name,
        price_monthly: Number(form.price_monthly) || 0,
        price_yearly: Number(form.price_yearly) || 0,
        max_users: Number(form.max_users) || 1,
      };
      if (editId) {
        const { error } = await supabase.from("plans").update(payload).eq("id", editId);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("plans").insert(payload);
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => {
      toast({ title: editId ? "Plan updated" : "Plan created" });
      qc.invalidateQueries({ queryKey: ["admin-plans"] });
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
      price_monthly: String(plan.price_monthly),
      price_yearly: String(plan.price_yearly),
      max_users: String(plan.max_users),
    });
    setDialogOpen(true);
  };

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
                  <TableHead>Max Users</TableHead>
                  <TableHead className="w-20">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No plans
                    </TableCell>
                  </TableRow>
                ) : (
                  plans.map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell>{formatCurrency(p.price_monthly)}</TableCell>
                      <TableCell>{formatCurrency(p.price_yearly)}</TableCell>
                      <TableCell>{p.max_users}</TableCell>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Plan" : "Create Plan"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Plan Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Monthly Price (৳)</Label>
                <Input type="number" value={form.price_monthly} onChange={(e) => setForm({ ...form, price_monthly: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Yearly Price (৳)</Label>
                <Input type="number" value={form.price_yearly} onChange={(e) => setForm({ ...form, price_yearly: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Max Users</Label>
              <Input type="number" value={form.max_users} onChange={(e) => setForm({ ...form, max_users: e.target.value })} />
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
