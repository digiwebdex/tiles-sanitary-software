import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import { backorderAllocationService, FULFILLMENT_STATUS_LABELS, FULFILLMENT_STATUS_COLORS } from "@/services/backorderAllocationService";

interface ReportProps {
  dealerId: string;
}

/** Backorder Report — shows all items with active backorder qty */
export function BackorderReport({ dealerId }: ReportProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["report-backorder", dealerId],
    queryFn: () => backorderAllocationService.getBackorderSummary(dealerId),
    enabled: !!dealerId,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Backorder Report</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-muted-foreground">Loading…</p> : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-center">Ordered</TableHead>
                  <TableHead className="text-center">Backorder Qty</TableHead>
                  <TableHead className="text-center">Allocated</TableHead>
                  <TableHead className="text-center">Unfulfilled</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      No active backorders
                    </TableCell>
                  </TableRow>
                ) : (data ?? []).map((item: any) => {
                  const unfulfilled = Math.max(0, Number(item.backorder_qty) - Number(item.allocated_qty));
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-sm">{item.sales?.invoice_number ?? "—"}</TableCell>
                      <TableCell>{item.sales?.sale_date ?? "—"}</TableCell>
                      <TableCell>{item.sales?.customers?.name ?? "—"}</TableCell>
                      <TableCell>
                        <span className="font-medium">{item.products?.name}</span>
                        <span className="text-xs text-muted-foreground ml-1">({item.products?.sku})</span>
                      </TableCell>
                      <TableCell className="text-center">{item.quantity}</TableCell>
                      <TableCell className="text-center font-semibold text-amber-600">{item.backorder_qty}</TableCell>
                      <TableCell className="text-center font-semibold text-blue-600">{item.allocated_qty}</TableCell>
                      <TableCell className="text-center font-bold text-red-600">{unfulfilled}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className={`text-xs ${FULFILLMENT_STATUS_COLORS[item.fulfillment_status] ?? ""}`}>
                          {FULFILLMENT_STATUS_LABELS[item.fulfillment_status] ?? item.fulfillment_status}
                        </Badge>
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

/** Pending Fulfillment Report — all items not yet fully delivered */
export function PendingFulfillmentReport({ dealerId }: ReportProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["report-pending-fulfillment", dealerId],
    queryFn: () => backorderAllocationService.getPendingFulfillment(dealerId),
    enabled: !!dealerId,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Pending Fulfillment Report</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-muted-foreground">Loading…</p> : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-center">Ordered</TableHead>
                  <TableHead className="text-center">Backorder</TableHead>
                  <TableHead className="text-center">Allocated</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      All items fulfilled
                    </TableCell>
                  </TableRow>
                ) : (data ?? []).map((item: any) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-sm">{item.sales?.invoice_number ?? "—"}</TableCell>
                    <TableCell>{item.sales?.customers?.name ?? "—"}</TableCell>
                    <TableCell className="font-medium">{item.products?.name}</TableCell>
                    <TableCell className="text-center">{item.quantity}</TableCell>
                    <TableCell className="text-center text-amber-600 font-semibold">{item.backorder_qty}</TableCell>
                    <TableCell className="text-center text-blue-600 font-semibold">{item.allocated_qty}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={`text-xs ${FULFILLMENT_STATUS_COLORS[item.fulfillment_status] ?? ""}`}>
                        {FULFILLMENT_STATUS_LABELS[item.fulfillment_status] ?? item.fulfillment_status}
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

/** Product Shortage Demand Report — aggregated shortage by product */
export function ShortageDemandReport({ dealerId }: ReportProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["report-shortage-demand", dealerId],
    queryFn: () => backorderAllocationService.getShortageDemandReport(dealerId),
    enabled: !!dealerId,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Product Shortage Demand Report</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-muted-foreground">Loading…</p> : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="text-center">Total Shortage</TableHead>
                  <TableHead className="text-center">Allocated</TableHead>
                  <TableHead className="text-center">Still Needed</TableHead>
                  <TableHead className="text-center">Pending Orders</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No product shortages
                    </TableCell>
                  </TableRow>
                ) : (data ?? []).map((item: any) => (
                  <TableRow key={item.product_id}>
                    <TableCell>
                      <span className="font-medium">{item.name}</span>
                      <span className="text-xs text-muted-foreground ml-1">({item.sku})</span>
                    </TableCell>
                    <TableCell>{item.brand}</TableCell>
                    <TableCell>{item.unit_type === "box_sft" ? "Box" : "Piece"}</TableCell>
                    <TableCell className="text-center font-semibold text-amber-600">{item.totalShortage}</TableCell>
                    <TableCell className="text-center font-semibold text-blue-600">{item.totalAllocated}</TableCell>
                    <TableCell className="text-center font-bold text-red-600">{item.unfulfilledQty}</TableCell>
                    <TableCell className="text-center">{item.pendingCount}</TableCell>
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

/** Customer Pending Delivery Report */
export function CustomerPendingDeliveryReport({ dealerId }: ReportProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["report-customer-pending-delivery", dealerId],
    queryFn: () => backorderAllocationService.getPendingFulfillment(dealerId),
    enabled: !!dealerId,
  });

  // Aggregate by customer
  const customerMap = new Map<string, { name: string; items: any[]; totalQty: number; totalBackorder: number }>();
  for (const item of data ?? []) {
    const cid = (item as any).sales?.customer_id ?? "unknown";
    const cname = (item as any).sales?.customers?.name ?? "Unknown";
    const existing = customerMap.get(cid);
    if (existing) {
      existing.items.push(item);
      existing.totalQty += Number(item.quantity);
      existing.totalBackorder += Number(item.backorder_qty);
    } else {
      customerMap.set(cid, {
        name: cname,
        items: [item],
        totalQty: Number(item.quantity),
        totalBackorder: Number(item.backorder_qty),
      });
    }
  }

  const customers = Array.from(customerMap.entries())
    .sort((a, b) => b[1].totalBackorder - a[1].totalBackorder);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Customer Pending Delivery Report</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-muted-foreground">Loading…</p> : customers.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No pending deliveries</p>
        ) : (
          <div className="space-y-4">
            {customers.map(([cid, cust]) => (
              <div key={cid} className="rounded-md border">
                <div className="bg-muted/50 px-4 py-2 flex justify-between items-center">
                  <span className="font-semibold">{cust.name}</span>
                  <Badge variant="outline" className="text-xs text-amber-600 border-amber-400">
                    {cust.totalBackorder} pending
                  </Badge>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-center">Ordered</TableHead>
                      <TableHead className="text-center">Pending</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cust.items.map((item: any) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono text-sm">{item.sales?.invoice_number ?? "—"}</TableCell>
                        <TableCell>{item.products?.name ?? "—"}</TableCell>
                        <TableCell className="text-center">{item.quantity}</TableCell>
                        <TableCell className="text-center font-semibold text-amber-600">{item.backorder_qty}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={`text-xs ${FULFILLMENT_STATUS_COLORS[item.fulfillment_status] ?? ""}`}>
                            {FULFILLMENT_STATUS_LABELS[item.fulfillment_status] ?? item.fulfillment_status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
