import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Loader2, Package } from "lucide-react";
import { toast } from "sonner";
import { purchasePlanningService, type CustomerShortageRow } from "@/services/purchasePlanningService";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealerId: string;
  selectedRows: CustomerShortageRow[];
  onCreated: (purchaseId: string) => void;
}

interface DraftLine {
  sale_item_id: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  customer_name: string;
  invoice_number: string | null;
  quantity: number;
  purchase_rate: number;
  shade_code: string;
  caliber: string;
  shortage_note: string;
}

/**
 * Create Purchase Draft from one or more shortage rows.
 * - Pre-fills supplier (last supplier per product if any), qty (= shortage qty),
 *   and shade/caliber preferences carried from the originating quotation.
 * - Owner can override every value before saving.
 * - Tile shade/caliber safety: lines with different shade/caliber stay split.
 */
export function CreatePurchaseDraftDialog({
  open, onOpenChange, dealerId, selectedRows, onCreated,
}: Props) {
  const { user } = useAuth();

  const [supplierId, setSupplierId] = useState<string>("");
  const [invoiceNumber, setInvoiceNumber] = useState<string>("");
  const [purchaseDate, setPurchaseDate] = useState<string>(
    new Date().toISOString().split("T")[0],
  );
  const [headerNote, setHeaderNote] = useState<string>("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [saving, setSaving] = useState(false);

  const { data: suppliers = [] } = useQuery({
    queryKey: ["draft-suppliers", dealerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("suppliers")
        .select("id, name")
        .eq("dealer_id", dealerId)
        .order("name");
      return data ?? [];
    },
    enabled: !!dealerId && open,
  });

  // Reset state when dialog opens with a new selection
  useEffect(() => {
    if (!open) return;
    setLines(
      selectedRows.map((r) => ({
        sale_item_id: r.sale_item_id,
        product_id: r.product_id,
        product_name: r.product_name,
        product_sku: r.product_sku,
        customer_name: r.customer_name,
        invoice_number: r.invoice_number,
        quantity: r.shortage_qty,
        purchase_rate: 0,
        shade_code: r.preferred_shade_code ?? "",
        caliber: r.preferred_caliber ?? "",
        shortage_note: `${r.invoice_number ?? "—"} • ${r.customer_name}${r.project_name ? ` • ${r.project_name}` : ""}`,
      })),
    );
    setSupplierId("");
    setInvoiceNumber("");
    setPurchaseDate(new Date().toISOString().split("T")[0]);
    setHeaderNote("");
  }, [open, selectedRows]);

  const totalQty = useMemo(
    () => lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0),
    [lines],
  );

  const hasShadeMix = useMemo(() => {
    const byProduct = new Map<string, Set<string>>();
    for (const l of lines) {
      const key = l.product_id;
      const tag = `${(l.shade_code || "").trim()}|${(l.caliber || "").trim()}`;
      const set = byProduct.get(key) ?? new Set();
      set.add(tag);
      byProduct.set(key, set);
    }
    return Array.from(byProduct.values()).some((s) => s.size > 1);
  }, [lines]);

  const updateLine = (idx: number, patch: Partial<DraftLine>) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const handleSave = async () => {
    if (!supplierId) {
      toast.error("Please select a supplier");
      return;
    }
    if (lines.some((l) => l.quantity <= 0)) {
      toast.error("Quantity must be greater than 0 on every line");
      return;
    }
    if (lines.some((l) => l.purchase_rate <= 0)) {
      toast.error("Please enter a purchase rate on every line");
      return;
    }
    setSaving(true);
    try {
      const result = await purchasePlanningService.createDraftFromShortage({
        dealer_id: dealerId,
        supplier_id: supplierId,
        invoice_number: invoiceNumber || undefined,
        purchase_date: purchaseDate,
        notes: headerNote || undefined,
        created_by: user?.id,
        rows: lines.map((l) => ({
          sale_item_id: l.sale_item_id,
          product_id: l.product_id,
          quantity: l.quantity,
          purchase_rate: l.purchase_rate,
          shade_code: l.shade_code || undefined,
          caliber: l.caliber || undefined,
          shortage_note: l.shortage_note || undefined,
        })),
      });
      toast.success("Purchase created — stock updated and shortage linked");
      onCreated(result.purchase_id);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to create purchase from shortage");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            Create Purchase from Shortage
          </DialogTitle>
          <DialogDescription>
            Review quantities and rates, pick a supplier, then save. The purchase will be
            recorded normally — stock is added, the supplier ledger is updated, and any
            pending backorders are auto-allocated.
          </DialogDescription>
        </DialogHeader>

        {hasShadeMix && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              You've selected lines for the same product with different shade/caliber needs.
              Keep them as separate lines so the supplier sources the correct shade.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label className="text-xs">Supplier *</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Supplier Invoice #</Label>
            <Input
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="(optional)"
            />
          </div>
          <div>
            <Label className="text-xs">Purchase Date *</Label>
            <Input
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
            />
          </div>
        </div>

        <div>
          <Label className="text-xs">Header Note</Label>
          <Textarea
            value={headerNote}
            onChange={(e) => setHeaderNote(e.target.value)}
            placeholder="(optional) e.g. Urgent restock for project XYZ"
            rows={2}
          />
        </div>

        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="w-[90px] text-center">Qty *</TableHead>
                <TableHead className="w-[110px] text-center">Rate (BDT) *</TableHead>
                <TableHead className="w-[90px]">Shade</TableHead>
                <TableHead className="w-[90px]">Caliber</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l, idx) => (
                <TableRow key={l.sale_item_id}>
                  <TableCell>
                    <span className="font-medium">{l.product_name}</span>
                    <span className="text-xs text-muted-foreground ml-1">({l.product_sku})</span>
                  </TableCell>
                  <TableCell className="text-xs">
                    <div className="font-mono">{l.invoice_number ?? "—"}</div>
                    <div className="text-muted-foreground">{l.customer_name}</div>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={l.quantity}
                      onChange={(e) => updateLine(idx, { quantity: Number(e.target.value) })}
                      className="text-center h-8"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={l.purchase_rate}
                      onChange={(e) => updateLine(idx, { purchase_rate: Number(e.target.value) })}
                      className="text-center h-8"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={l.shade_code}
                      onChange={(e) => updateLine(idx, { shade_code: e.target.value })}
                      placeholder="—"
                      className="h-8"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={l.caliber}
                      onChange={(e) => updateLine(idx, { caliber: e.target.value })}
                      placeholder="—"
                      className="h-8"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
          <span>{lines.length} line{lines.length !== 1 ? "s" : ""}</span>
          <span>Total qty: <strong className="text-foreground">{totalQty}</strong></span>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || lines.length === 0}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Purchase
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Tiny status badge used by the report. */
export function ShortageStatusBadge({ status }: { status: "open" | "planned" | "partial" | "fulfilled" }) {
  const map = {
    open:      { label: "Open",      cls: "bg-amber-500/10 text-amber-700 border-amber-300" },
    planned:   { label: "Planned",   cls: "bg-blue-500/10 text-blue-700 border-blue-300" },
    partial:   { label: "Partial",   cls: "bg-purple-500/10 text-purple-700 border-purple-300" },
    fulfilled: { label: "Fulfilled", cls: "bg-emerald-500/10 text-emerald-700 border-emerald-300" },
  } as const;
  const cfg = map[status];
  return <Badge variant="outline" className={cfg.cls}>{cfg.label}</Badge>;
}
