import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { salesReturnService } from "@/services/salesReturnService";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface SalesReturnListProps {
  dealerId: string;
}

const SalesReturnList = ({ dealerId }: SalesReturnListProps) => {
  const navigate = useNavigate();

  const { data: returns = [], isLoading } = useQuery({
    queryKey: ["sales-returns", dealerId],
    queryFn: () => salesReturnService.list(dealerId),
    enabled: !!dealerId,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-foreground">Sales Returns</h1>
        <Button onClick={() => navigate("/sales-returns/new")}>
          <Plus className="mr-2 h-4 w-4" /> New Return
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : returns.length === 0 ? (
        <p className="text-muted-foreground">No returns found.</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Refund</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {returns.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell>{r.return_date}</TableCell>
                  <TableCell className="font-mono text-sm">
                    {r.sales?.invoice_number ?? "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span>{r.products?.name}</span>
                      <span className="font-mono text-xs text-muted-foreground">{r.products?.sku}</span>
                    </div>
                  </TableCell>
                  <TableCell>{r.qty}</TableCell>
                  <TableCell>
                    {r.is_broken ? (
                      <Badge variant="destructive">Broken</Badge>
                    ) : (
                      <Badge variant="secondary">Restocked</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(r.refund_amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};

export default SalesReturnList;
