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
      approval_requests: {
        Row: {
          action_hash: string
          approval_type: Database["public"]["Enums"]["approval_type"]
          consumed_at: string | null
          consumed_by: string | null
          consumed_source_id: string | null
          context_data: Json
          created_at: string
          dealer_id: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          expires_at: string | null
          id: string
          reason: string | null
          requested_by: string
          source_id: string | null
          source_type: string
          status: string
        }
        Insert: {
          action_hash: string
          approval_type: Database["public"]["Enums"]["approval_type"]
          consumed_at?: string | null
          consumed_by?: string | null
          consumed_source_id?: string | null
          context_data?: Json
          created_at?: string
          dealer_id: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          expires_at?: string | null
          id?: string
          reason?: string | null
          requested_by: string
          source_id?: string | null
          source_type: string
          status?: string
        }
        Update: {
          action_hash?: string
          approval_type?: Database["public"]["Enums"]["approval_type"]
          consumed_at?: string | null
          consumed_by?: string | null
          consumed_source_id?: string | null
          context_data?: Json
          created_at?: string
          dealer_id?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          expires_at?: string | null
          id?: string
          reason?: string | null
          requested_by?: string
          source_id?: string | null
          source_type?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_requests_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_settings: {
        Row: {
          approval_expiry_hours: number
          auto_approve_for_admins: boolean
          created_at: string
          dealer_id: string
          discount_approval_threshold: number
          require_backorder_approval: boolean
          require_credit_override_approval: boolean
          require_mixed_caliber_approval: boolean
          require_mixed_shade_approval: boolean
          require_overdue_override_approval: boolean
          require_sale_cancel_approval: boolean
          require_stock_adjustment_approval: boolean
          updated_at: string
        }
        Insert: {
          approval_expiry_hours?: number
          auto_approve_for_admins?: boolean
          created_at?: string
          dealer_id: string
          discount_approval_threshold?: number
          require_backorder_approval?: boolean
          require_credit_override_approval?: boolean
          require_mixed_caliber_approval?: boolean
          require_mixed_shade_approval?: boolean
          require_overdue_override_approval?: boolean
          require_sale_cancel_approval?: boolean
          require_stock_adjustment_approval?: boolean
          updated_at?: string
        }
        Update: {
          approval_expiry_hours?: number
          auto_approve_for_admins?: boolean
          created_at?: string
          dealer_id?: string
          discount_approval_threshold?: number
          require_backorder_approval?: boolean
          require_credit_override_approval?: boolean
          require_mixed_caliber_approval?: boolean
          require_mixed_shade_approval?: boolean
          require_overdue_override_approval?: boolean
          require_sale_cancel_approval?: boolean
          require_stock_adjustment_approval?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_settings_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: true
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
        ]
      }
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
      backorder_allocations: {
        Row: {
          allocated_qty: number
          created_at: string
          dealer_id: string
          id: string
          product_id: string
          purchase_item_id: string
          sale_item_id: string
        }
        Insert: {
          allocated_qty?: number
          created_at?: string
          dealer_id: string
          id?: string
          product_id: string
          purchase_item_id: string
          sale_item_id: string
        }
        Update: {
          allocated_qty?: number
          created_at?: string
          dealer_id?: string
          id?: string
          product_id?: string
          purchase_item_id?: string
          sale_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "backorder_allocations_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backorder_allocations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backorder_allocations_purchase_item_id_fkey"
            columns: ["purchase_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backorder_allocations_sale_item_id_fkey"
            columns: ["sale_item_id"]
            isOneToOne: false
            referencedRelation: "sale_items"
            referencedColumns: ["id"]
          },
        ]
      }
      backup_logs: {
        Row: {
          app_name: string
          backup_type: string
          completed_at: string | null
          created_at: string | null
          database_name: string
          error_message: string | null
          file_name: string | null
          file_size: number | null
          id: string
          started_at: string | null
          status: string
          storage_location: string | null
        }
        Insert: {
          app_name?: string
          backup_type: string
          completed_at?: string | null
          created_at?: string | null
          database_name: string
          error_message?: string | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          started_at?: string | null
          status?: string
          storage_location?: string | null
        }
        Update: {
          app_name?: string
          backup_type?: string
          completed_at?: string | null
          created_at?: string | null
          database_name?: string
          error_message?: string | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          started_at?: string | null
          status?: string
          storage_location?: string | null
        }
        Relationships: []
      }
      campaign_gifts: {
        Row: {
          campaign_name: string
          created_at: string
          created_by: string | null
          customer_id: string
          dealer_id: string
          description: string | null
          gift_value: number
          id: string
          paid_amount: number
          payment_status: string
        }
        Insert: {
          campaign_name: string
          created_at?: string
          created_by?: string | null
          customer_id: string
          dealer_id: string
          description?: string | null
          gift_value?: number
          id?: string
          paid_amount?: number
          payment_status?: string
        }
        Update: {
          campaign_name?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string
          dealer_id?: string
          description?: string | null
          gift_value?: number
          id?: string
          paid_amount?: number
          payment_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_gifts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_gifts_dealer_id_fkey"
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
      challans: {
        Row: {
          challan_date: string
          challan_no: string
          created_at: string
          created_by: string | null
          dealer_id: string
          delivery_status: string
          driver_name: string | null
          id: string
          notes: string | null
          project_id: string | null
          sale_id: string
          show_price: boolean
          site_id: string | null
          status: string
          transport_name: string | null
          vehicle_no: string | null
        }
        Insert: {
          challan_date?: string
          challan_no: string
          created_at?: string
          created_by?: string | null
          dealer_id: string
          delivery_status?: string
          driver_name?: string | null
          id?: string
          notes?: string | null
          project_id?: string | null
          sale_id: string
          show_price?: boolean
          site_id?: string | null
          status?: string
          transport_name?: string | null
          vehicle_no?: string | null
        }
        Update: {
          challan_date?: string
          challan_no?: string
          created_at?: string
          created_by?: string | null
          dealer_id?: string
          delivery_status?: string
          driver_name?: string | null
          id?: string
          notes?: string | null
          project_id?: string | null
          sale_id?: string
          show_price?: boolean
          site_id?: string | null
          status?: string
          transport_name?: string | null
          vehicle_no?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "challans_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challans_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challans_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challans_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "project_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_submissions: {
        Row: {
          business_name: string | null
          created_at: string
          email: string
          id: string
          message: string
          name: string
          phone: string | null
          status: string
        }
        Insert: {
          business_name?: string | null
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          phone?: string | null
          status?: string
        }
        Update: {
          business_name?: string | null
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          phone?: string | null
          status?: string
        }
        Relationships: []
      }
      credit_overrides: {
        Row: {
          created_at: string
          credit_limit_at_time: number
          customer_id: string
          dealer_id: string
          id: string
          new_due_at_time: number
          outstanding_at_time: number
          overridden_by: string | null
          override_reason: string
          sale_id: string | null
        }
        Insert: {
          created_at?: string
          credit_limit_at_time?: number
          customer_id: string
          dealer_id: string
          id?: string
          new_due_at_time?: number
          outstanding_at_time?: number
          overridden_by?: string | null
          override_reason: string
          sale_id?: string | null
        }
        Update: {
          created_at?: string
          credit_limit_at_time?: number
          customer_id?: string
          dealer_id?: string
          id?: string
          new_due_at_time?: number
          outstanding_at_time?: number
          overridden_by?: string | null
          override_reason?: string
          sale_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_overrides_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_overrides_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_overrides_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_followups: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string
          dealer_id: string
          followup_date: string
          id: string
          note: string
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id: string
          dealer_id: string
          followup_date?: string
          id?: string
          note: string
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string
          dealer_id?: string
          followup_date?: string
          id?: string
          note?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_followups_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_followups_dealer_id_fkey"
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
          credit_limit: number
          dealer_id: string
          email: string | null
          id: string
          max_overdue_days: number
          name: string
          opening_balance: number
          phone: string | null
          price_tier_id: string | null
          reference_name: string | null
          status: string
          type: Database["public"]["Enums"]["customer_type"]
        }
        Insert: {
          address?: string | null
          created_at?: string
          credit_limit?: number
          dealer_id: string
          email?: string | null
          id?: string
          max_overdue_days?: number
          name: string
          opening_balance?: number
          phone?: string | null
          price_tier_id?: string | null
          reference_name?: string | null
          status?: string
          type?: Database["public"]["Enums"]["customer_type"]
        }
        Update: {
          address?: string | null
          created_at?: string
          credit_limit?: number
          dealer_id?: string
          email?: string | null
          id?: string
          max_overdue_days?: number
          name?: string
          opening_balance?: number
          phone?: string | null
          price_tier_id?: string | null
          reference_name?: string | null
          status?: string
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
          {
            foreignKeyName: "customers_price_tier_id_fkey"
            columns: ["price_tier_id"]
            isOneToOne: false
            referencedRelation: "price_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      dealers: {
        Row: {
          address: string | null
          allow_backorder: boolean
          challan_template: string
          created_at: string
          default_wastage_pct: number
          enable_reservations: boolean
          id: string
          name: string
          phone: string | null
          status: string
        }
        Insert: {
          address?: string | null
          allow_backorder?: boolean
          challan_template?: string
          created_at?: string
          default_wastage_pct?: number
          enable_reservations?: boolean
          id?: string
          name: string
          phone?: string | null
          status?: string
        }
        Update: {
          address?: string | null
          allow_backorder?: boolean
          challan_template?: string
          created_at?: string
          default_wastage_pct?: number
          enable_reservations?: boolean
          id?: string
          name?: string
          phone?: string | null
          status?: string
        }
        Relationships: []
      }
      deliveries: {
        Row: {
          challan_id: string | null
          created_at: string | null
          created_by: string | null
          dealer_id: string
          delivery_address: string | null
          delivery_date: string
          delivery_no: string | null
          id: string
          notes: string | null
          project_id: string | null
          receiver_name: string | null
          receiver_phone: string | null
          sale_id: string | null
          site_id: string | null
          status: string | null
        }
        Insert: {
          challan_id?: string | null
          created_at?: string | null
          created_by?: string | null
          dealer_id: string
          delivery_address?: string | null
          delivery_date?: string
          delivery_no?: string | null
          id?: string
          notes?: string | null
          project_id?: string | null
          receiver_name?: string | null
          receiver_phone?: string | null
          sale_id?: string | null
          site_id?: string | null
          status?: string | null
        }
        Update: {
          challan_id?: string | null
          created_at?: string | null
          created_by?: string | null
          dealer_id?: string
          delivery_address?: string | null
          delivery_date?: string
          delivery_no?: string | null
          id?: string
          notes?: string | null
          project_id?: string | null
          receiver_name?: string | null
          receiver_phone?: string | null
          sale_id?: string | null
          site_id?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_challan_id_fkey"
            columns: ["challan_id"]
            isOneToOne: false
            referencedRelation: "challans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "project_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_item_batches: {
        Row: {
          batch_id: string
          created_at: string
          dealer_id: string
          delivered_qty: number
          delivery_item_id: string
          id: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          dealer_id: string
          delivered_qty?: number
          delivery_item_id: string
          id?: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          dealer_id?: string
          delivered_qty?: number
          delivery_item_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_item_batches_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "product_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_item_batches_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_item_batches_delivery_item_id_fkey"
            columns: ["delivery_item_id"]
            isOneToOne: false
            referencedRelation: "delivery_items"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_items: {
        Row: {
          created_at: string
          dealer_id: string
          delivery_id: string
          id: string
          product_id: string
          quantity: number
          sale_item_id: string
        }
        Insert: {
          created_at?: string
          dealer_id: string
          delivery_id: string
          id?: string
          product_id: string
          quantity?: number
          sale_item_id: string
        }
        Update: {
          created_at?: string
          dealer_id?: string
          delivery_id?: string
          id?: string
          product_id?: string
          quantity?: number
          sale_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_items_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_items_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_items_sale_item_id_fkey"
            columns: ["sale_item_id"]
            isOneToOne: false
            referencedRelation: "sale_items"
            referencedColumns: ["id"]
          },
        ]
      }
      demand_planning_settings: {
        Row: {
          created_at: string
          dead_stock_days: number
          dealer_id: string
          fast_moving_30d_qty: number
          incoming_window_days: number
          reorder_cover_days: number
          safety_stock_days: number
          slow_moving_30d_max: number
          stockout_cover_days: number
          target_cover_days: number
          updated_at: string
          velocity_window_days: number
        }
        Insert: {
          created_at?: string
          dead_stock_days?: number
          dealer_id: string
          fast_moving_30d_qty?: number
          incoming_window_days?: number
          reorder_cover_days?: number
          safety_stock_days?: number
          slow_moving_30d_max?: number
          stockout_cover_days?: number
          target_cover_days?: number
          updated_at?: string
          velocity_window_days?: number
        }
        Update: {
          created_at?: string
          dead_stock_days?: number
          dealer_id?: string
          fast_moving_30d_qty?: number
          incoming_window_days?: number
          reorder_cover_days?: number
          safety_stock_days?: number
          slow_moving_30d_max?: number
          stockout_cover_days?: number
          target_cover_days?: number
          updated_at?: string
          velocity_window_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "demand_planning_settings_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: true
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
        ]
      }
      display_movements: {
        Row: {
          created_at: string
          created_by: string | null
          dealer_id: string
          id: string
          movement_type: Database["public"]["Enums"]["display_movement_type"]
          notes: string | null
          product_id: string
          quantity: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dealer_id: string
          id?: string
          movement_type: Database["public"]["Enums"]["display_movement_type"]
          notes?: string | null
          product_id: string
          quantity: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dealer_id?: string
          id?: string
          movement_type?: Database["public"]["Enums"]["display_movement_type"]
          notes?: string | null
          product_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "display_movements_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "display_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      display_stock: {
        Row: {
          created_at: string
          dealer_id: string
          display_qty: number
          id: string
          notes: string | null
          product_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dealer_id: string
          display_qty?: number
          id?: string
          notes?: string | null
          product_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dealer_id?: string
          display_qty?: number
          id?: string
          notes?: string | null
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "display_stock_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "display_stock_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
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
      invoice_sequences: {
        Row: {
          dealer_id: string
          next_challan_no: number
          next_invoice_no: number
          next_quotation_no: number
        }
        Insert: {
          dealer_id: string
          next_challan_no?: number
          next_invoice_no?: number
          next_quotation_no?: number
        }
        Update: {
          dealer_id?: string
          next_challan_no?: number
          next_invoice_no?: number
          next_quotation_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_sequences_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: true
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
        ]
      }
      login_attempts: {
        Row: {
          attempted_at: string
          email: string
          id: string
          ip_address: string | null
          is_locked: boolean
          locked_until: string | null
        }
        Insert: {
          attempted_at?: string
          email: string
          id?: string
          ip_address?: string | null
          is_locked?: boolean
          locked_until?: string | null
        }
        Update: {
          attempted_at?: string
          email?: string
          id?: string
          ip_address?: string | null
          is_locked?: boolean
          locked_until?: string | null
        }
        Relationships: []
      }
      notification_settings: {
        Row: {
          created_at: string
          dealer_id: string
          enable_daily_summary_email: boolean
          enable_daily_summary_sms: boolean
          enable_sale_email: boolean
          enable_sale_sms: boolean
          owner_email: string | null
          owner_phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          dealer_id: string
          enable_daily_summary_email?: boolean
          enable_daily_summary_sms?: boolean
          enable_sale_email?: boolean
          enable_sale_sms?: boolean
          owner_email?: string | null
          owner_phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          dealer_id?: string
          enable_daily_summary_email?: boolean
          enable_daily_summary_sms?: boolean
          enable_sale_email?: boolean
          enable_sale_sms?: boolean
          owner_email?: string | null
          owner_phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_settings_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: true
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          channel: string
          created_at: string
          dealer_id: string
          error_message: string | null
          id: string
          payload: Json
          retry_count: number
          sent_at: string | null
          status: string
          type: string
        }
        Insert: {
          channel: string
          created_at?: string
          dealer_id: string
          error_message?: string | null
          id?: string
          payload?: Json
          retry_count?: number
          sent_at?: string | null
          status?: string
          type: string
        }
        Update: {
          channel?: string
          created_at?: string
          dealer_id?: string
          error_message?: string | null
          id?: string
          payload?: Json
          retry_count?: number
          sent_at?: string | null
          status?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_dealer_id_fkey"
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
      price_tier_items: {
        Row: {
          created_at: string
          dealer_id: string
          id: string
          product_id: string
          rate: number
          tier_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dealer_id: string
          id?: string
          product_id: string
          rate: number
          tier_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dealer_id?: string
          id?: string
          product_id?: string
          rate?: number
          tier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_tier_items_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_tier_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_tier_items_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "price_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      price_tiers: {
        Row: {
          created_at: string
          dealer_id: string
          description: string | null
          id: string
          is_default: boolean
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dealer_id: string
          description?: string | null
          id?: string
          is_default?: boolean
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dealer_id?: string
          description?: string | null
          id?: string
          is_default?: boolean
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_tiers_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
        ]
      }
      product_batches: {
        Row: {
          batch_no: string
          box_qty: number
          caliber: string | null
          created_at: string
          dealer_id: string
          id: string
          lot_no: string | null
          notes: string | null
          piece_qty: number
          product_id: string
          reserved_box_qty: number
          reserved_piece_qty: number
          sft_qty: number
          shade_code: string | null
          status: string
        }
        Insert: {
          batch_no: string
          box_qty?: number
          caliber?: string | null
          created_at?: string
          dealer_id: string
          id?: string
          lot_no?: string | null
          notes?: string | null
          piece_qty?: number
          product_id: string
          reserved_box_qty?: number
          reserved_piece_qty?: number
          sft_qty?: number
          shade_code?: string | null
          status?: string
        }
        Update: {
          batch_no?: string
          box_qty?: number
          caliber?: string | null
          created_at?: string
          dealer_id?: string
          id?: string
          lot_no?: string | null
          notes?: string | null
          piece_qty?: number
          product_id?: string
          reserved_box_qty?: number
          reserved_piece_qty?: number
          sft_qty?: number
          shade_code?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_batches_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          barcode: string | null
          brand: string | null
          category: Database["public"]["Enums"]["product_category"]
          color: string | null
          cost_price: number
          created_at: string
          dealer_id: string
          default_sale_rate: number
          id: string
          material: string | null
          name: string
          per_box_sft: number | null
          reorder_level: number
          size: string | null
          sku: string
          unit_type: Database["public"]["Enums"]["unit_type"]
          warranty: string | null
          weight: string | null
        }
        Insert: {
          active?: boolean
          barcode?: string | null
          brand?: string | null
          category: Database["public"]["Enums"]["product_category"]
          color?: string | null
          cost_price?: number
          created_at?: string
          dealer_id: string
          default_sale_rate?: number
          id?: string
          material?: string | null
          name: string
          per_box_sft?: number | null
          reorder_level?: number
          size?: string | null
          sku: string
          unit_type?: Database["public"]["Enums"]["unit_type"]
          warranty?: string | null
          weight?: string | null
        }
        Update: {
          active?: boolean
          barcode?: string | null
          brand?: string | null
          category?: Database["public"]["Enums"]["product_category"]
          color?: string | null
          cost_price?: number
          created_at?: string
          dealer_id?: string
          default_sale_rate?: number
          id?: string
          material?: string | null
          name?: string
          per_box_sft?: number | null
          reorder_level?: number
          size?: string | null
          sku?: string
          unit_type?: Database["public"]["Enums"]["unit_type"]
          warranty?: string | null
          weight?: string | null
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
      project_code_sequences: {
        Row: {
          dealer_id: string
          next_project_no: number
        }
        Insert: {
          dealer_id: string
          next_project_no?: number
        }
        Update: {
          dealer_id?: string
          next_project_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_code_sequences_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: true
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
        ]
      }
      project_sites: {
        Row: {
          address: string | null
          contact_person: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          dealer_id: string
          id: string
          notes: string | null
          project_id: string
          site_name: string
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          dealer_id: string
          id?: string
          notes?: string | null
          project_id: string
          site_name: string
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          dealer_id?: string
          id?: string
          notes?: string | null
          project_id?: string
          site_name?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_sites_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_sites_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_sites_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string
          dealer_id: string
          expected_end_date: string | null
          id: string
          notes: string | null
          project_code: string
          project_name: string
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id: string
          dealer_id: string
          expected_end_date?: string | null
          id?: string
          notes?: string | null
          project_code: string
          project_name: string
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string
          dealer_id?: string
          expected_end_date?: string | null
          id?: string
          notes?: string | null
          project_code?: string
          project_name?: string
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_items: {
        Row: {
          batch_id: string | null
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
          shortage_note: string | null
          total: number
          total_sft: number | null
          transport_cost: number
        }
        Insert: {
          batch_id?: string | null
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
          shortage_note?: string | null
          total?: number
          total_sft?: number | null
          transport_cost?: number
        }
        Update: {
          batch_id?: string | null
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
          shortage_note?: string | null
          total?: number
          total_sft?: number | null
          transport_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "product_batches"
            referencedColumns: ["id"]
          },
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
      purchase_return_items: {
        Row: {
          dealer_id: string
          id: string
          product_id: string
          purchase_return_id: string
          quantity: number | null
          reason: string | null
          total: number
          unit_price: number
        }
        Insert: {
          dealer_id: string
          id?: string
          product_id: string
          purchase_return_id: string
          quantity?: number | null
          reason?: string | null
          total: number
          unit_price: number
        }
        Update: {
          dealer_id?: string
          id?: string
          product_id?: string
          purchase_return_id?: string
          quantity?: number | null
          reason?: string | null
          total?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_return_items_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_return_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_return_items_purchase_return_id_fkey"
            columns: ["purchase_return_id"]
            isOneToOne: false
            referencedRelation: "purchase_returns"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_returns: {
        Row: {
          created_at: string | null
          created_by: string | null
          dealer_id: string
          id: string
          notes: string | null
          purchase_id: string | null
          return_date: string
          return_no: string
          status: string | null
          supplier_id: string
          total_amount: number | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          dealer_id: string
          id?: string
          notes?: string | null
          purchase_id?: string | null
          return_date?: string
          return_no: string
          status?: string | null
          supplier_id: string
          total_amount?: number | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          dealer_id?: string
          id?: string
          notes?: string | null
          purchase_id?: string | null
          return_date?: string
          return_no?: string
          status?: string | null
          supplier_id?: string
          total_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_returns_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_returns_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_returns_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_shortage_links: {
        Row: {
          created_at: string
          created_by: string | null
          dealer_id: string
          id: string
          link_type: string
          notes: string | null
          planned_qty: number
          purchase_id: string
          purchase_item_id: string | null
          sale_item_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dealer_id: string
          id?: string
          link_type?: string
          notes?: string | null
          planned_qty?: number
          purchase_id: string
          purchase_item_id?: string | null
          sale_item_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dealer_id?: string
          id?: string
          link_type?: string
          notes?: string | null
          planned_qty?: number
          purchase_id?: string
          purchase_item_id?: string | null
          sale_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_shortage_links_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
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
      quotation_items: {
        Row: {
          created_at: string
          dealer_id: string
          discount_value: number
          id: string
          line_total: number
          measurement_snapshot: Json | null
          notes: string | null
          original_resolved_rate: number | null
          per_box_sft: number | null
          preferred_batch_no: string | null
          preferred_caliber: string | null
          preferred_shade_code: string | null
          product_id: string | null
          product_name_snapshot: string
          product_sku_snapshot: string | null
          quantity: number
          quotation_id: string
          rate: number
          rate_source: string
          sort_order: number
          tier_id: string | null
          unit_type: string
        }
        Insert: {
          created_at?: string
          dealer_id: string
          discount_value?: number
          id?: string
          line_total?: number
          measurement_snapshot?: Json | null
          notes?: string | null
          original_resolved_rate?: number | null
          per_box_sft?: number | null
          preferred_batch_no?: string | null
          preferred_caliber?: string | null
          preferred_shade_code?: string | null
          product_id?: string | null
          product_name_snapshot: string
          product_sku_snapshot?: string | null
          quantity?: number
          quotation_id: string
          rate?: number
          rate_source?: string
          sort_order?: number
          tier_id?: string | null
          unit_type?: string
        }
        Update: {
          created_at?: string
          dealer_id?: string
          discount_value?: number
          id?: string
          line_total?: number
          measurement_snapshot?: Json | null
          notes?: string | null
          original_resolved_rate?: number | null
          per_box_sft?: number | null
          preferred_batch_no?: string | null
          preferred_caliber?: string | null
          preferred_shade_code?: string | null
          product_id?: string | null
          product_name_snapshot?: string
          product_sku_snapshot?: string | null
          quantity?: number
          quotation_id?: string
          rate?: number
          rate_source?: string
          sort_order?: number
          tier_id?: string | null
          unit_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotation_items_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_items_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_items_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "price_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      quotations: {
        Row: {
          converted_at: string | null
          converted_by: string | null
          converted_sale_id: string | null
          created_at: string
          created_by: string | null
          customer_address_text: string | null
          customer_id: string | null
          customer_name_text: string | null
          customer_phone_text: string | null
          dealer_id: string
          discount_type: string
          discount_value: number
          id: string
          notes: string | null
          parent_quotation_id: string | null
          project_id: string | null
          quotation_no: string
          quote_date: string
          revision_no: number
          site_id: string | null
          status: string
          subtotal: number
          terms_text: string | null
          total_amount: number
          updated_at: string
          valid_until: string
        }
        Insert: {
          converted_at?: string | null
          converted_by?: string | null
          converted_sale_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_address_text?: string | null
          customer_id?: string | null
          customer_name_text?: string | null
          customer_phone_text?: string | null
          dealer_id: string
          discount_type?: string
          discount_value?: number
          id?: string
          notes?: string | null
          parent_quotation_id?: string | null
          project_id?: string | null
          quotation_no: string
          quote_date?: string
          revision_no?: number
          site_id?: string | null
          status?: string
          subtotal?: number
          terms_text?: string | null
          total_amount?: number
          updated_at?: string
          valid_until?: string
        }
        Update: {
          converted_at?: string | null
          converted_by?: string | null
          converted_sale_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_address_text?: string | null
          customer_id?: string | null
          customer_name_text?: string | null
          customer_phone_text?: string | null
          dealer_id?: string
          discount_type?: string
          discount_value?: number
          id?: string
          notes?: string | null
          parent_quotation_id?: string | null
          project_id?: string | null
          quotation_no?: string
          quote_date?: string
          revision_no?: number
          site_id?: string | null
          status?: string
          subtotal?: number
          terms_text?: string | null
          total_amount?: number
          updated_at?: string
          valid_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_parent_quotation_id_fkey"
            columns: ["parent_quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "project_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_sources: {
        Row: {
          active: boolean
          created_at: string
          dealer_id: string
          default_commission_type:
            | Database["public"]["Enums"]["commission_type"]
            | null
          default_commission_value: number | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          source_type: Database["public"]["Enums"]["referral_source_type"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          dealer_id: string
          default_commission_type?:
            | Database["public"]["Enums"]["commission_type"]
            | null
          default_commission_value?: number | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          source_type?: Database["public"]["Enums"]["referral_source_type"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          dealer_id?: string
          default_commission_type?:
            | Database["public"]["Enums"]["commission_type"]
            | null
          default_commission_value?: number | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          source_type?: Database["public"]["Enums"]["referral_source_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_sources_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
        ]
      }
      restore_logs: {
        Row: {
          app_name: string
          backup_file_name: string
          backup_log_id: string | null
          backup_type: string
          completed_at: string | null
          created_at: string | null
          database_name: string
          error_message: string | null
          id: string
          initiated_by: string | null
          initiated_by_name: string | null
          logs: string | null
          pre_restore_backup_taken: boolean | null
          started_at: string | null
          status: string
        }
        Insert: {
          app_name?: string
          backup_file_name: string
          backup_log_id?: string | null
          backup_type: string
          completed_at?: string | null
          created_at?: string | null
          database_name: string
          error_message?: string | null
          id?: string
          initiated_by?: string | null
          initiated_by_name?: string | null
          logs?: string | null
          pre_restore_backup_taken?: boolean | null
          started_at?: string | null
          status?: string
        }
        Update: {
          app_name?: string
          backup_file_name?: string
          backup_log_id?: string | null
          backup_type?: string
          completed_at?: string | null
          created_at?: string | null
          database_name?: string
          error_message?: string | null
          id?: string
          initiated_by?: string | null
          initiated_by_name?: string | null
          logs?: string | null
          pre_restore_backup_taken?: boolean | null
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "restore_logs_backup_log_id_fkey"
            columns: ["backup_log_id"]
            isOneToOne: false
            referencedRelation: "backup_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_commissions: {
        Row: {
          calculated_commission_amount: number
          commission_base_amount: number
          commission_type: Database["public"]["Enums"]["commission_type"]
          commission_value: number
          created_at: string
          created_by: string | null
          dealer_id: string
          id: string
          notes: string | null
          payable_at: string | null
          referral_source_id: string
          sale_id: string
          settled_amount: number
          settled_at: string | null
          status: Database["public"]["Enums"]["commission_status"]
          updated_at: string
        }
        Insert: {
          calculated_commission_amount?: number
          commission_base_amount?: number
          commission_type?: Database["public"]["Enums"]["commission_type"]
          commission_value?: number
          created_at?: string
          created_by?: string | null
          dealer_id: string
          id?: string
          notes?: string | null
          payable_at?: string | null
          referral_source_id: string
          sale_id: string
          settled_amount?: number
          settled_at?: string | null
          status?: Database["public"]["Enums"]["commission_status"]
          updated_at?: string
        }
        Update: {
          calculated_commission_amount?: number
          commission_base_amount?: number
          commission_type?: Database["public"]["Enums"]["commission_type"]
          commission_value?: number
          created_at?: string
          created_by?: string | null
          dealer_id?: string
          id?: string
          notes?: string | null
          payable_at?: string | null
          referral_source_id?: string
          sale_id?: string
          settled_amount?: number
          settled_at?: string | null
          status?: Database["public"]["Enums"]["commission_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_commissions_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_commissions_referral_source_id_fkey"
            columns: ["referral_source_id"]
            isOneToOne: false
            referencedRelation: "referral_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_commissions_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: true
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_item_batches: {
        Row: {
          allocated_qty: number
          batch_id: string
          created_at: string
          dealer_id: string
          id: string
          sale_item_id: string
        }
        Insert: {
          allocated_qty?: number
          batch_id: string
          created_at?: string
          dealer_id: string
          id?: string
          sale_item_id: string
        }
        Update: {
          allocated_qty?: number
          batch_id?: string
          created_at?: string
          dealer_id?: string
          id?: string
          sale_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_item_batches_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "product_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_item_batches_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_item_batches_sale_item_id_fkey"
            columns: ["sale_item_id"]
            isOneToOne: false
            referencedRelation: "sale_items"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          allocated_qty: number
          available_qty_at_sale: number
          backorder_qty: number
          dealer_id: string
          fulfillment_status: string
          id: string
          original_resolved_rate: number | null
          product_id: string
          quantity: number
          rate_source: string
          sale_id: string
          sale_rate: number
          tier_id: string | null
          total: number
          total_sft: number | null
        }
        Insert: {
          allocated_qty?: number
          available_qty_at_sale?: number
          backorder_qty?: number
          dealer_id: string
          fulfillment_status?: string
          id?: string
          original_resolved_rate?: number | null
          product_id: string
          quantity: number
          rate_source?: string
          sale_id: string
          sale_rate: number
          tier_id?: string | null
          total?: number
          total_sft?: number | null
        }
        Update: {
          allocated_qty?: number
          available_qty_at_sale?: number
          backorder_qty?: number
          dealer_id?: string
          fulfillment_status?: string
          id?: string
          original_resolved_rate?: number | null
          product_id?: string
          quantity?: number
          rate_source?: string
          sale_id?: string
          sale_rate?: number
          tier_id?: string | null
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
          {
            foreignKeyName: "sale_items_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "price_tiers"
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
          gross_profit: number
          has_backorder: boolean
          id: string
          invoice_number: string | null
          net_profit: number
          notes: string | null
          paid_amount: number
          payment_mode: string | null
          profit: number
          project_id: string | null
          sale_date: string
          sale_status: string
          sale_type: string
          site_id: string | null
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
          gross_profit?: number
          has_backorder?: boolean
          id?: string
          invoice_number?: string | null
          net_profit?: number
          notes?: string | null
          paid_amount?: number
          payment_mode?: string | null
          profit?: number
          project_id?: string | null
          sale_date?: string
          sale_status?: string
          sale_type?: string
          site_id?: string | null
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
          gross_profit?: number
          has_backorder?: boolean
          id?: string
          invoice_number?: string | null
          net_profit?: number
          notes?: string | null
          paid_amount?: number
          payment_mode?: string | null
          profit?: number
          project_id?: string | null
          sale_date?: string
          sale_status?: string
          sale_type?: string
          site_id?: string | null
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
          {
            foreignKeyName: "sales_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "project_sites"
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
      sample_issues: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string | null
          damaged_qty: number
          dealer_id: string
          expected_return_date: string | null
          id: string
          issue_date: string
          lost_qty: number
          notes: string | null
          product_id: string
          quantity: number
          recipient_name: string
          recipient_phone: string | null
          recipient_type: Database["public"]["Enums"]["sample_recipient_type"]
          returned_date: string | null
          returned_qty: number
          status: Database["public"]["Enums"]["sample_issue_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          damaged_qty?: number
          dealer_id: string
          expected_return_date?: string | null
          id?: string
          issue_date?: string
          lost_qty?: number
          notes?: string | null
          product_id: string
          quantity: number
          recipient_name: string
          recipient_phone?: string | null
          recipient_type?: Database["public"]["Enums"]["sample_recipient_type"]
          returned_date?: string | null
          returned_qty?: number
          status?: Database["public"]["Enums"]["sample_issue_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          damaged_qty?: number
          dealer_id?: string
          expected_return_date?: string | null
          id?: string
          issue_date?: string
          lost_qty?: number
          notes?: string | null
          product_id?: string
          quantity?: number
          recipient_name?: string
          recipient_phone?: string | null
          recipient_type?: Database["public"]["Enums"]["sample_recipient_type"]
          returned_date?: string | null
          returned_qty?: number
          status?: Database["public"]["Enums"]["sample_issue_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sample_issues_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sample_issues_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sample_issues_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
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
          reserved_box_qty: number
          reserved_piece_qty: number
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
          reserved_box_qty?: number
          reserved_piece_qty?: number
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
          reserved_box_qty?: number
          reserved_piece_qty?: number
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
      stock_reservations: {
        Row: {
          batch_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          dealer_id: string
          expires_at: string | null
          fulfilled_qty: number
          id: string
          product_id: string
          reason: string | null
          release_reason: string | null
          released_qty: number
          reserved_qty: number
          source_id: string | null
          source_type: string
          status: string
          updated_at: string
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          dealer_id: string
          expires_at?: string | null
          fulfilled_qty?: number
          id?: string
          product_id: string
          reason?: string | null
          release_reason?: string | null
          released_qty?: number
          reserved_qty?: number
          source_id?: string | null
          source_type?: string
          status?: string
          updated_at?: string
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          dealer_id?: string
          expires_at?: string | null
          fulfilled_qty?: number
          id?: string
          product_id?: string
          reason?: string | null
          release_reason?: string | null
          released_qty?: number
          reserved_qty?: number
          source_id?: string | null
          source_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_reservations_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "product_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_reservations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_reservations_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_reservations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_payments: {
        Row: {
          amount: number
          collected_by: string | null
          created_at: string
          dealer_id: string
          id: string
          note: string | null
          payment_date: string
          payment_method: Database["public"]["Enums"]["payment_method_type"]
          payment_status: Database["public"]["Enums"]["payment_status_type"]
          subscription_id: string
        }
        Insert: {
          amount?: number
          collected_by?: string | null
          created_at?: string
          dealer_id: string
          id?: string
          note?: string | null
          payment_date?: string
          payment_method: Database["public"]["Enums"]["payment_method_type"]
          payment_status?: Database["public"]["Enums"]["payment_status_type"]
          subscription_id: string
        }
        Update: {
          amount?: number
          collected_by?: string | null
          created_at?: string
          dealer_id?: string
          id?: string
          note?: string | null
          payment_date?: string
          payment_method?: Database["public"]["Enums"]["payment_method_type"]
          payment_status?: Database["public"]["Enums"]["payment_status_type"]
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_payments_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          created_at: string
          daily_summary_enabled: boolean
          email_enabled: boolean
          id: string
          is_active: boolean
          max_users: number
          monthly_price: number
          name: string
          sms_enabled: boolean
          updated_at: string
          yearly_price: number
        }
        Insert: {
          created_at?: string
          daily_summary_enabled?: boolean
          email_enabled?: boolean
          id?: string
          is_active?: boolean
          max_users?: number
          monthly_price?: number
          name: string
          sms_enabled?: boolean
          updated_at?: string
          yearly_price?: number
        }
        Update: {
          created_at?: string
          daily_summary_enabled?: boolean
          email_enabled?: boolean
          id?: string
          is_active?: boolean
          max_users?: number
          monthly_price?: number
          name?: string
          sms_enabled?: boolean
          updated_at?: string
          yearly_price?: number
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          billing_cycle: string
          created_at: string
          dealer_id: string
          end_date: string | null
          id: string
          plan_id: string
          start_date: string
          status: Database["public"]["Enums"]["subscription_status"]
          yearly_discount_applied: boolean
        }
        Insert: {
          billing_cycle?: string
          created_at?: string
          dealer_id: string
          end_date?: string | null
          id?: string
          plan_id: string
          start_date?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          yearly_discount_applied?: boolean
        }
        Update: {
          billing_cycle?: string
          created_at?: string
          dealer_id?: string
          end_date?: string | null
          id?: string
          plan_id?: string
          start_date?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          yearly_discount_applied?: boolean
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
            referencedRelation: "subscription_plans"
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
      supplier_notes: {
        Row: {
          created_at: string
          created_by: string | null
          dealer_id: string
          id: string
          note: string
          supplier_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dealer_id: string
          id?: string
          note: string
          supplier_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dealer_id?: string
          id?: string
          note?: string
          supplier_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_notes_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_notes_supplier_id_fkey"
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
          contact_person: string | null
          created_at: string
          dealer_id: string
          email: string | null
          gstin: string | null
          id: string
          name: string
          opening_balance: number
          phone: string | null
          status: string
        }
        Insert: {
          address?: string | null
          contact_person?: string | null
          created_at?: string
          dealer_id: string
          email?: string | null
          gstin?: string | null
          id?: string
          name: string
          opening_balance?: number
          phone?: string | null
          status?: string
        }
        Update: {
          address?: string | null
          contact_person?: string | null
          created_at?: string
          dealer_id?: string
          email?: string | null
          gstin?: string | null
          id?: string
          name?: string
          opening_balance?: number
          phone?: string | null
          status?: string
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
      website_content: {
        Row: {
          button_link: string | null
          button_text: string | null
          description: string | null
          extra_json: Json | null
          id: string
          section_key: string
          subtitle: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          button_link?: string | null
          button_text?: string | null
          description?: string | null
          extra_json?: Json | null
          id?: string
          section_key: string
          subtitle?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          button_link?: string | null
          button_text?: string | null
          description?: string | null
          extra_json?: Json | null
          id?: string
          section_key?: string
          subtitle?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      allocate_sale_batches: {
        Args: {
          _allocations: Json
          _dealer_id: string
          _per_box_sft: number
          _product_id: string
          _sale_item_id: string
          _unit_type: string
        }
        Returns: undefined
      }
      cancel_approval_request: {
        Args: { _cancel_reason?: string; _request_id: string }
        Returns: string
      }
      check_account_locked: { Args: { _email: string }; Returns: Json }
      consume_approval_request: {
        Args: { _action_hash: string; _request_id: string; _source_id?: string }
        Returns: string
      }
      consume_reservation_for_sale: {
        Args: {
          _consume_qty: number
          _dealer_id: string
          _reservation_id: string
          _sale_item_id: string
        }
        Returns: undefined
      }
      create_stock_reservation: {
        Args: {
          _batch_id: string
          _created_by?: string
          _customer_id: string
          _dealer_id: string
          _expires_at?: string
          _product_id: string
          _qty: number
          _reason?: string
          _unit_type: string
        }
        Returns: string
      }
      decide_approval_request: {
        Args: {
          _decision: string
          _decision_note?: string
          _request_id: string
        }
        Returns: string
      }
      deduct_stock_unbatched: {
        Args: {
          _dealer_id: string
          _per_box_sft: number
          _product_id: string
          _quantity: number
          _unit_type: string
        }
        Returns: undefined
      }
      execute_delivery_batches: {
        Args: { _dealer_id: string; _delivery_id: string }
        Returns: undefined
      }
      expire_stale_approvals: { Args: { _dealer_id: string }; Returns: number }
      expire_stale_quotations: { Args: { _dealer_id: string }; Returns: number }
      expire_stale_reservations: {
        Args: { _dealer_id: string }
        Returns: number
      }
      generate_next_challan_no: {
        Args: { _dealer_id: string }
        Returns: string
      }
      generate_next_invoice_no: {
        Args: { _dealer_id: string }
        Returns: string
      }
      generate_next_quotation_no: {
        Args: { _dealer_id: string }
        Returns: string
      }
      get_next_project_code: { Args: { p_dealer_id: string }; Returns: string }
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
      link_quotation_to_sale: {
        Args: { _dealer_id: string; _quotation_id: string; _sale_id: string }
        Returns: undefined
      }
      record_failed_login: {
        Args: { _email: string; _ip?: string }
        Returns: Json
      }
      record_successful_login: { Args: { _email: string }; Returns: undefined }
      release_stock_reservation: {
        Args: {
          _dealer_id: string
          _release_reason: string
          _reservation_id: string
        }
        Returns: undefined
      }
      restore_sale_batches: {
        Args: {
          _dealer_id: string
          _per_box_sft: number
          _product_id: string
          _sale_item_id: string
          _unit_type: string
        }
        Returns: undefined
      }
      revise_quotation: {
        Args: { _dealer_id: string; _quotation_id: string }
        Returns: string
      }
    }
    Enums: {
      app_role: "super_admin" | "dealer_admin" | "salesman"
      approval_type:
        | "backorder_sale"
        | "mixed_shade"
        | "mixed_caliber"
        | "credit_override"
        | "overdue_override"
        | "discount_override"
        | "stock_adjustment"
        | "sale_cancel"
        | "reservation_release"
      commission_status:
        | "pending"
        | "earned"
        | "settled"
        | "cancelled"
        | "adjusted"
      commission_type: "percent" | "fixed"
      customer_type: "retailer" | "customer" | "project"
      display_movement_type:
        | "to_display"
        | "from_display"
        | "display_damaged"
        | "display_replaced"
      ledger_entry_type:
        | "sale"
        | "purchase"
        | "payment"
        | "refund"
        | "expense"
        | "receipt"
        | "adjustment"
      ledger_type: "customer" | "supplier" | "cash" | "expense"
      payment_method_type: "cash" | "bank" | "mobile_banking"
      payment_status_type: "paid" | "partial" | "pending"
      product_category: "tiles" | "sanitary"
      referral_source_type:
        | "salesman"
        | "architect"
        | "contractor"
        | "mason"
        | "fitter"
        | "other"
      sample_issue_status:
        | "issued"
        | "returned"
        | "partially_returned"
        | "damaged"
        | "lost"
      sample_recipient_type:
        | "customer"
        | "architect"
        | "contractor"
        | "mason"
        | "other"
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
      approval_type: [
        "backorder_sale",
        "mixed_shade",
        "mixed_caliber",
        "credit_override",
        "overdue_override",
        "discount_override",
        "stock_adjustment",
        "sale_cancel",
        "reservation_release",
      ],
      commission_status: [
        "pending",
        "earned",
        "settled",
        "cancelled",
        "adjusted",
      ],
      commission_type: ["percent", "fixed"],
      customer_type: ["retailer", "customer", "project"],
      display_movement_type: [
        "to_display",
        "from_display",
        "display_damaged",
        "display_replaced",
      ],
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
      payment_method_type: ["cash", "bank", "mobile_banking"],
      payment_status_type: ["paid", "partial", "pending"],
      product_category: ["tiles", "sanitary"],
      referral_source_type: [
        "salesman",
        "architect",
        "contractor",
        "mason",
        "fitter",
        "other",
      ],
      sample_issue_status: [
        "issued",
        "returned",
        "partially_returned",
        "damaged",
        "lost",
      ],
      sample_recipient_type: [
        "customer",
        "architect",
        "contractor",
        "mason",
        "other",
      ],
      subscription_status: ["active", "expired", "suspended"],
      unit_type: ["box_sft", "piece"],
      user_status: ["active", "inactive", "suspended"],
    },
  },
} as const
