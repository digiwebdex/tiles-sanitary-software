import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePortalAuth } from "@/contexts/PortalAuthContext";
import { listPortalDeliveries } from "@/services/portalService";
import { PortalListSkeleton } from "./PortalLayout";

export default function PortalDeliveriesPage() {
  const { context } = usePortalAuth();
  const customerId = context?.customer_id ?? "";

  const { data, isLoading } = useQuery({
    queryKey: ["portal", "deliveries", customerId],
    queryFn: () => listPortalDeliveries(customerId),
    enabled: !!customerId,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>My Deliveries</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <PortalListSkeleton />
        ) : (data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No deliveries yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Delivery No.</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Receiver</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data!.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.delivery_no ?? d.id.slice(0, 8)}</TableCell>
                    <TableCell>{d.invoice_number ?? "—"}</TableCell>
                    <TableCell>{d.delivery_date}</TableCell>
                    <TableCell>{d.receiver_name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={d.status === "delivered" ? "default" : "secondary"}>
                        {d.status ?? "pending"}
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
