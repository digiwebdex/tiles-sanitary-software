import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { customerService } from "@/services/customerService";
import { useDealerId } from "@/hooks/useDealerId";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import Pagination from "@/components/Pagination";
import { toast } from "sonner";
import { Plus, Search, Pencil, ToggleLeft, ToggleRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { CreditStatusBadge } from "@/components/CreditStatusBadge";

const PAGE_SIZE = 25;

const TYPE_LABELS: Record<string, string> = {
  retailer: "Retailer",
  customer: "Regular",
  project: "Project",
};

const TYPE_COLORS: Record<string, string> = {
  retailer: "default",
  customer: "secondary",
  project: "outline",
};

const CustomerList = () => {
  const dealerId = useDealerId();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["customers", dealerId, search, typeFilter, page],
    queryFn: () => customerService.list(dealerId, search, typeFilter, page),
    enabled: !!dealerId,
  });

  const customers = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Fetch customer due balances for all customers on this page
  const { data: ledgerSums = {} } = useQuery({
    queryKey: ["customer-due-balances", dealerId, customers.map((c) => c.id)],
    queryFn: async () => {
      if (!customers.length) return {};
      const ids = customers.map((c) => c.id);
      const { data, error } = await supabase
        .from("customer_ledger")
        .select("customer_id, amount, type")
        .eq("dealer_id", dealerId)
        .in("customer_id", ids);
      if (error) throw new Error(error.message);

      const sums: Record<string, number> = {};
      for (const row of data ?? []) {
        const amt = Number(row.amount);
        if (!sums[row.customer_id]) sums[row.customer_id] = 0;
        if (row.type === "sale") sums[row.customer_id] += amt;
        else if (row.type === "payment" || row.type === "refund") sums[row.customer_id] -= amt;
        else if (row.type === "adjustment") sums[row.customer_id] += amt;
      }
      return sums;
    },
    enabled: customers.length > 0,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "active" | "inactive" }) =>
      customerService.toggleStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Customer status updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-foreground">Customers</h1>
        <Button onClick={() => navigate("/customers/new")}>
          <Plus className="mr-2 h-4 w-4" /> Add Customer
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, phone or reference…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
        <Select
          value={typeFilter || "all"}
          onValueChange={(v) => { setTypeFilter(v === "all" ? "" : v); setPage(1); }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="retailer">Retailer</SelectItem>
            <SelectItem value="customer">Regular</SelectItem>
            <SelectItem value="project">Project</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : customers.length === 0 ? (
        <p className="text-muted-foreground">No customers found.</p>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Opening Bal.</TableHead>
                  <TableHead className="text-right">Due Balance</TableHead>
                  <TableHead>Credit</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-20 text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((c) => {
                  const due = ledgerSums[c.id] ?? 0;
                  return (
                    <TableRow key={c.id} className={`cursor-pointer ${c.status === "inactive" ? "opacity-60" : ""}`} onClick={() => navigate(`/customers/${c.id}/edit`)}>
                      <TableCell className="font-medium">
                        <div>{c.name}</div>
                        {c.email && (
                          <div className="text-xs text-muted-foreground">{c.email}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={TYPE_COLORS[c.type] as any}>
                          {TYPE_LABELS[c.type] ?? c.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{c.phone ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {c.reference_name ?? "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm font-mono">
                        {formatCurrency(c.opening_balance)}
                      </TableCell>
                      <TableCell className="text-right text-sm font-mono">
                        <span className={due > 0 ? "text-destructive font-semibold" : "text-muted-foreground"}>
                          {formatCurrency(due)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {(c.credit_limit > 0 || c.max_overdue_days > 0) ? (
                          <CreditStatusBadge
                            outstanding={due}
                            creditLimit={c.credit_limit}
                            showTooltip={true}
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={c.status === "active" ? "default" : "secondary"}>
                          {c.status === "active" ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Edit customer"
                            onClick={() => navigate(`/customers/${c.id}/edit`)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title={c.status === "active" ? "Disable customer" : "Enable customer"}
                            onClick={() =>
                              toggleMutation.mutate({
                                id: c.id,
                                status: c.status === "active" ? "inactive" : "active",
                              })
                            }
                          >
                            {c.status === "active" ? (
                              <ToggleRight className="h-4 w-4 text-primary" />
                            ) : (
                              <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                            )}
                          </Button>
                        </div>
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
    </div>
  );
};

export default CustomerList;
