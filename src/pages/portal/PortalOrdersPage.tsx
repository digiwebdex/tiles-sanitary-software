import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePortalAuth } from "@/contexts/PortalAuthContext";
import { listPortalSales } from "@/services/portalService";
import { PortalListSkeleton } from "./PortalLayout";

const fmtBDT = (n: number) =>
  `৳${Number(n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PortalOrdersPage() {
  const { context } = usePortalAuth();
  const customerId = context?.customer_id ?? "";

  const { data, isLoading } = useQuery({
    queryKey: ["portal", "sales", customerId],
    queryFn: () => listPortalSales(customerId),
    enabled: !!customerId,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>My Orders</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <PortalListSkeleton />
        ) : (data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No orders yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice No.</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data!.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.invoice_no ?? s.id.slice(0, 8)}</TableCell>
                    <TableCell>{s.sale_date}</TableCell>
                    <TableCell>
                      <Badge variant={s.status === "paid" ? "default" : "secondary"}>
                        {s.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{fmtBDT(s.total_amount)}</TableCell>
                    <TableCell className="text-right">{fmtBDT(s.paid_amount ?? 0)}</TableCell>
                    <TableCell className={`text-right ${(s.balance_due ?? 0) > 0 ? "text-destructive font-semibold" : ""}`}>
                      {fmtBDT(s.balance_due ?? 0)}
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
