import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { salesService } from "@/services/salesService";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer, Download, TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const InvoicePage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isDealerAdmin } = useAuth();

  const { data: sale, isLoading } = useQuery({
    queryKey: ["sale", id],
    queryFn: () => salesService.getById(id!),
    enabled: !!id,
  });

  const handlePrint = () => window.print();

  const handleDownload = () => {
    window.print();
  };

  if (isLoading) return <p className="p-6 text-muted-foreground">Loading…</p>;
  if (!sale) return <p className="p-6 text-destructive">Sale not found</p>;

  const items = (sale as any).sale_items ?? [];
  const customer = (sale as any).customers;
  const subtotal = items.reduce((s: number, i: any) => s + Number(i.total), 0);
  const dueAmount = Number(sale.due_amount);
  const paidAmount = Number(sale.paid_amount);
  const totalAmount = Number(sale.total_amount);
  const discountAmount = Number(sale.discount);

  return (
    <>
      {/* Print-specific styles */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #invoice-print-area, #invoice-print-area * { visibility: visible !important; }
          #invoice-print-area {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .no-print { display: none !important; }
          @page {
            size: A4;
            margin: 15mm 15mm 15mm 15mm;
          }
        }
      `}</style>

      {/* Toolbar — hidden when printing */}
      <div className="no-print flex items-center justify-between border-b bg-background px-6 py-3 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate("/sales")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="font-semibold text-foreground">Invoice Preview</span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="mr-2 h-4 w-4" /> Print
          </Button>
          <Button onClick={handleDownload}>
            <Download className="mr-2 h-4 w-4" /> Download PDF
          </Button>
        </div>
      </div>

      {/* Invoice paper container */}
      <div className="no-print min-h-screen bg-muted/40 py-8 px-4">
        <div id="invoice-print-area" className="mx-auto max-w-3xl bg-background shadow-lg rounded-lg overflow-hidden">
          <InvoiceDocument
            sale={sale}
            items={items}
            customer={customer}
            subtotal={subtotal}
            totalAmount={totalAmount}
            discountAmount={discountAmount}
            paidAmount={paidAmount}
            dueAmount={dueAmount}
            isDealerAdmin={isDealerAdmin}
          />
        </div>
      </div>

      {/* Direct print area (always visible for print media) */}
      <div id="invoice-print-area" className="hidden print:block">
        <InvoiceDocument
          sale={sale}
          items={items}
          customer={customer}
          subtotal={subtotal}
          totalAmount={totalAmount}
          discountAmount={discountAmount}
          paidAmount={paidAmount}
          dueAmount={dueAmount}
          isDealerAdmin={isDealerAdmin}
        />
      </div>
    </>
  );
};

interface InvoiceDocumentProps {
  sale: any;
  items: any[];
  customer: any;
  subtotal: number;
  totalAmount: number;
  discountAmount: number;
  paidAmount: number;
  dueAmount: number;
  isDealerAdmin: boolean;
}

const InvoiceDocument = ({
  sale,
  items,
  customer,
  subtotal,
  totalAmount,
  discountAmount,
  paidAmount,
  dueAmount,
  isDealerAdmin,
}: InvoiceDocumentProps) => {
  const paymentStatus =
    dueAmount <= 0 ? "PAID" : paidAmount > 0 ? "PARTIAL" : "UNPAID";

  const statusColor =
    paymentStatus === "PAID"
      ? "text-green-700 bg-green-50 border-green-300"
      : paymentStatus === "PARTIAL"
      ? "text-yellow-700 bg-yellow-50 border-yellow-300"
      : "text-red-700 bg-red-50 border-red-300";

  return (
    <div className="p-8 font-sans text-sm text-gray-800">

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">INVOICE</h1>
          <p className="mt-1 text-lg font-mono font-bold text-blue-700">{sale.invoice_number}</p>
          <p className="mt-1 text-xs text-gray-500">Date: <span className="font-medium text-gray-700">{sale.sale_date}</span></p>
        </div>
        <div className="text-right">
          {/* Business info placeholder — can be made dynamic later */}
          <p className="text-lg font-bold text-gray-900">Your Business Name</p>
          <p className="text-xs text-gray-500 mt-0.5">Tile & Sanitary Dealer</p>
          <div
            className={`mt-3 inline-block px-3 py-1 rounded border text-xs font-bold tracking-widest uppercase ${statusColor}`}
          >
            {paymentStatus}
          </div>
        </div>
      </div>

      <Separator className="mb-6" />

      {/* Bill To / References */}
      <div className="grid grid-cols-2 gap-8 mb-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Bill To</p>
          <p className="font-bold text-base text-gray-900">{customer?.name ?? "—"}</p>
          {customer?.phone && <p className="text-gray-600 text-xs mt-0.5">{customer.phone}</p>}
          {customer?.address && <p className="text-gray-600 text-xs mt-0.5">{customer.address}</p>}
          <span className="mt-1 inline-block px-2 py-0.5 rounded text-xs border border-gray-200 text-gray-500 capitalize">
            {customer?.type}
          </span>
        </div>
        <div className="text-right space-y-1">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Details</p>
          {sale.client_reference && (
            <p className="text-xs">
              <span className="text-gray-400">Client Ref: </span>
              <span className="font-semibold text-gray-700">{sale.client_reference}</span>
            </p>
          )}
          {sale.fitter_reference && (
            <p className="text-xs">
              <span className="text-gray-400">Fitter: </span>
              <span className="font-semibold text-gray-700">{sale.fitter_reference}</span>
            </p>
          )}
          {sale.discount_reference && (
            <p className="text-xs">
              <span className="text-gray-400">Discount Ref: </span>
              <span className="font-semibold text-gray-700">{sale.discount_reference}</span>
            </p>
          )}
          {sale.payment_mode && (
            <p className="text-xs">
              <span className="text-gray-400">Payment Mode: </span>
              <span className="font-semibold text-gray-700 capitalize">{sale.payment_mode}</span>
            </p>
          )}
        </div>
      </div>

      {/* Items Table */}
      <div className="mb-6 rounded overflow-hidden border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-900 text-white">
              <th className="px-4 py-3 text-left font-semibold w-8">#</th>
              <th className="px-4 py-3 text-left font-semibold">Product</th>
              <th className="px-4 py-3 text-center font-semibold">Qty</th>
              <th className="px-4 py-3 text-center font-semibold">SFT</th>
              <th className="px-4 py-3 text-right font-semibold">Rate</th>
              <th className="px-4 py-3 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item: any, idx: number) => (
              <tr
                key={item.id}
                className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}
              >
                <td className="px-4 py-3 text-gray-400">{idx + 1}</td>
                <td className="px-4 py-3">
                  <p className="font-semibold text-gray-900">{item.products?.name}</p>
                  <p className="text-xs text-gray-400 font-mono">{item.products?.sku}</p>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="font-medium">{item.quantity}</span>
                  <span className="ml-1 text-xs text-gray-400">
                    {item.products?.unit_type === "box_sft" ? "box" : "pc"}
                  </span>
                </td>
                <td className="px-4 py-3 text-center text-gray-600">
                  {item.total_sft ? Number(item.total_sft).toFixed(2) : "—"}
                </td>
                <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(item.sale_rate)}</td>
                <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatCurrency(item.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals + Summary */}
      <div className="flex justify-between gap-8 mb-8">
        {/* Quantity Summary */}
        <div className="flex-1">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Quantity Summary</p>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded border border-gray-200 p-3 text-center">
              <p className="text-xs text-gray-400 uppercase">Total Box</p>
              <p className="text-lg font-bold text-gray-900">{Number(sale.total_box)}</p>
            </div>
            <div className="rounded border border-gray-200 p-3 text-center">
              <p className="text-xs text-gray-400 uppercase">Total SFT</p>
              <p className="text-lg font-bold text-gray-900">{Number(sale.total_sft).toFixed(2)}</p>
            </div>
            <div className="rounded border border-gray-200 p-3 text-center">
              <p className="text-xs text-gray-400 uppercase">Total Piece</p>
              <p className="text-lg font-bold text-gray-900">{Number(sale.total_piece)}</p>
            </div>
          </div>
          {sale.notes && (
            <div className="mt-4 rounded border border-gray-200 p-3">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Notes</p>
              <p className="text-xs text-gray-600">{sale.notes}</p>
            </div>
          )}
        </div>

        {/* Financial Summary */}
        <div className="w-64 space-y-1">
          <div className="flex justify-between py-1.5 text-gray-600">
            <span>Subtotal</span>
            <span className="font-medium">{formatCurrency(subtotal)}</span>
          </div>
          {discountAmount > 0 && (
            <div className="flex justify-between py-1.5 text-gray-600">
              <span>Discount</span>
              <span className="font-medium text-red-600">− {formatCurrency(discountAmount)}</span>
            </div>
          )}
          <Separator className="my-2" />
          <div className="flex justify-between py-2 text-base font-bold text-gray-900">
            <span>Grand Total</span>
            <span>{formatCurrency(totalAmount)}</span>
          </div>
          <div className="flex justify-between py-1.5 text-gray-600">
            <span>Amount Paid</span>
            <span className="font-medium text-green-700">{formatCurrency(paidAmount)}</span>
          </div>
          <Separator className="my-2" />
          <div className={`flex justify-between py-2 text-base font-bold ${dueAmount > 0 ? "text-red-600" : "text-green-700"}`}>
            <span>Balance Due</span>
            <span>{formatCurrency(dueAmount)}</span>
          </div>
        </div>
      </div>

      {/* Profit Summary — Owner only, hidden from print */}
      {isDealerAdmin && (
        <div className="no-print mt-4 rounded border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-blue-700" />
            <p className="text-xs font-bold uppercase tracking-wider text-blue-700">Profit Summary (Owner Only — Not Printed)</p>
          </div>
          <div className="grid grid-cols-4 gap-3 text-center">
            <div className="rounded bg-white p-3 border border-blue-100">
              <p className="text-xs text-gray-400 uppercase mb-1">COGS</p>
              <p className="font-bold text-red-600">{formatCurrency((sale as any).cogs ?? 0)}</p>
            </div>
            <div className="rounded bg-white p-3 border border-blue-100">
              <p className="text-xs text-gray-400 uppercase mb-1">Gross Profit</p>
              <p className={`font-bold ${Number((sale as any).gross_profit) >= 0 ? "text-green-700" : "text-red-600"}`}>
                {formatCurrency((sale as any).gross_profit ?? 0)}
              </p>
            </div>
            <div className="rounded bg-white p-3 border border-blue-100">
              <p className="text-xs text-gray-400 uppercase mb-1">Net Profit</p>
              <p className={`font-bold ${Number((sale as any).net_profit) >= 0 ? "text-green-700" : "text-red-600"}`}>
                {formatCurrency((sale as any).net_profit ?? 0)}
              </p>
            </div>
            <div className="rounded bg-white p-3 border border-blue-100">
              <p className="text-xs text-gray-400 uppercase mb-1">Margin %</p>
              <p className={`font-bold ${Number(sale.total_amount) > 0 && Number((sale as any).net_profit) >= 0 ? "text-green-700" : "text-red-600"}`}>
                {Number(sale.total_amount) > 0
                  ? `${((Number((sale as any).net_profit) / Number(sale.total_amount)) * 100).toFixed(1)}%`
                  : "—"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <Separator className="mt-8 mb-4" />
      <div className="flex justify-between text-xs text-gray-400">
        <span>Thank you for your business!</span>
        <span>Invoice #{sale.invoice_number} · {sale.sale_date}</span>
      </div>
    </div>
  );
};

export default InvoicePage;
