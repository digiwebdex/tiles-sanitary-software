import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { vpsAuthedFetch } from "@/lib/vpsAuthClient";
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
      const params = new URLSearchParams({ dealerId, status: statusFilter, search });
      const res = await vpsAuthedFetch(`/api/reports/batches/stock?${params.toString()}`);
      if (!res.ok) throw new Error(`batch stock failed: ${res.status}`);
      const json = await res.json();
      return (json.rows ?? []) as any[];
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
      const res = await vpsAuthedFetch(
        `/api/reports/batches/mixed-sales?dealerId=${encodeURIComponent(dealerId)}`,
      );
      if (!res.ok) throw new Error(`mixed-batch-sales failed: ${res.status}`);
      const json = await res.json();
      return (json.rows ?? []) as any[];
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
      const res = await vpsAuthedFetch(
        `/api/reports/batches/aging?dealerId=${encodeURIComponent(dealerId)}`,
      );
      if (!res.ok) throw new Error(`batch aging failed: ${res.status}`);
      const json = await res.json();
      return (json.rows ?? []) as any[];
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
      const params = new URLSearchParams({ dealerId, search });
      const res = await vpsAuthedFetch(`/api/reports/batches/movement?${params.toString()}`);
      if (!res.ok) throw new Error(`batch movement failed: ${res.status}`);
      const json = await res.json();
      return (json.rows ?? []) as any[];
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
