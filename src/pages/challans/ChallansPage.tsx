import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { challanService } from "@/services/challanService";
import { useDealerId } from "@/hooks/useDealerId";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Search, Eye, FileText } from "lucide-react";
import { format } from "date-fns";

const statusStyles: Record<string, string> = {
  pending: "bg-blue-100 text-blue-800 border-blue-300",
  delivered: "bg-green-100 text-green-800 border-green-300",
  cancelled: "bg-red-100 text-red-800 border-red-300",
};

const ChallansPage = () => {
  const dealerId = useDealerId();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const { data: challans = [], isLoading } = useQuery({
    queryKey: ["challans-list", dealerId],
    queryFn: () => challanService.list(dealerId),
    enabled: !!dealerId,
  });

  const filtered = challans.filter((c: any) => {
    const q = search.toLowerCase();
    if (!q) return true;
    const customerName = c.sales?.customers?.name ?? "";
    return (
      c.challan_no?.toLowerCase().includes(q) ||
      customerName.toLowerCase().includes(q) ||
      c.sales?.invoice_number?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Challans</h1>
          <p className="text-sm text-muted-foreground">Manage delivery challans</p>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by challan no, customer, or invoice…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <FileText className="h-12 w-12 mb-3 opacity-30" />
          <p>No challans found</p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Challan No</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Invoice Ref</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c: any) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono font-medium">{c.challan_no}</TableCell>
                  <TableCell>{format(new Date(c.challan_date), "dd MMM yyyy")}</TableCell>
                  <TableCell>{c.sales?.customers?.name ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{c.sales?.invoice_number ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={statusStyles[c.status] ?? ""}>
                      {c.status?.charAt(0).toUpperCase() + c.status?.slice(1)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`/sales/${c.sale_id}/challan`)}
                    >
                      <Eye className="mr-1 h-4 w-4" /> View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};

export default ChallansPage;
