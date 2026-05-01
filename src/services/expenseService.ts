import { vpsAuthedFetch } from "@/lib/vpsAuthClient";
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
    const body = await vpsRequest<{ rows: any[] }>(
      `/api/expenses?dealerId=${encodeURIComponent(dealerId)}`,
    );
    return body.rows ?? [];
  },

  async create(input: CreateExpenseInput) {
    await assertDealerId(input.dealer_id);
    validateInput(createExpenseServiceSchema, input);

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
  },
};
