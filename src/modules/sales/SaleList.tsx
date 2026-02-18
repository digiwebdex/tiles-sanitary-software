import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { salesService } from "@/services/salesService";
import Pagination from "@/components/Pagination";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, FileText } from "lucide-react";

interface SaleListProps {
  dealerId: string;
}

const PAGE_SIZE = 25;

const SaleList = ({ dealerId }: SaleListProps) => {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["sales", dealerId, page],
    queryFn: () => salesService.list(dealerId, page),
    enabled: !!dealerId,
  });

  const sales = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-foreground">Sales</h1>
        <Button onClick={() => navigate("/sales/new")}>
          <Plus className="mr-2 h-4 w-4" /> New Sale
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : sales.length === 0 ? (
        <p className="text-muted-foreground">No sales found.</p>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Due</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-sm">{s.invoice_number}</TableCell>
                    <TableCell>{s.sale_date}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        {s.customers?.name ?? "—"}
                        <Badge variant="outline" className="text-xs capitalize">{s.customers?.type}</Badge>
                      </span>
                    </TableCell>
                    <TableCell className="text-right">₹{Number(s.total_amount).toFixed(2)}</TableCell>
                    <TableCell className="text-right">₹{Number(s.paid_amount).toFixed(2)}</TableCell>
                    <TableCell className={`text-right ${Number(s.due_amount) > 0 ? "text-destructive font-semibold" : ""}`}>
                      ₹{Number(s.due_amount).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" onClick={() => navigate(`/sales/${s.id}/invoice`)}>
                        <FileText className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {totalPages > 1 && (
            <Pagination page={page} totalItems={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
          )}
        </>
      )}
    </div>
  );
};

export default SaleList;
