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

// ─── Date Helpers ─────────────────────────────────────────────────────────────

/**
 * Parses a "YYYY-MM-DD" date string as a LOCAL midnight Date object.
 *
 * Using `new Date("YYYY-MM-DD")` interprets the string as UTC midnight,
 * which causes off-by-one day bugs for users in positive UTC offsets
 * (e.g. UTC+6 Bangladesh). This function avoids that by constructing
 * the date from its individual parts in local time.
 *
 * @param dateStr - ISO date string "YYYY-MM-DD"
 * @returns Date at local midnight, or null if input is falsy / invalid
 */
export function parseLocalDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  // PostgreSQL date fields from the VPS backend may arrive as full ISO strings
  // (e.g. "2026-04-30T00:00:00.000Z"). Keep only the calendar date so
  // subscription checks stay timezone-safe and don't fail parsing.
  const dateOnly = dateStr.slice(0, 10);
  const parts = dateOnly.split("-").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  const [year, month, day] = parts;
  return new Date(year, month - 1, day); // local midnight — no UTC offset
}
