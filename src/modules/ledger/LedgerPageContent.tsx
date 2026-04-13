import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  customerLedgerService,
  supplierLedgerService,
  cashLedgerService,
  expenseLedgerService,
  type MonthlySummary,
} from "@/services/ledgerService";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";
import { exportToExcel } from "@/lib/exportUtils";
import { Download } from "lucide-react";
import { toast } from "sonner";

interface LedgerPageContentProps {
  dealerId: string;
}

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

const LedgerPageContent = ({ dealerId }: LedgerPageContentProps) => {
  const [year, setYear] = useState(currentYear);
  const [tab, setTab] = useState("customer");
  const permissions = usePermissions();

  const customerEntries = useQuery({
    queryKey: ["customer-ledger", dealerId],
    queryFn: () => customerLedgerService.list(dealerId),
    enabled: tab === "customer",
  });

  const supplierEntries = useQuery({
    queryKey: ["supplier-ledger", dealerId],
    queryFn: () => supplierLedgerService.list(dealerId),
    enabled: tab === "supplier" && permissions.canViewSupplierLedger,
  });

  const cashEntries = useQuery({
    queryKey: ["cash-ledger", dealerId],
    queryFn: () => cashLedgerService.list(dealerId),
    enabled: tab === "cash",
  });

  const expenseEntries = useQuery({
    queryKey: ["expense-ledger", dealerId],
    queryFn: () => expenseLedgerService.list(dealerId),
    enabled: tab === "expense" && permissions.canViewExpenseLedger,
  });

  const customerSummary = useQuery({
    queryKey: ["customer-ledger-summary", dealerId, year],
    queryFn: () => customerLedgerService.monthlySummary(dealerId, year),
    enabled: tab === "customer",
  });

  const supplierSummary = useQuery({
    queryKey: ["supplier-ledger-summary", dealerId, year],
    queryFn: () => supplierLedgerService.monthlySummary(dealerId, year),
    enabled: tab === "supplier" && permissions.canViewSupplierLedger,
  });

  const cashSummary = useQuery({
    queryKey: ["cash-ledger-summary", dealerId, year],
    queryFn: () => cashLedgerService.monthlySummary(dealerId, year),
    enabled: tab === "cash",
  });

  const expenseSummary = useQuery({
    queryKey: ["expense-ledger-summary", dealerId, year],
    queryFn: () => expenseLedgerService.monthlySummary(dealerId, year),
    enabled: tab === "expense" && permissions.canViewExpenseLedger,
  });

  const handleExportEntries = (entries: any[], label: string) => {
    if (!permissions.canExportReports) {
      toast.error("You don't have permission to export.");
      return;
    }
    exportToExcel(
      entries.map((e: any) => ({
        date: e.entry_date,
        type: e.type,
        description: e.description || "",
        amount: Number(e.amount),
      })),
      [
        { header: "Date", key: "date" },
        { header: "Type", key: "type" },
        { header: "Description", key: "description" },
        { header: "Amount", key: "amount", format: "currency" },
      ],
      `${label}-ledger-${new Date().toISOString().split("T")[0]}`
    );
    toast.success("Exported");
  };

  const renderEntries = (entries: any[], nameField?: string, label?: string) => (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span />
        {permissions.canExportReports && entries.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => handleExportEntries(entries, label ?? "ledger")}>
            <Download className="mr-1 h-3 w-3" /> Export
          </Button>
        )}
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              {nameField && <TableHead>Name</TableHead>}
              <TableHead>Type</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={nameField ? 5 : 4} className="text-center text-muted-foreground">
                  No entries
                </TableCell>
              </TableRow>
            ) : (
              entries.map((e: any) => (
                <TableRow key={e.id}>
                  <TableCell>{e.entry_date}</TableCell>
                  {nameField && (
                    <TableCell>{e[nameField]?.name ?? "—"}</TableCell>
                  )}
                  <TableCell>
                    <Badge variant="outline" className="capitalize text-xs">{e.type}</Badge>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate">{e.description || "—"}</TableCell>
                  <TableCell className={`text-right font-medium ${Number(e.amount) < 0 ? "text-destructive" : "text-primary"}`}>
                    {Number(e.amount) >= 0 ? "+" : ""}{formatCurrency(Math.abs(Number(e.amount)))}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );

  const renderMonthlySummary = (summary: MonthlySummary[] | undefined) => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">Monthly Summary — {year}</CardTitle>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Credit</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(summary ?? []).map((row) => (
                <TableRow key={row.month}>
                  <TableCell className="font-medium">{row.month}</TableCell>
                  <TableCell className="text-right text-primary">{formatCurrency(row.credit)}</TableCell>
                  <TableCell className="text-right text-destructive">{formatCurrency(row.debit)}</TableCell>
                  <TableCell className={`text-right font-semibold ${row.balance < 0 ? "text-destructive" : ""}`}>
                    {formatCurrency(row.balance)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );

  // Build tabs based on permissions
  const availableTabs = [
    { key: "customer", label: "Customer" },
    ...(permissions.canViewSupplierLedger ? [{ key: "supplier", label: "Supplier" }] : []),
    { key: "cash", label: "Cash" },
    ...(permissions.canViewExpenseLedger ? [{ key: "expense", label: "Expense" }] : []),
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Ledger</h1>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className={`grid w-full grid-cols-${availableTabs.length}`}>
          {availableTabs.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>{t.label}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="customer" className="space-y-6">
          {renderMonthlySummary(customerSummary.data)}
          <h3 className="text-lg font-semibold text-foreground">Recent Entries</h3>
          {renderEntries(customerEntries.data ?? [], "customers", "customer")}
        </TabsContent>

        {permissions.canViewSupplierLedger && (
          <TabsContent value="supplier" className="space-y-6">
            {renderMonthlySummary(supplierSummary.data)}
            <h3 className="text-lg font-semibold text-foreground">Recent Entries</h3>
            {renderEntries(supplierEntries.data ?? [], "suppliers", "supplier")}
          </TabsContent>
        )}

        <TabsContent value="cash" className="space-y-6">
          {renderMonthlySummary(cashSummary.data)}
          <h3 className="text-lg font-semibold text-foreground">Recent Entries</h3>
          {renderEntries(cashEntries.data ?? [], undefined, "cash")}
        </TabsContent>

        {permissions.canViewExpenseLedger && (
          <TabsContent value="expense" className="space-y-6">
            {renderMonthlySummary(expenseSummary.data)}
            <h3 className="text-lg font-semibold text-foreground">Recent Entries</h3>
            {renderEntries(expenseEntries.data ?? [], undefined, "expense")}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};

export default LedgerPageContent;
