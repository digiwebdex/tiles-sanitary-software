import { useQuery } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Box, Layers, TrendingUp, TrendingDown, RotateCcw, DollarSign, BarChart3 } from "lucide-react";

interface StockSummaryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: {
    id: string;
    name: string;
    sku: string;
    unit_type: string;
    per_box_sft: number | null;
  } | null;
  dealerId: string;
}

const StockSummaryDialog = ({ open, onOpenChange, product, dealerId }: StockSummaryDialogProps) => {
  const productId = product?.id ?? null;
  const isBoxSft = product?.unit_type === "box_sft";
  const perBoxSft = Number(product?.per_box_sft) || 0;

  const { data: stock, isLoading: loadStock } = useQuery({
    queryKey: ["stock-summary-stock", productId, dealerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("stock")
        .select("box_qty, piece_qty, sft_qty, reserved_box_qty, reserved_piece_qty, average_cost_per_unit")
        .eq("product_id", productId!)
        .eq("dealer_id", dealerId)
        .maybeSingle();
      return data;
    },
    enabled: open && !!productId,
  });

  const { data: totalPurchased, isLoading: loadPurch } = useQuery({
    queryKey: ["stock-summary-purchased", productId, dealerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("purchase_items")
        .select("quantity")
        .eq("product_id", productId!)
        .eq("dealer_id", dealerId);
      return (data ?? []).reduce((s, r) => s + Number(r.quantity), 0);
    },
    enabled: open && !!productId,
  });

  const { data: totalSold, isLoading: loadSold } = useQuery({
    queryKey: ["stock-summary-sold", productId, dealerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("sale_items")
        .select("quantity")
        .eq("product_id", productId!)
        .eq("dealer_id", dealerId);
      return (data ?? []).reduce((s, r) => s + Number(r.quantity), 0);
    },
    enabled: open && !!productId,
  });

  const { data: totalReturned, isLoading: loadRet } = useQuery({
    queryKey: ["stock-summary-returned", productId, dealerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales_returns")
        .select("qty")
        .eq("product_id", productId!)
        .eq("dealer_id", dealerId);
      return (data ?? []).reduce((s, r) => s + Number(r.qty), 0);
    },
    enabled: open && !!productId,
  });

  const { data: lastPurchaseRate, isLoading: loadLast } = useQuery({
    queryKey: ["stock-summary-last-rate", productId, dealerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("purchase_items")
        .select("landed_cost, purchase_id, purchases!inner(purchase_date)")
        .eq("product_id", productId!)
        .eq("dealer_id", dealerId)
        .order("purchases(purchase_date)", { ascending: false })
        .limit(1);
      return data && data.length > 0 ? Number(data[0].landed_cost) : 0;
    },
    enabled: open && !!productId,
  });

  const isLoading = loadStock || loadPurch || loadSold || loadRet || loadLast;

  if (!product) return null;

  const boxQty = Number(stock?.box_qty) || 0;
  const pieceQty = Number(stock?.piece_qty) || 0;
  const sftQty = Number(stock?.sft_qty) || 0;
  const reservedBox = Number(stock?.reserved_box_qty) || 0;
  const reservedPiece = Number(stock?.reserved_piece_qty) || 0;
  const avgCost = Number(stock?.average_cost_per_unit) || 0;

  const rows: { icon: React.ReactNode; label: string; value: string; highlight?: string }[] = [];

  if (isBoxSft) {
    rows.push(
      { icon: <Box className="h-4 w-4 text-primary" />, label: "Available Box", value: `${boxQty} Box` },
      { icon: <Box className="h-4 w-4 text-muted-foreground" />, label: "Reserved Box", value: `${reservedBox} Box` },
      { icon: <Layers className="h-4 w-4 text-primary" />, label: "Available SFT", value: `${sftQty.toFixed(2)} Sft` },
    );
  } else {
    rows.push(
      { icon: <Box className="h-4 w-4 text-primary" />, label: "Available Pieces", value: `${pieceQty} Pcs` },
      { icon: <Box className="h-4 w-4 text-muted-foreground" />, label: "Reserved Pieces", value: `${reservedPiece} Pcs` },
    );
  }

  rows.push(
    { icon: <TrendingUp className="h-4 w-4 text-green-600" />, label: "Total Purchased", value: `${totalPurchased ?? 0} ${isBoxSft ? "Box" : "Pcs"}` },
    { icon: <TrendingDown className="h-4 w-4 text-orange-500" />, label: "Total Sold", value: `${totalSold ?? 0} ${isBoxSft ? "Box" : "Pcs"}` },
    { icon: <RotateCcw className="h-4 w-4 text-blue-500" />, label: "Total Returned", value: `${totalReturned ?? 0} ${isBoxSft ? "Box" : "Pcs"}` },
  );

  rows.push(
    { icon: <DollarSign className="h-4 w-4 text-amber-600" />, label: "Last Purchase Rate", value: lastPurchaseRate ? formatCurrency(lastPurchaseRate) : "—" },
    { icon: <BarChart3 className="h-4 w-4 text-primary" />, label: "Average Cost", value: avgCost > 0 ? formatCurrency(avgCost) : "—" },
  );

  if (isBoxSft && perBoxSft > 0 && avgCost > 0) {
    rows.push(
      { icon: <BarChart3 className="h-4 w-4 text-muted-foreground" />, label: "Avg Cost / Box", value: formatCurrency(avgCost * perBoxSft) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Stock Summary</DialogTitle>
        </DialogHeader>

        <div className="space-y-1">
          <p className="text-sm font-medium">{product.name}</p>
          <p className="text-xs text-muted-foreground font-mono">{product.sku}</p>
        </div>

        <Separator />

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-4">Loading…</p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="w-8 py-2.5 pr-0">{r.icon}</TableCell>
                    <TableCell className="py-2.5 text-sm text-muted-foreground">{r.label}</TableCell>
                    <TableCell className="py-2.5 text-sm font-semibold text-right">{r.value}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <p className="text-xs text-muted-foreground text-center">Read-only view • Real-time stock data</p>
      </DialogContent>
    </Dialog>
  );
};

export default StockSummaryDialog;
