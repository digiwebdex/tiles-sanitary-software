import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { productService } from "@/services/productService";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: { id: string; name: string; sku: string; barcode: string | null } | null;
  dealerId: string;
}

const ChangeBarcodeDialog = ({ open, onOpenChange, product, dealerId }: Props) => {
  const [barcode, setBarcode] = useState("");
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      if (!barcode.trim()) throw new Error("Barcode is required");
      if (!product) throw new Error("No product selected");

      const isUnique = await productService.isBarcodeUnique(barcode, dealerId, product.id);
      if (!isUnique) throw new Error("This barcode already exists for another product");

      await productService.update(product.id, { barcode: barcode.trim() });
    },
    onSuccess: () => {
      toast.success("Barcode updated");
      qc.invalidateQueries({ queryKey: ["products"] });
      setBarcode("");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Change Barcode</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            <strong>{product.sku}</strong> — {product.name}
          </p>
          <p className="text-sm">Current: <strong>{product.barcode || "None"}</strong></p>
          <div>
            <Label>New Barcode *</Label>
            <Input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Scan or enter barcode" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !barcode.trim()}>
            {mutation.isPending ? "Saving…" : "Update Barcode"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ChangeBarcodeDialog;
