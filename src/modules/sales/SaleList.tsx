import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { salesService } from "@/services/salesService";
import { deliveryService } from "@/services/deliveryService";
import Pagination from "@/components/Pagination";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Plus, Search, Truck,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import CreateDeliveryDialog from "@/modules/deliveries/CreateDeliveryDialog";
import DeleteConfirmDialog from "@/components/DeleteConfirmDialog";
import SaleActionDropdown from "./SaleActionDropdown";

interface SaleListProps {
  dealerId: string;
}

const PAGE_SIZE = 25;

const statusColors: Record<string, string> = {
  draft: "secondary",
  challan_created: "outline",
  delivered: "default",
  invoiced: "default",
  completed: "default",
  partially_delivered: "outline",
};

const paymentStatusVariant = (due: number, paid: number) => {
  if (due <= 0) return "default";
  if (paid > 0) return "outline";
  return "secondary";
};

const paymentStatusLabel = (due: number, paid: number) => {
  if (due <= 0) return "Paid";
  if (paid > 0) return "Partial";
  return "Pending";
};

const SaleList = ({ dealerId }: SaleListProps) => {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deliverySale, setDeliverySale] = useState<any>(null);
  const [deleteSale, setDeleteSale] = useState<any>(null);
  const { isDealerAdmin, profile } = useAuth();
  const queryClient = useQueryClient();

  // Check which sales have deliveries
  const { data: deliveryMap } = useQuery({
    queryKey: ["sales-delivery-check", dealerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("deliveries")
        .select("sale_id")
        .eq("dealer_id", dealerId);
      const set = new Set<string>();
      for (const d of data ?? []) if (d.sale_id) set.add(d.sale_id);
      return set;
    },
    enabled: !!dealerId,
  });

  // Check which sales have challans
  const { data: challanMap } = useQuery({
    queryKey: ["sales-challan-check", dealerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("challans")
        .select("sale_id")
        .eq("dealer_id", dealerId);
      const set = new Set<string>();
      for (const d of data ?? []) set.add(d.sale_id);
      return set;
    },
    enabled: !!dealerId,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("sales").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      toast.success("Sale deleted");
      setDeleteSale(null);
    },
    onError: (e) => toast.error(e.message),
  });

  // Fetch sale items for the delivery dialog
  const { data: deliverySaleData } = useQuery({
    queryKey: ["sale-for-delivery", deliverySale?.id],
    queryFn: async () => {
      if (!deliverySale?.id) return null;
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: sData, error } = await supabase
        .from("sales")
        .select("*, sale_items(*, products(name, sku, unit_type, per_box_sft)), customers(name, phone, address)")
        .eq("id", deliverySale.id)
        .single();
      if (error) throw new Error(error.message);
      return sData;
    },
    enabled: !!deliverySale?.id,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["sales", dealerId, page, search],
    queryFn: () => salesService.list(dealerId, page, search),
    enabled: !!dealerId,
  });

  const sales = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === sales.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(sales.map((s: any) => s.id)));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-foreground">Sales</h1>
        <Button onClick={() => navigate("/sales/new")}>
          <Plus className="mr-2 h-4 w-4" /> Add Sale
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by invoice or customer…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : sales.length === 0 ? (
        <p className="text-muted-foreground">No sales found.</p>
      ) : (
        <>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={sales.length > 0 && selected.size === sales.length}
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Reference No</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Sale Status</TableHead>
                  <TableHead className="text-right">Grand Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Payment Status</TableHead>
                  {isDealerAdmin && (
                    <TableHead className="text-right">Profit</TableHead>
                  )}
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.map((s: any) => {
                  const isChallan = s.sale_type === "challan_mode";
                  const due = Number(s.due_amount) || 0;
                  const paid = Number(s.paid_amount) || 0;

                  return (
                    <TableRow
                      key={s.id}
                      className="cursor-pointer"
                      onClick={() => {
                        const isChallanStatus = isChallan && ["draft", "challan_created", "delivered"].includes(s.sale_status);
                        navigate(isChallanStatus ? `/sales/${s.id}/challan` : `/sales/${s.id}/invoice`);
                      }}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selected.has(s.id)}
                          onCheckedChange={() => toggleSelect(s.id)}
                        />
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{s.sale_date}</TableCell>
                      <TableCell className="font-mono text-sm">{s.invoice_number ?? "—"}</TableCell>
                      <TableCell>{s.customers?.name ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Badge
                            variant={statusColors[s.sale_status] as any ?? "secondary"}
                            className={`capitalize text-xs ${s.sale_status === "partially_delivered" ? "border-orange-500 text-orange-600" : s.sale_status === "delivered" ? "bg-green-600 text-white" : ""}`}
                          >
                            {s.sale_status === "partially_delivered" 
                              ? "Partial Delivery" 
                              : (s.sale_status ?? "invoiced").replace(/_/g, " ")}
                          </Badge>
                          {s.sale_status === "partially_delivered" && (
                            <span className="text-xs text-orange-600 font-medium">
                              <Truck className="inline h-3 w-3 mr-0.5" />
                              In Progress
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(s.total_amount)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(s.paid_amount)}</TableCell>
                      <TableCell className={`text-right ${due > 0 ? "text-destructive font-semibold" : ""}`}>
                        {formatCurrency(due)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={paymentStatusVariant(due, paid) as any}
                          className={`text-xs ${due <= 0 ? "bg-green-600 text-white hover:bg-green-700" : due > 0 && paid > 0 ? "border-yellow-500 text-yellow-600" : "bg-orange-100 text-orange-700"}`}
                        >
                          {paymentStatusLabel(due, paid)}
                        </Badge>
                      </TableCell>
                      {isDealerAdmin && (
                        <TableCell className={`text-right font-semibold ${Number(s.profit) >= 0 ? "text-primary" : "text-destructive"}`}>
                          {formatCurrency(s.profit)}
                        </TableCell>
                      )}
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <SaleActionDropdown
                          saleType={s.sale_type}
                          saleStatus={s.sale_status}
                          hasPaid={paid > 0}
                          hasDelivery={deliveryMap?.has(s.id) ?? false}
                          hasChallan={challanMap?.has(s.id) ?? false}
                          onViewDetails={() => navigate(`/sales/${s.id}/invoice`)}
                          onViewInvoice={() => navigate(`/sales/${s.id}/invoice`)}
                          onViewChallan={() => navigate(`/sales/${s.id}/challan`)}
                          onViewPayments={() => navigate(`/sales/${s.id}/invoice`)}
                          onViewDeliveryStatus={() => navigate(`/deliveries`)}
                          onAddPayment={() => navigate(`/sales/${s.id}/invoice`)}
                          onViewPaymentHistory={() => navigate(`/sales/${s.id}/invoice`)}
                          onPrintReceipt={() => navigate(`/sales/${s.id}/invoice`)}
                          onSendReminder={() => navigate(`/sales/${s.id}/invoice`)}
                          onAddDelivery={() => setDeliverySale(s)}
                          onViewDelivery={() => navigate(`/deliveries`)}
                          onMarkDelivered={() => {
                            toast.info("Use delivery management to update status");
                            navigate(`/deliveries`);
                          }}
                          onPrintChallan={() => navigate(`/sales/${s.id}/challan`)}
                          onDownloadInvoice={() => navigate(`/sales/${s.id}/invoice`)}
                          onDownloadChallan={() => navigate(`/sales/${s.id}/challan`)}
                          onEmailInvoice={() => toast.info("Email invoice from the invoice page")}
                          onEditSale={() => navigate(`/sales/${s.id}/edit`)}
                          onConvertToInvoice={() => navigate(`/sales/${s.id}/invoice`)}
                          onDuplicateSale={() => navigate(`/sales/new`)}
                          onReturnFull={() => navigate(`/sales-returns/new`)}
                          onReturnPartial={() => navigate(`/sales-returns/new`)}
                          onCancelSale={() => toast.info("Cancel via edit page")}
                          onDeleteSale={() => setDeleteSale(s)}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {totalPages > 1 && (
            <Pagination page={page} totalItems={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
          )}
        </>
      )}

      <CreateDeliveryDialog
        open={!!deliverySale}
        onClose={() => setDeliverySale(null)}
        sale={deliverySaleData ?? deliverySale}
        dealerId={dealerId}
      />

      <DeleteConfirmDialog
        open={!!deleteSale}
        onOpenChange={(open) => { if (!open) setDeleteSale(null); }}
        title="Delete Sale"
        description={`Are you sure you want to permanently delete sale "${deleteSale?.invoice_number ?? ""}"? This action cannot be undone.`}
        onConfirm={() => { if (deleteSale) deleteMutation.mutate(deleteSale.id); }}
      />
    </div>
  );
};

export default SaleList;
