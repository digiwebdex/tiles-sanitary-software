import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { challanService } from "@/services/challanService";
import { salesService } from "@/services/salesService";
import { useDealerId } from "@/hooks/useDealerId";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Printer, Truck, FileCheck, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { useState } from "react";

const ChallanPage = () => {
  const { saleId } = useParams<{ saleId: string }>();
  const navigate = useNavigate();
  const dealerId = useDealerId();
  const queryClient = useQueryClient();
  const [showPrices, setShowPrices] = useState(false);

  const { data: sale, isLoading: saleLoading } = useQuery({
    queryKey: ["sale", saleId],
    queryFn: () => salesService.getById(saleId!),
    enabled: !!saleId,
  });

  const { data: challans = [], isLoading: challanLoading } = useQuery({
    queryKey: ["challans", saleId],
    queryFn: () => challanService.getBySaleId(saleId!),
    enabled: !!saleId,
  });

  const createChallanMutation = useMutation({
    mutationFn: () =>
      challanService.create({
        dealer_id: dealerId,
        sale_id: saleId!,
        challan_date: new Date().toISOString().split("T")[0],
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["challans", saleId] });
      queryClient.invalidateQueries({ queryKey: ["sale", saleId] });
      queryClient.invalidateQueries({ queryKey: ["stock"] });
      toast.success("Challan created & stock reserved");
    },
    onError: (e) => toast.error(e.message),
  });

  const deliverMutation = useMutation({
    mutationFn: (challanId: string) => challanService.markDelivered(challanId, dealerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["challans", saleId] });
      queryClient.invalidateQueries({ queryKey: ["sale", saleId] });
      toast.success("Challan marked as delivered");
    },
    onError: (e) => toast.error(e.message),
  });

  const convertMutation = useMutation({
    mutationFn: () => challanService.convertToInvoice(saleId!, dealerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["sale", saleId] });
      queryClient.invalidateQueries({ queryKey: ["stock"] });
      toast.success("Converted to invoice successfully");
      navigate(`/sales/${saleId}/invoice`);
    },
    onError: (e) => toast.error(e.message),
  });

  const cancelMutation = useMutation({
    mutationFn: (challanId: string) => challanService.cancelChallan(challanId, dealerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["challans", saleId] });
      queryClient.invalidateQueries({ queryKey: ["sale", saleId] });
      queryClient.invalidateQueries({ queryKey: ["stock"] });
      toast.success("Challan cancelled & stock restored");
    },
    onError: (e) => toast.error(e.message),
  });

  const handlePrint = () => window.print();

  if (saleLoading || challanLoading) return <p className="p-6 text-muted-foreground">Loading…</p>;
  if (!sale) return <p className="p-6 text-destructive">Sale not found</p>;

  const items = (sale as any).sale_items ?? [];
  const customer = (sale as any).customers;
  const saleStatus = (sale as any).sale_status;
  const activeChallan = challans.find((c: any) => c.status !== "cancelled");

  const statusColor: Record<string, string> = {
    draft: "bg-yellow-100 text-yellow-800 border-yellow-300",
    challan_created: "bg-blue-100 text-blue-800 border-blue-300",
    delivered: "bg-green-100 text-green-800 border-green-300",
    invoiced: "bg-primary/10 text-primary border-primary/30",
  };

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #challan-print-area, #challan-print-area * { visibility: visible !important; }
          #challan-print-area {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
          }
          .no-print { display: none !important; }
          @page { size: A4; margin: 15mm; }
        }
      `}</style>

      {/* Toolbar */}
      <div className="no-print flex items-center justify-between border-b bg-background px-6 py-3 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate("/sales")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="font-semibold text-foreground">Challan Management</span>
          <Badge className={`ml-2 ${statusColor[saleStatus] ?? ""}`}>
            {saleStatus?.replace(/_/g, " ").toUpperCase()}
          </Badge>
        </div>
        <div className="flex gap-2">
          {saleStatus === "draft" && (
            <Button onClick={() => createChallanMutation.mutate()} disabled={createChallanMutation.isPending}>
              <Truck className="mr-2 h-4 w-4" /> Create Challan
            </Button>
          )}
          {activeChallan && (activeChallan as any).status === "pending" && (
            <>
              <Button variant="outline" onClick={() => deliverMutation.mutate(activeChallan.id)} disabled={deliverMutation.isPending}>
                <Truck className="mr-2 h-4 w-4" /> Mark Delivered
              </Button>
              <Button variant="destructive" size="sm" onClick={() => cancelMutation.mutate(activeChallan.id)} disabled={cancelMutation.isPending}>
                <X className="mr-2 h-4 w-4" /> Cancel Challan
              </Button>
            </>
          )}
          {(saleStatus === "delivered" || saleStatus === "challan_created") && (
            <Button onClick={() => convertMutation.mutate()} disabled={convertMutation.isPending}>
              <FileCheck className="mr-2 h-4 w-4" /> Convert to Invoice
            </Button>
          )}
          {activeChallan && (activeChallan as any).status === "delivered" && (
            <Button variant="destructive" size="sm" onClick={() => cancelMutation.mutate(activeChallan.id)} disabled={cancelMutation.isPending}>
              <X className="mr-2 h-4 w-4" /> Cancel Challan
            </Button>
          )}
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="mr-2 h-4 w-4" /> Print
          </Button>
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={showPrices} onChange={(e) => setShowPrices(e.target.checked)} />
            Show Prices
          </label>
        </div>
      </div>

      {/* Challan Document */}
      <div className="no-print min-h-screen bg-muted/40 py-8 px-4">
        <div id="challan-print-area" className="mx-auto max-w-3xl bg-background shadow-lg rounded-lg overflow-hidden">
          <ChallanDocument
            sale={sale}
            items={items}
            customer={customer}
            challan={activeChallan}
            showPrices={showPrices}
          />
        </div>
      </div>

      <div id="challan-print-area" className="hidden print:block">
        <ChallanDocument
          sale={sale}
          items={items}
          customer={customer}
          challan={activeChallan}
          showPrices={showPrices}
        />
      </div>
    </>
  );
};

interface ChallanDocumentProps {
  sale: any;
  items: any[];
  customer: any;
  challan: any;
  showPrices: boolean;
}

const ChallanDocument = ({ sale, items, customer, challan, showPrices }: ChallanDocumentProps) => {
  return (
    <div className="p-8 font-sans text-sm text-gray-800">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">DELIVERY CHALLAN</h1>
          {challan && (
            <p className="mt-1 text-lg font-mono font-bold text-blue-700">{(challan as any).challan_no}</p>
          )}
          <p className="mt-1 text-xs text-gray-500">
            Date: <span className="font-medium text-gray-700">{challan ? (challan as any).challan_date : sale.sale_date}</span>
          </p>
          <p className="text-xs text-gray-500">
            Ref Invoice: <span className="font-medium text-gray-700">{sale.invoice_number}</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-gray-900">Your Business Name</p>
          <p className="text-xs text-gray-500 mt-0.5">Tile & Sanitary Dealer</p>
          {challan && (
            <div className={`mt-3 inline-block px-3 py-1 rounded border text-xs font-bold tracking-widest uppercase ${
              (challan as any).status === "delivered"
                ? "text-green-700 bg-green-50 border-green-300"
                : (challan as any).status === "cancelled"
                ? "text-red-700 bg-red-50 border-red-300"
                : "text-blue-700 bg-blue-50 border-blue-300"
            }`}>
              {(challan as any).status}
            </div>
          )}
        </div>
      </div>

      <Separator className="mb-6" />

      {/* Bill To / Transport */}
      <div className="grid grid-cols-2 gap-8 mb-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Deliver To</p>
          <p className="font-bold text-base text-gray-900">{customer?.name ?? "—"}</p>
          {customer?.phone && <p className="text-gray-600 text-xs mt-0.5">{customer.phone}</p>}
          {customer?.address && <p className="text-gray-600 text-xs mt-0.5">{customer.address}</p>}
        </div>
        {challan && (
          <div className="text-right space-y-1">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Transport Details</p>
            {(challan as any).driver_name && (
              <p className="text-xs">
                <span className="text-gray-400">Driver: </span>
                <span className="font-semibold text-gray-700">{(challan as any).driver_name}</span>
              </p>
            )}
            {(challan as any).transport_name && (
              <p className="text-xs">
                <span className="text-gray-400">Transport: </span>
                <span className="font-semibold text-gray-700">{(challan as any).transport_name}</span>
              </p>
            )}
            {(challan as any).vehicle_no && (
              <p className="text-xs">
                <span className="text-gray-400">Vehicle: </span>
                <span className="font-semibold text-gray-700">{(challan as any).vehicle_no}</span>
              </p>
            )}
          </div>
        )}
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
              {showPrices && <th className="px-4 py-3 text-right font-semibold">Rate</th>}
              {showPrices && <th className="px-4 py-3 text-right font-semibold">Amount</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((item: any, idx: number) => (
              <tr key={item.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
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
                {showPrices && (
                  <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(item.sale_rate)}</td>
                )}
                {showPrices && (
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatCurrency(item.total)}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Quantity Summary */}
      <div className="mb-8">
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
      </div>

      {challan && (challan as any).notes && (
        <div className="rounded border border-gray-200 p-3 mb-6">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Notes</p>
          <p className="text-xs text-gray-600">{(challan as any).notes}</p>
        </div>
      )}

      {/* Footer */}
      <Separator className="mt-8 mb-4" />
      <div className="flex justify-between text-xs text-gray-400">
        <span>This is a delivery challan, not an invoice.</span>
        <span>{challan ? `Challan #${(challan as any).challan_no}` : sale.invoice_number} · {challan ? (challan as any).challan_date : sale.sale_date}</span>
      </div>

      {/* Signature area */}
      <div className="grid grid-cols-2 gap-8 mt-12">
        <div className="text-center">
          <div className="border-t border-gray-300 pt-2 mt-8">
            <p className="text-xs text-gray-500">Receiver's Signature</p>
          </div>
        </div>
        <div className="text-center">
          <div className="border-t border-gray-300 pt-2 mt-8">
            <p className="text-xs text-gray-500">Authorized Signature</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChallanPage;
