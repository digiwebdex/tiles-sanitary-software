import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { salesService } from "@/services/salesService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer, TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

const InvoicePage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isDealerAdmin } = useAuth();

  const { data: sale, isLoading } = useQuery({
    queryKey: ["sale", id],
    queryFn: () => salesService.getById(id!),
    enabled: !!id,
  });

  if (isLoading) return <p className="p-6 text-muted-foreground">Loading…</p>;
  if (!sale) return <p className="p-6 text-destructive">Sale not found</p>;

  const items = (sale as any).sale_items ?? [];
  const customer = (sale as any).customers;

  return (
    <div className="container mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate("/sales")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold text-foreground">Invoice</h1>
        </div>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" /> Print
        </Button>
      </div>

      {/* Invoice Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-xl">INVOICE</CardTitle>
              <p className="mt-1 font-mono text-lg font-bold text-primary">
                {sale.invoice_number}
              </p>
            </div>
            <div className="text-right text-sm">
              <p className="text-muted-foreground">Date</p>
              <p className="font-medium">{sale.sale_date}</p>
            </div>
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="grid grid-cols-2 gap-6 pt-4 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Bill To</p>
            <p className="mt-1 font-medium">{customer?.name ?? "—"}</p>
            {customer?.phone && <p className="text-muted-foreground">{customer.phone}</p>}
            {customer?.address && <p className="text-muted-foreground">{customer.address}</p>}
            <Badge variant="outline" className="mt-1 text-xs capitalize">{customer?.type}</Badge>
          </div>
          <div className="text-right">
            {sale.client_reference && (
              <div className="mb-1">
                <span className="text-muted-foreground">Client Ref: </span>
                <span className="font-medium">{sale.client_reference}</span>
              </div>
            )}
            {sale.fitter_reference && (
              <div>
                <span className="text-muted-foreground">Fitter: </span>
                <span className="font-medium">{sale.fitter_reference}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Items Table — no offer_price */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead>SFT</TableHead>
              <TableHead>Rate</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item: any, idx: number) => (
              <TableRow key={item.id}>
                <TableCell>{idx + 1}</TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{item.products?.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">{item.products?.sku}</span>
                  </div>
                </TableCell>
                <TableCell>
                  {item.quantity}
                  <Badge variant="secondary" className="ml-1 text-xs">
                    {item.products?.unit_type === "box_sft" ? "box" : "pc"}
                  </Badge>
                </TableCell>
                <TableCell>{item.total_sft ? Number(item.total_sft).toFixed(2) : "—"}</TableCell>
                <TableCell>{formatCurrency(item.sale_rate)}</TableCell>
                <TableCell className="text-right">{formatCurrency(item.total)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Summary */}
      <Card>
        <CardContent className="grid grid-cols-3 gap-4 pt-6 text-center md:grid-cols-6">
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Total Box</p>
            <p className="text-lg font-bold">{Number(sale.total_box)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Total SFT</p>
            <p className="text-lg font-bold">{Number(sale.total_sft).toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Total Piece</p>
            <p className="text-lg font-bold">{Number(sale.total_piece)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Discount</p>
            <p className="text-lg font-bold">{formatCurrency(sale.discount)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Paid</p>
            <p className="text-lg font-bold text-primary">{formatCurrency(sale.paid_amount)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Due</p>
            <p className={`text-lg font-bold ${Number(sale.due_amount) > 0 ? "text-destructive" : ""}`}>
              {formatCurrency(sale.due_amount)}
            </p>
          </div>
        </CardContent>
        <Separator />
        <CardContent className="flex items-center justify-between pt-4">
          <span className="text-lg font-semibold text-foreground">Grand Total</span>
          <span className="text-2xl font-bold text-primary">{formatCurrency(sale.total_amount)}</span>
        </CardContent>
      </Card>

      {/* Profit Summary — Owner only, hidden from print if desired */}
      {isDealerAdmin && (
        <Card className="border-primary/30 bg-primary/5 print:hidden">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-primary" />
              Profit Summary
              <Badge variant="secondary" className="ml-1 text-xs">Owner Only</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-center md:grid-cols-4">
            <div className="rounded-md bg-background p-3">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Cost of Goods</p>
              <p className="text-lg font-bold text-destructive">{formatCurrency((sale as any).cogs ?? 0)}</p>
            </div>
            <div className="rounded-md bg-background p-3">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Gross Profit</p>
              <p className={`text-lg font-bold ${Number((sale as any).gross_profit ?? (sale as any).profit) >= 0 ? "text-primary" : "text-destructive"}`}>
                {formatCurrency((sale as any).gross_profit ?? (sale as any).profit)}
              </p>
            </div>
            <div className="rounded-md bg-background p-3">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Net Profit</p>
              <p className={`text-lg font-bold ${Number((sale as any).net_profit ?? (sale as any).profit) >= 0 ? "text-primary" : "text-destructive"}`}>
                {formatCurrency((sale as any).net_profit ?? (sale as any).profit)}
              </p>
            </div>
            <div className="rounded-md bg-background p-3">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Margin %</p>
              <p className={`text-lg font-bold ${Number(sale.total_amount) > 0 && Number((sale as any).net_profit ?? (sale as any).profit) >= 0 ? "text-primary" : "text-destructive"}`}>
                {Number(sale.total_amount) > 0
                  ? `${(((Number((sale as any).net_profit ?? (sale as any).profit)) / Number(sale.total_amount)) * 100).toFixed(1)}%`
                  : "—"}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default InvoicePage;
