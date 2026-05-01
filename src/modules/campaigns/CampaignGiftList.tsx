import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { campaignGiftService, CampaignGift } from "@/services/campaignGiftService";
import { useDealerId } from "@/hooks/useDealerId";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Gift, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { vpsAuthedFetch } from "@/lib/vpsAuthClient";

const CampaignGiftList = () => {
  const dealerId = useDealerId();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [payOpen, setPayOpen] = useState<CampaignGift | null>(null);

  // Form state
  const [customerId, setCustomerId] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [description, setDescription] = useState("");
  const [giftValue, setGiftValue] = useState("");

  // Pay form
  const [payAmount, setPayAmount] = useState("");

  const { data: gifts = [], isLoading } = useQuery({
    queryKey: ["campaign-gifts", dealerId],
    queryFn: () => campaignGiftService.list(dealerId),
    enabled: !!dealerId,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers-for-gifts", dealerId],
    queryFn: async () => {
      const params = new URLSearchParams({
        dealerId,
        pageSize: "200",
        orderBy: "name",
        orderDir: "asc",
        "f.status": "active",
      });
      const res = await vpsAuthedFetch(`/api/customers?${params.toString()}`);
      if (!res.ok) return [];
      const body = await res.json();
      return (body.rows ?? []).map((c: any) => ({ id: c.id, name: c.name, type: c.type }));
    },
    enabled: !!dealerId,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      campaignGiftService.create({
        dealer_id: dealerId,
        customer_id: customerId,
        campaign_name: campaignName,
        description: description || undefined,
        gift_value: Number(giftValue),
        created_by: user?.id,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-gifts"] });
      toast.success("Campaign gift created");
      setCreateOpen(false);
      setCustomerId("");
      setCampaignName("");
      setDescription("");
      setGiftValue("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const payMutation = useMutation({
    mutationFn: async () => {
      if (!payOpen) return;
      const newPaid = Number(payOpen.paid_amount) + Number(payAmount);
      const status = newPaid >= Number(payOpen.gift_value) ? "paid" : "partial";
      await campaignGiftService.update(payOpen.id, {
        paid_amount: newPaid,
        payment_status: status,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-gifts"] });
      toast.success("Payment recorded");
      setPayOpen(null);
      setPayAmount("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => campaignGiftService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-gifts"] });
      toast.success("Gift deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const statusBadge = (status: string) => {
    if (status === "paid") return <Badge className="bg-green-600 text-white text-xs">Paid</Badge>;
    if (status === "partial") return <Badge variant="outline" className="border-yellow-500 text-yellow-600 text-xs">Partial</Badge>;
    return <Badge className="bg-orange-100 text-orange-700 text-xs">Pending</Badge>;
  };

  return (
    <div className="container mx-auto max-w-5xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gift className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Campaign Gifts</h1>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add Gift
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : gifts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No campaign gifts yet. Click "Add Gift" to create one.
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Gift Value</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {gifts.map((g) => {
                const balance = Number(g.gift_value) - Number(g.paid_amount);
                return (
                  <TableRow key={g.id}>
                    <TableCell className="font-medium">{g.campaign_name}</TableCell>
                    <TableCell>{(g as any).customers?.name ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{g.description || "—"}</TableCell>
                    <TableCell className="text-right">{formatCurrency(g.gift_value)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(g.paid_amount)}</TableCell>
                    <TableCell className={`text-right ${balance > 0 ? "text-destructive font-semibold" : ""}`}>
                      {formatCurrency(balance)}
                    </TableCell>
                    <TableCell>{statusBadge(g.payment_status)}</TableCell>
                    <TableCell className="text-sm">{new Date(g.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {g.payment_status !== "paid" && (
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setPayOpen(g); setPayAmount(""); }}>
                            Pay
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => deleteMutation.mutate(g.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Campaign Gift</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Campaign Name *</Label>
              <Input value={campaignName} onChange={(e) => setCampaignName(e.target.value)} placeholder="e.g. Eid Campaign 2026" />
            </div>
            <div>
              <Label>Customer *</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name} ({c.type})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Gift Value (৳) *</Label>
              <Input type="number" step="0.01" value={giftValue} onChange={(e) => setGiftValue(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Gift details…" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !campaignName || !customerId || !giftValue}>
              {createMutation.isPending ? "Creating…" : "Create Gift"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={!!payOpen} onOpenChange={(o) => { if (!o) setPayOpen(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>
          {payOpen && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                <strong>{payOpen.campaign_name}</strong> — Balance: {formatCurrency(Number(payOpen.gift_value) - Number(payOpen.paid_amount))}
              </p>
              <div>
                <Label>Payment Amount (৳)</Label>
                <Input type="number" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="0.00" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(null)}>Cancel</Button>
            <Button onClick={() => payMutation.mutate()} disabled={payMutation.isPending || !payAmount}>
              {payMutation.isPending ? "Processing…" : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CampaignGiftList;
