import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useDealerId } from "@/hooks/useDealerId";
import {
  getApprovalSettings,
  saveApprovalSettings,
  type ApprovalSettings,
} from "@/services/approvalService";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ShieldCheck, Save } from "lucide-react";
import { toast } from "sonner";

interface ToggleRowProps {
  id: keyof ApprovalSettings;
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}

function ToggleRow({ id, label, description, value, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="space-y-0.5 flex-1">
        <Label htmlFor={String(id)} className="text-sm font-medium">
          {label}
        </Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch id={String(id)} checked={value} onCheckedChange={onChange} />
    </div>
  );
}

export function ApprovalSettingsCard() {
  const dealerId = useDealerId();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<ApprovalSettings | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["approval-settings", dealerId],
    queryFn: () => getApprovalSettings(dealerId),
    enabled: !!dealerId,
  });

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  const save = useMutation({
    mutationFn: (s: ApprovalSettings) => saveApprovalSettings(s),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["approval-settings"] });
      toast.success("Approval settings saved");
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading || !draft) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground text-sm">Loading approval settings…</p>
        </CardContent>
      </Card>
    );
  }

  const update = <K extends keyof ApprovalSettings>(key: K, val: ApprovalSettings[K]) =>
    setDraft({ ...draft, [key]: val });

  const dirty =
    !!data &&
    JSON.stringify({ ...data, dealer_id: undefined }) !==
      JSON.stringify({ ...draft, dealer_id: undefined });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Approval Workflow
        </CardTitle>
        <CardDescription>
          Decide which risky actions need a manager's approval before they execute.
          Requesters cannot bypass these — every approval is fingerprinted and single-use.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        <ToggleRow
          id="require_backorder_approval"
          label="Require approval for backorder sales"
          description="Block sales above current stock until a dealer admin approves."
          value={draft.require_backorder_approval}
          onChange={(v) => update("require_backorder_approval", v)}
        />
        <ToggleRow
          id="require_mixed_shade_approval"
          label="Require approval for mixed-shade sales"
          description="Sales mixing multiple shade codes need approval (avoids customer complaints)."
          value={draft.require_mixed_shade_approval}
          onChange={(v) => update("require_mixed_shade_approval", v)}
        />
        <ToggleRow
          id="require_mixed_caliber_approval"
          label="Require approval for mixed-caliber sales"
          description="Sales mixing multiple calibers need approval."
          value={draft.require_mixed_caliber_approval}
          onChange={(v) => update("require_mixed_caliber_approval", v)}
        />

        <Separator className="my-3" />

        <ToggleRow
          id="require_credit_override_approval"
          label="Require approval for credit-limit overrides"
          description="Block sales that push the customer above their credit limit."
          value={draft.require_credit_override_approval}
          onChange={(v) => update("require_credit_override_approval", v)}
        />
        <ToggleRow
          id="require_overdue_override_approval"
          label="Require approval for overdue overrides"
          description="Block sales when the customer is past the allowed overdue days."
          value={draft.require_overdue_override_approval}
          onChange={(v) => update("require_overdue_override_approval", v)}
        />

        <div className="flex items-start justify-between gap-4 py-2">
          <div className="space-y-0.5 flex-1">
            <Label htmlFor="discount_threshold" className="text-sm font-medium">
              Discount approval threshold (%)
            </Label>
            <p className="text-xs text-muted-foreground">
              Discounts at or above this percentage need a dealer-admin approval.
            </p>
          </div>
          <Input
            id="discount_threshold"
            type="number"
            min={0}
            max={100}
            step={0.5}
            className="w-24"
            value={draft.discount_approval_threshold}
            onChange={(e) =>
              update(
                "discount_approval_threshold",
                Math.max(0, Math.min(100, Number(e.target.value) || 0))
              )
            }
          />
        </div>

        <Separator className="my-3" />

        <ToggleRow
          id="require_stock_adjustment_approval"
          label="Require approval for manual stock adjustments"
          description="Direct add/reduce stock changes will need approval before applying."
          value={draft.require_stock_adjustment_approval}
          onChange={(v) => update("require_stock_adjustment_approval", v)}
        />
        <ToggleRow
          id="require_sale_cancel_approval"
          label="Require approval for sale cancellations by salesman"
          description="Salesmen cannot cancel a sale without a manager's approval."
          value={draft.require_sale_cancel_approval}
          onChange={(v) => update("require_sale_cancel_approval", v)}
        />

        <Separator className="my-3" />

        <ToggleRow
          id="auto_approve_for_admins"
          label="Auto-approve when a dealer admin performs the action"
          description="Admin actions still create an audit trail but skip the manual review step."
          value={draft.auto_approve_for_admins}
          onChange={(v) => update("auto_approve_for_admins", v)}
        />

        <div className="flex items-start justify-between gap-4 py-2">
          <div className="space-y-0.5 flex-1">
            <Label htmlFor="expiry_hours" className="text-sm font-medium">
              Approval expiry (hours)
            </Label>
            <p className="text-xs text-muted-foreground">
              How long an approval stays valid before it auto-expires. Default 24h.
            </p>
          </div>
          <Input
            id="expiry_hours"
            type="number"
            min={1}
            max={720}
            step={1}
            className="w-24"
            value={draft.approval_expiry_hours}
            onChange={(e) =>
              update(
                "approval_expiry_hours",
                Math.max(1, Math.min(720, Number(e.target.value) || 24))
              )
            }
          />
        </div>

        <div className="pt-3 flex justify-end">
          <Button
            onClick={() => save.mutate(draft)}
            disabled={!dirty || save.isPending}
          >
            <Save className="h-4 w-4 mr-1" />
            {save.isPending ? "Saving…" : "Save approval settings"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
