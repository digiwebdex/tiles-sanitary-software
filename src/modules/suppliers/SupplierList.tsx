import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supplierService } from "@/services/supplierService";
import { useDealerId } from "@/hooks/useDealerId";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import Pagination from "@/components/Pagination";
import { toast } from "sonner";
import { Plus, Search, Pencil, ToggleLeft, ToggleRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

const PAGE_SIZE = 25;

const SupplierList = () => {
  const dealerId = useDealerId();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["suppliers", dealerId, search, page],
    queryFn: () => supplierService.list(dealerId, search, page),
    enabled: !!dealerId,
  });

  const suppliers = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const toggleMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "active" | "inactive" }) =>
      supplierService.toggleStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success("Supplier status updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-foreground">Suppliers</h1>
        <Button onClick={() => navigate("/suppliers/new")}>
          <Plus className="mr-2 h-4 w-4" /> Add Supplier
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by name, contact or phone…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : suppliers.length === 0 ? (
        <p className="text-muted-foreground">No suppliers found.</p>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier Name</TableHead>
                  <TableHead>Contact Person</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-right">Opening Bal.</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-20 text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliers.map((s) => (
                  <TableRow key={s.id} className={s.status === "inactive" ? "opacity-60" : ""}>
                    <TableCell className="font-medium">
                      <div>{s.name}</div>
                      {s.gstin && <div className="text-xs text-muted-foreground">{s.gstin}</div>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {s.contact_person ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">{s.phone ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {s.email ? (
                        <a href={`mailto:${s.email}`} className="hover:underline">
                          {s.email}
                        </a>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm font-mono">
                      {formatCurrency(s.opening_balance)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={s.status === "active" ? "default" : "secondary"}>
                        {s.status === "active" ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Edit supplier"
                          onClick={() => navigate(`/suppliers/${s.id}/edit`)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title={s.status === "active" ? "Disable supplier" : "Enable supplier"}
                          onClick={() =>
                            toggleMutation.mutate({
                              id: s.id,
                              status: s.status === "active" ? "inactive" : "active",
                            })
                          }
                        >
                          {s.status === "active" ? (
                            <ToggleRight className="h-4 w-4 text-primary" />
                          ) : (
                            <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
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

export default SupplierList;
