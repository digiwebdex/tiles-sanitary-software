import { Separator } from "@/components/ui/separator";
import { formatCurrency, CURRENCY_CODE, parseLocalDate } from "@/lib/utils";
import { formatQuotationDisplayNo, type Quotation, type QuotationItem } from "@/services/quotationService";

interface Props {
  quotation: Quotation;
  items: QuotationItem[];
  customer?: { name?: string | null; phone?: string | null; address?: string | null } | null;
  dealerInfo?: { name: string; phone: string | null; address: string | null } | null;
  /** When true, render compact measurement breakdown for lines that have a snapshot. */
  showMeasurements?: boolean;
}

const fmtDate = (d: string) => {
  const dt = parseLocalDate(d);
  return dt ? dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : d;
};

const QuotationDocument = ({ quotation, items, customer, dealerInfo, showMeasurements = true }: Props) => {
  const measuredItems = showMeasurements
    ? items.filter((it) => (it as { measurement_snapshot?: unknown }).measurement_snapshot)
    : [];
  const businessName = dealerInfo?.name ?? "Your Business Name";
  const customerName = customer?.name ?? quotation.customer_name_text ?? "—";
  const customerPhone = customer?.phone ?? quotation.customer_phone_text ?? null;
  const customerAddress = customer?.address ?? quotation.customer_address_text ?? null;

  const discountLabel =
    quotation.discount_type === "percent"
      ? `Discount (${Number(quotation.discount_value).toFixed(2)}%)`
      : `Discount`;
  const discountAmount = Math.max(0, Number(quotation.subtotal) - Number(quotation.total_amount));

  return (
    <div className="text-sm text-foreground">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-6 pb-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
            <span className="text-xl font-black text-primary">{businessName.charAt(0)}</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">{businessName}</h1>
            <p className="text-xs text-muted-foreground">Tile & Sanitary Dealer</p>
          </div>
        </div>
        <div className="text-right">
          <h2 className="text-2xl font-black tracking-wider text-primary">QUOTATION</h2>
          <p className="text-xs text-muted-foreground">Price Estimate</p>
        </div>
      </div>

      <Separator />

      {/* Info bar */}
      <div className="mx-6 my-4 rounded-md border bg-muted/30 px-4 py-3 grid grid-cols-2 gap-y-1 text-xs">
        <div>
          <span className="text-muted-foreground">Quote No: </span>
          <span className="font-mono font-medium">{formatQuotationDisplayNo(quotation)}</span>
        </div>
        <div className="text-right">
          <span className="text-muted-foreground">Date: </span>
          <span className="font-medium">{fmtDate(quotation.quote_date)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Valid Until: </span>
          <span className="font-semibold">{fmtDate(quotation.valid_until)}</span>
        </div>
        <div className="text-right">
          <span className="text-muted-foreground">Status: </span>
          <span className="font-semibold capitalize">{quotation.status.replace("_", " ")}</span>
        </div>
      </div>

      {/* To / From */}
      <div className="grid grid-cols-2 gap-6 px-6 mb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Quote To:</p>
          <p className="font-bold text-foreground">{customerName}</p>
          {customerAddress && <p className="text-xs text-muted-foreground mt-0.5">{customerAddress}</p>}
          {customerPhone && <p className="text-xs text-muted-foreground mt-0.5">Tel: {customerPhone}</p>}
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">From:</p>
          <p className="font-bold text-foreground">{businessName}</p>
          {dealerInfo?.address && <p className="text-xs text-muted-foreground mt-0.5">{dealerInfo.address}</p>}
          {dealerInfo?.phone && <p className="text-xs text-muted-foreground mt-0.5">Tel: {dealerInfo.phone}</p>}
        </div>
      </div>

      {/* Items */}
      <div className="px-6 mb-4">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-primary text-primary-foreground">
              <th className="px-3 py-2 text-left font-semibold w-10">No.</th>
              <th className="px-3 py-2 text-left font-semibold">Description</th>
              <th className="px-3 py-2 text-center font-semibold">Quantity</th>
              <th className="px-3 py-2 text-right font-semibold">Unit Price</th>
              <th className="px-3 py-2 text-right font-semibold">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => {
              const qtyDisplay = it.unit_type === "box_sft" ? `${it.quantity} box` : `${it.quantity} pc`;
              const sftDisplay =
                it.unit_type === "box_sft" && it.per_box_sft
                  ? ` (${(Number(it.quantity) * Number(it.per_box_sft)).toFixed(2)} Sft)`
                  : "";
              const prefs: string[] = [];
              if (it.preferred_shade_code) prefs.push(`Shade: ${it.preferred_shade_code}`);
              if (it.preferred_caliber) prefs.push(`Caliber: ${it.preferred_caliber}`);
              if (it.preferred_batch_no) prefs.push(`Batch: ${it.preferred_batch_no}`);
              return (
                <tr key={it.id} className={idx % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                  <td className="px-3 py-2 text-muted-foreground border-b">{idx + 1}</td>
                  <td className="px-3 py-2 border-b">
                    <p className="font-medium text-foreground">{it.product_name_snapshot}</p>
                    {it.product_sku_snapshot && (
                      <p className="text-xs text-muted-foreground">{it.product_sku_snapshot}</p>
                    )}
                    {prefs.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-0.5">{prefs.join(" · ")}</p>
                    )}
                    {it.notes && <p className="text-xs text-muted-foreground italic mt-0.5">{it.notes}</p>}
                  </td>
                  <td className="px-3 py-2 text-center border-b">
                    {qtyDisplay}{sftDisplay}
                  </td>
                  <td className="px-3 py-2 text-right border-b">{formatCurrency(it.rate)}</td>
                  <td className="px-3 py-2 text-right font-semibold border-b">{formatCurrency(it.line_total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="px-6 mb-4">
        <div className="ml-auto w-72 space-y-1 text-sm">
          <Row label={`Subtotal (${CURRENCY_CODE})`} value={formatCurrency(quotation.subtotal)} />
          {discountAmount > 0 && (
            <Row label={`${discountLabel} (${CURRENCY_CODE})`} value={`(${formatCurrency(discountAmount)})`} className="text-destructive" />
          )}
          <Separator className="my-1" />
          <Row label={`Total (${CURRENCY_CODE})`} value={formatCurrency(quotation.total_amount)} bold />
        </div>
      </div>

      {/* Measurement summary (Area Calculator) */}
      {measuredItems.length > 0 && (
        <div className="px-6 mb-4">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
            Measurement Summary
          </p>
          <table className="w-full text-[11px] border-collapse border border-border">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-2 py-1 text-left">Room / Product</th>
                <th className="px-2 py-1 text-left">Type</th>
                <th className="px-2 py-1 text-right">Gross</th>
                <th className="px-2 py-1 text-right">Deduct</th>
                <th className="px-2 py-1 text-right">Net</th>
                <th className="px-2 py-1 text-right">Wast.%</th>
                <th className="px-2 py-1 text-right">Final sft</th>
                <th className="px-2 py-1 text-right">Per box</th>
                <th className="px-2 py-1 text-right">Calc</th>
                <th className="px-2 py-1 text-right">Final</th>
              </tr>
            </thead>
            <tbody>
              {measuredItems.map((it) => {
                const s = (it as { measurement_snapshot: Record<string, unknown> }).measurement_snapshot;
                const room = (s.room_name as string) || it.product_name_snapshot;
                return (
                  <tr key={`m-${it.id}`} className="border-t border-border">
                    <td className="px-2 py-1">
                      <span className="font-medium">{room}</span>
                      <span className="text-muted-foreground"> · {it.product_name_snapshot}</span>
                      {Boolean(s.manual_override) && s.override_reason ? (
                        <div className="text-[10px] text-destructive">⚠ Override: {String(s.override_reason)}</div>
                      ) : null}
                    </td>
                    <td className="px-2 py-1">{String(s.measurement_type)}</td>
                    <td className="px-2 py-1 text-right">{Number(s.gross_area_sft ?? 0).toFixed(2)}</td>
                    <td className="px-2 py-1 text-right">{Number(s.deduction_area_sft ?? 0).toFixed(2)}</td>
                    <td className="px-2 py-1 text-right">{Number(s.net_area_sft ?? 0).toFixed(2)}</td>
                    <td className="px-2 py-1 text-right">{Number(s.wastage_pct ?? 0)}%</td>
                    <td className="px-2 py-1 text-right">{Number(s.final_area_sft ?? 0).toFixed(2)}</td>
                    <td className="px-2 py-1 text-right">{Number(s.per_box_sft_snapshot ?? 0).toFixed(2)}</td>
                    <td className="px-2 py-1 text-right">{String(s.calculated_boxes ?? "—")}</td>
                    <td className="px-2 py-1 text-right font-semibold">{String(s.final_boxes ?? "—")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-[10px] text-muted-foreground mt-1">
            Areas in sft. Linear inputs (ft/m) and direct area (sft/sqm) are normalized internally.
          </p>
        </div>
      )}

      {/* Notes / Terms */}
      {(quotation.notes || quotation.terms_text) && (
        <div className="px-6 mb-4 grid grid-cols-2 gap-6 text-xs">
          {quotation.notes && (
            <div>
              <p className="font-bold uppercase tracking-wider text-muted-foreground mb-1">Notes</p>
              <p className="whitespace-pre-wrap text-foreground">{quotation.notes}</p>
            </div>
          )}
          {quotation.terms_text && (
            <div>
              <p className="font-bold uppercase tracking-wider text-muted-foreground mb-1">Terms & Conditions</p>
              <p className="whitespace-pre-wrap text-foreground">{quotation.terms_text}</p>
            </div>
          )}
        </div>
      )}

      <div className="px-6 pb-4 text-[11px] text-muted-foreground border-t pt-3 mx-6">
        <p>This is a price quotation only — not a tax invoice. Stock & rates are subject to availability at time of order.</p>
      </div>

      <div className="px-6 pb-4 flex justify-between text-xs text-muted-foreground">
        <span>{businessName}</span>
        <span>Quote {formatQuotationDisplayNo(quotation)} · {fmtDate(quotation.quote_date)}</span>
      </div>
    </div>
  );
};

const Row = ({ label, value, bold, className }: { label: string; value: string; bold?: boolean; className?: string }) => (
  <div className={`flex justify-between py-0.5 ${bold ? "font-bold" : ""} ${className ?? ""}`}>
    <span>{label}</span>
    <span>{value}</span>
  </div>
);

export default QuotationDocument;
