import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { deliveryService } from "@/services/deliveryService";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import Pagination from "@/components/Pagination";
import { useToast } from "@/hooks/use-toast";
import { Truck, CheckCircle } from "lucide-react";

interface DeliveryListProps {
  dealerId: string;
}

const statusOptions = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "in_transit", label: "In Transit" },
  { value: "delivered", label: "Delivered" },
];

const statusColors: Record<string, string> = {
  pending: "secondary",
  in_transit: "outline",
  delivered: "default",
};

const DeliveryList = ({ dealerId }: DeliveryListProps) => {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["deliveries", dealerId, page, statusFilter],
    queryFn: () => deliveryService.list(dealerId, page, statusFilter),
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

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-foreground">Deliveries</h1>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            {statusOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : deliveries.length === 0 ? (
        <p className="text-muted-foreground">No deliveries found.</p>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Challan / Invoice</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Receiver</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliveries.map((d: any) => (
                  <TableRow key={d.id}>
                    <TableCell>{d.delivery_date}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {(d.challans as any)?.challan_no || (d.sales as any)?.invoice_number || "—"}
                    </TableCell>
                    <TableCell>{(d.sales as any)?.customers?.name ?? "—"}</TableCell>
                    <TableCell>{d.receiver_name || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={statusColors[d.status] as any ?? "secondary"} className="capitalize text-xs">
                        {d.status?.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {d.status === "pending" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateMutation.mutate({ id: d.id, status: "in_transit" })}
                          >
                            <Truck className="h-3 w-3 mr-1" /> Ship
                          </Button>
                        )}
                        {d.status === "in_transit" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateMutation.mutate({ id: d.id, status: "delivered" })}
                          >
                            <CheckCircle className="h-3 w-3 mr-1" /> Delivered
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pagination page={page} totalItems={total} pageSize={25} onPageChange={setPage} />
        </>
      )}
    </div>
  );
};

export default DeliveryList;
