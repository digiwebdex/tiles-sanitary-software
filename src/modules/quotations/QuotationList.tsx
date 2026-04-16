import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Search, Eye, Pencil, X, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pagination } from "@/components/Pagination";

import { useDealerId } from "@/hooks/useDealerId";
import { quotationService, type QuotationStatus, formatQuotationDisplayNo } from "@/services/quotationService";
import { QuotationStatusBadge } from "@/components/quotation/QuotationStatusBadge";
import { formatCurrency, parseLocalDate } from "@/lib/utils";
import QuotationDetailDialog from "./QuotationDetailDialog";

const fmtDate = (d: string) => {
  const dt = parseLocalDate(d);
  return dt ? dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : d;
};

const QuotationList = () => {
  const navigate = useNavigate();
  const dealerId = useDealerId();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<QuotationStatus | "">("");
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["quotations", dealerId, search, status, page],
    queryFn: () => quotationService.list(dealerId, { search, status, page }),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => quotationService.cancel(id),
    onSuccess: () => {
      toast.success("Quotation cancelled");
      qc.invalidateQueries({ queryKey: ["quotations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / 25));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Quotations</h1>
          <p className="text-sm text-muted-foreground">Price estimates for customers — convert to sale when confirmed</p>
        </div>
        <Button onClick={() => navigate("/quotations/new")}>
          <Plus className="h-4 w-4 mr-1" /> New Quotation
        </Button>
      </div>

      <Card>
        <CardContent className="pt-4 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by quote no or customer name"
              className="pl-8"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <Select value={status || "__all"} onValueChange={(v) => { setStatus(v === "__all" ? "" : (v as QuotationStatus)); setPage(1); }}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="active">Active Quote</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="revised">Revised</SelectItem>
              <SelectItem value="converted">Converted</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Quote #</th>
                <th className="text-left px-3 py-2">Customer</th>
                <th className="text-left px-3 py-2">Date</th>
                <th className="text-left px-3 py-2">Valid Until</th>
                <th className="text-right px-3 py-2">Total</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-right px-3 py-2 w-32">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">Loading…</td></tr>
              ) : (data?.data ?? []).length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-muted-foreground">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    No quotations yet. Click <strong>New Quotation</strong> to start.
                  </td>
                </tr>
              ) : (
                (data?.data ?? []).map((q) => {
                  const customerName = q.customers?.name ?? q.customer_name_text ?? "—";
                  const isDraft = q.status === "draft";
                  const canCancel = ["draft", "active", "expired"].includes(q.status);
                  return (
                    <tr key={q.id} className="border-t hover:bg-accent/30">
                      <td className="px-3 py-2 font-mono">{formatQuotationDisplayNo(q)}</td>
                      <td className="px-3 py-2">{customerName}</td>
                      <td className="px-3 py-2">{fmtDate(q.quote_date)}</td>
                      <td className="px-3 py-2">{fmtDate(q.valid_until)}</td>
                      <td className="px-3 py-2 text-right font-semibold">{formatCurrency(q.total_amount)}</td>
                      <td className="px-3 py-2"><QuotationStatusBadge status={q.status} /></td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => setDetailId(q.id)} title="View">
                            <Eye className="h-4 w-4" />
                          </Button>
                          {isDraft && (
                            <Button variant="ghost" size="icon" onClick={() => navigate(`/quotations/${q.id}/edit`)} title="Edit draft">
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {canCancel && (
                            <Button
                              variant="ghost" size="icon" title="Cancel"
                              onClick={() => {
                                if (confirm("Cancel this quotation?")) cancelMutation.mutate(q.id);
                              }}
                            >
                              <X className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {pageCount > 1 && (
        <Pagination currentPage={page} totalPages={pageCount} onPageChange={setPage} />
      )}

      {detailId && (
        <QuotationDetailDialog quotationId={detailId} open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)} />
      )}
    </div>
  );
};

export default QuotationList;
