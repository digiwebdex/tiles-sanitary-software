import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { deliveryService } from "@/services/deliveryService";
import { useDealerInfo } from "@/hooks/useDealerInfo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Pagination from "@/components/Pagination";
import { useToast } from "@/hooks/use-toast";
import { Search, Eye, Pencil, Download, Trash2, MapPin, MessageCircle } from "lucide-react";
import DeliveryDetailDialog from "./DeliveryDetailDialog";
import { ProjectSiteFilter } from "@/components/project/ProjectSiteFilter";
import SendWhatsAppDialog from "@/components/whatsapp/SendWhatsAppDialog";
import { buildDeliveryUpdateMessage } from "@/services/whatsappService";

interface DeliveryListProps {
  dealerId: string;
}

const statusOptions = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "in_transit", label: "In Transit" },
  { value: "delivered", label: "Delivered" },
];

const statusBadge = (status: string) => {
  if (status === "delivered") return <Badge className="bg-green-600 hover:bg-green-700 text-white text-xs">Delivered</Badge>;
  if (status === "in_transit") return <Badge variant="outline" className="border-blue-500 text-blue-600 text-xs">In Transit</Badge>;
  return <Badge variant="secondary" className="text-xs capitalize">{status?.replace("_", " ")}</Badge>;
};

const DeliveryList = ({ dealerId }: DeliveryListProps) => {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [waDialog, setWaDialog] = useState<null | {
    deliveryId: string;
    phone: string;
    name: string;
    message: string;
  }>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: dealerInfo } = useDealerInfo();

  const { data, isLoading } = useQuery({
    queryKey: ["deliveries", dealerId, page, statusFilter, projectId, siteId],
    queryFn: () => deliveryService.list(dealerId, page, statusFilter, { projectId, siteId }),
    enabled: !!dealerId,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      deliveryService.updateStatus(id, status, dealerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deliveries"] });
      toast({ title: "Delivery status updated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deliveries = data?.data ?? [];
  const total = data?.total ?? 0;

  // Client-side search filter
  const filtered = search.trim()
    ? deliveries.filter((d: any) => {
        const q = search.toLowerCase();
        const customer = (d.sales as any)?.customers?.name ?? "";
        const challanNo = (d.challans as any)?.challan_no ?? "";
        const invoiceNo = (d.sales as any)?.invoice_number ?? "";
        return customer.toLowerCase().includes(q) || challanNo.toLowerCase().includes(q) || invoiceNo.toLowerCase().includes(q);
      })
    : deliveries;

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((d: any) => d.id)));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-foreground">Deliveries</h1>
        <div className="flex flex-wrap items-center gap-3">
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {statusOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ProjectSiteFilter
            dealerId={dealerId}
            projectId={projectId}
            siteId={siteId}
            onChange={({ projectId: pid, siteId: sid }) => { setProjectId(pid); setSiteId(sid); setPage(1); }}
          />
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-48"
            />
          </div>
        </div>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground">No deliveries found.</p>
      ) : (
        <>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={filtered.length > 0 && selected.size === filtered.length}
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Delivery Ref No</TableHead>
                  <TableHead>Sale Ref No</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((d: any) => {
                  const customer = (d.sales as any)?.customers;
                  const challanNo = (d.challans as any)?.challan_no;
                  const invoiceNo = (d.sales as any)?.invoice_number;
                  const deliveryNo = (d as any)?.delivery_no;
                  const address = d.delivery_address || customer?.address || "—";
                  const phone = d.receiver_phone || customer?.phone;
                  const deliveryItemsList = (d as any)?.delivery_items ?? [];
                  const itemCount = deliveryItemsList.length;
                  const totalQty = deliveryItemsList.reduce((sum: number, di: any) => sum + Number(di.quantity), 0);

                  return (
                    <TableRow key={d.id} className="cursor-pointer" onClick={() => setDetailId(d.id)}>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selected.has(d.id)}
                          onCheckedChange={() => toggleSelect(d.id)}
                        />
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{d.delivery_date}</TableCell>
                      <TableCell className="font-mono text-sm">{deliveryNo || challanNo || `DO${d.id.slice(0, 12)}`}</TableCell>
                      <TableCell className="font-mono text-sm">{invoiceNo || "—"}</TableCell>
                      <TableCell>{customer?.name ?? d.receiver_name ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px]">
                        {itemCount > 0 ? (
                          <span className="font-medium text-foreground">{itemCount} items, {totalQty} units</span>
                        ) : (
                          <>
                            <p>{address}</p>
                            {phone && <p>Tel: {phone}</p>}
                          </>
                        )}
                      </TableCell>
                      <TableCell>{statusBadge(d.status)}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="outline" className="h-8 px-3 text-xs">
                              Actions
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setDetailId(d.id)}>
                              <Eye className="mr-2 h-4 w-4" /> Delivery Details
                            </DropdownMenuItem>
                            {d.status !== "delivered" && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() =>
                                    updateMutation.mutate({
                                      id: d.id,
                                      status: d.status === "pending" ? "in_transit" : "delivered",
                                    })
                                  }
                                >
                                  <Pencil className="mr-2 h-4 w-4" />
                                  {d.status === "pending" ? "Mark In Transit" : "Mark Delivered"}
                                </DropdownMenuItem>
                              </>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem>
                              <Download className="mr-2 h-4 w-4" /> Download as PDF
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <Pagination page={page} totalItems={total} pageSize={25} onPageChange={setPage} />
        </>
      )}
      <DeliveryDetailDialog
        deliveryId={detailId}
        dealerId={dealerId}
        onClose={() => setDetailId(null)}
      />
    </div>
  );
};

export default DeliveryList;
