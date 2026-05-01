import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, subDays, startOfMonth } from "date-fns";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { cn, formatCurrency } from "@/lib/utils";
import { vpsAuthedFetch } from "@/lib/vpsAuthClient";
import { CalendarIcon } from "lucide-react";

interface StockMovementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string | null;
  productName: string;
  dealerId: string;
  unitType: string;
}

type MovementEntry = {
  date: string;
  type: "purchase" | "sale" | "sales_return" | "purchase_return" | "adjustment";
  label: string;
  party: string;
  qtyIn: number;
  qtyOut: number;
  reference: string;
};

const TYPE_COLORS: Record<string, string> = {
  purchase: "default",
  sale: "secondary",
  sales_return: "outline",
  purchase_return: "outline",
  adjustment: "destructive",
};

const TYPE_LABELS: Record<string, string> = {
  purchase: "Purchase",
  sale: "Sale",
  sales_return: "Sales Return",
  purchase_return: "Purchase Return",
  adjustment: "Adjustment",
};

const StockMovementDialog = ({
  open, onOpenChange, productId, productName, dealerId, unitType,
}: StockMovementDialogProps) => {
  const [fromDate, setFromDate] = useState<Date>(startOfMonth(new Date()));
  const [toDate, setToDate] = useState<Date>(new Date());

  const fromStr = format(fromDate, "yyyy-MM-dd");
  const toStr = format(toDate, "yyyy-MM-dd");

  const { data: movement, isLoading } = useQuery({
    queryKey: ["stock-mov", productId, dealerId, fromStr, toStr],
    queryFn: async () => {
      if (!productId) return null;
      const params = new URLSearchParams({ dealerId, from: fromStr, to: toStr });
      const res = await vpsAuthedFetch(
        `/api/products/${productId}/stock-movement?${params.toString()}`,
      );
      if (!res.ok) throw new Error(`stock-movement failed: ${res.status}`);
      return res.json() as Promise<{
        purchases: MovementEntry[];
        sales: MovementEntry[];
        salesReturns: MovementEntry[];
        purchaseReturns: MovementEntry[];
        adjustments: MovementEntry[];
      }>;
    },
    enabled: open && !!productId,
  });

  const allMovements = useMemo(() => {
    if (!movement) return [];
    const entries: MovementEntry[] = [
      ...movement.purchases,
      ...movement.sales,
      ...movement.salesReturns,
      ...movement.purchaseReturns,
      ...movement.adjustments,
    ];
    entries.sort((a, b) => a.date.localeCompare(b.date));
    return entries;
  }, [movement]);

  // Calculate running balance
  const movementsWithBalance = useMemo(() => {
    let balance = 0;
    return allMovements.map((m) => {
      balance += m.qtyIn - m.qtyOut;
      return { ...m, balance };
    });
  }, [allMovements]);

  const totalIn = allMovements.reduce((s, m) => s + m.qtyIn, 0);
  const totalOut = allMovements.reduce((s, m) => s + m.qtyOut, 0);
  const qtyLabel = unitType === "box_sft" ? "Box" : "Pcs";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Stock Movement — {productName}</DialogTitle>
        </DialogHeader>

        {/* Date Filter */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">From:</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("w-[140px] justify-start text-left font-normal")}>
                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                  {format(fromDate, "dd MMM yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={fromDate}
                  onSelect={(d) => d && setFromDate(d)}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">To:</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("w-[140px] justify-start text-left font-normal")}>
                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                  {format(toDate, "dd MMM yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={toDate}
                  onSelect={(d) => d && setToDate(d)}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => { setFromDate(subDays(new Date(), 7)); setToDate(new Date()); }}>7D</Button>
            <Button size="sm" variant="ghost" onClick={() => { setFromDate(subDays(new Date(), 30)); setToDate(new Date()); }}>30D</Button>
            <Button size="sm" variant="ghost" onClick={() => { setFromDate(startOfMonth(new Date())); setToDate(new Date()); }}>MTD</Button>
          </div>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground text-sm py-4">Loading movements…</p>
        ) : movementsWithBalance.length === 0 ? (
          <p className="text-muted-foreground text-sm py-4">No stock movements found in this period.</p>
        ) : (
          <>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Party / Reason</TableHead>
                    <TableHead>Ref</TableHead>
                    <TableHead className="text-right">In ({qtyLabel})</TableHead>
                    <TableHead className="text-right">Out ({qtyLabel})</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movementsWithBalance.map((m, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-sm whitespace-nowrap">
                        {format(new Date(m.date), "dd MMM yyyy")}
                      </TableCell>
                      <TableCell>
                        <Badge variant={TYPE_COLORS[m.type] as any} className="text-xs">
                          {TYPE_LABELS[m.type] ?? m.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm max-w-[180px] truncate">
                        {m.type === "adjustment" ? m.label : m.party}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{m.reference}</TableCell>
                      <TableCell className="text-right text-sm font-medium text-green-600">
                        {m.qtyIn > 0 ? `+${m.qtyIn}` : ""}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium text-destructive">
                        {m.qtyOut > 0 ? `-${m.qtyOut}` : ""}
                      </TableCell>
                      <TableCell className={cn("text-right text-sm font-semibold", m.balance < 0 && "text-destructive")}>
                        {m.balance}
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Totals */}
                  <TableRow className="bg-muted/50 font-semibold">
                    <TableCell colSpan={4} className="text-right">Totals:</TableCell>
                    <TableCell className="text-right text-green-600">+{totalIn}</TableCell>
                    <TableCell className="text-right text-destructive">-{totalOut}</TableCell>
                    <TableCell className="text-right">
                      {movementsWithBalance.length > 0
                        ? movementsWithBalance[movementsWithBalance.length - 1].balance
                        : 0}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground">
              Showing {movementsWithBalance.length} entries • Running balance is relative to this date range
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default StockMovementDialog;
