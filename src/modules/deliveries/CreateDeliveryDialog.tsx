import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { deliveryService, DeliveryItemInput } from "@/services/deliveryService";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Truck, Package, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  sale: any;
  dealerId: string;
}

const CreateDeliveryDialog = ({ open, onClose, sale, dealerId }: Props) => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const saleId = sale?.id;
  const saleItems: any[] = sale?.sale_items ?? [];
  const customer = sale?.customers;
  const productIds = saleItems.map((si: any) => si.product_id);

  // Fetch already-delivered quantities
  const { data: deliveredQty = {} } = useQuery({
    queryKey: ["delivered-qty", saleId],
    queryFn: () => deliveryService.getDeliveredQtyBySale(saleId, dealerId),
    enabled: open && !!saleId,
  });

  // Fetch current stock
  const { data: stockData = {} } = useQuery({
    queryKey: ["stock-for-delivery", productIds.join(",")],
    queryFn: () => deliveryService.getStockForProducts(productIds, dealerId),
    enabled: open && productIds.length > 0,
  });

  // Reset quantities when dialog opens
  useEffect(() => {
    if (open) setQuantities({});
  }, [open, saleId]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const items: DeliveryItemInput[] = saleItems
        .filter((si: any) => (quantities[si.id] || 0) > 0)
        .map((si: any) => ({
          sale_item_id: si.id,
          product_id: si.product_id,
          quantity: quantities[si.id],
        }));

      if (items.length === 0) throw new Error("কোনো আইটেমের পরিমাণ দেওয়া হয়নি");

      await deliveryService.create({
        dealer_id: dealerId,
        sale_id: saleId,
        delivery_date: new Date().toISOString().split("T")[0],
        receiver_name: customer?.name,
        delivery_address: customer?.address,
        receiver_phone: customer?.phone,
        created_by: profile?.id,
        items,
      });

      // Update sale delivery status
      await deliveryService.updateSaleDeliveryStatus(saleId, dealerId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deliveries"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["delivered-qty"] });
      toast.success("ডেলিভারি সফলভাবে তৈরি হয়েছে");
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const hasAnyQty = Object.values(quantities).some(q => q > 0);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" /> ডেলিভারি তৈরি করুন
          </DialogTitle>
          <DialogDescription>
            ইনভয়েস: {sale?.invoice_number ?? "—"} | কাস্টমার: {customer?.name ?? "—"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {saleItems.length === 0 ? (
            <p className="text-muted-foreground text-sm">এই সেলে কোনো আইটেম নেই।</p>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left px-3 py-2 font-medium">প্রডাক্ট</th>
                    <th className="text-center px-3 py-2 font-medium">অর্ডার</th>
                    <th className="text-center px-3 py-2 font-medium">ডেলিভারড</th>
                    <th className="text-center px-3 py-2 font-medium">বাকী</th>
                    <th className="text-center px-3 py-2 font-medium">স্টক</th>
                    <th className="text-center px-3 py-2 font-medium w-28">এবার দিন</th>
                  </tr>
                </thead>
                <tbody>
                  {saleItems.map((si: any) => {
                    const product = si.products;
                    const isBox = product?.unit_type === "box_sft";
                    const unit = isBox ? "box" : "pc";
                    const ordered = Number(si.quantity);
                    const delivered = deliveredQty[si.id] || 0;
                    const remaining = Math.max(0, ordered - delivered);
                    const stock = stockData[si.product_id];
                    const availableStock = isBox ? (stock?.box_qty ?? 0) : (stock?.piece_qty ?? 0);
                    const maxDeliverable = Math.min(remaining, availableStock);
                    const currentQty = quantities[si.id] || 0;
                    const progress = ordered > 0 ? ((delivered / ordered) * 100) : 0;

                    if (remaining <= 0) {
                      return (
                        <tr key={si.id} className="bg-green-50/50 dark:bg-green-950/20">
                          <td className="px-3 py-2">
                            <span className="font-medium">{product?.name}</span>
                            {product?.sku && <span className="text-xs text-muted-foreground ml-1">({product.sku})</span>}
                          </td>
                          <td className="text-center px-3 py-2">{ordered} {unit}</td>
                          <td className="text-center px-3 py-2 text-green-600 font-medium">{delivered} {unit}</td>
                          <td className="text-center px-3 py-2">
                            <Badge className="bg-green-600 text-white text-xs">সম্পূর্ণ</Badge>
                          </td>
                          <td className="text-center px-3 py-2">—</td>
                          <td className="text-center px-3 py-2">—</td>
                        </tr>
                      );
                    }

                    return (
                      <tr key={si.id} className="border-t">
                        <td className="px-3 py-2">
                          <div>
                            <span className="font-medium">{product?.name}</span>
                            {product?.sku && <span className="text-xs text-muted-foreground ml-1">({product.sku})</span>}
                          </div>
                          <Progress value={progress} className="h-1.5 mt-1" />
                        </td>
                        <td className="text-center px-3 py-2">{ordered} {unit}</td>
                        <td className="text-center px-3 py-2">{delivered} {unit}</td>
                        <td className="text-center px-3 py-2 font-semibold text-orange-600">{remaining} {unit}</td>
                        <td className="text-center px-3 py-2">
                          {availableStock <= 0 ? (
                            <span className="text-destructive text-xs flex items-center justify-center gap-1">
                              <AlertCircle className="h-3 w-3" /> নেই
                            </span>
                          ) : (
                            <span className={availableStock < remaining ? "text-yellow-600" : "text-green-600"}>
                              {availableStock} {unit}
                            </span>
                          )}
                        </td>
                        <td className="text-center px-3 py-2">
                          <Input
                            type="number"
                            min={0}
                            max={maxDeliverable}
                            value={currentQty || ""}
                            onChange={(e) => {
                              const val = Math.min(Math.max(0, Number(e.target.value)), maxDeliverable);
                              setQuantities(prev => ({ ...prev, [si.id]: val }));
                            }}
                            className="w-20 h-8 text-center mx-auto"
                            disabled={maxDeliverable <= 0}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>বাতিল</Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!hasAnyQty || createMutation.isPending}
          >
            <Package className="mr-2 h-4 w-4" />
            {createMutation.isPending ? "তৈরি হচ্ছে..." : "ডেলিভারি তৈরি করুন"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateDeliveryDialog;
