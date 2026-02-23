import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

interface Props {
  value: string;
}

const SaleInvoiceBarcode = ({ value }: Props) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (svgRef.current && value) {
      try {
        JsBarcode(svgRef.current, value, {
          format: "CODE128",
          width: 1.2,
          height: 40,
          displayValue: false,
          margin: 0,
        });
      } catch {
        // invalid barcode value — ignore
      }
    }
  }, [value]);

  return <svg ref={svgRef} className="h-10" />;
};

export default SaleInvoiceBarcode;
