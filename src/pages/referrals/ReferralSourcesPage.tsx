import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDealerId } from "@/hooks/useDealerId";
import { useAuth } from "@/contexts/AuthContext";
import {
  referralSourceService,
  type ReferralSource,
  type ReferralSourceType,
  type CommissionType,
} from "@/services/commissionService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Search, HandCoins } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";

const SOURCE_TYPES: { value: ReferralSourceType; label: string }[] = [
  { value: "salesman", label: "Salesman" },
  { value: "architect", label: "Architect" },
  { value: "contractor", label: "Contractor" },
  { value: "mason", label: "Mason" },
  { value: "fitter", label: "Fitter" },
  { value: "other", label: "Other" },
];

interface DraftSource {
  id?: string;
  source_type: ReferralSourceType;
  name: string;
  phone: string;
  notes: string;
  active: boolean;
  default_commission_type: CommissionType | "";
  default_commission_value: number | "";
}

const emptyDraft: DraftSource = {
  source_type: "other",
  name: "",
  phone: "",
  notes: "",
  active: true,
  default_commission_type: "",
  default_commission_value: "",
};

const ReferralSourcesPage = () => {
  const dealerId = useDealerId();
  const { isDealerAdmin } = useAuth();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DraftSource>(emptyDraft);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["referral-sources", dealerId, search, activeOnly],
    queryFn: () => referralSourceService.list(dealerId, { search, activeOnly }),
    enabled: !!dealerId,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        dealer_id: dealerId,
        source_type: draft.source_type,
        name: draft.name.trim(),
        phone: draft.phone.trim() || null,
        notes: draft.notes.trim() || null,
        active: draft.active,
        default_commission_type:
          (draft.default_commission_type as CommissionType) || null,
        default_commission_value:
          draft.default_commission_value === "" ? null : Number(draft.default_commission_value),
      };
      if (!payload.name) throw new Error("Name is required");
      if (draft.id) {
        await referralSourceService.update(draft.id, dealerId, payload);
      } else {
        await referralSourceService.create(payload);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["referral-sources"] });
      toast.success(draft.id ? "Referral source updated" : "Referral source added");
      setOpen(false);
      setDraft(emptyDraft);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async (row: ReferralSource) =>
      referralSourceService.toggleActive(row.id, dealerId, !row.active),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["referral-sources"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const openEdit = (row: ReferralSource) => {
    setDraft({
      id: row.id,
      source_type: row.source_type,
      name: row.name,
      phone: row.phone ?? "",
      notes: row.notes ?? "",
      active: row.active,
      default_commission_type: (row.default_commission_type as CommissionType) ?? "",
      default_commission_value:
        row.default_commission_value == null ? "" : Number(row.default_commission_value),
    });
    setOpen(true);
  };

  const openCreate = () => {
    setDraft(emptyDraft);
    setOpen(true);
  };

  return (
    <div className="container mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <HandCoins className="h-6 w-6 text-primary" />
            Referral Sources
          </h1>
          <p className="text-sm text-muted-foreground">
            Track architects, contractors, masons/fitters, salesmen and other referrers used in sales for commission calculation.
          </p>
        </div>
        {isDealerAdmin && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" /> Add Referrer
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Switch checked={activeOnly} onCheckedChange={setActiveOnly} id="active-only" />
              <Label htmlFor="active-only" className="cursor-pointer">Active only</Label>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Default Commission</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Loading…</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No referral sources yet.</TableCell></TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell><Badge variant="secondary" className="capitalize text-[10px]">{row.source_type}</Badge></TableCell>
                    <TableCell className="text-muted-foreground text-xs">{row.phone ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      {row.default_commission_type && row.default_commission_value != null ? (
                        row.default_commission_type === "percent"
                          ? `${row.default_commission_value}%`
                          : formatCurrency(Number(row.default_commission_value))
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.active ? (
                        <Badge variant="outline" className="text-emerald-600 border-emerald-300 text-[10px]">Active</Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground text-[10px]">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      {isDealerAdmin && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => toggleMutation.mutate(row)}>
                            {row.active ? "Deactivate" : "Activate"}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => openEdit(row)}>
                            <Pencil className="h-3 w-3 mr-1" /> Edit
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{draft.id ? "Edit Referrer" : "Add Referrer"}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Name *</Label>
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. Engr. Rahim"
              />
            </div>
            <div>
              <Label>Type</Label>
              <Select
                value={draft.source_type}
                onValueChange={(v) => setDraft({ ...draft, source_type: v as ReferralSourceType })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SOURCE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Phone</Label>
              <Input
                value={draft.phone}
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                placeholder="01XXXXXXXXX"
              />
            </div>
            <div>
              <Label>Default Commission Type</Label>
              <Select
                value={draft.default_commission_type || "none"}
                onValueChange={(v) =>
                  setDraft({ ...draft, default_commission_type: v === "none" ? "" : (v as CommissionType) })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No default</SelectItem>
                  <SelectItem value="percent">% of Sale</SelectItem>
                  <SelectItem value="fixed">Fixed Amount</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Default Value</Label>
              <Input
                type="number"
                min={0}
                value={draft.default_commission_value}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    default_commission_value: e.target.value === "" ? "" : Number(e.target.value),
                  })
                }
                placeholder={draft.default_commission_type === "percent" ? "e.g. 5" : "e.g. 500"}
                disabled={!draft.default_commission_type}
              />
            </div>
            <div className="col-span-2">
              <Label>Notes</Label>
              <Textarea
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                rows={2}
              />
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <Switch
                checked={draft.active}
                onCheckedChange={(v) => setDraft({ ...draft, active: v })}
                id="draft-active"
              />
              <Label htmlFor="draft-active">Active</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? "Saving…" : draft.id ? "Save Changes" : "Add Referrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ReferralSourcesPage;
