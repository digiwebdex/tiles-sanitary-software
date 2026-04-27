/**
 * Edit Dealer dialog (Super Admin).
 *
 * Loads from the in-list dealer object so it opens instantly, then PATCHes
 * to /api/dealers/:id on save. Empty strings clear a field. Validation is
 * intentionally light here — the backend Zod schema is the source of truth.
 *
 * Includes a "Set New Password" section with a strong-password generator,
 * a strength meter, show/hide toggle, copy-to-clipboard, and an option to
 * notify the dealer via Email + SMS. Leaving the password field empty
 * keeps the existing password unchanged.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Wand2, Eye, EyeOff, Copy, Check } from "lucide-react";
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

/** Cryptographically-strong password generator (default 14 chars, mixed classes). */
function generateStrongPassword(length = 14): string {
  // Avoid visually ambiguous chars (O/0, l/1/I) so the password is easy to read aloud.
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digit = "23456789";
  const sym = "!@#$%&*?-_";
  const all = upper + lower + digit + sym;

  const rand = (n: number) => {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] % n;
  };
  const pick = (s: string) => s[rand(s.length)];

  // Guarantee at least one of each class.
  const out = [pick(upper), pick(lower), pick(digit), pick(sym)];
  for (let i = out.length; i < length; i++) out.push(pick(all));

  // Fisher-Yates shuffle so guaranteed chars aren't always at the front.
  for (let i = out.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.join("");
}

interface Strength {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  color: string;
}

function scorePassword(pwd: string): Strength {
  if (!pwd) return { score: 0, label: "—", color: "bg-muted" };
  let score = 0;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 12) score++;
  if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score++;
  if (/\d/.test(pwd) && /[^A-Za-z0-9]/.test(pwd)) score++;
  // Penalise obvious patterns.
  if (/(.)\1{2,}/.test(pwd) || /(0123|1234|abcd|qwer|password)/i.test(pwd)) {
    score = Math.max(0, score - 1);
  }
  const map: Record<number, Strength> = {
    0: { score: 0, label: "Very weak", color: "bg-destructive" },
    1: { score: 1, label: "Weak", color: "bg-destructive" },
    2: { score: 2, label: "Fair", color: "bg-amber-500" },
    3: { score: 3, label: "Strong", color: "bg-emerald-500" },
    4: { score: 4, label: "Very strong", color: "bg-emerald-600" },
  };
  return map[score as 0 | 1 | 2 | 3 | 4];
}

export default function EditDealerDialog({ dealer, onClose }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [form, setForm] = useState({
    name: "", phone: "", email: "", owner_name: "", business_type: "",
    address: "", city: "", district: "", country: "", postal_code: "",
    tax_id: "", trade_license_no: "", website: "", logo_url: "", notes: "",
    admin_name: "", admin_email: "",
  });

  // Password section state — kept separate so we only PATCH it when the user
  // actually intends to change the password.
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [notifyPassword, setNotifyPassword] = useState(true);
  const [copied, setCopied] = useState(false);

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
    setNewPassword("");
    setShowPassword(false);
    setNotifyPassword(true);
    setCopied(false);
  }, [dealer]);

  const setField = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const strength = useMemo(() => scorePassword(newPassword), [newPassword]);
  const passwordTooShort = !!newPassword && newPassword.length < 8;

  const handleGenerate = () => {
    const pwd = generateStrongPassword(14);
    setNewPassword(pwd);
    setShowPassword(true);
    setCopied(false);
  };

  const handleCopy = async () => {
    if (!newPassword) return;
    try {
      await navigator.clipboard.writeText(newPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast({ variant: "destructive", title: "Copy failed", description: "Clipboard not available." });
    }
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!dealer) throw new Error("No dealer");
      if (newPassword && newPassword.length < 8) {
        throw new Error("Password must be at least 8 characters.");
      }
      const payload: Record<string, unknown> = { ...form };
      if (newPassword) {
        payload.new_password = newPassword;
        payload.notify_password = notifyPassword;
      }
      const res = await vpsAuthedFetch(`/api/dealers/${dealer.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Update failed (${res.status})`);
      return body as { password_updated?: boolean };
    },
    onSuccess: (body) => {
      toast({
        title: "Dealer updated",
        description: body?.password_updated
          ? notifyPassword
            ? "Password set and sent to the dealer."
            : "Password set. Share it with the dealer manually."
          : undefined,
      });
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
              Changing the admin email also changes the dealer's login email.
            </p>
          </section>

          {/* Set new password */}
          <section className="space-y-3 rounded-md border border-border/60 p-4 bg-muted/30">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Set New Password
              </h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleGenerate}
                className="gap-1.5"
              >
                <Wand2 className="h-3.5 w-3.5" />
                Suggest strong
              </Button>
            </div>

            <Field label="New password (leave blank to keep unchanged)">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => { setNewPassword(e.target.value); setCopied(false); }}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                    className="pr-9 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleCopy}
                  disabled={!newPassword}
                  aria-label="Copy password"
                  title="Copy password"
                >
                  {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </Field>

            {/* Strength meter */}
            {newPassword && (
              <div className="space-y-1.5">
                <div className="flex h-1.5 gap-1 overflow-hidden rounded-full bg-muted">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className={`flex-1 transition-colors ${i <= strength.score ? strength.color : "bg-muted"}`}
                    />
                  ))}
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    Strength: <span className="font-medium text-foreground">{strength.label}</span>
                  </span>
                  {passwordTooShort && (
                    <span className="text-destructive">Min 8 characters</span>
                  )}
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Tip: use 12+ characters mixing upper/lower case, digits and symbols.
              Setting a new password will sign the dealer out of all active sessions.
            </p>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={notifyPassword}
                onCheckedChange={(v) => setNotifyPassword(v === true)}
                disabled={!newPassword}
              />
              <span className={!newPassword ? "text-muted-foreground" : ""}>
                Send the new password to the dealer via Email + SMS
              </span>
            </label>
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
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending || !form.name.trim() || passwordTooShort}
          >
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
