import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { vpsAuthedFetch } from "@/lib/vpsAuthClient";
import { formatCurrency } from "@/lib/utils";
import { exportToExcel } from "@/lib/exportUtils";
import { Button } from "@/components/ui/button";
import { Download, Lock, ShieldCheck, Clock, Users } from "lucide-react";

// ─── Reserved Stock Report ────────────────────────────────
export function ReservedStockReport({ dealerId }: { dealerId: string }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["report-reserved-stock", dealerId],
    queryFn: async () => {
      const res = await vpsAuthedFetch(`/api/reports/reservations-active?dealerId=${dealerId}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
      const body = await res.json();
      return (body.rows ?? []) as any[];
    },
  });

  const rows = data.map((r: any) => {
    const remaining = Number(r.reserved_qty) - Number(r.fulfilled_qty) - Number(r.released_qty);
    const rate = Number(r.products?.default_sale_rate ?? 0);
    return {
      product: r.products?.name ?? "—",
      sku: r.products?.sku ?? "—",
      customer: r.customers?.name ?? "—",
      batch: r.product_batches?.batch_no ?? "—",
      shade: r.product_batches?.shade_code ?? "—",
      caliber: r.product_batches?.caliber ?? "—",
      reserved: Number(r.reserved_qty),
      fulfilled: Number(r.fulfilled_qty),
      remaining,
      estimatedValue: remaining * rate,
      reason: r.reason ?? "—",
      expiresAt: r.expires_at ? new Date(r.expires_at).toLocaleDateString() : "No expiry",
      createdAt: new Date(r.created_at).toLocaleDateString(),
    };
  });

  const totalReserved = rows.reduce((s, r) => s + r.remaining, 0);
  const totalValue = rows.reduce((s, r) => s + r.estimatedValue, 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="h-4 w-4" /> Reserved Stock
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            All active reservations • {rows.length} holds • {totalReserved} units • Est. {formatCurrency(totalValue)}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => exportToExcel(rows, [
          { key: "product", header: "Product" }, { key: "sku", header: "SKU" },
          { key: "customer", header: "Customer" }, { key: "batch", header: "Batch" },
          { key: "remaining", header: "Remaining" }, { key: "estimatedValue", header: "Est. Value" },
          { key: "expiresAt", header: "Expires" },
        ], "reserved-stock-report")}>
          <Download className="h-3.5 w-3.5 mr-1" /> Export
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-muted-foreground text-sm">Loading…</p> : rows.length === 0 ? (
          <p className="text-center text-muted-foreground py-6">No active reservations</p>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-xs">Product</TableHead>
                  <TableHead className="text-xs">Customer</TableHead>
                  <TableHead className="text-xs">Batch / Shade</TableHead>
                  <TableHead className="text-xs text-right">Reserved</TableHead>
                  <TableHead className="text-xs text-right">Remaining</TableHead>
                  <TableHead className="text-xs text-right">Est. Value</TableHead>
                  <TableHead className="text-xs">Expires</TableHead>
                  <TableHead className="text-xs">Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="py-2 text-xs">
                      <div className="font-medium">{r.product}</div>
                      <div className="text-muted-foreground">{r.sku}</div>
                    </TableCell>
                    <TableCell className="py-2 text-xs">{r.customer}</TableCell>
                    <TableCell className="py-2 text-xs">
                      <div>{r.batch}</div>
                      {r.shade !== "—" && <div className="text-muted-foreground">{r.shade} / {r.caliber}</div>}
                    </TableCell>
                    <TableCell className="py-2 text-xs text-right">{r.reserved}</TableCell>
                    <TableCell className="py-2 text-xs text-right font-semibold">{r.remaining}</TableCell>
                    <TableCell className="py-2 text-xs text-right">{formatCurrency(r.estimatedValue)}</TableCell>
                    <TableCell className="py-2 text-xs">{r.expiresAt}</TableCell>
                    <TableCell className="py-2 text-xs max-w-[120px] truncate">{r.reason}</TableCell>
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

// ─── Free vs Reserved Stock Report ────────────────────────
export function FreeVsReservedReport({ dealerId }: { dealerId: string }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["report-free-vs-reserved", dealerId],
    queryFn: async () => {
      const res = await vpsAuthedFetch(`/api/reports/free-vs-reserved?dealerId=${dealerId}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
      const body = await res.json();
      return (body.rows ?? []) as Array<{
        name: string; sku: string; unitType: string; total: number; reserved: number; free: number;
      }>;
    },
  });

  const exportRows = data.map((r) => ({
    Product: r.name, SKU: r.sku, Unit: r.unitType === "box_sft" ? "Box" : "Pcs",
    Total: r.total, Reserved: r.reserved, Free: r.free,
  }));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Free vs Reserved Stock
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">{data.length} products with stock</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => exportToExcel(exportRows, [
          { key: "Product", header: "Product" }, { key: "SKU", header: "SKU" },
          { key: "Unit", header: "Unit" }, { key: "Total", header: "Total" },
          { key: "Reserved", header: "Reserved" }, { key: "Free", header: "Free" },
        ], "free-vs-reserved-report")}>
          <Download className="h-3.5 w-3.5 mr-1" /> Export
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-muted-foreground text-sm">Loading…</p> : data.length === 0 ? (
          <p className="text-center text-muted-foreground py-6">No stock data</p>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-xs">Product</TableHead>
                  <TableHead className="text-xs text-right">Total</TableHead>
                  <TableHead className="text-xs text-right">Reserved</TableHead>
                  <TableHead className="text-xs text-right">Free</TableHead>
                  <TableHead className="text-xs text-right">% Reserved</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((r, i) => {
                  const pct = r.total > 0 ? Math.round((r.reserved / r.total) * 100) : 0;
                  const unit = r.unitType === "box_sft" ? "Box" : "Pcs";
                  return (
                    <TableRow key={i}>
                      <TableCell className="py-2 text-xs">
                        <div className="font-medium">{r.name}</div>
                        <div className="text-muted-foreground">{r.sku}</div>
                      </TableCell>
                      <TableCell className="py-2 text-xs text-right">{r.total} {unit}</TableCell>
                      <TableCell className="py-2 text-xs text-right font-semibold text-amber-500">{r.reserved} {unit}</TableCell>
                      <TableCell className="py-2 text-xs text-right font-semibold text-green-500">{r.free} {unit}</TableCell>
                      <TableCell className="py-2 text-xs text-right">
                        {pct > 0 ? (
                          <Badge variant="outline" className={pct > 50 ? "text-amber-500 border-amber-500/30" : ""}>{pct}%</Badge>
                        ) : "—"}
                      </TableCell>
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

// ─── Expiring Reservations Report ─────────────────────────
export function ExpiringReservationsReport({ dealerId }: { dealerId: string }) {
  const [days, setDays] = useState("7");

  const { data = [], isLoading } = useQuery({
    queryKey: ["report-expiring-reservations", dealerId, days],
    queryFn: async () => {
      const res = await vpsAuthedFetch(
        `/api/reports/reservations-expiring?dealerId=${dealerId}&days=${Number(days)}`,
      );
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
      const body = await res.json();
      return (body.rows ?? []) as any[];
    },
  });

  const rows = data.map((r: any) => {
    const remaining = Number(r.reserved_qty) - Number(r.fulfilled_qty) - Number(r.released_qty);
    const expiresAt = new Date(r.expires_at);
    const daysLeft = Math.ceil((expiresAt.getTime() - Date.now()) / 86400000);
    return {
      product: r.products?.name ?? "—",
      sku: r.products?.sku ?? "—",
      customer: r.customers?.name ?? "—",
      batch: r.product_batches?.batch_no ?? "—",
      remaining,
      daysLeft,
      expiresAt: expiresAt.toLocaleDateString(),
      isExpired: daysLeft < 0,
    };
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" /> Expiring Reservations
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">{rows.length} reservations expiring within {days} days</p>
        </div>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-28 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Today</SelectItem>
            <SelectItem value="3">3 Days</SelectItem>
            <SelectItem value="7">7 Days</SelectItem>
            <SelectItem value="14">14 Days</SelectItem>
            <SelectItem value="30">30 Days</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-muted-foreground text-sm">Loading…</p> : rows.length === 0 ? (
          <p className="text-center text-muted-foreground py-6">No expiring reservations in this window</p>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-xs">Product</TableHead>
                  <TableHead className="text-xs">Customer</TableHead>
                  <TableHead className="text-xs">Batch</TableHead>
                  <TableHead className="text-xs text-right">Held Qty</TableHead>
                  <TableHead className="text-xs">Expires</TableHead>
                  <TableHead className="text-xs text-right">Days Left</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={i} className={r.isExpired ? "bg-destructive/5" : ""}>
                    <TableCell className="py-2 text-xs">
                      <div className="font-medium">{r.product}</div>
                      <div className="text-muted-foreground">{r.sku}</div>
                    </TableCell>
                    <TableCell className="py-2 text-xs">{r.customer}</TableCell>
                    <TableCell className="py-2 text-xs">{r.batch}</TableCell>
                    <TableCell className="py-2 text-xs text-right font-semibold">{r.remaining}</TableCell>
                    <TableCell className="py-2 text-xs">{r.expiresAt}</TableCell>
                    <TableCell className="py-2 text-xs text-right">
                      <Badge variant={r.isExpired ? "destructive" : r.daysLeft <= 1 ? "secondary" : "outline"} className="text-[10px]">
                        {r.isExpired ? "Expired" : `${r.daysLeft}d`}
                      </Badge>
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

// ─── Customer Reserved Stock Report ───────────────────────
export function CustomerReservedStockReport({ dealerId }: { dealerId: string }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["report-customer-reserved", dealerId],
    queryFn: async () => {
      const res = await vpsAuthedFetch(
        `/api/reports/reservations-by-customer?dealerId=${dealerId}`,
      );
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
      const body = await res.json();
      return (body.rows ?? []) as Array<{
        name: string; holds: number; totalQty: number; totalValue: number;
      }>;
    },
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4" /> Customer Reserved Stock
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">{data.length} customers with active holds</p>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-muted-foreground text-sm">Loading…</p> : data.length === 0 ? (
          <p className="text-center text-muted-foreground py-6">No customer reservations</p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-xs">Customer</TableHead>
                  <TableHead className="text-xs text-right">Active Holds</TableHead>
                  <TableHead className="text-xs text-right">Total Qty Held</TableHead>
                  <TableHead className="text-xs text-right">Est. Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="py-2 text-xs font-medium">{r.name}</TableCell>
                    <TableCell className="py-2 text-xs text-right">{r.holds}</TableCell>
                    <TableCell className="py-2 text-xs text-right font-semibold">{r.totalQty}</TableCell>
                    <TableCell className="py-2 text-xs text-right">{formatCurrency(r.totalValue)}</TableCell>
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

// ─── Batch-wise Reserved Stock Report ─────────────────────
export function BatchReservedStockReport({ dealerId }: { dealerId: string }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["report-batch-reserved", dealerId],
    queryFn: async () => {
      const res = await vpsAuthedFetch(
        `/api/reports/reservations-by-batch?dealerId=${dealerId}`,
      );
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
      const body = await res.json();
      return (body.rows ?? []) as any[];
    },
  });

  const rows = data.map((r: any) => {
    const remaining = Number(r.reserved_qty) - Number(r.fulfilled_qty) - Number(r.released_qty);
    const isBox = r.products?.unit_type === "box_sft";
    const batchTotal = isBox ? Number(r.product_batches?.box_qty ?? 0) : Number(r.product_batches?.piece_qty ?? 0);
    const batchReserved = isBox ? Number(r.product_batches?.reserved_box_qty ?? 0) : Number(r.product_batches?.reserved_piece_qty ?? 0);
    const batchFree = batchTotal - batchReserved;
    return {
      product: r.products?.name ?? "—",
      sku: r.products?.sku ?? "—",
      customer: r.customers?.name ?? "—",
      batchNo: r.product_batches?.batch_no ?? "—",
      shade: r.product_batches?.shade_code ?? "—",
      caliber: r.product_batches?.caliber ?? "—",
      batchTotal,
      batchReserved,
      batchFree,
      heldQty: remaining,
      unit: isBox ? "Box" : "Pcs",
    };
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Lock className="h-4 w-4" /> Batch-wise Reserved Stock
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">{rows.length} batch-level reservations</p>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-muted-foreground text-sm">Loading…</p> : rows.length === 0 ? (
          <p className="text-center text-muted-foreground py-6">No batch-level reservations</p>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-xs">Product</TableHead>
                  <TableHead className="text-xs">Customer</TableHead>
                  <TableHead className="text-xs">Batch / Shade / Cal</TableHead>
                  <TableHead className="text-xs text-right">Batch Total</TableHead>
                  <TableHead className="text-xs text-right">Batch Reserved</TableHead>
                  <TableHead className="text-xs text-right">Batch Free</TableHead>
                  <TableHead className="text-xs text-right">This Hold</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="py-2 text-xs">
                      <div className="font-medium">{r.product}</div>
                      <div className="text-muted-foreground">{r.sku}</div>
                    </TableCell>
                    <TableCell className="py-2 text-xs">{r.customer}</TableCell>
                    <TableCell className="py-2 text-xs">
                      <div>{r.batchNo}</div>
                      <div className="text-muted-foreground">{r.shade} / {r.caliber}</div>
                    </TableCell>
                    <TableCell className="py-2 text-xs text-right">{r.batchTotal} {r.unit}</TableCell>
                    <TableCell className="py-2 text-xs text-right text-amber-500 font-semibold">{r.batchReserved} {r.unit}</TableCell>
                    <TableCell className="py-2 text-xs text-right text-green-500 font-semibold">{r.batchFree} {r.unit}</TableCell>
                    <TableCell className="py-2 text-xs text-right font-semibold">{r.heldQty} {r.unit}</TableCell>
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
