/**
 * SASubscriptionStatusPage
 *
 * Super Admin view showing the current subscription lifecycle state for every
 * dealer.  Each row is independently evaluated against `end_date` (the source
 * of truth), matching the same rules as AuthContext & has_active_subscription():
 *
 *   suspended            → Suspended  (blocked, red)
 *   today <= end_date    → Active     (green)
 *   end_date + 1–3 days  → Grace      (amber)
 *   end_date + 4-7 days  → Expiring Soon (yellow, only for future-expiry subs)
 *   beyond grace         → Expired    (red)
 *   no end_date          → No Date    (grey)
 */

import { useQuery } from "@tanstack/react-query";
import { vpsAuthedFetch } from "@/lib/vpsAuthClient";
import { parseLocalDate, formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { differenceInDays } from "date-fns";
import { useState, useMemo } from "react";
import {
  CheckCircle2, AlertTriangle, Clock, Ban, HelpCircle, Activity,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type LifecycleStage =
  | "active"
  | "expiring_soon"
  | "grace"
  | "expired"
  | "suspended"
  | "no_date";

interface DealerRow {
  dealerId: string;
  dealerName: string;
  dealerStatus: string;
  subId: string | null;
  planName: string | null;
  planMonthly: number | null;
  subStatus: string | null;
  startDate: string | null;
  endDate: string | null;
  stage: LifecycleStage;
  daysLeft: number | null; // positive = days remaining; negative = days overdue
}

// ─── Lifecycle computation ─────────────────────────────────────────────────────

const GRACE_DAYS = 3;
const EXPIRING_SOON_DAYS = 7;

function computeStage(
  subStatus: string | null,
  endDate: string | null
): { stage: LifecycleStage; daysLeft: number | null } {
  if (!subStatus) return { stage: "no_date", daysLeft: null };
  if (subStatus === "suspended") return { stage: "suspended", daysLeft: null };

  const end = parseLocalDate(endDate);
  if (!end) return { stage: "no_date", daysLeft: null };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days = differenceInDays(end, today); // positive = future, negative = past

  if (days >= 0) {
    // Active window
    if (days <= EXPIRING_SOON_DAYS) return { stage: "expiring_soon", daysLeft: days };
    return { stage: "active", daysLeft: days };
  }

  // Overdue — days is negative here
  const overdueDays = Math.abs(days);
  if (overdueDays <= GRACE_DAYS) return { stage: "grace", daysLeft: -overdueDays };
  return { stage: "expired", daysLeft: -overdueDays };
}

// ─── Stage UI config ───────────────────────────────────────────────────────────

const STAGE_CONFIG: Record<
  LifecycleStage,
  { label: string; icon: React.ElementType; badgeClass: string }
> = {
  active: {
    label: "Active",
    icon: CheckCircle2,
    badgeClass: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30",
  },
  expiring_soon: {
    label: "Expiring Soon",
    icon: Clock,
    badgeClass: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/30",
  },
  grace: {
    label: "Grace Period",
    icon: AlertTriangle,
    badgeClass: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
  },
  expired: {
    label: "Expired",
    icon: Ban,
    badgeClass: "bg-destructive/10 text-destructive border-destructive/30",
  },
  suspended: {
    label: "Suspended",
    icon: Ban,
    badgeClass: "bg-destructive/10 text-destructive border-destructive/30",
  },
  no_date: {
    label: "No Date",
    icon: HelpCircle,
    badgeClass: "bg-muted text-muted-foreground border-border",
  },
};

// ─── Summary card ──────────────────────────────────────────────────────────────

const SummaryCard = ({
  stage,
  count,
  onClick,
  active,
}: {
  stage: LifecycleStage;
  count: number;
  onClick: () => void;
  active: boolean;
}) => {
  const cfg = STAGE_CONFIG[stage];
  const Icon = cfg.icon;
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-lg border p-4 transition-all hover:ring-2 hover:ring-primary/40 ${
        active ? "ring-2 ring-primary bg-primary/5" : "bg-card"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <Badge variant="outline" className={`text-xs ${cfg.badgeClass}`}>
          {cfg.label}
        </Badge>
      </div>
      <p className="text-2xl font-bold text-foreground">{count}</p>
      <p className="text-xs text-muted-foreground mt-0.5">dealers</p>
    </button>
  );
};

// ─── StageBadge ───────────────────────────────────────────────────────────────

const StageBadge = ({ stage }: { stage: LifecycleStage }) => {
  const { label, icon: Icon, badgeClass } = STAGE_CONFIG[stage];
  return (
    <Badge variant="outline" className={`inline-flex items-center gap-1 text-xs font-medium ${badgeClass}`}>
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

const SASubscriptionStatusPage = () => {
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<LifecycleStage | "all">("all");

  const { data: rows = [], isLoading } = useQuery<DealerRow[]>({
    queryKey: ["sa-subscription-status"],
    queryFn: async () => {
      // VPS data sources (super_admin only). Fan-out three parallel calls.
      const [dealersRes, subsRes, lookupsRes] = await Promise.all([
        vpsAuthedFetch("/api/dealers"),
        vpsAuthedFetch("/api/subscriptions"),
        vpsAuthedFetch("/api/subscriptions/lookups"),
      ]);

      if (!dealersRes.ok) throw new Error(`Failed to load dealers (${dealersRes.status})`);
      if (!subsRes.ok) throw new Error(`Failed to load subscriptions (${subsRes.status})`);
      if (!lookupsRes.ok) throw new Error(`Failed to load lookups (${lookupsRes.status})`);

      const { dealers = [] } = await dealersRes.json();
      const { subscriptions = [] } = await subsRes.json();
      const { plans = [] } = await lookupsRes.json();

      const planMap = new Map<string, { name: string; monthly_price: number }>();
      for (const p of plans) {
        planMap.set(p.id, { name: p.name, monthly_price: Number(p.monthly_price ?? 0) });
      }

      // Newest subscription per dealer
      const sorted = [...subscriptions].sort(
        (a: any, b: any) =>
          new Date(b.start_date ?? 0).getTime() - new Date(a.start_date ?? 0).getTime()
      );
      const latestSubByDealer = new Map<string, any>();
      for (const sub of sorted) {
        if (!latestSubByDealer.has(sub.dealer_id)) {
          latestSubByDealer.set(sub.dealer_id, sub);
        }
      }

      return dealers.map((d: any): DealerRow => {
        const sub = latestSubByDealer.get(d.id) ?? null;
        const planInfo = sub?.plan_id ? planMap.get(sub.plan_id) : null;
        const { stage, daysLeft } = computeStage(
          sub?.status ?? null,
          sub?.end_date ?? null
        );
        return {
          dealerId: d.id,
          dealerName: d.name,
          dealerStatus: d.status,
          subId: sub?.id ?? null,
          planName: planInfo?.name ?? null,
          planMonthly: planInfo?.monthly_price ?? null,
          subStatus: sub?.status ?? null,
          startDate: sub?.start_date ?? null,
          endDate: sub?.end_date ?? null,
          stage,
          daysLeft,
        };
      });
    },
    staleTime: 30_000,
  });

  // Summary counts
  const counts = useMemo(() => {
    const map: Partial<Record<LifecycleStage, number>> = {};
    for (const r of rows) map[r.stage] = (map[r.stage] ?? 0) + 1;
    return map;
  }, [rows]);

  // Filtered rows
  const filtered = useMemo(() => {
    let result = rows;
    if (stageFilter !== "all") result = result.filter((r) => r.stage === stageFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) =>
          r.dealerName.toLowerCase().includes(q) ||
          r.planName?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [rows, stageFilter, search]);

  // Days-remaining label
  const daysLabel = (row: DealerRow) => {
    if (row.daysLeft === null) return "—";
    if (row.daysLeft === 0) return "Today";
    if (row.daysLeft > 0) return `${row.daysLeft}d left`;
    return `${Math.abs(row.daysLeft)}d overdue`;
  };

  const daysClass = (row: DealerRow) => {
    if (row.daysLeft === null) return "text-muted-foreground";
    if (row.daysLeft < 0) return "text-destructive font-medium";
    if (row.daysLeft <= 3) return "text-amber-600 dark:text-amber-400 font-medium";
    if (row.daysLeft <= 7) return "text-yellow-600 dark:text-yellow-400 font-medium";
    return "text-muted-foreground";
  };

  const STAGE_ORDER: LifecycleStage[] = [
    "suspended", "expired", "grace", "expiring_soon", "active", "no_date",
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Subscription Status</h1>
        <p className="text-sm text-muted-foreground">
          Per-dealer lifecycle view — evaluated from <code className="text-xs bg-muted px-1 rounded">end_date</code>, not the status field.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {STAGE_ORDER.filter((s) => (counts[s] ?? 0) > 0 || s === "active").map((stage) => (
          <SummaryCard
            key={stage}
            stage={stage}
            count={counts[stage] ?? 0}
            active={stageFilter === stage}
            onClick={() => setStageFilter((p) => (p === stage ? "all" : stage))}
          />
        ))}
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              Dealer Subscription Details
              <Badge variant="secondary" className="text-xs ml-1">
                {filtered.length} dealer{filtered.length !== 1 ? "s" : ""}
              </Badge>
            </CardTitle>
            <div className="flex gap-2">
              <Input
                placeholder="Search dealer or plan…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 w-48 text-sm"
              />
              <Select
                value={stageFilter}
                onValueChange={(v) => setStageFilter(v as LifecycleStage | "all")}
              >
                <SelectTrigger className="h-8 w-40 text-sm">
                  <SelectValue placeholder="All stages" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All stages</SelectItem>
                  {STAGE_ORDER.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STAGE_CONFIG[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Loading dealer subscriptions…
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No dealers match the current filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="pl-4">Dealer</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Monthly Rate</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead>End Date</TableHead>
                    <TableHead>Days</TableHead>
                    <TableHead>Stage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => (
                    <TableRow
                      key={row.dealerId}
                      className={
                        row.stage === "expired" || row.stage === "suspended"
                          ? "bg-destructive/5"
                          : row.stage === "grace"
                          ? "bg-amber-500/5"
                          : row.stage === "expiring_soon"
                          ? "bg-yellow-500/5"
                          : ""
                      }
                    >
                      <TableCell className="pl-4 font-medium">
                        <div>{row.dealerName}</div>
                        {row.dealerStatus !== "active" && (
                          <span className="text-xs text-muted-foreground capitalize">
                            {row.dealerStatus}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.planName ?? <span className="italic text-muted-foreground/60">No plan</span>}
                      </TableCell>
                      <TableCell className="text-sm">
                        {row.planMonthly !== null
                          ? formatCurrency(row.planMonthly)
                          : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.startDate ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.endDate ?? "—"}
                      </TableCell>
                      <TableCell className={`text-sm ${daysClass(row)}`}>
                        {daysLabel(row)}
                      </TableCell>
                      <TableCell>
                        <StageBadge stage={row.stage} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SASubscriptionStatusPage;
