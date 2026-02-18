import { supabase } from "@/integrations/supabase/client";
import { expenseLedgerService } from "@/services/ledgerService";
import { cashLedgerService } from "@/services/ledgerService";
import { validateInput, createExpenseServiceSchema } from "@/lib/validators";

export interface CreateExpenseInput {
  dealer_id: string;
  description: string;
  amount: number;
  expense_date: string;
  category?: string;
  created_by?: string;
}

export const expenseService = {
  async list(dealerId: string) {
    const { data, error } = await supabase
      .from("expenses")
      .select("*")
      .eq("dealer_id", dealerId)
      .order("expense_date", { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  },

  async create(input: CreateExpenseInput) {
    // Service-level validation
    validateInput(createExpenseServiceSchema, input);

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
