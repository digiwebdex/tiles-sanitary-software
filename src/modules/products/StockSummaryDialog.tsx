import { useQuery } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Box, Layers, TrendingUp, TrendingDown, RotateCcw, DollarSign, BarChart3, Package, Lock, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getProductReservations } from "@/services/reservationService";

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

  // Batch data
  const { data: batches = [], isLoading: loadBatches } = useQuery({
    queryKey: ["stock-summary-batches", productId, dealerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("product_batches")
        .select("*")
        .eq("product_id", productId!)
        .eq("dealer_id", dealerId)
        .order("created_at", { ascending: true });
      return data ?? [];
    },
    enabled: open && !!productId,
  });

  // Active reservations for this product
  const { data: reservations = [], isLoading: loadRes } = useQuery({
    queryKey: ["stock-summary-reservations", productId, dealerId],
    queryFn: () => getProductReservations(productId!, dealerId),
    enabled: open && !!productId,
  });

  const isLoading = loadStock || loadPurch || loadSold || loadRet || loadLast || loadBatches || loadRes;

  if (!product) return null;

  const boxQty = Number(stock?.box_qty) || 0;
  const pieceQty = Number(stock?.piece_qty) || 0;
  const sftQty = Number(stock?.sft_qty) || 0;
  const reservedBox = Number(stock?.reserved_box_qty) || 0;
  const reservedPiece = Number(stock?.reserved_piece_qty) || 0;
  const avgCost = Number(stock?.average_cost_per_unit) || 0;

  const freeBox = boxQty - reservedBox;
  const freePiece = pieceQty - reservedPiece;

  const rows: { icon: React.ReactNode; label: string; value: string }[] = [];

  if (isBoxSft) {
    rows.push(
      { icon: <Box className="h-4 w-4 text-primary" />, label: "Total Stock", value: `${boxQty} Box` },
      { icon: <Lock className="h-4 w-4 text-amber-500" />, label: "Reserved", value: `${reservedBox} Box` },
      { icon: <ShieldCheck className="h-4 w-4 text-green-500" />, label: "Free Stock", value: `${freeBox} Box` },
      { icon: <Layers className="h-4 w-4 text-primary" />, label: "Total SFT", value: `${sftQty.toFixed(2)} Sft` },
    );
  } else {
    rows.push(
      { icon: <Box className="h-4 w-4 text-primary" />, label: "Total Stock", value: `${pieceQty} Pcs` },
      { icon: <Lock className="h-4 w-4 text-amber-500" />, label: "Reserved", value: `${reservedPiece} Pcs` },
      { icon: <ShieldCheck className="h-4 w-4 text-green-500" />, label: "Free Stock", value: `${freePiece} Pcs` },
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

  const activeBatches = batches.filter((b: any) => b.status === "active");
  const depletedBatches = batches.filter((b: any) => b.status === "depleted");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
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
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="w-full">
              <TabsTrigger value="overview" className="flex-1">Overview</TabsTrigger>
              <TabsTrigger value="batches" className="flex-1">
                Batches {activeBatches.length > 0 && <Badge variant="secondary" className="ml-1 text-[10px] px-1">{activeBatches.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="holds" className="flex-1">
                Holds {reservations.length > 0 && <Badge variant="secondary" className="ml-1 text-[10px] px-1">{reservations.length}</Badge>}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
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
            </TabsContent>

            <TabsContent value="batches">
              {activeBatches.length === 0 && depletedBatches.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <Package className="mx-auto h-8 w-8 mb-2" />
                  <p className="text-sm">No batch records yet</p>
                  <p className="text-xs mt-1">Batches are created during purchases</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeBatches.length > 0 && (
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead className="text-xs">Batch</TableHead>
                            <TableHead className="text-xs">Shade</TableHead>
                            <TableHead className="text-xs">Caliber</TableHead>
                            <TableHead className="text-xs text-right">Qty</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {activeBatches.map((b: any) => (
                            <TableRow key={b.id}>
                              <TableCell className="py-2 text-xs">
                                <div className="font-medium">{b.batch_no}</div>
                                {b.lot_no && <div className="text-muted-foreground">Lot: {b.lot_no}</div>}
                              </TableCell>
                              <TableCell className="py-2 text-xs">{b.shade_code || "—"}</TableCell>
                              <TableCell className="py-2 text-xs">{b.caliber || "—"}</TableCell>
                              <TableCell className="py-2 text-xs text-right font-semibold">
                                {isBoxSft
                                  ? `${Number(b.box_qty)} Box`
                                  : `${Number(b.piece_qty)} Pcs`}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}

                  {depletedBatches.length > 0 && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                        {depletedBatches.length} depleted batch(es)
                      </summary>
                      <div className="rounded-md border mt-1">
                        <Table>
                          <TableBody>
                            {depletedBatches.map((b: any) => (
                              <TableRow key={b.id} className="opacity-50">
                                <TableCell className="py-1.5 text-xs">{b.batch_no}</TableCell>
                                <TableCell className="py-1.5 text-xs">{b.shade_code || "—"}</TableCell>
                                <TableCell className="py-1.5 text-xs">{b.caliber || "—"}</TableCell>
                                <TableCell className="py-1.5 text-xs text-right">0</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </details>
                  )}
                </div>
              )}
            </TabsContent>
            <TabsContent value="holds">
              {reservations.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <Lock className="mx-auto h-8 w-8 mb-2" />
                  <p className="text-sm">No active reservations</p>
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="text-xs">Customer</TableHead>
                        <TableHead className="text-xs">Batch</TableHead>
                        <TableHead className="text-xs text-right">Held</TableHead>
                        <TableHead className="text-xs">Expiry</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reservations.map((r: any) => {
                        const remaining = Number(r.reserved_qty) - Number(r.fulfilled_qty) - Number(r.released_qty);
                        const expiresAt = r.expires_at ? new Date(r.expires_at) : null;
                        const daysLeft = expiresAt
                          ? Math.ceil((expiresAt.getTime() - Date.now()) / 86400000)
                          : null;
                        return (
                          <TableRow key={r.id}>
                            <TableCell className="py-2 text-xs font-medium">
                              {r.customers?.name ?? "—"}
                            </TableCell>
                            <TableCell className="py-2 text-xs">
                              {r.product_batches?.batch_no ?? "—"}
                              {r.product_batches?.shade_code && (
                                <span className="text-muted-foreground ml-1">({r.product_batches.shade_code})</span>
                              )}
                            </TableCell>
                            <TableCell className="py-2 text-xs text-right font-semibold">
                              {remaining} {isBoxSft ? "Box" : "Pcs"}
                            </TableCell>
                            <TableCell className="py-2 text-xs">
                              {daysLeft === null
                                ? "No expiry"
                                : daysLeft < 0
                                  ? <span className="text-destructive">Expired</span>
                                  : `${daysLeft}d left`}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

          </Tabs>
        )}

        <p className="text-xs text-muted-foreground text-center">Read-only view • Real-time stock data</p>
      </DialogContent>
    </Dialog>
  );
};

export default StockSummaryDialog;
