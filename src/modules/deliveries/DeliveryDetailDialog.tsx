import { useQuery } from "@tanstack/react-query";
import { deliveryService } from "@/services/deliveryService";
import { useDealerInfo } from "@/hooks/useDealerInfo";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Printer, X } from "lucide-react";

interface Props {
  deliveryId: string | null;
  dealerId: string;
  onClose: () => void;
}

const DeliveryDetailDialog = ({ deliveryId, dealerId, onClose }: Props) => {
  const { data: dealerInfo } = useDealerInfo();

  const { data: delivery, isLoading } = useQuery({
    queryKey: ["delivery-detail", deliveryId],
    queryFn: () => deliveryService.getById(deliveryId!, dealerId),
    enabled: !!deliveryId,
  });

  if (!deliveryId) return null;

  const sale = (delivery as any)?.sales;
  const customer = sale?.customers;
  const items = sale?.sale_items ?? [];
  const challanNo = (delivery as any)?.challans?.challan_no;
  const invoiceNo = sale?.invoice_number;
  const address = delivery?.delivery_address || customer?.address || "—";
  const phone = delivery?.receiver_phone || customer?.phone;
  const businessName = dealerInfo?.name ?? "Your Business";

  const statusLabel = delivery?.status === "delivered"
    ? "Delivered"
    : delivery?.status === "in_transit"
    ? "In Transit"
    : "Pending";

  return (
    <Dialog open={!!deliveryId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
        {/* Header toolbar */}
        <div className="flex items-center justify-between px-6 pt-4 pb-2">
          <DialogTitle className="sr-only">Delivery Details</DialogTitle>
          <div />
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.print()}
            >
              <Printer className="mr-1.5 h-3.5 w-3.5" /> Print
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {isLoading ? (
          <p className="p-6 text-muted-foreground">Loading…</p>
        ) : !delivery ? (
          <p className="p-6 text-destructive">Delivery not found</p>
        ) : (
          <div className="px-6 pb-6 space-y-5 text-sm">
            {/* Company Header */}
            <div className="flex justify-center">
              <div className="text-center">
                <div className="mx-auto mb-1 h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <span className="text-xl font-black text-primary">{businessName.charAt(0)}</span>
                </div>
                <p className="font-bold text-foreground">{businessName}</p>
                <p className="text-xs text-muted-foreground">Tile & Sanitary Dealer</p>
              </div>
            </div>

            <Separator />

            {/* Info Table */}
            <table className="w-full text-sm">
              <tbody>
                <InfoRow label="Date" value={delivery.delivery_date} />
                <InfoRow label="Delivery Reference No" value={challanNo || `DO${delivery.id.slice(0, 12)}`} />
                <InfoRow label="Sale Reference No" value={invoiceNo || "—"} />
                <InfoRow label="Customer" value={customer?.name ?? delivery.receiver_name ?? "—"} />
                <InfoRow
                  label="Address"
                  value={
                    <div>
                      <p>{address}</p>
                      {phone && <p>Tel: {phone}</p>}
                    </div>
                  }
                />
                <InfoRow
                  label="Status"
                  value={
                    <Badge
                      className={
                        delivery.status === "delivered"
                          ? "bg-green-600 text-white text-xs"
                          : delivery.status === "in_transit"
                          ? "border-blue-500 text-blue-600 text-xs"
                          : "text-xs"
                      }
                      variant={delivery.status === "delivered" ? "default" : "outline"}
                    >
                      {statusLabel}
                    </Badge>
                  }
                />
              </tbody>
            </table>

            <Separator />

            {/* Items */}
            <div>
              <p className="font-semibold text-foreground mb-2">Items</p>
              {items.length === 0 ? (
                <p className="text-muted-foreground text-xs">No items linked to this delivery.</p>
              ) : (
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-primary text-primary-foreground">
                      <th className="px-3 py-2 text-left font-semibold w-10">No</th>
                      <th className="px-3 py-2 text-left font-semibold">Description</th>
                      <th className="px-3 py-2 text-center font-semibold">Box/Pcs</th>
                      <th className="px-3 py-2 text-right font-semibold">Quantity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item: any, idx: number) => {
                      const product = item.products;
                      const isBox = product?.unit_type === "box_sft";
                      const sft = item.total_sft ? `${Number(item.total_sft).toFixed(2)} Sft` : "";
                      const boxPcs = isBox ? `${item.quantity} box` : `${item.quantity} pc`;

                      return (
                        <tr key={item.id} className={idx % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                          <td className="px-3 py-2 border-b text-muted-foreground">{idx + 1}</td>
                          <td className="px-3 py-2 border-b">
                            <span className="font-medium">{product?.name}</span>
                            {product?.sku && (
                              <span className="text-xs text-muted-foreground ml-1">({product.sku})</span>
                            )}
                          </td>
                          <td className="px-3 py-2 border-b text-center">{boxPcs}</td>
                          <td className="px-3 py-2 border-b text-right">{sft || boxPcs}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <Separator />

            {/* Footer signatures */}
            <div className="grid grid-cols-3 gap-4 text-xs text-muted-foreground pt-2">
              <div>
                <p className="font-medium text-foreground">Prepared by:</p>
                <p>{delivery.created_by ?? "—"}</p>
              </div>
              <div>
                <p className="font-medium text-foreground">Delivered by:</p>
                <p>{delivery.receiver_name ?? "—"}</p>
              </div>
              <div>
                <p className="font-medium text-foreground">Received by:</p>
                <p>—</p>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

const InfoRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <tr className="border-b last:border-0">
    <td className="py-2 pr-4 font-medium text-muted-foreground w-44">{label}</td>
    <td className="py-2 text-foreground">{value}</td>
  </tr>
);

export default DeliveryDetailDialog;
