import { useQuery } from "@tanstack/react-query";
import { getDealerCreditReport, type CustomerCreditInfo } from "@/services/creditService";
import { useDealerId } from "@/hooks/useDealerId";
import { CreditStatusBadge } from "@/components/CreditStatusBadge";
import { formatCurrency } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldCheck, AlertTriangle } from "lucide-react";

const CreditReportPage = () => {
  const dealerId = useDealerId();

  const { data: report = [], isLoading } = useQuery({
    queryKey: ["credit-report", dealerId],
    queryFn: () => getDealerCreditReport(dealerId),
    staleTime: 60_000,
  });

  const exceeded = report.filter((r) => r.status === "exceeded").length;
  const near = report.filter((r) => r.status === "near").length;
  const overdue = report.filter(
    (r) => r.max_overdue_days > 0 && r.overdue_days > r.max_overdue_days
  ).length;
  const totalDue = report.reduce((s, r) => s + r.current_outstanding, 0);

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Credit Report</h1>
        <p className="text-sm text-muted-foreground">Customer-wise credit utilization and overdue analysis</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total Outstanding</p>
          <p className="text-xl font-bold text-foreground">{formatCurrency(totalDue)}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Limit Exceeded</p>
          <p className="text-xl font-bold text-destructive">{exceeded}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Near Limit</p>
          <p className="text-xl font-bold text-yellow-600">{near}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Overdue Violations</p>
          <p className="text-xl font-bold text-orange-600">{overdue}</p>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead className="text-right">Outstanding</TableHead>
              <TableHead className="text-right">Credit Limit</TableHead>
              <TableHead className="w-36">Utilization</TableHead>
              <TableHead className="text-right">Overdue Days</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : report.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                  <ShieldCheck className="mx-auto h-8 w-8 mb-2 text-muted-foreground/50" />
                  No active customers with outstanding balances.
                </TableCell>
              </TableRow>
            ) : (
              report.map((row) => {
                const isOverdueViolated =
                  row.max_overdue_days > 0 && row.overdue_days > row.max_overdue_days;
                const pct = Math.min(100, row.utilization_pct);
                const progressColor =
                  row.status === "exceeded"
                    ? "bg-destructive"
                    : row.status === "near"
                    ? "bg-yellow-500"
                    : "bg-green-500";

                return (
                  <TableRow
                    key={row.customer_id}
                    className={
                      row.status === "exceeded" || isOverdueViolated
                        ? "bg-red-50/50 dark:bg-red-950/20"
                        : ""
                    }
                  >
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-2">
                        {isOverdueViolated && (
                          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                        )}
                        {row.customer_name}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatCurrency(row.current_outstanding)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {row.credit_limit > 0 ? formatCurrency(row.credit_limit) : "—"}
                    </TableCell>
                    <TableCell>
                      {row.credit_limit > 0 ? (
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{pct}%</span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${progressColor}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">No limit</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={
                          isOverdueViolated
                            ? "font-semibold text-amber-600"
                            : "text-muted-foreground"
                        }
                      >
                        {row.overdue_days > 0 ? `${row.overdue_days}d` : "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <CreditStatusBadge
                        outstanding={row.current_outstanding}
                        creditLimit={row.credit_limit}
                        overdueDays={row.overdue_days}
                        maxOverdueDays={row.max_overdue_days}
                        showTooltip={false}
                      />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default CreditReportPage;
