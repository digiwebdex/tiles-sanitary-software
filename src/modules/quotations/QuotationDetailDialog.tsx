import { useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Printer, X, GitBranch, ShoppingCart, ExternalLink } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { quotationService, formatQuotationDisplayNo } from "@/services/quotationService";
import { useDealerInfo } from "@/hooks/useDealerInfo";
import { useDealerId } from "@/hooks/useDealerId";
import QuotationDocument from "@/components/quotation/QuotationDocument";
import { QuotationStatusBadge } from "@/components/quotation/QuotationStatusBadge";
import { formatCurrency, parseLocalDate } from "@/lib/utils";

interface Props {
  quotationId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

const fmtDate = (d?: string | null) => {
  if (!d) return "—";
  const dt = parseLocalDate(d);
  return dt ? dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : d;
};

const QuotationDetailDialog = ({ quotationId, open, onOpenChange }: Props) => {
  const printRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const dealerId = useDealerId();
  const qc = useQueryClient();
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

  const { data: chain = [] } = useQuery({
    queryKey: ["quotation-chain", quotationId],
    queryFn: () => quotationService.getRevisionChain(quotation!),
    enabled: open && !!quotation,
  });

  const reviseMutation = useMutation({
    mutationFn: () => quotationService.revise(quotationId, dealerId),
    onSuccess: (newId) => {
      toast.success("Revision created");
      qc.invalidateQueries({ queryKey: ["quotations"] });
      onOpenChange(false);
      navigate(`/quotations/${newId}/edit`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleConvert = async () => {
    if (!quotation) return;
    try {
      const prefill = await quotationService.prepareConversionPrefill(quotationId, dealerId);
      if (prefill.blockers.length > 0) {
        toast.error(prefill.blockers[0], {
          description: prefill.blockers.length > 1 ? `+${prefill.blockers.length - 1} more issue(s)` : undefined,
        });
        return;
      }
      onOpenChange(false);
      navigate("/sales/new", {
        state: {
          quotation_id: quotationId,
          customer_name: prefill.customer_name,
          discount: prefill.discount,
          notes: prefill.notes,
          items: prefill.items,
        },
      });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

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

  const canRevise = quotation && (quotation.status === "active" || quotation.status === "expired");
  const canConvert = quotation && quotation.status === "active";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto p-0">
        <DialogHeader className="px-6 pt-6 pb-2 flex-row items-center justify-between space-y-0">
          <div className="space-y-1">
            <DialogTitle>Quotation Detail</DialogTitle>
            {quotation && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono">{formatQuotationDisplayNo(quotation)}</span>
                <QuotationStatusBadge status={quotation.status} />
                {quotation.converted_sale_id && (
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs"
                    onClick={() => {
                      onOpenChange(false);
                      navigate(`/sales/${quotation.converted_sale_id}/invoice`);
                    }}
                  >
                    <ExternalLink className="h-3 w-3 mr-1" /> View linked sale
                  </Button>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {canRevise && (
              <Button
                variant="outline" size="sm"
                onClick={() => {
                  if (confirm("Create a new revision? The current quote will be marked as Revised.")) {
                    reviseMutation.mutate();
                  }
                }}
                disabled={reviseMutation.isPending}
              >
                <GitBranch className="h-4 w-4 mr-1" /> Revise
              </Button>
            )}
            {canConvert && (
              <Button size="sm" onClick={handleConvert}>
                <ShoppingCart className="h-4 w-4 mr-1" /> Convert to Sale
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handlePrint} disabled={!quotation}>
              <Printer className="h-4 w-4 mr-1" /> Print
            </Button>
            <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        {chain.length > 1 && (
          <div className="px-6 pb-2">
            <Card>
              <CardContent className="py-3">
                <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Revision History</p>
                <div className="space-y-1">
                  {chain.map((c) => (
                    <div
                      key={c.id}
                      className={`flex items-center justify-between text-sm rounded px-2 py-1.5 ${
                        c.id === quotationId ? "bg-primary/10 border border-primary/30" : "hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs">{formatQuotationDisplayNo(c)}</span>
                        <QuotationStatusBadge status={c.status} />
                        <span className="text-xs text-muted-foreground">{fmtDate(c.quote_date)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{formatCurrency(c.total_amount)}</span>
                        {c.id !== quotationId && (
                          <Badge variant="outline" className="text-xs cursor-pointer" onClick={() => {
                            onOpenChange(false);
                            // Reopen with the other revision
                            setTimeout(() => {
                              const evt = new CustomEvent("open-quotation-detail", { detail: { id: c.id } });
                              window.dispatchEvent(evt);
                            }, 50);
                          }}>
                            View
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

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
