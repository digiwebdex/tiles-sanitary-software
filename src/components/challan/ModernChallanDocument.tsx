import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/utils";

interface ModernChallanDocumentProps {
  sale: any;
  items: any[];
  customer: any;
  challan: any;
  showPrices: boolean;
  dealerInfo?: { name: string; phone: string | null; address: string | null } | null;
}

const ModernChallanDocument = ({ sale, items, customer, challan, showPrices, dealerInfo }: ModernChallanDocumentProps) => {
  const challanDate = challan ? (challan as any).challan_date : sale.sale_date;
  const challanNo = challan ? (challan as any).challan_no : "—";
  const status = challan ? (challan as any).status : null;

  return (
    <div className="p-8 sm:p-10 font-sans text-[13px] leading-relaxed text-foreground print:p-6">

      {/* ═══ MODERN HEADER — gradient accent strip ═══ */}
      <div className="challan-header relative mb-6">
        <div className="h-2 bg-gradient-to-r from-primary via-primary/70 to-primary/30 rounded-t-md" />
        <div className="border border-t-0 border-border rounded-b-md px-6 py-5">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
                {dealerInfo?.name ?? "Your Business Name"}
              </h1>
              <p className="text-[11px] text-muted-foreground mt-0.5">Tile & Sanitary Dealer</p>
              <div className="flex flex-wrap gap-3 mt-2 text-[11px] text-muted-foreground">
                {dealerInfo?.phone && <span>📞 {dealerInfo.phone}</span>}
                {dealerInfo?.address && <span>📍 {dealerInfo.address}</span>}
              </div>
            </div>
            <div className="text-right space-y-1">
              <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider">
                Delivery Challan
              </div>
              <p className="font-mono font-bold text-lg text-foreground">{challanNo}</p>
              <p className="text-[11px] text-muted-foreground">Date: {challanDate}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ STATUS + REF PILLS ═══ */}
      <div className="flex flex-wrap gap-2 mb-5">
        {sale.invoice_number && (
          <span className="text-[10px] bg-muted text-muted-foreground px-2.5 py-1 rounded-full font-medium">
            Invoice: {sale.invoice_number}
          </span>
        )}
        {sale.client_reference && (
          <span className="text-[10px] bg-muted text-muted-foreground px-2.5 py-1 rounded-full font-medium">
            Client: {sale.client_reference}
          </span>
        )}
        {sale.fitter_reference && (
          <span className="text-[10px] bg-muted text-muted-foreground px-2.5 py-1 rounded-full font-medium">
            Fitter: {sale.fitter_reference}
          </span>
        )}
        {status && (
          <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold uppercase ${
            status === "delivered" ? "bg-green-100 text-green-800" :
            status === "cancelled" ? "bg-destructive/10 text-destructive" :
            "bg-blue-100 text-blue-800"
          }`}>
            {status}
          </span>
        )}
      </div>

      {/* ═══ CUSTOMER & TRANSPORT — modern cards ═══ */}
      <div className="challan-section grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 print:mb-5">
        {/* Customer card */}
        <div className="rounded-lg border border-border bg-muted/20 p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-4 bg-primary rounded-full" />
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Deliver To</p>
          </div>
          <p className="font-bold text-[15px] text-foreground">{customer?.name ?? "—"}</p>
          {customer?.type && (
            <span className="inline-block mt-1.5 text-[9px] uppercase tracking-wider bg-primary/10 text-primary px-2 py-0.5 rounded-full font-semibold">
              {customer.type}
            </span>
          )}
          {customer?.phone && <p className="text-[11px] text-muted-foreground mt-2">📞 {customer.phone}</p>}
          {customer?.address && <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{customer.address}</p>}
        </div>

        {/* Transport card */}
        <div className="rounded-lg border border-border bg-muted/20 p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-4 bg-primary rounded-full" />
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Transport Details</p>
          </div>
          {challan ? (
            <div className="space-y-2 text-[12px]">
              {[
                { label: "Driver", value: (challan as any).driver_name },
                { label: "Transport", value: (challan as any).transport_name },
                { label: "Vehicle", value: (challan as any).vehicle_no },
              ].map((t) => (
                <div key={t.label} className="flex items-baseline gap-2">
                  <span className="text-muted-foreground w-[70px] shrink-0 text-[11px]">{t.label}:</span>
                  <span className="font-medium text-foreground">{t.value || "—"}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground italic">No challan created yet</p>
          )}
        </div>
      </div>

      {/* ═══ ITEMS TABLE — modern rounded ═══ */}
      <div className="mb-6 print:mb-5 rounded-lg border border-border overflow-hidden">
        <table className="w-full text-[12px] border-collapse">
          <thead>
            <tr className="bg-primary text-primary-foreground">
              <th className="px-3 py-2.5 text-left font-semibold w-8">#</th>
              <th className="px-3 py-2.5 text-left font-semibold">Item Description</th>
              <th className="px-3 py-2.5 text-center font-semibold w-16">Qty</th>
              <th className="px-3 py-2.5 text-center font-semibold w-14">Unit</th>
              <th className="px-3 py-2.5 text-center font-semibold w-20">SFT</th>
              {showPrices && <th className="px-3 py-2.5 text-right font-semibold w-24">Rate</th>}
              {showPrices && <th className="px-3 py-2.5 text-right font-semibold w-28">Amount</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((item: any, idx: number) => (
              <tr key={item.id} className={`border-b border-border last:border-0 ${idx % 2 === 0 ? "bg-background" : "bg-muted/30"}`}>
                <td className="px-3 py-2.5 text-muted-foreground text-center">{idx + 1}</td>
                <td className="px-3 py-2.5">
                  <p className="font-semibold text-foreground leading-tight">{item.products?.name}</p>
                  <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{item.products?.sku}</p>
                </td>
                <td className="px-3 py-2.5 text-center font-bold text-foreground">{item.quantity}</td>
                <td className="px-3 py-2.5 text-center text-muted-foreground text-[11px]">
                  {item.products?.unit_type === "box_sft" ? "Box" : "Pc"}
                </td>
                <td className="px-3 py-2.5 text-center text-foreground">
                  {item.total_sft ? Number(item.total_sft).toFixed(2) : "—"}
                </td>
                {showPrices && (
                  <td className="px-3 py-2.5 text-right text-foreground">{formatCurrency(item.sale_rate)}</td>
                )}
                {showPrices && (
                  <td className="px-3 py-2.5 text-right font-bold text-foreground">{formatCurrency(item.total)}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ═══ QUANTITY SUMMARY — modern cards row ═══ */}
      <div className="challan-section grid grid-cols-3 gap-3 mb-6 print:mb-5">
        {[
          { label: "Total Boxes", value: Number(sale.total_box), color: "bg-blue-50 border-blue-200 text-blue-900" },
          { label: "Total SFT", value: Number(sale.total_sft).toFixed(2), color: "bg-green-50 border-green-200 text-green-900" },
          { label: "Total Pieces", value: Number(sale.total_piece), color: "bg-amber-50 border-amber-200 text-amber-900" },
        ].map((s) => (
          <div key={s.label} className={`rounded-lg border px-3 py-3 text-center ${s.color}`}>
            <p className="text-[9px] uppercase tracking-[0.15em] font-bold opacity-70">{s.label}</p>
            <p className="text-xl font-black mt-0.5">{s.value}</p>
          </div>
        ))}
      </div>
      {showPrices && (
        <div className="mb-6 print:mb-5 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-center">
          <p className="text-[9px] uppercase tracking-[0.15em] font-bold text-primary/70">Total Amount</p>
          <p className="text-2xl font-black text-primary mt-0.5">{formatCurrency(sale.total_amount)}</p>
        </div>
      )}

      {/* ═══ NOTES ═══ */}
      {challan && (challan as any).notes && (
        <div className="rounded-lg border border-border bg-muted/20 p-4 mb-5 print:mb-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1 h-3 bg-primary rounded-full" />
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Notes</p>
          </div>
          <p className="text-[11px] text-foreground ml-3">{(challan as any).notes}</p>
        </div>
      )}

      {/* ═══ TERMS ═══ */}
      <div className="rounded-lg border border-border p-4 mb-8 print:mb-6 bg-muted/10">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-1 h-3 bg-muted-foreground/30 rounded-full" />
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Terms & Conditions</p>
        </div>
        <ol className="text-[10px] text-muted-foreground list-decimal list-inside space-y-0.5 ml-3">
          <li>Goods once delivered will not be taken back without prior written approval.</li>
          <li>Please check the goods thoroughly at the time of delivery.</li>
          <li>This is a delivery challan only — not a tax invoice.</li>
          <li>Any discrepancy must be reported within 24 hours of delivery.</li>
        </ol>
      </div>

      {/* ═══ SIGNATURES ═══ */}
      <div className="challan-signature grid grid-cols-3 gap-8 mt-8 mb-4">
        {["Prepared By", "Receiver's Signature", "Authorized Signatory"].map((label) => (
          <div key={label} className="text-center">
            <div className="h-16 border-b-2 border-dashed border-muted-foreground/30" />
            <p className="text-[10px] text-muted-foreground font-semibold mt-2">{label}</p>
          </div>
        ))}
      </div>

      {/* ═══ FOOTER ═══ */}
      <div className="challan-footer mt-6">
        <div className="h-1 bg-gradient-to-r from-primary via-primary/70 to-primary/30 rounded-full mb-2" />
        <div className="flex justify-between text-[9px] text-muted-foreground">
          <span>This document is a delivery challan and does not serve as a tax invoice.</span>
          <span className="font-mono">{challanNo} · {challanDate}</span>
        </div>
      </div>
    </div>
  );
};

export default ModernChallanDocument;
