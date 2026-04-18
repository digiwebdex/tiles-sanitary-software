import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePortalAuth } from "@/contexts/PortalAuthContext";
import { listPortalDeliveries } from "@/services/portalService";
import { PortalListSkeleton } from "./PortalLayout";

export default function PortalDeliveriesPage() {
  const { context } = usePortalAuth();
  const customerId = context?.customer_id ?? "";

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const { data, isLoading } = useQuery({
    queryKey: ["portal", "deliveries", customerId],
    queryFn: () => listPortalDeliveries(customerId),
    enabled: !!customerId,
  });

  const filtered = useMemo(() => {
    const rows = data ?? [];
    const q = search.trim().toLowerCase();
    return rows.filter((d) => {
      if (status !== "all" && (d.status ?? "pending") !== status) return false;
      if (from && d.delivery_date && d.delivery_date < from) return false;
      if (to && d.delivery_date && d.delivery_date > to) return false;
      if (!q) return true;
      return (
        (d.delivery_no ?? "").toLowerCase().includes(q) ||
        (d.invoice_number ?? "").toLowerCase().includes(q) ||
        (d.receiver_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [data, search, status, from, to]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>My Deliveries</CardTitle>
        <div className="flex gap-2 flex-wrap pt-2">
          <Input
            placeholder="Search delivery / invoice / receiver…"
            className="h-8 w-[240px]"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-8 w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="in_transit">In transit</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="date"
            className="h-8 w-[150px]"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            aria-label="From date"
          />
          <Input
            type="date"
            className="h-8 w-[150px]"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            aria-label="To date"
          />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <PortalListSkeleton />
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No deliveries match.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Delivery No.</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Receiver</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.delivery_no ?? d.id.slice(0, 8)}</TableCell>
                    <TableCell>{d.invoice_number ?? "—"}</TableCell>
                    <TableCell>{d.delivery_date}</TableCell>
                    <TableCell>{d.receiver_name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={d.status === "delivered" ? "default" : "secondary"}>
                        {d.status ?? "pending"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
