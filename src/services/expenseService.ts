import { supabase } from "@/integrations/supabase/client";
import { env } from "@/lib/env";
import { vpsAuthedFetch } from "@/lib/vpsAuthClient";
import { expenseLedgerService } from "@/services/ledgerService";
import { cashLedgerService } from "@/services/ledgerService";
import { validateInput, createExpenseServiceSchema } from "@/lib/validators";
import { assertDealerId } from "@/lib/tenancy";

export interface CreateExpenseInput {
  dealer_id: string;
  description: string;
  amount: number;
  expense_date: string;
  category?: string;
  created_by?: string;
}

const USE_VPS = env.AUTH_BACKEND === "vps";

async function vpsRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await vpsAuthedFetch(path, init);
  const body = await res.json().catch(() => ({} as any));
  if (!res.ok) {
    const msg = (body as any)?.error || `Request failed (${res.status})`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return body as T;
}

export const expenseService = {
  async list(dealerId: string) {
    if (USE_VPS) {
      const body = await vpsRequest<{ rows: any[] }>(
        `/api/expenses?dealerId=${dealerId}`,
      );
      return body.rows ?? [];
    }
    const { data, error } = await supabase
      .from("expenses")
      .select("*")
      .eq("dealer_id", dealerId)
      .order("expense_date", { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  },

  async create(input: CreateExpenseInput) {
    await assertDealerId(input.dealer_id);
    validateInput(createExpenseServiceSchema, input);

    if (USE_VPS) {
      // Atomic on the server (header + expense_ledger + cash_ledger).
      const body = await vpsRequest<{ expense: any }>(`/api/expenses`, {
        method: "POST",
        body: JSON.stringify({
          dealer_id: input.dealer_id,
          description: input.description,
          amount: input.amount,
          expense_date: input.expense_date,
          category: input.category ?? null,
        }),
      });
      return body.expense;
    }

    // Legacy Supabase fallback (3-step non-atomic).
    const { data: expense, error } = await supabase
      .from("expenses")
      .insert({
        dealer_id: input.dealer_id,
        description: input.description,
        amount: input.amount,
        expense_date: input.expense_date,
        category: input.category || null,
        created_by: input.created_by || null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    await expenseLedgerService.addEntry({
      dealer_id: input.dealer_id,
      expense_id: expense!.id,
      amount: -input.amount,
      category: input.category,
      description: `Expense: ${input.description}`,
      entry_date: input.expense_date,
    });

    await cashLedgerService.addEntry({
      dealer_id: input.dealer_id,
      type: "expense",
      amount: -input.amount,
      description: `Expense: ${input.description}`,
      reference_type: "expenses",
      reference_id: expense!.id,
      entry_date: input.expense_date,
    });

    return expense;
  },
};
