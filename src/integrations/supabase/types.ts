export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          created_at: string
          dealer_id: string | null
          id: string
          ip_address: string | null
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          dealer_id?: string | null
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          dealer_id?: string | null
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_ledger: {
        Row: {
          amount: number
          created_at: string
          dealer_id: string
          description: string | null
          entry_date: string
          id: string
          reference_id: string | null
          reference_type: string | null
          type: Database["public"]["Enums"]["ledger_entry_type"]
        }
        Insert: {
          amount: number
          created_at?: string
          dealer_id: string
          description?: string | null
          entry_date?: string
          id?: string
          reference_id?: string | null
          reference_type?: string | null
          type: Database["public"]["Enums"]["ledger_entry_type"]
        }
        Update: {
          amount?: number
          created_at?: string
          dealer_id?: string
          description?: string | null
          entry_date?: string
          id?: string
          reference_id?: string | null
          reference_type?: string | null
          type?: Database["public"]["Enums"]["ledger_entry_type"]
        }
        Relationships: [
          {
            foreignKeyName: "cash_ledger_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_ledger: {
        Row: {
          amount: number
          created_at: string
          customer_id: string
          dealer_id: string
          description: string | null
          entry_date: string
          id: string
          sale_id: string | null
          sales_return_id: string | null
          type: string
        }
        Insert: {
          amount: number
          created_at?: string
          customer_id: string
          dealer_id: string
          description?: string | null
          entry_date?: string
          id?: string
          sale_id?: string | null
          sales_return_id?: string | null
          type: string
        }
        Update: {
          amount?: number
          created_at?: string
          customer_id?: string
          dealer_id?: string
          description?: string | null
          entry_date?: string
          id?: string
          sale_id?: string | null
          sales_return_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_ledger_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_ledger_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_ledger_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_ledger_sales_return_id_fkey"
            columns: ["sales_return_id"]
            isOneToOne: false
            referencedRelation: "sales_returns"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          created_at: string
          dealer_id: string
          id: string
          name: string
          phone: string | null
          type: Database["public"]["Enums"]["customer_type"]
        }
        Insert: {
          address?: string | null
          created_at?: string
          dealer_id: string
          id?: string
          name: string
          phone?: string | null
          type?: Database["public"]["Enums"]["customer_type"]
        }
        Update: {
          address?: string | null
          created_at?: string
          dealer_id?: string
          id?: string
          name?: string
          phone?: string | null
          type?: Database["public"]["Enums"]["customer_type"]
        }
        Relationships: [
          {
            foreignKeyName: "customers_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
        ]
      }
      dealers: {
        Row: {
          address: string | null
          created_at: string
          id: string
          name: string
          phone: string | null
          status: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          name: string
          phone?: string | null
          status?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          name?: string
          phone?: string | null
          status?: string
        }
        Relationships: []
      }
      expense_ledger: {
        Row: {
          amount: number
          category: string | null
          created_at: string
          dealer_id: string
          description: string | null
          entry_date: string
          expense_id: string | null
          id: string
        }
        Insert: {
          amount: number
          category?: string | null
          created_at?: string
          dealer_id: string
          description?: string | null
          entry_date?: string
          expense_id?: string | null
          id?: string
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string
          dealer_id?: string
          description?: string | null
          entry_date?: string
          expense_id?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_ledger_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_ledger_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string | null
          created_at: string
          created_by: string | null
          dealer_id: string
          description: string
          expense_date: string
          id: string
        }
        Insert: {
          amount: number
          category?: string | null
          created_at?: string
          created_by?: string | null
          dealer_id: string
          description: string
          expense_date?: string
          id?: string
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string
          created_by?: string | null
          dealer_id?: string
          description?: string
          expense_date?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          id: string
          max_users: number
          name: string
          price_monthly: number
          price_yearly: number
        }
        Insert: {
          created_at?: string
          id?: string
          max_users?: number
          name: string
          price_monthly?: number
          price_yearly?: number
        }
        Update: {
          created_at?: string
          id?: string
          max_users?: number
          name?: string
          price_monthly?: number
          price_yearly?: number
        }
        Relationships: []
      }
      products: {
        Row: {
          active: boolean
          brand: string | null
          category: Database["public"]["Enums"]["product_category"]
          color: string | null
          created_at: string
          dealer_id: string
          default_sale_rate: number
          id: string
          name: string
          per_box_sft: number | null
          reorder_level: number
          size: string | null
          sku: string
          unit_type: Database["public"]["Enums"]["unit_type"]
        }
        Insert: {
          active?: boolean
          brand?: string | null
          category: Database["public"]["Enums"]["product_category"]
          color?: string | null
          created_at?: string
          dealer_id: string
          default_sale_rate?: number
          id?: string
          name: string
          per_box_sft?: number | null
          reorder_level?: number
          size?: string | null
          sku: string
          unit_type?: Database["public"]["Enums"]["unit_type"]
        }
        Update: {
          active?: boolean
          brand?: string | null
          category?: Database["public"]["Enums"]["product_category"]
          color?: string | null
          created_at?: string
          dealer_id?: string
          default_sale_rate?: number
          id?: string
          name?: string
          per_box_sft?: number | null
          reorder_level?: number
          size?: string | null
          sku?: string
          unit_type?: Database["public"]["Enums"]["unit_type"]
        }
        Relationships: [
          {
            foreignKeyName: "products_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          dealer_id: string | null
          email: string
          id: string
          name: string
          status: Database["public"]["Enums"]["user_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          dealer_id?: string | null
          email: string
          id: string
          name: string
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          dealer_id?: string | null
          email?: string
          id?: string
          name?: string
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_items: {
        Row: {
          dealer_id: string
          id: string
          labor_cost: number
          landed_cost: number
          offer_price: number
          other_cost: number
          product_id: string
          purchase_id: string
          purchase_rate: number
          quantity: number
          total: number
          total_sft: number | null
          transport_cost: number
        }
        Insert: {
          dealer_id: string
          id?: string
          labor_cost?: number
          landed_cost?: number
          offer_price?: number
          other_cost?: number
          product_id: string
          purchase_id: string
          purchase_rate: number
          quantity: number
          total?: number
          total_sft?: number | null
          transport_cost?: number
        }
        Update: {
          dealer_id?: string
          id?: string
          labor_cost?: number
          landed_cost?: number
          offer_price?: number
          other_cost?: number
          product_id?: string
          purchase_id?: string
          purchase_rate?: number
          quantity?: number
          total?: number
          total_sft?: number | null
          transport_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_items_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          created_at: string
          created_by: string | null
          dealer_id: string
          id: string
          invoice_number: string | null
          notes: string | null
          purchase_date: string
          supplier_id: string
          total_amount: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dealer_id: string
          id?: string
          invoice_number?: string | null
          notes?: string | null
          purchase_date?: string
          supplier_id: string
          total_amount?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dealer_id?: string
          id?: string
          invoice_number?: string | null
          notes?: string | null
          purchase_date?: string
          supplier_id?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchases_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          dealer_id: string
          id: string
          product_id: string
          quantity: number
          sale_id: string
          sale_rate: number
          total: number
          total_sft: number | null
        }
        Insert: {
          dealer_id: string
          id?: string
          product_id: string
          quantity: number
          sale_id: string
          sale_rate: number
          total?: number
          total_sft?: number | null
        }
        Update: {
          dealer_id?: string
          id?: string
          product_id?: string
          quantity?: number
          sale_id?: string
          sale_rate?: number
          total?: number
          total_sft?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          client_reference: string | null
          cogs: number
          created_at: string
          created_by: string | null
          customer_id: string
          dealer_id: string
          discount: number
          discount_reference: string | null
          due_amount: number
          fitter_reference: string | null
          id: string
          invoice_number: string | null
          notes: string | null
          paid_amount: number
          payment_mode: string | null
          profit: number
          sale_date: string
          total_amount: number
          total_box: number
          total_piece: number
          total_sft: number
        }
        Insert: {
          client_reference?: string | null
          cogs?: number
          created_at?: string
          created_by?: string | null
          customer_id: string
          dealer_id: string
          discount?: number
          discount_reference?: string | null
          due_amount?: number
          fitter_reference?: string | null
          id?: string
          invoice_number?: string | null
          notes?: string | null
          paid_amount?: number
          payment_mode?: string | null
          profit?: number
          sale_date?: string
          total_amount?: number
          total_box?: number
          total_piece?: number
          total_sft?: number
        }
        Update: {
          client_reference?: string | null
          cogs?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string
          dealer_id?: string
          discount?: number
          discount_reference?: string | null
          due_amount?: number
          fitter_reference?: string | null
          id?: string
          invoice_number?: string | null
          notes?: string | null
          paid_amount?: number
          payment_mode?: string | null
          profit?: number
          sale_date?: string
          total_amount?: number
          total_box?: number
          total_piece?: number
          total_sft?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_returns: {
        Row: {
          created_at: string
          created_by: string | null
          dealer_id: string
          id: string
          is_broken: boolean
          product_id: string
          qty: number
          reason: string | null
          refund_amount: number
          refund_mode: string | null
          return_date: string
          sale_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dealer_id: string
          id?: string
          is_broken?: boolean
          product_id: string
          qty: number
          reason?: string | null
          refund_amount?: number
          refund_mode?: string | null
          return_date?: string
          sale_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dealer_id?: string
          id?: string
          is_broken?: boolean
          product_id?: string
          qty?: number
          reason?: string | null
          refund_amount?: number
          refund_mode?: string | null
          return_date?: string
          sale_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_returns_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_returns_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_returns_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      stock: {
        Row: {
          average_cost_per_unit: number
          box_qty: number
          dealer_id: string
          id: string
          piece_qty: number
          product_id: string
          sft_qty: number
          updated_at: string
        }
        Insert: {
          average_cost_per_unit?: number
          box_qty?: number
          dealer_id: string
          id?: string
          piece_qty?: number
          product_id: string
          sft_qty?: number
          updated_at?: string
        }
        Update: {
          average_cost_per_unit?: number
          box_qty?: number
          dealer_id?: string
          id?: string
          piece_qty?: number
          product_id?: string
          sft_qty?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          dealer_id: string
          end_date: string | null
          id: string
          plan_id: string
          start_date: string
          status: Database["public"]["Enums"]["subscription_status"]
        }
        Insert: {
          created_at?: string
          dealer_id: string
          end_date?: string | null
          id?: string
          plan_id: string
          start_date?: string
          status?: Database["public"]["Enums"]["subscription_status"]
        }
        Update: {
          created_at?: string
          dealer_id?: string
          end_date?: string | null
          id?: string
          plan_id?: string
          start_date?: string
          status?: Database["public"]["Enums"]["subscription_status"]
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_ledger: {
        Row: {
          amount: number
          created_at: string
          dealer_id: string
          description: string | null
          entry_date: string
          id: string
          purchase_id: string | null
          supplier_id: string
          type: Database["public"]["Enums"]["ledger_entry_type"]
        }
        Insert: {
          amount: number
          created_at?: string
          dealer_id: string
          description?: string | null
          entry_date?: string
          id?: string
          purchase_id?: string | null
          supplier_id: string
          type: Database["public"]["Enums"]["ledger_entry_type"]
        }
        Update: {
          amount?: number
          created_at?: string
          dealer_id?: string
          description?: string | null
          entry_date?: string
          id?: string
          purchase_id?: string | null
          supplier_id?: string
          type?: Database["public"]["Enums"]["ledger_entry_type"]
        }
        Relationships: [
          {
            foreignKeyName: "supplier_ledger_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_ledger_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_ledger_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          created_at: string
          dealer_id: string
          gstin: string | null
          id: string
          name: string
          phone: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          dealer_id: string
          gstin?: string | null
          id?: string
          name: string
          phone?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          dealer_id?: string
          gstin?: string | null
          id?: string
          name?: string
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_dealer_id: { Args: { _user_id: string }; Returns: string }
      has_active_subscription: { Args: never; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "super_admin" | "dealer_admin" | "salesman"
      customer_type: "retailer" | "customer" | "project"
      ledger_entry_type:
        | "sale"
        | "purchase"
        | "payment"
        | "refund"
        | "expense"
        | "receipt"
        | "adjustment"
      ledger_type: "customer" | "supplier" | "cash" | "expense"
      product_category: "tiles" | "sanitary"
      subscription_status: "active" | "expired" | "suspended"
      unit_type: "box_sft" | "piece"
      user_status: "active" | "inactive" | "suspended"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["super_admin", "dealer_admin", "salesman"],
      customer_type: ["retailer", "customer", "project"],
      ledger_entry_type: [
        "sale",
        "purchase",
        "payment",
        "refund",
        "expense",
        "receipt",
        "adjustment",
      ],
      ledger_type: ["customer", "supplier", "cash", "expense"],
      product_category: ["tiles", "sanitary"],
      subscription_status: ["active", "expired", "suspended"],
      unit_type: ["box_sft", "piece"],
      user_status: ["active", "inactive", "suspended"],
    },
  },
} as const
