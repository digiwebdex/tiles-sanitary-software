import { useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import BarcodeLabel from "./BarcodeLabel";

interface Product {
  id: string;
  sku: string;
  name: string;
  default_sale_rate: number;
}

interface BarcodePrintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Product[];
}

const BarcodePrintDialog = ({ open, onOpenChange, products }: BarcodePrintDialogProps) => {
  const [showPrice, setShowPrice] = useState(true);
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    if (!printRef.current) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html><head><title>Barcode Print</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: sans-serif; }
        .grid { display: flex; flex-wrap: wrap; gap: 8px; padding: 8px; }
        .label { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px; border: 1px solid #ccc; border-radius: 4px; width: 200px; }
        .label p { margin: 0; }
        .name { font-size: 10px; font-weight: 600; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .sku { font-size: 9px; font-family: monospace; }
        .price { font-size: 10px; font-weight: 700; }
        svg { width: 100%; }
        @media print { .grid { gap: 4px; padding: 4px; } .label { border-color: #000; } }
      </style></head><body>
      <div class="grid">${printRef.current.innerHTML}</div>
      </body></html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 300);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Print Barcodes ({products.length} products)</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 py-2">
          <Switch id="show-price" checked={showPrice} onCheckedChange={setShowPrice} />
          <Label htmlFor="show-price">Show sale price</Label>
        </div>

        <div ref={printRef} className="flex flex-wrap gap-2 p-2 border rounded-md bg-white">
          {products.map((p) => (
            <BarcodeLabel
              key={p.id}
              sku={p.sku}
              name={p.name}
              price={p.default_sale_rate}
              showPrice={showPrice}
            />
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={handlePrint}>Print</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BarcodePrintDialog;
