import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─── Currency (BDT) ──────────────────────────────────────────────────────────

export const CURRENCY_SYMBOL = "৳";
export const CURRENCY_CODE = "BDT";

/**
 * Formats a numeric value as BDT currency.
 * e.g. formatCurrency(12345.6) → "৳ 12,345.60"
 */
export function formatCurrency(amount: number | string | null | undefined): string {
  const num = Number(amount ?? 0);
  if (isNaN(num)) return `${CURRENCY_SYMBOL} 0.00`;
  return `${CURRENCY_SYMBOL} ${num.toLocaleString("en-BD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Formats without the symbol — useful for compact number-only display.
 * e.g. formatAmount(12345.6) → "12,345.60"
 */
export function formatAmount(amount: number | string | null | undefined): string {
  const num = Number(amount ?? 0);
  if (isNaN(num)) return "0.00";
  return num.toLocaleString("en-BD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
