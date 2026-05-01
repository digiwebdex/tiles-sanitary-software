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

interface PurchaseHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string | null;
  productName: string;
  dealerId: string;
}

const PurchaseHistoryDialog = ({ open, onOpenChange, productId, productName, dealerId }: PurchaseHistoryDialogProps) => {
  const { data, isLoading } = useQuery({
    queryKey: ["product-purchase-history", productId, dealerId],
    queryFn: async () => {
      if (!productId) return [];
      const res = await vpsAuthedFetch(
        `/api/products/${productId}/purchase-history?dealerId=${encodeURIComponent(dealerId)}`,
      );
      if (!res.ok) throw new Error(`purchase-history failed: ${res.status}`);
      const json = await res.json();
      return (json.rows ?? []) as any[];
    },
    enabled: open && !!productId,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Purchase History — {productName}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : !data?.length ? (
          <p className="text-muted-foreground text-sm">No purchase history found.</p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Landed</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((item: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm">
                      {format(new Date(item.purchases.purchase_date), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell className="text-sm">{item.purchases.suppliers?.name ?? "—"}</TableCell>
                    <TableCell className="text-right text-sm">{formatCurrency(item.purchase_rate)}</TableCell>
                    <TableCell className="text-right text-sm">{formatCurrency(item.landed_cost)}</TableCell>
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

export default PurchaseHistoryDialog;
