import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { purchaseService } from "@/services/purchaseService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { LinkedShortagesPanel } from "@/components/LinkedShortagesPanel";
import { useDealerId } from "@/hooks/useDealerId";

// TODO: Replace with actual role from auth context
const TEMP_SHOW_OFFER = true;

const ViewPurchasePage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const dealerId = useDealerId();

  const { data: purchase, isLoading } = useQuery({
    queryKey: ["purchase", id],
    queryFn: () => purchaseService.getById(id!),
    enabled: !!id,
  });

  if (isLoading) return <p className="p-6 text-muted-foreground">Loading…</p>;
  if (!purchase) return <p className="p-6 text-destructive">Purchase not found</p>;

  const items = (purchase as any).purchase_items ?? [];

  return (
    <div className="container mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate("/purchases")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold text-foreground">Purchase Details</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Purchase Info</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          <div>
            <span className="text-muted-foreground">Invoice #</span>
            <p className="font-medium">{purchase.invoice_number || "—"}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Date</span>
            <p className="font-medium">{purchase.purchase_date}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Supplier</span>
            <p className="font-medium">{(purchase as any).suppliers?.name ?? "—"}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Total</span>
            <p className="font-medium">{formatCurrency(purchase.total_amount)}</p>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead>Rate</TableHead>
              {TEMP_SHOW_OFFER && <TableHead>Offer</TableHead>}
              <TableHead>Transport</TableHead>
              <TableHead>Labor</TableHead>
              <TableHead>Other</TableHead>
              <TableHead>SFT</TableHead>
              <TableHead className="text-right">Landed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item: any) => (
              <TableRow key={item.id}>
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
                <TableCell>{formatCurrency(item.purchase_rate)}</TableCell>
                {TEMP_SHOW_OFFER && <TableCell>{formatCurrency(item.offer_price)}</TableCell>}
                <TableCell>{formatCurrency(item.transport_cost)}</TableCell>
                <TableCell>{formatCurrency(item.labor_cost)}</TableCell>
                <TableCell>{formatCurrency(item.other_cost)}</TableCell>
                <TableCell>{item.total_sft ? Number(item.total_sft).toFixed(2) : "—"}</TableCell>
                <TableCell className="text-right font-semibold">{formatCurrency(item.landed_cost)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default ViewPurchasePage;
