import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { customerLedgerService } from "@/services/ledgerService";
import { cashLedgerService } from "@/services/ledgerService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Search, Wallet, AlertTriangle, CheckCircle, DollarSign, TrendingDown } from "lucide-react";
import { format } from "date-fns";

interface CustomerOutstanding {
  id: string;
  name: string;
  phone: string | null;
  type: string;
  outstanding: number;
  last_payment_date: string | null;
  total_sales: number;
  total_paid: number;
  invoices: { invoice_number: string; sale_id: string }[];
}

interface CollectionEntry {
  id: string;
  customer_name: string;
  amount: number;
  description: string | null;
  entry_date: string;
  created_at: string;
}

export default function CollectionTracker({ dealerId }: { dealerId: string }) {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [payDialog, setPayDialog] = useState<{ open: boolean; customer?: CustomerOutstanding }>({ open: false });
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");

  // Fetch all customers with outstanding balances
  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["collection-tracker", dealerId],
    queryFn: async () => {
      // Get all active customers
      const { data: custs, error: custErr } = await supabase
        .from("customers")
        .select("id, name, phone, type")
        .eq("dealer_id", dealerId)
        .eq("status", "active")
        .order("name");
      if (custErr) throw new Error(custErr.message);

      // Get all customer ledger entries and latest sales
      const [ledgerRes, salesRes] = await Promise.all([
        supabase
          .from("customer_ledger")
          .select("customer_id, amount, type, entry_date")
          .eq("dealer_id", dealerId),
        supabase
          .from("sales")
          .select("customer_id, invoice_number, sale_date, id")
          .eq("dealer_id", dealerId)
          .order("sale_date", { ascending: false }),
      ]);
      if (ledgerRes.error) throw new Error(ledgerRes.error.message);
      if (salesRes.error) throw new Error(salesRes.error.message);
      const ledger = ledgerRes.data ?? [];
      const sales = salesRes.data ?? [];

      // Map all invoices per customer
      const invoiceMap = new Map<string, { invoice_number: string; sale_id: string }[]>();
      for (const s of sales) {
        if (s.invoice_number) {
          const arr = invoiceMap.get(s.customer_id) ?? [];
          arr.push({ invoice_number: s.invoice_number, sale_id: s.id });
          invoiceMap.set(s.customer_id, arr);
        }
      }

      // Aggregate per customer
      const map = new Map<string, { outstanding: number; total_sales: number; total_paid: number; last_payment: string | null }>();
      for (const entry of ledger ?? []) {
        const cur = map.get(entry.customer_id) ?? { outstanding: 0, total_sales: 0, total_paid: 0, last_payment: null };
        const amt = Number(entry.amount);
        if (entry.type === "sale") {
          cur.outstanding += amt;
          cur.total_sales += amt;
        } else if (entry.type === "payment" || entry.type === "refund") {
          cur.outstanding -= amt;
          cur.total_paid += amt;
          if (!cur.last_payment || entry.entry_date > cur.last_payment) {
            cur.last_payment = entry.entry_date;
          }
        } else if (entry.type === "adjustment") {
          cur.outstanding += amt;
          cur.total_sales += amt;
        }
        map.set(entry.customer_id, cur);
      }

      const result: CustomerOutstanding[] = (custs ?? []).map((c) => {
        const agg = map.get(c.id) ?? { outstanding: 0, total_sales: 0, total_paid: 0, last_payment: null };
        return {
          id: c.id,
          name: c.name,
          phone: c.phone,
          type: c.type,
          outstanding: Math.round(agg.outstanding * 100) / 100,
          last_payment_date: agg.last_payment,
          total_sales: Math.round(agg.total_sales * 100) / 100,
          total_paid: Math.round(agg.total_paid * 100) / 100,
          invoices: invoiceMap.get(c.id) ?? [],
        };
      });

      // Sort by outstanding descending, filter out zero/negative
      return result.filter((c) => c.outstanding > 0).sort((a, b) => b.outstanding - a.outstanding);
    },
  });

  // Recent collections (payments)
  const { data: recentCollections = [] } = useQuery({
    queryKey: ["recent-collections", dealerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_ledger")
        .select("id, amount, description, entry_date, created_at, customer_id, customers(name)")
        .eq("dealer_id", dealerId)
        .eq("type", "payment")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw new Error(error.message);
      return (data ?? []).map((r: any) => ({
        id: r.id,
        customer_name: r.customers?.name ?? "Unknown",
        amount: Number(r.amount),
        description: r.description,
        entry_date: r.entry_date,
        created_at: r.created_at,
      })) as CollectionEntry[];
    },
  });

  // Record payment mutation
  const recordPayment = useMutation({
    mutationFn: async ({ customerId, amount, note }: { customerId: string; amount: number; note: string }) => {
      // Add to customer ledger as payment
      await customerLedgerService.addEntry({
        dealer_id: dealerId,
        customer_id: customerId,
        type: "payment",
        amount,
        description: note || `Payment collected`,
      });
      // Add to cash ledger as receipt
      await cashLedgerService.addEntry({
        dealer_id: dealerId,
        type: "receipt",
        amount,
        description: `Payment from ${payDialog.customer?.name}: ${note || "Collection"}`,
        reference_type: "customer_payment",
      });
    },
    onSuccess: () => {
      toast.success("Payment recorded successfully");
      queryClient.invalidateQueries({ queryKey: ["collection-tracker"] });
      queryClient.invalidateQueries({ queryKey: ["recent-collections"] });
      setPayDialog({ open: false });
      setPayAmount("");
      setPayNote("");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const filtered = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.phone && c.phone.includes(search))
  );

  const totalOutstanding = customers.reduce((s, c) => s + c.outstanding, 0);
  const totalCollectedToday = recentCollections
    .filter((c) => c.entry_date === new Date().toISOString().split("T")[0])
    .reduce((s, c) => s + c.amount, 0);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Payment Collections</h1>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-destructive/10">
              <TrendingDown className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Outstanding</p>
              <p className="text-xl font-bold text-foreground">৳{totalOutstanding.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Wallet className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Today's Collection</p>
              <p className="text-xl font-bold text-foreground">৳{totalCollectedToday.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent">
              <AlertTriangle className="h-5 w-5 text-accent-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Customers with Due</p>
              <p className="text-xl font-bold text-foreground">{customers.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search customer name or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Outstanding Customers Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Outstanding Balances</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Invoice No.</TableHead>
                  <TableHead className="text-right">Total Sales</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead>Last Payment</TableHead>
                  <TableHead className="text-center">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No outstanding balances found</TableCell></TableRow>
                ) : (
                  filtered.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-foreground">{c.name}</p>
                          {c.phone && <p className="text-xs text-muted-foreground">{c.phone}</p>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs capitalize">{c.type}</Badge>
                      </TableCell>
                      <TableCell>
                        {c.invoices.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {c.invoices.map((inv) => (
                              <button
                                key={inv.sale_id}
                                onClick={() => navigate(`/sales/${inv.sale_id}/invoice`)}
                                className="text-xs font-mono text-primary hover:underline cursor-pointer"
                              >
                                {inv.invoice_number}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">৳{c.total_sales.toLocaleString()}</TableCell>
                      <TableCell className="text-right">৳{c.total_paid.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-semibold text-destructive">৳{c.outstanding.toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {c.last_payment_date ? format(new Date(c.last_payment_date), "dd MMM yyyy") : "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => {
                            setPayDialog({ open: true, customer: c });
                            setPayAmount("");
                            setPayNote("");
                          }}
                        >
                          <DollarSign className="h-3 w-3 mr-1" /> Collect
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Recent Collections */}
      {recentCollections.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-primary" /> Recent Collections
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentCollections.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.customer_name}</TableCell>
                      <TableCell className="text-right font-semibold text-primary">৳{c.amount.toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.description || "—"}</TableCell>
                      <TableCell className="text-xs">{format(new Date(c.entry_date), "dd MMM yyyy")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payment Dialog */}
      <Dialog open={payDialog.open} onOpenChange={(o) => setPayDialog({ open: o })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Collect Payment — {payDialog.customer?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Outstanding:</span>
              <span className="font-bold text-destructive">৳{payDialog.customer?.outstanding.toLocaleString()}</span>
            </div>
            <div className="space-y-2">
              <Label>Amount (৳)</Label>
              <Input
                type="number"
                min={1}
                max={payDialog.customer?.outstanding}
                placeholder="Enter amount"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Note (optional)</Label>
              <Textarea
                placeholder="Collection note..."
                value={payNote}
                onChange={(e) => setPayNote(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialog({ open: false })}>Cancel</Button>
            <Button
              disabled={!payAmount || Number(payAmount) <= 0 || recordPayment.isPending}
              onClick={() => {
                if (!payDialog.customer) return;
                recordPayment.mutate({
                  customerId: payDialog.customer.id,
                  amount: Number(payAmount),
                  note: payNote,
                });
              }}
            >
              {recordPayment.isPending ? "Recording..." : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
