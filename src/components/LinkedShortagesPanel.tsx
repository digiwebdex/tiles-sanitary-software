import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Folder, Link2 } from "lucide-react";
import { purchasePlanningService } from "@/services/purchasePlanningService";
import { ShortageStatusBadge } from "@/components/CreatePurchaseDraftDialog";

interface LinkedShortagesPanelProps {
  dealerId: string;
  purchaseId: string;
}

/**
 * Read-only panel for ViewPurchase that shows which customer shortage demands
 * this purchase was planned to cover. No stock/ledger side effect.
 */
export function LinkedShortagesPanel({ dealerId, purchaseId }: LinkedShortagesPanelProps) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["purchase-linked-shortages", dealerId, purchaseId],
    queryFn: () => purchasePlanningService.linksForPurchase(dealerId, purchaseId),
    enabled: !!dealerId && !!purchaseId,
  });

  if (isLoading) return null;
  if (rows.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Link2 className="h-4 w-4 text-primary" />
          Covering Customer Shortages
          <Badge variant="secondary">{rows.length}</Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Customer demand lines this purchase was planned to fulfil. Status updates
          automatically as backorder allocations consume the new stock.
        </p>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Project / Site</TableHead>
                <TableHead className="text-center">Linked Qty</TableHead>
                <TableHead className="text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.link_id}>
                  <TableCell className="font-medium">{r.customer_name}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {r.invoice_number ?? "—"}
                    {r.sale_date && (
                      <span className="text-muted-foreground ml-1">• {r.sale_date}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span>{r.product_name}</span>
                    <span className="text-xs text-muted-foreground ml-1">({r.product_sku})</span>
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.project_name ? (
                      <Badge variant="outline" className="text-xs">
                        <Folder className="h-3 w-3 mr-1" />
                        {r.project_name}
                        {r.site_name && <span className="text-muted-foreground"> › {r.site_name}</span>}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center font-semibold">
                    {r.planned_qty} {r.unit_type === "box_sft" ? "box" : "pc"}
                  </TableCell>
                  <TableCell className="text-center">
                    <ShortageStatusBadge status={r.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
