import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { challanService } from "@/services/challanService";
import { salesService } from "@/services/salesService";
import { useDealerId } from "@/hooks/useDealerId";
import { useDealerInfo } from "@/hooks/useDealerInfo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
  const { data: dealerInfo } = useDealerInfo();

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
            padding: 0 !important;
            margin: 0 !important;
          }
          .no-print { display: none !important; }
          @page { size: A4; margin: 12mm 15mm; }
        }
      `}</style>

      {/* Toolbar */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3 border-b bg-card px-6 py-3 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/challans")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="font-semibold text-foreground text-lg">Challan</span>
          <Badge className={statusColor[saleStatus] ?? ""}>
            {saleStatus?.replace(/_/g, " ").toUpperCase()}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Show Prices toggle */}
          <div className="flex items-center gap-2 mr-2">
            <Switch checked={showPrices} onCheckedChange={setShowPrices} id="show-prices" />
            <label htmlFor="show-prices" className="text-sm text-muted-foreground cursor-pointer select-none">
              Show Prices
            </label>
          </div>

          <Separator orientation="vertical" className="h-6 hidden sm:block" />

          {saleStatus === "draft" && (
            <Button onClick={() => createChallanMutation.mutate()} disabled={createChallanMutation.isPending} size="sm">
              <Truck className="mr-1.5 h-4 w-4" /> Create Challan
            </Button>
          )}
          {activeChallan && (activeChallan as any).status === "pending" && (
            <>
              <Button variant="outline" size="sm" onClick={() => deliverMutation.mutate(activeChallan.id)} disabled={deliverMutation.isPending}>
                <Truck className="mr-1.5 h-4 w-4" /> Mark Delivered
              </Button>
              <Button variant="destructive" size="sm" onClick={() => cancelMutation.mutate(activeChallan.id)} disabled={cancelMutation.isPending}>
                <X className="mr-1.5 h-4 w-4" /> Cancel
              </Button>
            </>
          )}
          {activeChallan && (activeChallan as any).status === "delivered" && (
            <Button variant="destructive" size="sm" onClick={() => cancelMutation.mutate(activeChallan.id)} disabled={cancelMutation.isPending}>
              <X className="mr-1.5 h-4 w-4" /> Cancel
            </Button>
          )}
          {(saleStatus === "delivered" || saleStatus === "challan_created") && (
            <Button size="sm" onClick={() => convertMutation.mutate()} disabled={convertMutation.isPending}>
              <FileCheck className="mr-1.5 h-4 w-4" /> Convert to Invoice
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="mr-1.5 h-4 w-4" /> Print
          </Button>
        </div>
      </div>

      {/* Preview */}
      <div className="no-print min-h-screen bg-muted/40 py-8 px-4">
        <div id="challan-print-area" className="mx-auto max-w-[210mm] bg-background shadow-lg rounded-lg overflow-hidden">
          <ChallanDocument
            sale={sale}
            items={items}
            customer={customer}
            challan={activeChallan}
            showPrices={showPrices}
            dealerInfo={dealerInfo}
          />
        </div>
      </div>

      {/* Print-only version */}
      <div id="challan-print-area" className="hidden print:block">
        <ChallanDocument
          sale={sale}
          items={items}
          customer={customer}
          challan={activeChallan}
          showPrices={showPrices}
          dealerInfo={dealerInfo}
        />
      </div>
    </>
  );
};

/* ── Document Component ── */

interface ChallanDocumentProps {
  sale: any;
  items: any[];
  customer: any;
  challan: any;
  showPrices: boolean;
  dealerInfo?: { name: string; phone: string | null; address: string | null } | null;
}

const ChallanDocument = ({ sale, items, customer, challan, showPrices, dealerInfo }: ChallanDocumentProps) => {
  return (
    <div className="p-10 font-sans text-[13px] leading-relaxed text-gray-800">
      {/* ── Header with dealer branding ── */}
      <div className="border-b-4 border-gray-900 pb-5 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-gray-900 uppercase">
              {dealerInfo?.name ?? "Your Business Name"}
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">Tile & Sanitary Dealer</p>
            {dealerInfo?.phone && <p className="text-xs text-gray-500">{dealerInfo.phone}</p>}
            {dealerInfo?.address && <p className="text-xs text-gray-500 max-w-[260px]">{dealerInfo.address}</p>}
          </div>
          <div className="text-right">
            {challan && (
              <div className={`inline-block px-3 py-1 rounded text-xs font-bold tracking-widest uppercase border ${
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
      </div>

      {/* ── Title bar ── */}
      <div className="bg-gray-900 text-white rounded-md px-5 py-3 mb-6 flex items-center justify-between">
        <h2 className="text-lg font-bold tracking-wide uppercase">Delivery Challan</h2>
        <div className="text-right text-xs space-y-0.5">
          {challan && (
            <p className="text-sm font-mono font-bold">{(challan as any).challan_no}</p>
          )}
          <p>Date: {challan ? (challan as any).challan_date : sale.sale_date}</p>
          <p>Ref: {sale.invoice_number ?? "—"}</p>
        </div>
      </div>

      {/* ── Deliver To + Transport Details ── */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="border rounded-md p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Deliver To</p>
          <p className="font-bold text-base text-gray-900">{customer?.name ?? "—"}</p>
          {customer?.phone && <p className="text-xs text-gray-600 mt-1">{customer.phone}</p>}
          {customer?.address && <p className="text-xs text-gray-600">{customer.address}</p>}
        </div>
        <div className="border rounded-md p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Transport Details</p>
          {challan ? (
            <div className="space-y-1 text-xs">
              {(challan as any).driver_name && (
                <p><span className="text-gray-400">Driver:</span> <span className="font-semibold text-gray-700">{(challan as any).driver_name}</span></p>
              )}
              {(challan as any).transport_name && (
                <p><span className="text-gray-400">Transport:</span> <span className="font-semibold text-gray-700">{(challan as any).transport_name}</span></p>
              )}
              {(challan as any).vehicle_no && (
                <p><span className="text-gray-400">Vehicle:</span> <span className="font-semibold text-gray-700">{(challan as any).vehicle_no}</span></p>
              )}
              {!(challan as any).driver_name && !(challan as any).transport_name && !(challan as any).vehicle_no && (
                <p className="text-gray-400 italic">Not specified</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic">No challan created yet</p>
          )}
        </div>
      </div>

      {/* ── Items Table ── */}
      <div className="mb-6 rounded-md overflow-hidden border">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-gray-900 text-white">
              <th className="px-3 py-2.5 text-left font-semibold w-10">#</th>
              <th className="px-3 py-2.5 text-left font-semibold">Product</th>
              <th className="px-3 py-2.5 text-center font-semibold w-20">Qty</th>
              <th className="px-3 py-2.5 text-center font-semibold w-20">SFT</th>
              {showPrices && <th className="px-3 py-2.5 text-right font-semibold w-24">Rate</th>}
              {showPrices && <th className="px-3 py-2.5 text-right font-semibold w-28">Amount</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((item: any, idx: number) => (
              <tr key={item.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                <td className="px-3 py-2.5 text-gray-400">{idx + 1}</td>
                <td className="px-3 py-2.5">
                  <p className="font-semibold text-gray-900">{item.products?.name}</p>
                  <p className="text-[10px] text-gray-400 font-mono">{item.products?.sku}</p>
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span className="font-medium">{item.quantity}</span>
                  <span className="ml-1 text-[10px] text-gray-400">
                    {item.products?.unit_type === "box_sft" ? "box" : "pc"}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-center text-gray-600">
                  {item.total_sft ? Number(item.total_sft).toFixed(2) : "—"}
                </td>
                {showPrices && (
                  <td className="px-3 py-2.5 text-right text-gray-700">{formatCurrency(item.sale_rate)}</td>
                )}
                {showPrices && (
                  <td className="px-3 py-2.5 text-right font-semibold text-gray-900">{formatCurrency(item.total)}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Quantity Summary Bar ── */}
      <div className="mb-6 bg-gray-50 rounded-md border px-5 py-3 flex items-center justify-around text-center">
        <div>
          <p className="text-[10px] uppercase text-gray-400 font-bold">Total Box</p>
          <p className="text-lg font-bold text-gray-900">{Number(sale.total_box)}</p>
        </div>
        <Separator orientation="vertical" className="h-10" />
        <div>
          <p className="text-[10px] uppercase text-gray-400 font-bold">Total SFT</p>
          <p className="text-lg font-bold text-gray-900">{Number(sale.total_sft).toFixed(2)}</p>
        </div>
        <Separator orientation="vertical" className="h-10" />
        <div>
          <p className="text-[10px] uppercase text-gray-400 font-bold">Total Piece</p>
          <p className="text-lg font-bold text-gray-900">{Number(sale.total_piece)}</p>
        </div>
        {showPrices && (
          <>
            <Separator orientation="vertical" className="h-10" />
            <div>
              <p className="text-[10px] uppercase text-gray-400 font-bold">Total Amount</p>
              <p className="text-lg font-bold text-gray-900">{formatCurrency(sale.total_amount)}</p>
            </div>
          </>
        )}
      </div>

      {/* ── Notes ── */}
      {challan && (challan as any).notes && (
        <div className="rounded-md border p-4 mb-6">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Notes</p>
          <p className="text-xs text-gray-600">{(challan as any).notes}</p>
        </div>
      )}

      {/* ── Terms & Conditions ── */}
      <div className="rounded-md border p-4 mb-8">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Terms & Conditions</p>
        <ul className="text-[10px] text-gray-500 list-disc list-inside space-y-0.5">
          <li>Goods once delivered will not be taken back without prior approval.</li>
          <li>Please check the goods at the time of delivery.</li>
          <li>This is a delivery challan and not a tax invoice.</li>
        </ul>
      </div>

      {/* ── Signature Areas ── */}
      <div className="grid grid-cols-2 gap-12 mt-4 mb-6">
        <div className="text-center">
          <div className="h-20"></div>
          <div className="border-t border-gray-400 pt-2">
            <p className="text-xs text-gray-500 font-medium">Receiver's Signature & Stamp</p>
          </div>
        </div>
        <div className="text-center">
          <div className="h-20"></div>
          <div className="border-t border-gray-400 pt-2">
            <p className="text-xs text-gray-500 font-medium">Authorized Signature & Stamp</p>
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <Separator className="mb-3" />
      <div className="flex justify-between text-[10px] text-gray-400">
        <span>This is a delivery challan, not a tax invoice.</span>
        <span>
          {challan ? `Challan #${(challan as any).challan_no}` : sale.invoice_number} · {challan ? (challan as any).challan_date : sale.sale_date}
        </span>
      </div>
    </div>
  );
};

export default ChallanPage;
