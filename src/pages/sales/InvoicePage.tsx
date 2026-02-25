import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { salesService } from "@/services/salesService";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer, Download, Pencil, Truck, Mail, CreditCard, Trash2, X, TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { Separator } from "@/components/ui/separator";
import { useDealerInfo } from "@/hooks/useDealerInfo";
import SaleInvoiceDocument from "@/components/sale/SaleInvoiceDocument";

const InvoicePage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isDealerAdmin } = useAuth();
  const { data: dealerInfo } = useDealerInfo();

  const { data: sale, isLoading } = useQuery({
    queryKey: ["sale", id],
    queryFn: () => salesService.getById(id!),
    enabled: !!id,
  });

  const { data: salesReturns = [] } = useQuery({
    queryKey: ["sale-returns-for-invoice", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales_returns")
        .select("id, qty, refund_amount, return_date, reason, is_broken, product_id, products(name)")
        .eq("sale_id", id!);
      return data ?? [];
    },
    enabled: !!id,
  });

  const handlePrint = () => window.print();
  const handleClose = () => navigate("/sales");

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
          @page { size: A4; margin: 10mm; }
        }
      `}</style>

      {/* Top bar with Print & Close */}
      <div className="no-print flex items-center justify-end gap-2 border-b bg-background px-6 py-2 sticky top-0 z-10">
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={handlePrint}>
          <Printer className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={handleClose} className="h-8 w-8">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Invoice paper */}
      <div className="no-print min-h-screen bg-muted/40 py-6 px-4">
        <div id="invoice-print-area" className="mx-auto max-w-3xl bg-background shadow-lg rounded-lg overflow-hidden border">
        <SaleInvoiceDocument
          sale={sale}
          items={items}
          customer={customer}
          subtotal={subtotal}
          totalAmount={totalAmount}
          discountAmount={discountAmount}
          paidAmount={paidAmount}
          dueAmount={dueAmount}
          isDealerAdmin={isDealerAdmin}
          dealerInfo={dealerInfo}
          salesReturns={salesReturns}
        />
        </div>
      </div>

      {/* Print area */}
      <div id="invoice-print-area" className="hidden print:block">
          <SaleInvoiceDocument
            sale={sale}
            items={items}
            customer={customer}
            subtotal={subtotal}
            totalAmount={totalAmount}
            discountAmount={discountAmount}
            paidAmount={paidAmount}
            dueAmount={dueAmount}
            isDealerAdmin={isDealerAdmin}
            dealerInfo={dealerInfo}
            salesReturns={salesReturns}
          />
      </div>

      {/* Bottom action bar */}
      <div className="no-print sticky bottom-0 z-10 flex items-center justify-center gap-2 border-t bg-background px-4 py-3 flex-wrap">
        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => navigate("/collections")}>
          <CreditCard className="mr-1.5 h-3.5 w-3.5" /> Payment
        </Button>
        <Button size="sm" variant="outline" onClick={() => navigate("/deliveries")}>
          <Truck className="mr-1.5 h-3.5 w-3.5" /> Delivery
        </Button>
        <Button size="sm" variant="outline">
          <Mail className="mr-1.5 h-3.5 w-3.5" /> Email
        </Button>
        <Button size="sm" variant="outline" onClick={handlePrint}>
          <Download className="mr-1.5 h-3.5 w-3.5" /> PDF
        </Button>
        <Button size="sm" variant="outline" onClick={() => navigate(`/sales/${id}/edit`)}>
          <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
        </Button>
        <Button size="sm" variant="destructive">
          <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
        </Button>
      </div>
    </>
  );
};

export default InvoicePage;
