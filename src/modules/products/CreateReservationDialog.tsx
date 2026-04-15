import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createReservation } from "@/services/reservationService";
import { useAuth } from "@/contexts/AuthContext";

interface CreateReservationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: {
    id: string;
    name: string;
    sku: string;
    unit_type: string;
    category: string;
    per_box_sft: number | null;
  };
  dealerId: string;
}

const CreateReservationDialog = ({
  open, onOpenChange, product, dealerId,
}: CreateReservationDialogProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [customerId, setCustomerId] = useState("");
  const [batchId, setBatchId] = useState<string>("");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [expiryDays, setExpiryDays] = useState("7");

  const isTiles = product.category === "tiles";
  const unitLabel = product.unit_type === "box_sft" ? "Box" : "Pcs";

  // Fetch customers
  const { data: customers = [] } = useQuery({
    queryKey: ["reservation-customers", dealerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("customers")
        .select("id, name")
        .eq("dealer_id", dealerId)
        .eq("status", "active")
        .order("name");
      return data ?? [];
    },
    enabled: open,
  });

  // Fetch active batches for this product
  const { data: batches = [] } = useQuery({
    queryKey: ["reservation-batches", product.id, dealerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("product_batches")
        .select("id, batch_no, shade_code, caliber, box_qty, piece_qty, reserved_box_qty, reserved_piece_qty")
        .eq("product_id", product.id)
        .eq("dealer_id", dealerId)
        .eq("status", "active")
        .order("created_at", { ascending: true });
      return data ?? [];
    },
    enabled: open,
  });

  const hasBatches = batches.length > 0;
  const requireBatch = isTiles && hasBatches;

  // Calculate free qty for selected batch or product
  const selectedBatch = batches.find((b: any) => b.id === batchId);
  const freeQty = selectedBatch
    ? product.unit_type === "box_sft"
      ? Number(selectedBatch.box_qty) - Number(selectedBatch.reserved_box_qty ?? 0)
      : Number(selectedBatch.piece_qty) - Number(selectedBatch.reserved_piece_qty ?? 0)
    : null;

  const mutation = useMutation({
    mutationFn: async () => {
      if (!customerId) throw new Error("Select a customer");
      const qtyNum = Number(qty);
      if (!qtyNum || qtyNum <= 0) throw new Error("Enter a valid quantity");
      if (requireBatch && !batchId) throw new Error("Select a batch for tile reservation");
      if (freeQty !== null && qtyNum > freeQty) throw new Error(`Max available: ${freeQty} ${unitLabel}`);

      const expiresAt = expiryDays
        ? new Date(Date.now() + Number(expiryDays) * 86400000).toISOString()
        : null;

      return createReservation({
        dealer_id: dealerId,
        product_id: product.id,
        batch_id: batchId || null,
        customer_id: customerId,
        reserved_qty: qtyNum,
        unit_type: product.unit_type,
        reason: reason || undefined,
        expires_at: expiresAt,
        created_by: user?.id,
      });
    },
    onSuccess: () => {
      toast.success("Stock reserved successfully");
      queryClient.invalidateQueries({ queryKey: ["stock-reservations"] });
      queryClient.invalidateQueries({ queryKey: ["stock-summary"] });
      queryClient.invalidateQueries({ queryKey: ["products-stock-map"] });
      queryClient.invalidateQueries({ queryKey: ["reservation-batches"] });
      onOpenChange(false);
      resetForm();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const resetForm = () => {
    setCustomerId("");
    setBatchId("");
    setQty("");
    setReason("");
    setExpiryDays("7");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reserve Stock — {product.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Customer */}
          <div className="space-y-1.5">
            <Label>Customer *</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
              <SelectContent>
                {customers.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Batch (required for tiles with batches) */}
          {hasBatches && (
            <div className="space-y-1.5">
              <Label>
                Batch {requireBatch ? "*" : "(Optional)"}
              </Label>
              <Select value={batchId} onValueChange={setBatchId}>
                <SelectTrigger><SelectValue placeholder="Select batch" /></SelectTrigger>
                <SelectContent>
                  {!requireBatch && <SelectItem value="">No specific batch</SelectItem>}
                  {batches.map((b: any) => {
                    const free = product.unit_type === "box_sft"
                      ? Number(b.box_qty) - Number(b.reserved_box_qty ?? 0)
                      : Number(b.piece_qty) - Number(b.reserved_piece_qty ?? 0);
                    return (
                      <SelectItem key={b.id} value={b.id} disabled={free <= 0}>
                        {b.batch_no}
                        {b.shade_code && ` · ${b.shade_code}`}
                        {b.caliber && ` · ${b.caliber}`}
                        {` — Free: ${free} ${unitLabel}`}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {freeQty !== null && (
                <p className="text-xs text-muted-foreground">
                  Free in batch: {freeQty} {unitLabel}
                </p>
              )}
            </div>
          )}

          {/* Quantity */}
          <div className="space-y-1.5">
            <Label>Quantity ({unitLabel}) *</Label>
            <Input
              type="number"
              min="1"
              max={freeQty ?? undefined}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder={`Enter ${unitLabel.toLowerCase()}`}
            />
          </div>

          {/* Expiry */}
          <div className="space-y-1.5">
            <Label>Hold Duration (days)</Label>
            <Select value={expiryDays} onValueChange={setExpiryDays}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="3">3 days</SelectItem>
                <SelectItem value="7">7 days</SelectItem>
                <SelectItem value="14">14 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="">No expiry</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Reason */}
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Customer confirmed order, waiting for payment"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Reserving…" : "Reserve Stock"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateReservationDialog;
