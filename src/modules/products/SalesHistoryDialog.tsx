import { useQuery } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import { vpsAuthedFetch } from "@/lib/vpsAuthClient";
import { format } from "date-fns";

interface SalesHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string | null;
  productName: string;
  dealerId: string;
}

const SalesHistoryDialog = ({ open, onOpenChange, productId, productName, dealerId }: SalesHistoryDialogProps) => {
  const { data, isLoading } = useQuery({
    queryKey: ["product-sales-history", productId, dealerId],
    queryFn: async () => {
      if (!productId) return [];
      const res = await vpsAuthedFetch(
        `/api/products/${productId}/sales-history?dealerId=${encodeURIComponent(dealerId)}`,
      );
      if (!res.ok) throw new Error(`sales-history failed: ${res.status}`);
      const json = await res.json();
      return (json.rows ?? []) as any[];
    },
    enabled: open && !!productId,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Sales History — {productName}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : !data?.length ? (
          <p className="text-muted-foreground text-sm">No sales history found.</p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Sale Rate</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((item: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm">
                      {format(new Date(item.sales.sale_date), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell className="text-sm">{item.sales.customers?.name ?? "—"}</TableCell>
                    <TableCell className="text-right text-sm">{formatCurrency(item.sale_rate)}</TableCell>
                    <TableCell className="text-right text-sm">{item.quantity}</TableCell>
                    <TableCell className="text-right text-sm font-medium">{formatCurrency(item.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default SalesHistoryDialog;
