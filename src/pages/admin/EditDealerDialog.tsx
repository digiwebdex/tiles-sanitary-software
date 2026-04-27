/**
 * Edit Dealer dialog (Super Admin).
 *
 * Loads from the in-list dealer object so it opens instantly, then PATCHes
 * to /api/dealers/:id on save. Empty strings clear a field. Validation is
 * intentionally light here — the backend Zod schema is the source of truth.
 */
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { vpsAuthedFetch } from "@/lib/vpsAuthClient";

export interface EditableDealer {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  email?: string | null;
  owner_name?: string | null;
  business_type?: string | null;
  city?: string | null;
  district?: string | null;
  country?: string | null;
  postal_code?: string | null;
  tax_id?: string | null;
  trade_license_no?: string | null;
  website?: string | null;
  logo_url?: string | null;
  notes?: string | null;
  admin_email: string | null;
  admin_name: string | null;
}

interface Props {
  dealer: EditableDealer | null;
  onClose: () => void;
}

const blank = (v: string | null | undefined) => (v ?? "");

export default function EditDealerDialog({ dealer, onClose }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [form, setForm] = useState({
    name: "", phone: "", email: "", owner_name: "", business_type: "",
    address: "", city: "", district: "", country: "", postal_code: "",
    tax_id: "", trade_license_no: "", website: "", logo_url: "", notes: "",
    admin_name: "", admin_email: "",
  });

  useEffect(() => {
    if (!dealer) return;
    setForm({
      name: blank(dealer.name),
      phone: blank(dealer.phone),
      email: blank(dealer.email),
      owner_name: blank(dealer.owner_name),
      business_type: blank(dealer.business_type),
      address: blank(dealer.address),
      city: blank(dealer.city),
      district: blank(dealer.district),
      country: blank(dealer.country) || "Bangladesh",
      postal_code: blank(dealer.postal_code),
      tax_id: blank(dealer.tax_id),
      trade_license_no: blank(dealer.trade_license_no),
      website: blank(dealer.website),
      logo_url: blank(dealer.logo_url),
      notes: blank(dealer.notes),
      admin_name: blank(dealer.admin_name),
      admin_email: blank(dealer.admin_email),
    });
  }, [dealer]);

  const setField = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = useMutation({
    mutationFn: async () => {
      if (!dealer) throw new Error("No dealer");
      const res = await vpsAuthedFetch(`/api/dealers/${dealer.id}`, {
        method: "PATCH",
        body: JSON.stringify(form),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Update failed (${res.status})`);
      return body;
    },
    onSuccess: () => {
      toast({ title: "Dealer updated" });
      qc.invalidateQueries({ queryKey: ["vps-dealers"] });
      onClose();
    },
    onError: (e: Error) => {
      toast({ variant: "destructive", title: "Update failed", description: e.message });
    },
  });

  const open = !!dealer;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Dealer</DialogTitle>
          <DialogDescription>
            Update business information and the primary admin user. Leave a field
            blank to clear it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Business */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Business</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Business name *">
                <Input value={form.name} onChange={setField("name")} required />
              </Field>
              <Field label="Owner name">
                <Input value={form.owner_name} onChange={setField("owner_name")} />
              </Field>
              <Field label="Business type">
                <Input
                  value={form.business_type}
                  onChange={setField("business_type")}
                  placeholder="Tiles / Sanitary / Both"
                />
              </Field>
              <Field label="Website">
                <Input value={form.website} onChange={setField("website")} placeholder="https://..." />
              </Field>
              <Field label="Tax / VAT ID (BIN)">
                <Input value={form.tax_id} onChange={setField("tax_id")} />
              </Field>
              <Field label="Trade license no">
                <Input value={form.trade_license_no} onChange={setField("trade_license_no")} />
              </Field>
              <Field label="Logo URL" className="md:col-span-2">
                <Input value={form.logo_url} onChange={setField("logo_url")} placeholder="https://.../logo.png" />
              </Field>
            </div>
          </section>

          {/* Contact */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Contact</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Business phone">
                <Input value={form.phone} onChange={setField("phone")} />
              </Field>
              <Field label="Business email">
                <Input type="email" value={form.email} onChange={setField("email")} />
              </Field>
              <Field label="Street address" className="md:col-span-2">
                <Input value={form.address} onChange={setField("address")} />
              </Field>
              <Field label="City">
                <Input value={form.city} onChange={setField("city")} />
              </Field>
              <Field label="District">
                <Input value={form.district} onChange={setField("district")} />
              </Field>
              <Field label="Postal code">
                <Input value={form.postal_code} onChange={setField("postal_code")} />
              </Field>
              <Field label="Country">
                <Input value={form.country} onChange={setField("country")} />
              </Field>
            </div>
          </section>

          {/* Admin user */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Primary Admin User</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Admin name">
                <Input value={form.admin_name} onChange={setField("admin_name")} />
              </Field>
              <Field label="Admin email (login)">
                <Input type="email" value={form.admin_email} onChange={setField("admin_email")} />
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">
              Changing the admin email also changes the dealer's login email. Use Reset Password if they need new credentials.
            </p>
          </section>

          {/* Notes */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Internal notes</h3>
            <Textarea
              value={form.notes}
              onChange={setField("notes")}
              placeholder="Visible to Super Admins only…"
              rows={3}
            />
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !form.name.trim()}>
            {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1 ${className}`}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
