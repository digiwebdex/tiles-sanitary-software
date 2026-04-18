import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Loader2, Printer } from "lucide-react";
import {
  getPortalInvoiceDoc,
  getPortalQuotationDoc,
  getPortalChallanDoc,
} from "@/services/portalService";

interface Props {
  kind: "invoice" | "quotation" | "challan";
}

const fmtBDT = (n: unknown) =>
  `৳${Number(n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PortalDocumentPage({ kind }: Props) {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ["portal", "doc", kind, id],
    queryFn: async () => {
      if (!id) return null;
      if (kind === "invoice") return getPortalInvoiceDoc(id);
      if (kind === "quotation") return getPortalQuotationDoc(id);
      return getPortalChallanDoc(id);
    },
    enabled: !!id,
  });

  useEffect(() => {
    document.title = `${kind.charAt(0).toUpperCase() + kind.slice(1)} document`;
  }, [kind]);

  if (isLoading) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-md mx-auto py-12 text-center space-y-2">
        <h1 className="text-lg font-semibold">Document not available</h1>
        <p className="text-sm text-muted-foreground">
          You don't have access to this document, or it no longer exists.
        </p>
      </div>
    );
  }

  // Narrow accessors
  const dealer = (data as { dealer?: Record<string, unknown> }).dealer ?? {};
  const customer = (data as { customer?: Record<string, unknown> }).customer ?? {};
  const items = (data as { items?: Record<string, unknown>[] }).items ?? [];
  const header =
    kind === "invoice"
      ? (data as { sale: Record<string, unknown> }).sale
      : kind === "quotation"
        ? (data as { quotation: Record<string, unknown> }).quotation
        : (data as { challan: Record<string, unknown> }).challan;

  const docNo = String(
    header[
      kind === "invoice" ? "invoice_number" : kind === "quotation" ? "quotation_no" : "challan_no"
    ] ?? "",
  );
  const docDate = String(
    header[kind === "invoice" ? "sale_date" : kind === "quotation" ? "quote_date" : "challan_date"] ?? "",
  );
  const total = Number(header.total_amount ?? 0);

  return (
    <div className="bg-background min-h-screen">
      <div className="max-w-3xl mx-auto p-6">
        <div className="flex justify-between items-center mb-4 print:hidden">
          <h1 className="text-xl font-bold capitalize">{kind} {docNo && `· ${docNo}`}</h1>
          <Button onClick={() => window.print()} size="sm">
            <Printer className="h-4 w-4 mr-1.5" /> Print / Save PDF
          </Button>
        </div>

        <div className="bg-card border border-border rounded-md p-6 print:border-0 print:p-0">
          <div className="flex justify-between mb-6 pb-4 border-b border-border">
            <div>
              <div className="text-lg font-bold">{String(dealer.name ?? "")}</div>
              <div className="text-xs text-muted-foreground">{String(dealer.address ?? "")}</div>
              <div className="text-xs text-muted-foreground">{String(dealer.phone ?? "")}</div>
            </div>
            <div className="text-right">
              <div className="font-bold uppercase">{kind}</div>
              <div className="text-sm">{docNo}</div>
              <div className="text-xs text-muted-foreground">{docDate}</div>
            </div>
          </div>

          <div className="mb-4">
            <div className="text-xs text-muted-foreground">Bill to</div>
            <div className="font-semibold">{String(customer.name ?? "")}</div>
            {customer.phone && <div className="text-xs">{String(customer.phone)}</div>}
            {customer.address && <div className="text-xs">{String(customer.address)}</div>}
          </div>

          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2">Item</th>
                <th className="text-right py-2">Qty</th>
                <th className="text-right py-2">Rate</th>
                <th className="text-right py-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="py-2">
                    {String(it.product_name ?? it.product_name_snapshot ?? "—")}
                  </td>
                  <td className="text-right">{Number(it.quantity ?? 0)}</td>
                  <td className="text-right">{fmtBDT(it.rate)}</td>
                  <td className="text-right">{fmtBDT(it.line_total ?? it.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className="text-right py-3 font-semibold">Total</td>
                <td className="text-right py-3 font-bold">{fmtBDT(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <style>{`
        @media print {
          body { background: white; }
          .print\\:hidden { display: none !important; }
          .print\\:border-0 { border: 0 !important; }
          .print\\:p-0 { padding: 0 !important; }
        }
      `}</style>
    </div>
  );
}
