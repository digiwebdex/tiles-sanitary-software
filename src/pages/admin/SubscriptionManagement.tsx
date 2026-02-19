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
import { useToast } from "@/hooks/use-toast";
import { Plus, CalendarPlus } from "lucide-react";

const SubscriptionManagement = () => {
  const { toast } = useToast();
  const qc = useQueryClient();

  // Existing subscriptions
  const { data: subscriptions = [], isLoading } = useQuery({
    queryKey: ["admin-subscriptions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*, dealers(name), plans(name)")
        .order("start_date", { ascending: false });
      if (error) throw new Error(error.message);
      return data;
    },
  });

  // Dealers & plans for assignment
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
    onError: (e: Error) => {
      toast({ variant: "destructive", title: "Error", description: e.message });
    },
  });

  // Inline edit
  const [editId, setEditId] = useState<string | null>(null);
  const [editEndDate, setEditEndDate] = useState("");
  const [editStatus, setEditStatus] = useState("active");

  const updateMutation = useMutation({
    mutationFn: async ({ subId, newEndDate, newStatus }: { subId: string; newEndDate: string; newStatus: string }) => {
      const { error } = await supabase
        .from("subscriptions")
        .update({ end_date: newEndDate || null, status: newStatus as any })
        .eq("id", subId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast({ title: "Subscription updated" });
      qc.invalidateQueries({ queryKey: ["admin-subscriptions"] });
      setEditId(null);
    },
    onError: (e: Error) => {
      toast({ variant: "destructive", title: "Error", description: e.message });
    },
  });

  return (
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
                  <TableHead className="w-52">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subscriptions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No subscriptions
                    </TableCell>
                  </TableRow>
                ) : (
                  subscriptions.map((sub: any) => (
                    <TableRow key={sub.id}>
                      <TableCell className="font-medium">{sub.dealers?.name ?? "—"}</TableCell>
                      <TableCell>{sub.plans?.name ?? "—"}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            sub.status === "active" ? "default" :
                            sub.status === "expired" ? "destructive" : "secondary"
                          }
                          className="capitalize text-xs"
                        >
                          {sub.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{sub.start_date}</TableCell>
                      <TableCell>{sub.end_date ?? "—"}</TableCell>
                      <TableCell>
                        {editId === sub.id ? (
                          <div className="space-y-2">
                            <div className="flex gap-2">
                              <Input
                                type="date"
                                value={editEndDate}
                                onChange={(e) => setEditEndDate(e.target.value)}
                                className="h-8 text-xs"
                              />
                              <Select value={editStatus} onValueChange={setEditStatus}>
                                <SelectTrigger className="h-8 w-28 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="active">Active</SelectItem>
                                  <SelectItem value="expired">Expired</SelectItem>
                                  <SelectItem value="suspended">Suspended</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => {
                                  updateMutation.mutate({
                                    subId: sub.id,
                                    newEndDate: editEndDate,
                                    newStatus: editStatus,
                                  });
                                }}
                              >
                                Save
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditId(null)}>
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => {
                              setEditId(sub.id);
                              setEditEndDate(sub.end_date ?? "");
                              setEditStatus(sub.status);
                            }}
                          >
                            <CalendarPlus className="mr-1 h-3 w-3" /> Edit
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Assign Plan Dialog */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Plan to Dealer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Dealer *</Label>
              <Select value={assignForm.dealer_id} onValueChange={(v) => setAssignForm({ ...assignForm, dealer_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select dealer" /></SelectTrigger>
                <SelectContent>
                  {dealers.map((d: any) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Plan *</Label>
              <Select value={assignForm.plan_id} onValueChange={(v) => setAssignForm({ ...assignForm, plan_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select plan" /></SelectTrigger>
                <SelectContent>
                  {plans.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
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
            <Button onClick={() => assignMutation.mutate()} disabled={assignMutation.isPending}>
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default SubscriptionManagement;
