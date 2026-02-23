import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

interface BarcodeLabelProps {
  sku: string;
  name: string;
  price?: number;
  showPrice?: boolean;
}

const BarcodeLabel = ({ sku, name, price, showPrice = true }: BarcodeLabelProps) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (svgRef.current && sku) {
      try {
        JsBarcode(svgRef.current, sku, {
          format: "CODE128",
          width: 1.5,
          height: 40,
          displayValue: false,
          margin: 2,
        });
      } catch {
        // Invalid barcode value fallback
      }
    }
  }, [sku]);

  return (
    <div className="flex flex-col items-center gap-0.5 p-2 border border-border rounded w-[200px] bg-white text-black print:border-black">
      <p className="text-[10px] font-semibold truncate max-w-full leading-tight">{name}</p>
      <svg ref={svgRef} className="w-full" />
      <p className="text-[9px] font-mono">{sku}</p>
      {showPrice && price != null && (
        <p className="text-[10px] font-bold">৳{price.toLocaleString()}</p>
      )}
    </div>
  );
};

export default BarcodeLabel;
