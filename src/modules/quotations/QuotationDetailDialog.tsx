import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer, X } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { quotationService } from "@/services/quotationService";
import { useDealerInfo } from "@/hooks/useDealerInfo";
import QuotationDocument from "@/components/quotation/QuotationDocument";

interface Props {
  quotationId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

const QuotationDetailDialog = ({ quotationId, open, onOpenChange }: Props) => {
  const printRef = useRef<HTMLDivElement>(null);
  const { data: dealerInfo } = useDealerInfo();

  const { data: quotation } = useQuery({
    queryKey: ["quotation", quotationId],
    queryFn: () => quotationService.getById(quotationId),
    enabled: open,
  });

  const { data: items = [] } = useQuery({
    queryKey: ["quotation-items", quotationId],
    queryFn: () => quotationService.listItems(quotationId),
    enabled: open,
  });

  const handlePrint = () => {
    if (!printRef.current) return;
    const w = window.open("", "_blank", "width=900,height=1100");
    if (!w) return;
    w.document.write(`
      <html><head><title>Quotation</title>
        <style>
          body{font-family:system-ui,sans-serif;color:#0f172a;margin:0}
          table{border-collapse:collapse;width:100%}
          th,td{padding:6px 10px;font-size:13px;text-align:left}
          thead tr{background:#0f172a;color:#fff}
          .text-right{text-align:right}
          .text-center{text-align:center}
          .font-bold{font-weight:700}
          .text-xs{font-size:11px}
          .text-muted-foreground{color:#64748b}
          .border-b{border-bottom:1px solid #e2e8f0}
          hr{border:none;border-top:1px solid #e2e8f0;margin:8px 0}
          @media print{ .no-print{display:none} }
        </style>
      </head><body>${printRef.current.innerHTML}</body></html>
    `);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 250);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto p-0">
        <DialogHeader className="px-6 pt-6 pb-2 flex-row items-center justify-between space-y-0">
          <DialogTitle>Quotation Detail</DialogTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handlePrint} disabled={!quotation}>
              <Printer className="h-4 w-4 mr-1" /> Print
            </Button>
            <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>
        <div ref={printRef}>
          {quotation && (
            <QuotationDocument
              quotation={quotation}
              items={items}
              customer={quotation.customers ?? undefined}
              dealerInfo={dealerInfo ?? undefined}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default QuotationDetailDialog;
