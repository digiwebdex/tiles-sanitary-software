import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePortalAuth } from "@/contexts/PortalAuthContext";
import { listPortalQuotations } from "@/services/portalService";
import { PortalListSkeleton } from "./PortalLayout";

const fmtBDT = (n: number) =>
  `৳${Number(n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PortalQuotationsPage() {
  const { context } = usePortalAuth();
  const customerId = context?.customer_id ?? "";

  const { data, isLoading } = useQuery({
    queryKey: ["portal", "quotations", customerId],
    queryFn: () => listPortalQuotations(customerId),
    enabled: !!customerId,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>My Quotations</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <PortalListSkeleton />
        ) : (data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No quotations yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quotation No.</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Valid until</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data!.map((q) => (
                  <TableRow key={q.id}>
                    <TableCell className="font-medium">
                      {q.quotation_no}
                      {q.revision_no > 1 && (
                        <span className="text-xs text-muted-foreground"> · rev {q.revision_no}</span>
                      )}
                    </TableCell>
                    <TableCell>{q.quote_date}</TableCell>
                    <TableCell>{q.valid_until}</TableCell>
                    <TableCell>
                      <Badge variant={q.status === "active" ? "default" : "secondary"}>
                        {q.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{fmtBDT(q.total_amount)}</TableCell>
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
