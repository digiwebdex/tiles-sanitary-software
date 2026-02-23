import { supabase } from "@/integrations/supabase/client";

export interface CampaignGift {
  id: string;
  dealer_id: string;
  customer_id: string;
  campaign_name: string;
  description: string | null;
  gift_value: number;
  payment_status: string;
  paid_amount: number;
  created_by: string | null;
  created_at: string;
  customers?: { name: string };
}

export const campaignGiftService = {
  async list(dealerId: string): Promise<CampaignGift[]> {
    const { data, error } = await supabase
      .from("campaign_gifts" as any)
      .select("*, customers(name)")
      .eq("dealer_id", dealerId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as CampaignGift[];
  },

  async create(gift: {
    dealer_id: string;
    customer_id: string;
    campaign_name: string;
    description?: string;
    gift_value: number;
    paid_amount?: number;
    payment_status?: string;
    created_by?: string;
  }) {
    const { data, error } = await supabase
      .from("campaign_gifts" as any)
      .insert(gift as any)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  async update(id: string, updates: { paid_amount?: number; payment_status?: string }) {
    const { error } = await supabase
      .from("campaign_gifts" as any)
      .update(updates as any)
      .eq("id", id);
    if (error) throw new Error(error.message);
  },

  async delete(id: string) {
    const { error } = await supabase
      .from("campaign_gifts" as any)
      .delete()
      .eq("id", id);
    if (error) throw new Error(error.message);
  },
};
