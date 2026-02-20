import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import Pagination from "@/components/Pagination";
import {
  fetchStockReport,
  fetchBrandStockReport,
  fetchSalesReport,
  fetchRetailerSalesReport,
  fetchProductHistory,
  fetchAccountingSummary,
  REPORT_PAGE_SIZE,
} from "@/services/reportService";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

interface ReportsPageContentProps {
  dealerId: string;
}

const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth() + 1;
const years = Array.from({ length: 5 }, (_, i) => currentYear - i);
const months = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const ReportsPageContent = ({ dealerId }: ReportsPageContentProps) => {
  const [tab, setTab] = useState("stock");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Reports</h1>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="stock">Stock (SKU)</TabsTrigger>
          <TabsTrigger value="brand-stock">Brand Stock</TabsTrigger>
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="retailer">Retailer Sales</TabsTrigger>
          <TabsTrigger value="product-history">Product History</TabsTrigger>
          <TabsTrigger value="accounting">Accounting</TabsTrigger>
        </TabsList>

        <TabsContent value="stock"><StockReport dealerId={dealerId} /></TabsContent>
        <TabsContent value="brand-stock"><BrandStockReport dealerId={dealerId} /></TabsContent>
        <TabsContent value="sales"><SalesReport dealerId={dealerId} /></TabsContent>
        <TabsContent value="retailer"><RetailerSalesReport dealerId={dealerId} /></TabsContent>
        <TabsContent value="product-history"><ProductHistoryReport dealerId={dealerId} /></TabsContent>
        <TabsContent value="accounting"><AccountingSummaryReport dealerId={dealerId} /></TabsContent>
      </Tabs>
    </div>
  );
};

// ─── Stock Report ─────────────────────────────────────────
function StockReport({ dealerId }: { dealerId: string }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["report-stock", dealerId, page, search],
    queryFn: () => fetchStockReport(dealerId, page, search),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
        <CardTitle className="text-base">Stock Report (SKU-wise)</CardTitle>
        <Input
          placeholder="Search SKU, name, brand…"
          className="max-w-xs"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-muted-foreground">Loading…</p> : (
          <>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Box</TableHead>
                    <TableHead className="text-right">SFT</TableHead>
                    <TableHead className="text-right">Piece</TableHead>
                    <TableHead className="text-right">Avg Cost</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.rows ?? []).length === 0 ? (
                    <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground">No products</TableCell></TableRow>
                  ) : (data?.rows ?? []).map((r) => (
                    <TableRow key={r.productId}>
                      <TableCell className="font-mono text-sm">{r.sku}</TableCell>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell>{r.brand || "—"}</TableCell>
                      <TableCell><Badge variant="outline" className="capitalize text-xs">{r.category}</Badge></TableCell>
                      <TableCell className="text-right">{r.boxQty}</TableCell>
                      <TableCell className="text-right">{r.sftQty.toFixed(2)}</TableCell>
                      <TableCell className="text-right">{r.pieceQty}</TableCell>
                      <TableCell className="text-right">{formatCurrency(r.avgCost)}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(r.stockValue)}</TableCell>
                      <TableCell>
                        {r.isLow ? (
                          <Badge variant="destructive" className="text-xs">Low</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">OK</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Pagination page={page} totalItems={data?.total ?? 0} pageSize={REPORT_PAGE_SIZE} onPageChange={setPage} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Brand-wise Stock ─────────────────────────────────────
function BrandStockReport({ dealerId }: { dealerId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["report-brand-stock", dealerId],
    queryFn: () => fetchBrandStockReport(dealerId),
  });

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Brand-wise Stock</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? <p className="text-muted-foreground">Loading…</p> : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Brand</TableHead>
                  <TableHead className="text-right">Products</TableHead>
                  <TableHead className="text-right">Boxes</TableHead>
                  <TableHead className="text-right">SFT</TableHead>
                  <TableHead className="text-right">Pieces</TableHead>
                  <TableHead className="text-right">Total Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No data</TableCell></TableRow>
                ) : (data ?? []).map((r) => (
                  <TableRow key={r.brand}>
                    <TableCell className="font-medium">{r.brand}</TableCell>
                    <TableCell className="text-right">{r.productCount}</TableCell>
                    <TableCell className="text-right">{r.totalBox}</TableCell>
                    <TableCell className="text-right">{r.totalSft.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{r.totalPiece}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(r.totalValue)}</TableCell>
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

// ─── Sales Report ─────────────────────────────────────────
function SalesReport({ dealerId }: { dealerId: string }) {
  const [mode, setMode] = useState<"daily" | "monthly">("monthly");
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);
  const { isDealerAdmin } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["report-sales", dealerId, mode, year, month],
    queryFn: () => fetchSalesReport(dealerId, mode, year, mode === "daily" ? month : undefined),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-2">
        <CardTitle className="text-base">Sales Report</CardTitle>
        <div className="flex gap-2 flex-wrap">
          <Select value={mode} onValueChange={(v) => setMode(v as any)}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="daily">Daily</SelectItem>
            </SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          {mode === "daily" && (
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {months.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-muted-foreground">Loading…</p> : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{mode === "daily" ? "Date" : "Month"}</TableHead>
                  <TableHead className="text-right">Sales</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  {isDealerAdmin && <TableHead className="text-right">Profit</TableHead>}
                  <TableHead className="text-right">Due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={isDealerAdmin ? 5 : 4} className="text-center text-muted-foreground">No data</TableCell></TableRow>
                ) : (data ?? []).map((r) => (
                  <TableRow key={r.date}>
                    <TableCell className="font-medium">{r.date}</TableCell>
                    <TableCell className="text-right">{r.count}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.totalAmount)}</TableCell>
                    {isDealerAdmin && (
                      <TableCell className={`text-right font-semibold ${r.totalProfit >= 0 ? "text-primary" : "text-destructive"}`}>
                        {formatCurrency(r.totalProfit)}
                      </TableCell>
                    )}
                    <TableCell className={`text-right ${r.totalDue > 0 ? "text-destructive font-semibold" : ""}`}>
                      {formatCurrency(r.totalDue)}
                    </TableCell>
                  </TableRow>
                ))}
                {/* Totals row */}
                {(data ?? []).length > 0 && (
                  <TableRow className="bg-muted/50 font-semibold">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right">{(data ?? []).reduce((s, r) => s + r.count, 0)}</TableCell>
                    <TableCell className="text-right">{formatCurrency((data ?? []).reduce((s, r) => s + r.totalAmount, 0))}</TableCell>
                    {isDealerAdmin && (
                      <TableCell className="text-right">{formatCurrency((data ?? []).reduce((s, r) => s + r.totalProfit, 0))}</TableCell>
                    )}
                    <TableCell className="text-right">{formatCurrency((data ?? []).reduce((s, r) => s + r.totalDue, 0))}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Retailer-wise Sales ──────────────────────────────────
function RetailerSalesReport({ dealerId }: { dealerId: string }) {
  const [year, setYear] = useState(currentYear);

  const { data, isLoading } = useQuery({
    queryKey: ["report-retailer", dealerId, year],
    queryFn: () => fetchRetailerSalesReport(dealerId, year),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">Retailer-wise Sales (SFT)</CardTitle>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
          <SelectContent>
            {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-muted-foreground">Loading…</p> : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Sales</TableHead>
                  <TableHead className="text-right">Total SFT</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No data</TableCell></TableRow>
                ) : (data ?? []).map((r) => (
                  <TableRow key={r.customerId}>
                    <TableCell className="font-medium">{r.customerName}</TableCell>
                    <TableCell><Badge variant="outline" className="capitalize text-xs">{r.customerType}</Badge></TableCell>
                    <TableCell className="text-right">{r.saleCount}</TableCell>
                    <TableCell className="text-right">{r.totalSft.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.totalAmount)}</TableCell>
                    <TableCell className={`text-right ${r.totalDue > 0 ? "text-destructive font-semibold" : ""}`}>
                      {formatCurrency(r.totalDue)}
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

// ─── Product History ──────────────────────────────────────
function ProductHistoryReport({ dealerId }: { dealerId: string }) {
  const [productId, setProductId] = useState("");
  const [page, setPage] = useState(1);

  const { data: products } = useQuery({
    queryKey: ["products-list", dealerId],
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
    queryKey: ["report-product-history", dealerId, productId, page],
    queryFn: () => fetchProductHistory(dealerId, productId, page),
    enabled: !!productId,
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
        <CardTitle className="text-base">Product History</CardTitle>
        <Select value={productId} onValueChange={(v) => { setProductId(v); setPage(1); }}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Select a product" />
          </SelectTrigger>
          <SelectContent>
            {(products ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.sku} — {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {!productId ? (
          <p className="text-muted-foreground text-sm">Select a product to view its purchase & sale history.</p>
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
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.rows ?? []).length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No history</TableCell></TableRow>
                  ) : (data?.rows ?? []).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.date}</TableCell>
                      <TableCell>
                        <Badge
                          variant={r.type === "purchase" ? "secondary" : "default"}
                          className="capitalize text-xs"
                        >
                          {r.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{r.reference}</TableCell>
                      <TableCell className="text-right">{r.quantity}</TableCell>
                      <TableCell className="text-right">{formatCurrency(r.rate)}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(r.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Pagination page={page} totalItems={data?.total ?? 0} pageSize={REPORT_PAGE_SIZE} onPageChange={setPage} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Accounting Summary ───────────────────────────────────
function AccountingSummaryReport({ dealerId }: { dealerId: string }) {
  const [year, setYear] = useState(currentYear);
  const { isDealerAdmin } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["report-accounting", dealerId, year],
    queryFn: () => fetchAccountingSummary(dealerId, year),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">Monthly Accounting Summary — {year}</CardTitle>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
          <SelectContent>
            {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-muted-foreground">Loading…</p> : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Sales</TableHead>
                  <TableHead className="text-right">Purchases</TableHead>
                  <TableHead className="text-right">Expenses</TableHead>
                  {isDealerAdmin && <TableHead className="text-right">Profit</TableHead>}
                  <TableHead className="text-right">Due</TableHead>
                  <TableHead className="text-right">Cash In</TableHead>
                  <TableHead className="text-right">Cash Out</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data ?? []).map((r) => (
                  <TableRow key={r.month}>
                    <TableCell className="font-medium">{r.month}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.totalSales)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.totalPurchases)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.totalExpenses)}</TableCell>
                    {isDealerAdmin && (
                      <TableCell className={`text-right font-semibold ${r.netProfit >= 0 ? "text-primary" : "text-destructive"}`}>
                        {formatCurrency(r.netProfit)}
                      </TableCell>
                    )}
                    <TableCell className={`text-right ${r.totalDue > 0 ? "text-destructive" : ""}`}>
                      {formatCurrency(r.totalDue)}
                    </TableCell>
                    <TableCell className="text-right text-primary">{formatCurrency(r.cashIn)}</TableCell>
                    <TableCell className="text-right text-destructive">{formatCurrency(r.cashOut)}</TableCell>
                  </TableRow>
                ))}
                {/* Grand totals */}
                <TableRow className="bg-muted/50 font-semibold">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">{formatCurrency((data ?? []).reduce((s, r) => s + r.totalSales, 0))}</TableCell>
                  <TableCell className="text-right">{formatCurrency((data ?? []).reduce((s, r) => s + r.totalPurchases, 0))}</TableCell>
                  <TableCell className="text-right">{formatCurrency((data ?? []).reduce((s, r) => s + r.totalExpenses, 0))}</TableCell>
                  {isDealerAdmin && (
                    <TableCell className="text-right">{formatCurrency((data ?? []).reduce((s, r) => s + r.netProfit, 0))}</TableCell>
                  )}
                  <TableCell className="text-right">{formatCurrency((data ?? []).reduce((s, r) => s + r.totalDue, 0))}</TableCell>
                  <TableCell className="text-right">{formatCurrency((data ?? []).reduce((s, r) => s + r.cashIn, 0))}</TableCell>
                  <TableCell className="text-right">{formatCurrency((data ?? []).reduce((s, r) => s + r.cashOut, 0))}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ReportsPageContent;
