import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X, HandCoins, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import {
  referralSourceService,
  calculateCommissionAmount,
  type CommissionType,
  type ReferralSource,
} from "@/services/commissionService";
import { formatCurrency } from "@/lib/utils";

export interface SaleCommissionDraft {
  referral_source_id: string;
  commission_type: CommissionType;
  commission_value: number;
  notes?: string;
}

interface Props {
  dealerId: string;
  /** Subtotal − discount (BDT). Used as commission base preview. */
  baseAmount: number;
  value: SaleCommissionDraft | null;
  onChange: (next: SaleCommissionDraft | null) => void;
  /** When true, render as read-only (price-locked sale, etc). */
  disabled?: boolean;
}

/**
 * Optional referral / commission section for the sale form.
 * Pure controlled component — owns no async state, only previews calculation.
 * Persisting happens in the page mutation after sale create/update.
 */
export function SaleCommissionSection({ dealerId, baseAmount, value, onChange, disabled }: Props) {
  const { data: sources = [] } = useQuery({
    queryKey: ["referral-sources", dealerId, "active"],
    queryFn: () => referralSourceService.list(dealerId, { activeOnly: true }),
    enabled: !!dealerId,
  });

  // When user picks a source that has defaults configured, prefill commission inputs.
  useEffect(() => {
    if (!value?.referral_source_id) return;
    const src = sources.find((s) => s.id === value.referral_source_id);
    if (!src) return;
    if (
      value.commission_value === 0 &&
      src.default_commission_type &&
      src.default_commission_value != null
    ) {
      onChange({
        ...value,
        commission_type: src.default_commission_type,
        commission_value: Number(src.default_commission_value),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.referral_source_id, sources]);

  const calc = useMemo(
    () =>
      value
        ? calculateCommissionAmount(value.commission_type, value.commission_value, baseAmount)
        : 0,
    [value, baseAmount],
  );

  const selectedSource: ReferralSource | undefined = sources.find(
    (s) => s.id === value?.referral_source_id,
  );

  if (!value) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-center justify-between py-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <HandCoins className="h-4 w-4" />
            <span>Optional: attach a referral / commission to this sale</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || sources.length === 0}
              onClick={() =>
                onChange({
                  referral_source_id: sources[0]?.id ?? "",
                  commission_type: "percent",
                  commission_value: 0,
                })
              }
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Referral
            </Button>
            {sources.length === 0 && (
              <Link to="/referrals" className="text-xs text-primary underline">
                Add source
              </Link>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/30">
      <CardContent className="space-y-3 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <HandCoins className="h-4 w-4 text-primary" />
            <span>Referral & Commission</span>
            {selectedSource && (
              <Badge variant="secondary" className="capitalize text-[10px]">
                {selectedSource.source_type}
              </Badge>
            )}
          </div>
          {!disabled && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="lg:col-span-2">
            <Label className="text-xs">Referrer</Label>
            <Select
              value={value.referral_source_id}
              onValueChange={(v) => onChange({ ...value, referral_source_id: v })}
              disabled={disabled}
            >
              <SelectTrigger><SelectValue placeholder="Select referrer" /></SelectTrigger>
              <SelectContent>
                {sources.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                    <span className="text-muted-foreground ml-2 text-xs capitalize">
                      ({s.source_type})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Type</Label>
            <Select
              value={value.commission_type}
              onValueChange={(v) =>
                onChange({ ...value, commission_type: v as CommissionType })
              }
              disabled={disabled}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="percent">% of Sale</SelectItem>
                <SelectItem value="fixed">Fixed Amount</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">
              {value.commission_type === "percent" ? "Percent (%)" : "Amount"}
            </Label>
            <Input
              type="number"
              min={0}
              step={value.commission_type === "percent" ? "0.1" : "1"}
              value={Number.isFinite(value.commission_value) ? value.commission_value : 0}
              onChange={(e) =>
                onChange({ ...value, commission_value: Number(e.target.value) })
              }
              disabled={disabled}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs">
          <span className="text-muted-foreground">
            Base: <span className="font-mono">{formatCurrency(baseAmount)}</span>
          </span>
          <span className="font-semibold">
            Commission preview:{" "}
            <span className="font-mono text-primary">{formatCurrency(calc)}</span>
          </span>
        </div>

        <p className="text-[11px] text-muted-foreground leading-snug">
          Commission is recorded as <strong>pending</strong> on save. It does not affect
          stock or customer ledger. Mark it settled later from the Commissions report.
        </p>
      </CardContent>
    </Card>
  );
}

export default SaleCommissionSection;
