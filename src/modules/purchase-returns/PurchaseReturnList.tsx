import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { purchaseReturnService } from "@/services/purchaseReturnService";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import Pagination from "@/components/Pagination";
import { Plus } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface PurchaseReturnListProps {
  dealerId: string;
}

const PurchaseReturnList = ({ dealerId }: PurchaseReturnListProps) => {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["purchase-returns", dealerId, page],
    queryFn: () => purchaseReturnService.list(dealerId, page),
    enabled: !!dealerId,
  });

  const returns = data?.data ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-foreground">Purchase Returns</h1>
        <Button onClick={() => navigate("/purchase-returns/new")}>
          <Plus className="mr-2 h-4 w-4" /> New Purchase Return
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : returns.length === 0 ? (
        <p className="text-muted-foreground">No purchase returns found.</p>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Return No</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {returns.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-sm">{r.return_no}</TableCell>
                    <TableCell>{r.return_date}</TableCell>
                    <TableCell>{(r.suppliers as any)?.name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize text-xs">{r.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(r.total_amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pagination page={page} totalItems={total} pageSize={25} onPageChange={setPage} />
        </>
      )}
    </div>
  );
};

export default PurchaseReturnList;
