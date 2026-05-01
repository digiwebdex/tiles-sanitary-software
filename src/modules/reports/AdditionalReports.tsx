import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { vpsAuthedFetch } from "@/lib/vpsAuthClient";
import { formatCurrency } from "@/lib/utils";
import { exportToExcel } from "@/lib/exportUtils";
import { usePermissions } from "@/hooks/usePermissions";
import Pagination from "@/components/Pagination";
import { Download, UserCheck, Truck, TruckIcon } from "lucide-react";

// ─── Sales by Salesman Report ─────────────────────────────
export function SalesBySalesmanReport({ dealerId }: { dealerId: string }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const { canExportReports } = usePermissions();

  const { data, isLoading } = useQuery({
    queryKey: ["report-sales-by-salesman", dealerId, year, month],
    queryFn: async () => {
      const res = await vpsAuthedFetch(
        `/api/reports/sales-by-salesman?dealerId=${dealerId}&year=${year}&month=${month}`,
      );
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
      const body = await res.json();
      return (body.rows ?? []) as Array<{
        name: string; count: number; total: number; paid: number; due: number; discount: number;
      }>;
    },
  });

  const rows = data ?? [];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
        <CardTitle className="text-base flex items-center gap-2"><UserCheck className="h-4 w-4" /> Sales by Salesman</CardTitle>
        <div className="flex items-center gap-2">
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              {months.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[0, 1, 2, 3, 4].map(i => <SelectItem key={i} value={String(new Date().getFullYear() - i)}>{new Date().getFullYear() - i}</SelectItem>)}
            </SelectContent>
          </Select>
          {canExportReports && rows.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => exportToExcel(rows, [
              { header: "Salesman", key: "name" },
              { header: "Invoices", key: "count", format: "number" },
              { header: "Total Sales", key: "total", format: "currency" },
              { header: "Collected", key: "paid", format: "currency" },
              { header: "Due", key: "due", format: "currency" },
              { header: "Avg Ticket", key: "avgTicket", format: "currency" },
            ], `sales-by-salesman-${year}-${month}`)}>
              <Download className="h-4 w-4 mr-1" /> Export
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-muted-foreground">Loading…</p> : rows.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No sales found for this period</p>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Salesman</TableHead>
                  <TableHead className="text-right">Invoices</TableHead>
                  <TableHead className="text-right">Total Sales</TableHead>
                  <TableHead className="text-right">Collected</TableHead>
                  <TableHead className="text-right">Due</TableHead>
                  <TableHead className="text-right">Discount</TableHead>
                  <TableHead className="text-right">Avg Ticket</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.name}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-right">{r.count}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(r.total)}</TableCell>
                    <TableCell className="text-right text-primary">{formatCurrency(r.paid)}</TableCell>
                    <TableCell className={`text-right ${r.due > 0 ? "text-destructive" : ""}`}>{formatCurrency(r.due)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.discount)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.count > 0 ? r.total / r.count : 0)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50 font-semibold">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">{rows.reduce((s, r) => s + r.count, 0)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(rows.reduce((s, r) => s + r.total, 0))}</TableCell>
                  <TableCell className="text-right">{formatCurrency(rows.reduce((s, r) => s + r.paid, 0))}</TableCell>
                  <TableCell className="text-right">{formatCurrency(rows.reduce((s, r) => s + r.due, 0))}</TableCell>
                  <TableCell className="text-right">{formatCurrency(rows.reduce((s, r) => s + r.discount, 0))}</TableCell>
                  <TableCell className="text-right">—</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Supplier Outstanding Summary ─────────────────────────
export function SupplierOutstandingReport({ dealerId }: { dealerId: string }) {
  const { canExportReports } = usePermissions();

  const { data, isLoading } = useQuery({
    queryKey: ["report-supplier-outstanding", dealerId],
    queryFn: async () => {
      const [ledgerRes, suppRes] = await Promise.all([
        supabase.from("supplier_ledger").select("supplier_id, amount, type").eq("dealer_id", dealerId),
        supabase.from("suppliers").select("id, name, phone, status").eq("dealer_id", dealerId),
      ]);

      const suppMap = new Map((suppRes.data ?? []).map(s => [s.id, s]));
      const balances: Record<string, { debit: number; credit: number; paymentCount: number }> = {};

      for (const e of ledgerRes.data ?? []) {
        const sid = e.supplier_id;
        if (!balances[sid]) balances[sid] = { debit: 0, credit: 0, paymentCount: 0 };
        const amt = Number(e.amount);
        if (amt >= 0) balances[sid].debit += amt;
        else balances[sid].credit += Math.abs(amt);
        if (e.type === "payment") balances[sid].paymentCount += 1;
      }

      return Object.entries(balances)
        .map(([sid, b]) => {
          const s = suppMap.get(sid);
          return {
            supplierId: sid,
            name: s?.name ?? "—",
            phone: s?.phone ?? "—",
            totalPurchase: Math.round(b.debit * 100) / 100,
            totalPaid: Math.round(b.credit * 100) / 100,
            outstanding: Math.round((b.debit - b.credit) * 100) / 100,
            payments: b.paymentCount,
          };
        })
        .filter(r => r.outstanding > 0)
        .sort((a, b) => b.outstanding - a.outstanding);
    },
  });

  const rows = data ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">Supplier Outstanding Summary</CardTitle>
        {canExportReports && rows.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => exportToExcel(rows, [
            { header: "Supplier", key: "name" },
            { header: "Phone", key: "phone" },
            { header: "Total Purchase", key: "totalPurchase", format: "currency" },
            { header: "Total Paid", key: "totalPaid", format: "currency" },
            { header: "Outstanding", key: "outstanding", format: "currency" },
          ], "supplier-outstanding")}>
            <Download className="h-4 w-4 mr-1" /> Export
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-muted-foreground">Loading…</p> : rows.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No outstanding payables</p>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="text-right">Total Purchase</TableHead>
                  <TableHead className="text-right">Total Paid</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(r => (
                  <TableRow key={r.supplierId}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>{r.phone}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.totalPurchase)}</TableCell>
                    <TableCell className="text-right text-primary">{formatCurrency(r.totalPaid)}</TableCell>
                    <TableCell className="text-right font-semibold text-destructive">{formatCurrency(r.outstanding)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50 font-semibold">
                  <TableCell colSpan={2}>Total</TableCell>
                  <TableCell className="text-right">{formatCurrency(rows.reduce((s, r) => s + r.totalPurchase, 0))}</TableCell>
                  <TableCell className="text-right">{formatCurrency(rows.reduce((s, r) => s + r.totalPaid, 0))}</TableCell>
                  <TableCell className="text-right">{formatCurrency(rows.reduce((s, r) => s + r.outstanding, 0))}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Pending Delivery Report ──────────────────────────────
export function PendingDeliveryReport({ dealerId }: { dealerId: string }) {
  const { canExportReports } = usePermissions();

  const { data, isLoading } = useQuery({
    queryKey: ["report-pending-delivery", dealerId],
    queryFn: async () => {
      const { data: challans, error } = await supabase
        .from("challans")
        .select("id, challan_no, challan_date, delivery_status, transport_name, vehicle_no, driver_name, sale_id, sales(invoice_number, customers(name))")
        .eq("dealer_id", dealerId)
        .neq("delivery_status", "delivered")
        .order("challan_date", { ascending: true });
      if (error) throw new Error(error.message);

      const today = new Date();
      return (challans ?? []).map((c: any) => {
        const days = Math.floor((today.getTime() - new Date(c.challan_date).getTime()) / 86_400_000);
        return {
          challanNo: c.challan_no,
          challanDate: c.challan_date,
          invoiceNo: c.sales?.invoice_number ?? "—",
          customer: c.sales?.customers?.name ?? "—",
          status: c.delivery_status,
          transport: c.transport_name ?? "—",
          vehicle: c.vehicle_no ?? "—",
          daysPending: days,
          isLate: days > 2,
        };
      });
    },
  });

  const rows = data ?? [];
  const lateCount = rows.filter(r => r.isLate).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Card className="flex-1 min-w-[140px]">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Pending</p>
            <p className="text-xl font-bold">{rows.length}</p>
          </CardContent>
        </Card>
        <Card className="flex-1 min-w-[140px]">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Late (&gt;2 days)</p>
            <p className="text-xl font-bold text-destructive">{lateCount}</p>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Truck className="h-4 w-4" /> Pending Deliveries</CardTitle>
          {canExportReports && rows.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => exportToExcel(rows, [
              { header: "Challan#", key: "challanNo" },
              { header: "Date", key: "challanDate" },
              { header: "Invoice#", key: "invoiceNo" },
              { header: "Customer", key: "customer" },
              { header: "Status", key: "status" },
              { header: "Transport", key: "transport" },
              { header: "Days Pending", key: "daysPending", format: "number" },
            ], "pending-deliveries")}>
              <Download className="h-4 w-4 mr-1" /> Export
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? <p className="text-muted-foreground">Loading…</p> : rows.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">All deliveries are completed ✓</p>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Challan#</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Invoice#</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Transport</TableHead>
                    <TableHead className="text-right">Days Pending</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(r => (
                    <TableRow key={r.challanNo} className={r.isLate ? "bg-destructive/5" : ""}>
                      <TableCell className="font-mono text-sm">{r.challanNo}</TableCell>
                      <TableCell>{r.challanDate}</TableCell>
                      <TableCell className="font-mono text-sm">{r.invoiceNo}</TableCell>
                      <TableCell className="font-medium">{r.customer}</TableCell>
                      <TableCell>
                        <Badge variant={r.status === "dispatched" ? "secondary" : "outline"} className="capitalize text-xs">{r.status}</Badge>
                      </TableCell>
                      <TableCell>{r.transport}</TableCell>
                      <TableCell className={`text-right font-semibold ${r.isLate ? "text-destructive" : ""}`}>{r.daysPending}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Delivery Status Report ───────────────────────────────
export function DeliveryStatusReport({ dealerId }: { dealerId: string }) {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { canExportReports } = usePermissions();

  const { data, isLoading } = useQuery({
    queryKey: ["report-delivery-status", dealerId, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("challans")
        .select("id, challan_no, challan_date, delivery_status, transport_name, vehicle_no, driver_name, sales(invoice_number, customers(name))")
        .eq("dealer_id", dealerId)
        .order("challan_date", { ascending: false })
        .limit(100);

      if (statusFilter !== "all") {
        query = query.eq("delivery_status", statusFilter);
      }

      const { data: challans, error } = await query;
      if (error) throw new Error(error.message);

      return (challans ?? []).map((c: any) => ({
        challanNo: c.challan_no,
        challanDate: c.challan_date,
        invoiceNo: c.sales?.invoice_number ?? "—",
        customer: c.sales?.customers?.name ?? "—",
        status: c.delivery_status,
        transport: c.transport_name ?? "—",
        vehicle: c.vehicle_no ?? "—",
        driver: c.driver_name ?? "—",
      }));
    },
  });

  const rows = data ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
        <CardTitle className="text-base flex items-center gap-2"><TruckIcon className="h-4 w-4" /> Delivery Status</CardTitle>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="dispatched">Dispatched</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
            </SelectContent>
          </Select>
          {canExportReports && rows.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => exportToExcel(rows, [
              { header: "Challan#", key: "challanNo" },
              { header: "Date", key: "challanDate" },
              { header: "Invoice#", key: "invoiceNo" },
              { header: "Customer", key: "customer" },
              { header: "Status", key: "status" },
              { header: "Transport", key: "transport" },
              { header: "Vehicle", key: "vehicle" },
              { header: "Driver", key: "driver" },
            ], "delivery-status")}>
              <Download className="h-4 w-4 mr-1" /> Export
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-muted-foreground">Loading…</p> : rows.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No challans found</p>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Challan#</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Invoice#</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Transport</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Driver</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(r => (
                  <TableRow key={r.challanNo}>
                    <TableCell className="font-mono text-sm">{r.challanNo}</TableCell>
                    <TableCell>{r.challanDate}</TableCell>
                    <TableCell className="font-mono text-sm">{r.invoiceNo}</TableCell>
                    <TableCell className="font-medium">{r.customer}</TableCell>
                    <TableCell>
                      <Badge
                        variant={r.status === "delivered" ? "default" : r.status === "dispatched" ? "secondary" : "outline"}
                        className="capitalize text-xs"
                      >{r.status}</Badge>
                    </TableCell>
                    <TableCell>{r.transport}</TableCell>
                    <TableCell>{r.vehicle}</TableCell>
                    <TableCell>{r.driver}</TableCell>
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

// ─── Stock Movement Report ────────────────────────────────
export function StockMovementReport({ dealerId }: { dealerId: string }) {
  const [productId, setProductId] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;
  const { canExportReports } = usePermissions();

  const { data: products } = useQuery({
    queryKey: ["products-list-movement", dealerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, sku")
        .eq("dealer_id", dealerId)
        .eq("active", true)
        .order("name");
      return data ?? [];
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["report-stock-movement", dealerId, productId, page],
    queryFn: async () => {
      if (!productId) return { rows: [], total: 0 };

      const [purchaseRes, saleRes, returnRes] = await Promise.all([
        supabase
          .from("purchase_items")
          .select("id, quantity, purchase_rate, total, purchases(purchase_date, invoice_number)")
          .eq("dealer_id", dealerId)
          .eq("product_id", productId),
        supabase
          .from("sale_items")
          .select("id, quantity, sale_rate, total, sales(sale_date, invoice_number)")
          .eq("dealer_id", dealerId)
          .eq("product_id", productId),
        supabase
          .from("sales_returns")
          .select("id, qty, refund_amount, return_date, is_broken, sales(invoice_number)")
          .eq("dealer_id", dealerId)
          .eq("product_id", productId),
      ]);

      type MovementRow = { id: string; date: string; type: string; reference: string; qtyIn: number; qtyOut: number; rate: number; total: number };
      const movements: MovementRow[] = [];

      for (const pi of purchaseRes.data ?? []) {
        const p = (pi as any).purchases;
        movements.push({
          id: pi.id, date: p?.purchase_date ?? "", type: "Purchase",
          reference: p?.invoice_number ?? "—",
          qtyIn: Number(pi.quantity), qtyOut: 0,
          rate: Number(pi.purchase_rate), total: Number(pi.total),
        });
      }
      for (const si of saleRes.data ?? []) {
        const s = (si as any).sales;
        movements.push({
          id: si.id, date: s?.sale_date ?? "", type: "Sale",
          reference: s?.invoice_number ?? "—",
          qtyIn: 0, qtyOut: Number(si.quantity),
          rate: Number(si.sale_rate), total: Number(si.total),
        });
      }
      for (const sr of returnRes.data ?? []) {
        const s = (sr as any).sales;
        movements.push({
          id: sr.id, date: sr.return_date, type: sr.is_broken ? "Return (Broken)" : "Return",
          reference: s?.invoice_number ?? "—",
          qtyIn: sr.is_broken ? 0 : Number(sr.qty), qtyOut: sr.is_broken ? Number(sr.qty) : 0,
          rate: 0, total: Number(sr.refund_amount),
        });
      }

      movements.sort((a, b) => a.date.localeCompare(b.date));

      // Calculate running balance
      let balance = 0;
      const withBalance = movements.map(m => {
        balance += m.qtyIn - m.qtyOut;
        return { ...m, balance };
      });

      const total = withBalance.length;
      const paged = withBalance.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
      return { rows: paged, total, allRows: withBalance };
    },
    enabled: !!productId,
  });

  const rows = data?.rows ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
        <CardTitle className="text-base">Stock Movement</CardTitle>
        <div className="flex items-center gap-2">
          <Select value={productId} onValueChange={(v) => { setProductId(v); setPage(1); }}>
            <SelectTrigger className="w-64"><SelectValue placeholder="Select a product" /></SelectTrigger>
            <SelectContent>
              {(products ?? []).map(p => <SelectItem key={p.id} value={p.id}>{p.sku} — {p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {canExportReports && (data?.allRows?.length ?? 0) > 0 && (
            <Button size="sm" variant="outline" onClick={() => exportToExcel(data!.allRows!, [
              { header: "Date", key: "date" },
              { header: "Type", key: "type" },
              { header: "Reference", key: "reference" },
              { header: "Qty In", key: "qtyIn", format: "number" },
              { header: "Qty Out", key: "qtyOut", format: "number" },
              { header: "Balance", key: "balance", format: "number" },
            ], "stock-movement")}>
              <Download className="h-4 w-4 mr-1" /> Export
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!productId ? (
          <p className="text-muted-foreground text-sm">Select a product to view stock movements.</p>
        ) : isLoading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : (
          <>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="text-right">Qty In</TableHead>
                    <TableHead className="text-right">Qty Out</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No movements</TableCell></TableRow>
                  ) : rows.map(r => (
                    <TableRow key={r.id}>
                      <TableCell>{r.date}</TableCell>
                      <TableCell>
                        <Badge variant={r.type === "Purchase" ? "secondary" : r.type === "Sale" ? "default" : "outline"} className="text-xs">{r.type}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{r.reference}</TableCell>
                      <TableCell className="text-right text-primary font-medium">{r.qtyIn > 0 ? `+${r.qtyIn}` : "—"}</TableCell>
                      <TableCell className="text-right text-destructive font-medium">{r.qtyOut > 0 ? `-${r.qtyOut}` : "—"}</TableCell>
                      <TableCell className="text-right font-semibold">{(r as any).balance}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Pagination page={page} totalItems={data?.total ?? 0} pageSize={PAGE_SIZE} onPageChange={setPage} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
