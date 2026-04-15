import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { exportToExcel } from "@/lib/exportUtils";
import { usePermissions } from "@/hooks/usePermissions";
import Pagination from "@/components/Pagination";
import { Download, Layers, AlertTriangle, Clock, GitBranch } from "lucide-react";

const PAGE_SIZE = 50;

// ─── Batch Stock Report ───────────────────────────────────
export function BatchStockReport({ dealerId }: { dealerId: string }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "depleted">("active");
  const { canExportReports } = usePermissions();

  const { data, isLoading } = useQuery({
    queryKey: ["report-batch-stock", dealerId, search, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("product_batches")
        .select("*, products(name, sku, unit_type, category)")
        .eq("dealer_id", dealerId)
        .order("created_at", { ascending: false })
        .limit(500);

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);

      let rows = (data ?? []) as any[];
      if (search) {
        const s = search.toLowerCase();
        rows = rows.filter((r: any) =>
          r.products?.name?.toLowerCase().includes(s) ||
          r.products?.sku?.toLowerCase().includes(s) ||
          r.batch_no?.toLowerCase().includes(s) ||
          r.shade_code?.toLowerCase().includes(s)
        );
      }
      return rows;
    },
  });

  const rows = data ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Layers className="h-4 w-4" /> Batch Stock Report
        </CardTitle>
        <div className="flex items-center gap-2">
          <Input placeholder="Search…" className="max-w-xs" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="border rounded px-2 py-1.5 text-sm bg-background text-foreground"
          >
            <option value="active">Active</option>
            <option value="depleted">Depleted</option>
            <option value="all">All</option>
          </select>
          {canExportReports && rows.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => exportToExcel(
              rows.map((r: any) => ({
                product: r.products?.name, sku: r.products?.sku,
                batch_no: r.batch_no, shade: r.shade_code ?? "—", caliber: r.caliber ?? "—",
                lot: r.lot_no ?? "—",
                qty: r.products?.unit_type === "box_sft" ? r.box_qty : r.piece_qty,
                unit: r.products?.unit_type === "box_sft" ? "Box" : "Pc",
                sft: r.sft_qty ?? 0, status: r.status, received: r.created_at?.slice(0, 10),
              })),
              [
                { header: "Product", key: "product" }, { header: "SKU", key: "sku" },
                { header: "Batch", key: "batch_no" }, { header: "Shade", key: "shade" },
                { header: "Caliber", key: "caliber" }, { header: "Lot", key: "lot" },
                { header: "Qty", key: "qty", format: "number" },
                { header: "Unit", key: "unit" }, { header: "SFT", key: "sft", format: "number" },
                { header: "Status", key: "status" }, { header: "Received", key: "received" },
              ], "batch-stock"
            )}>
              <Download className="h-4 w-4 mr-1" /> Export
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-muted-foreground">Loading…</p> : rows.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No batch data found</p>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Shade</TableHead>
                  <TableHead>Caliber</TableHead>
                  <TableHead>Lot</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">SFT</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Received</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r: any) => {
                  const isBox = r.products?.unit_type === "box_sft";
                  const qty = isBox ? Number(r.box_qty) : Number(r.piece_qty);
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <span className="font-medium">{r.products?.name}</span>
                        <span className="text-xs text-muted-foreground ml-1">({r.products?.sku})</span>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{r.batch_no}</TableCell>
                      <TableCell>{r.shade_code || "—"}</TableCell>
                      <TableCell>{r.caliber || "—"}</TableCell>
                      <TableCell>{r.lot_no || "—"}</TableCell>
                      <TableCell className="text-right font-medium">{qty} {isBox ? "box" : "pc"}</TableCell>
                      <TableCell className="text-right">{isBox ? Number(r.sft_qty).toFixed(2) : "—"}</TableCell>
                      <TableCell>
                        <Badge variant={r.status === "active" ? "default" : "secondary"} className="text-xs capitalize">
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.created_at?.slice(0, 10)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Mixed Batch Sales Report ─────────────────────────────
export function MixedBatchSalesReport({ dealerId }: { dealerId: string }) {
  const { canExportReports } = usePermissions();

  const { data, isLoading } = useQuery({
    queryKey: ["report-mixed-batch-sales", dealerId],
    queryFn: async () => {
      // Get all sale_item_batches with sale and product info
      const { data: sibs, error } = await supabase
        .from("sale_item_batches")
        .select("sale_item_id, batch_id, allocated_qty, product_batches(batch_no, shade_code, caliber)")
        .eq("dealer_id", dealerId);
      if (error) throw new Error(error.message);

      // Group by sale_item_id
      const grouped: Record<string, any[]> = {};
      for (const sib of (sibs ?? []) as any[]) {
        const key = sib.sale_item_id;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(sib);
      }

      // Find items with multiple batches that have different shade/caliber
      const mixedSaleItemIds: string[] = [];
      const mixedDetails: Record<string, { batches: any[]; mixedShade: boolean; mixedCaliber: boolean }> = {};

      for (const [siId, batches] of Object.entries(grouped)) {
        if (batches.length <= 1) continue;
        const shades = new Set(batches.map((b: any) => b.product_batches?.shade_code).filter(Boolean));
        const calibers = new Set(batches.map((b: any) => b.product_batches?.caliber).filter(Boolean));
        const mixedShade = shades.size > 1;
        const mixedCaliber = calibers.size > 1;
        if (mixedShade || mixedCaliber) {
          mixedSaleItemIds.push(siId);
          mixedDetails[siId] = { batches, mixedShade, mixedCaliber };
        }
      }

      if (mixedSaleItemIds.length === 0) return [];

      // Get sale_items with sale info
      const { data: saleItems } = await supabase
        .from("sale_items")
        .select("id, product_id, quantity, sale_id, products(name, sku), sales(invoice_number, sale_date, customers(name))")
        .in("id", mixedSaleItemIds)
        .eq("dealer_id", dealerId);

      return (saleItems ?? []).map((si: any) => ({
        saleItemId: si.id,
        invoiceNo: si.sales?.invoice_number ?? "—",
        saleDate: si.sales?.sale_date,
        customer: si.sales?.customers?.name ?? "—",
        product: si.products?.name ?? "—",
        sku: si.products?.sku ?? "—",
        quantity: Number(si.quantity),
        mixedShade: mixedDetails[si.id]?.mixedShade ?? false,
        mixedCaliber: mixedDetails[si.id]?.mixedCaliber ?? false,
        batches: mixedDetails[si.id]?.batches.map((b: any) => ({
          batch_no: b.product_batches?.batch_no,
          shade: b.product_batches?.shade_code ?? "—",
          caliber: b.product_batches?.caliber ?? "—",
          qty: Number(b.allocated_qty),
        })) ?? [],
      }));
    },
  });

  const rows = data ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" /> Mixed Batch Sales
        </CardTitle>
        {canExportReports && rows.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => exportToExcel(
            rows.map(r => ({
              invoice: r.invoiceNo, date: r.saleDate, customer: r.customer,
              product: r.product, qty: r.quantity,
              mixed_shade: r.mixedShade ? "Yes" : "No",
              mixed_caliber: r.mixedCaliber ? "Yes" : "No",
              batches: r.batches.map((b: any) => `${b.batch_no}(${b.shade}/${b.caliber}:${b.qty})`).join(", "),
            })),
            [
              { header: "Invoice", key: "invoice" }, { header: "Date", key: "date" },
              { header: "Customer", key: "customer" }, { header: "Product", key: "product" },
              { header: "Qty", key: "qty", format: "number" },
              { header: "Mixed Shade", key: "mixed_shade" }, { header: "Mixed Caliber", key: "mixed_caliber" },
              { header: "Batches", key: "batches" },
            ], "mixed-batch-sales"
          )}>
            <Download className="h-4 w-4 mr-1" /> Export
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-muted-foreground">Loading…</p> : rows.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No mixed-batch sales found ✓</p>
        ) : (
          <div className="space-y-3">
            {rows.map((r: any) => (
              <div key={r.saleItemId} className="rounded-md border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-mono text-sm font-medium">{r.invoiceNo}</span>
                    <span className="mx-2 text-muted-foreground">·</span>
                    <span className="text-sm">{r.customer}</span>
                    <span className="mx-2 text-muted-foreground">·</span>
                    <span className="text-sm text-muted-foreground">{r.saleDate}</span>
                  </div>
                  <div className="flex gap-1">
                    {r.mixedShade && <Badge variant="destructive" className="text-xs">Mixed Shade</Badge>}
                    {r.mixedCaliber && <Badge className="bg-amber-600 text-white text-xs">Mixed Caliber</Badge>}
                  </div>
                </div>
                <div className="text-sm">
                  <span className="font-medium">{r.product}</span>
                  <span className="text-muted-foreground ml-1">({r.sku})</span>
                  <span className="ml-2">× {r.quantity}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="text-xs w-full">
                    <thead>
                      <tr className="text-muted-foreground">
                        <th className="text-left pr-3 py-1">Batch</th>
                        <th className="text-left pr-3 py-1">Shade</th>
                        <th className="text-left pr-3 py-1">Caliber</th>
                        <th className="text-right py-1">Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.batches.map((b: any, i: number) => (
                        <tr key={i} className="border-t border-border/50">
                          <td className="pr-3 py-1 font-mono">{b.batch_no}</td>
                          <td className="pr-3 py-1">{b.shade}</td>
                          <td className="pr-3 py-1">{b.caliber}</td>
                          <td className="text-right py-1 font-medium">{b.qty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Aging Batch Report ───────────────────────────────────
export function AgingBatchReport({ dealerId }: { dealerId: string }) {
  const { canExportReports } = usePermissions();

  const { data, isLoading } = useQuery({
    queryKey: ["report-aging-batch", dealerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_batches")
        .select("*, products(name, sku, unit_type)")
        .eq("dealer_id", dealerId)
        .eq("status", "active")
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);

      const now = new Date();
      return (data ?? []).map((r: any) => {
        const days = Math.floor((now.getTime() - new Date(r.created_at).getTime()) / 86_400_000);
        const isBox = r.products?.unit_type === "box_sft";
        const qty = isBox ? Number(r.box_qty) : Number(r.piece_qty);
        return {
          id: r.id,
          product: r.products?.name ?? "—",
          sku: r.products?.sku ?? "—",
          batch_no: r.batch_no,
          shade: r.shade_code ?? "—",
          caliber: r.caliber ?? "—",
          qty,
          unit: isBox ? "box" : "pc",
          sft: isBox ? Number(r.sft_qty) : 0,
          ageDays: days,
          ageCategory: days > 180 ? "180+" : days > 90 ? "91-180" : days > 30 ? "31-90" : "0-30",
          received: r.created_at?.slice(0, 10),
        };
      }).filter((r: any) => r.qty > 0)
        .sort((a: any, b: any) => b.ageDays - a.ageDays);
    },
  });

  const rows = data ?? [];
  const old = rows.filter(r => r.ageDays > 90).length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4" /> Batch Aging Report
        </CardTitle>
        <div className="flex items-center gap-2">
          {old > 0 && <Badge variant="destructive" className="text-xs">{old} old batches (&gt;90d)</Badge>}
          {canExportReports && rows.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => exportToExcel(rows, [
              { header: "Product", key: "product" }, { header: "SKU", key: "sku" },
              { header: "Batch", key: "batch_no" }, { header: "Shade", key: "shade" },
              { header: "Caliber", key: "caliber" }, { header: "Qty", key: "qty", format: "number" },
              { header: "Unit", key: "unit" }, { header: "Age (Days)", key: "ageDays", format: "number" },
              { header: "Category", key: "ageCategory" }, { header: "Received", key: "received" },
            ], "batch-aging")}>
              <Download className="h-4 w-4 mr-1" /> Export
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-muted-foreground">Loading…</p> : rows.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No active batches</p>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Shade</TableHead>
                  <TableHead>Caliber</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Age</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Received</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r: any) => (
                  <TableRow key={r.id} className={r.ageDays > 180 ? "bg-destructive/5" : r.ageDays > 90 ? "bg-amber-50/50 dark:bg-amber-950/10" : ""}>
                    <TableCell>
                      <span className="font-medium">{r.product}</span>
                      <span className="text-xs text-muted-foreground ml-1">({r.sku})</span>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{r.batch_no}</TableCell>
                    <TableCell>{r.shade}</TableCell>
                    <TableCell>{r.caliber}</TableCell>
                    <TableCell className="text-right font-medium">{r.qty} {r.unit}</TableCell>
                    <TableCell className={`text-right font-semibold ${r.ageDays > 90 ? "text-destructive" : ""}`}>{r.ageDays}d</TableCell>
                    <TableCell>
                      <Badge variant={r.ageDays > 180 ? "destructive" : r.ageDays > 90 ? "secondary" : "outline"} className="text-xs">
                        {r.ageCategory}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.received}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Batch Movement Report ────────────────────────────────
export function BatchMovementReport({ dealerId }: { dealerId: string }) {
  const [search, setSearch] = useState("");
  const { canExportReports } = usePermissions();

  const { data, isLoading } = useQuery({
    queryKey: ["report-batch-movement", dealerId, search],
    queryFn: async () => {
      // Get all batches with purchase and sale info
      const { data: batches, error } = await supabase
        .from("product_batches")
        .select("*, products(name, sku, unit_type)")
        .eq("dealer_id", dealerId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);

      // Get sale allocations per batch
      const { data: sibs } = await supabase
        .from("sale_item_batches")
        .select("batch_id, allocated_qty")
        .eq("dealer_id", dealerId);

      const saleMap: Record<string, number> = {};
      for (const sib of (sibs ?? []) as any[]) {
        saleMap[sib.batch_id] = (saleMap[sib.batch_id] || 0) + Number(sib.allocated_qty);
      }

      // Get delivery amounts per batch
      const { data: dibs } = await supabase
        .from("delivery_item_batches")
        .select("batch_id, delivered_qty")
        .eq("dealer_id", dealerId);

      const deliveryMap: Record<string, number> = {};
      for (const dib of (dibs ?? []) as any[]) {
        deliveryMap[dib.batch_id] = (deliveryMap[dib.batch_id] || 0) + Number(dib.delivered_qty);
      }

      let rows = (batches ?? []).map((b: any) => {
        const isBox = b.products?.unit_type === "box_sft";
        const currentQty = isBox ? Number(b.box_qty) : Number(b.piece_qty);
        const soldQty = saleMap[b.id] || 0;
        const deliveredQty = deliveryMap[b.id] || 0;
        // Purchased = current + sold (since sold was deducted from current)
        const purchasedQty = currentQty + soldQty;

        return {
          id: b.id,
          product: b.products?.name ?? "—",
          sku: b.products?.sku ?? "—",
          batch_no: b.batch_no,
          shade: b.shade_code ?? "—",
          caliber: b.caliber ?? "—",
          unit: isBox ? "box" : "pc",
          purchased: purchasedQty,
          sold: soldQty,
          delivered: deliveredQty,
          current: currentQty,
          status: b.status,
        };
      });

      if (search) {
        const s = search.toLowerCase();
        rows = rows.filter(r =>
          r.product.toLowerCase().includes(s) ||
          r.sku.toLowerCase().includes(s) ||
          r.batch_no.toLowerCase().includes(s)
        );
      }

      return rows;
    },
  });

  const rows = data ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <GitBranch className="h-4 w-4" /> Batch Movement
        </CardTitle>
        <div className="flex items-center gap-2">
          <Input placeholder="Search…" className="max-w-xs" value={search} onChange={(e) => setSearch(e.target.value)} />
          {canExportReports && rows.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => exportToExcel(rows, [
              { header: "Product", key: "product" }, { header: "SKU", key: "sku" },
              { header: "Batch", key: "batch_no" }, { header: "Shade", key: "shade" },
              { header: "Caliber", key: "caliber" },
              { header: "Purchased", key: "purchased", format: "number" },
              { header: "Sold", key: "sold", format: "number" },
              { header: "Delivered", key: "delivered", format: "number" },
              { header: "Current", key: "current", format: "number" },
              { header: "Status", key: "status" },
            ], "batch-movement")}>
              <Download className="h-4 w-4 mr-1" /> Export
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-muted-foreground">Loading…</p> : rows.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No batch movement data</p>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Shade</TableHead>
                  <TableHead>Caliber</TableHead>
                  <TableHead className="text-right">Purchased</TableHead>
                  <TableHead className="text-right">Sold</TableHead>
                  <TableHead className="text-right">Delivered</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <span className="font-medium">{r.product}</span>
                      <span className="text-xs text-muted-foreground ml-1">({r.sku})</span>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{r.batch_no}</TableCell>
                    <TableCell>{r.shade}</TableCell>
                    <TableCell>{r.caliber}</TableCell>
                    <TableCell className="text-right text-primary font-medium">{r.purchased} {r.unit}</TableCell>
                    <TableCell className="text-right text-amber-600 font-medium">{r.sold} {r.unit}</TableCell>
                    <TableCell className="text-right font-medium">{r.delivered} {r.unit}</TableCell>
                    <TableCell className="text-right font-bold">{r.current} {r.unit}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === "active" ? "default" : "secondary"} className="text-xs capitalize">{r.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
