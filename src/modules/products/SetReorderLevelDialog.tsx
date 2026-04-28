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
  product: { id: string; name: string; sku: string; reorder_level: number } | null;
}

const SetReorderLevelDialog = ({ open, onOpenChange, product }: Props) => {
  const [level, setLevel] = useState("");
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const val = Number(level);
      if (isNaN(val) || val < 0) throw new Error("Level must be >= 0");
      if (!product) throw new Error("No product selected");

      await productService.update(product.id, { reorder_level: val });
    },
    onSuccess: () => {
      toast.success("Reorder level updated");
      qc.invalidateQueries({ queryKey: ["products"] });
      setLevel("");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Set Reorder Level</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            <strong>{product.sku}</strong> — {product.name}
          </p>
          <p className="text-sm">Current Level: <strong>{product.reorder_level || 0}</strong></p>
          <div>
            <Label>New Reorder Level *</Label>
            <Input type="number" min="0" value={level} onChange={(e) => setLevel(e.target.value)} placeholder="Enter quantity" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || level === ""}>
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SetReorderLevelDialog;
