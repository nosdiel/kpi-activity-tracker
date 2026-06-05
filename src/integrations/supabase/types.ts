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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      daily_sales: {
        Row: {
          actual_customer_count: number | null
          actual_sales: number | null
          business_date: string
          created_at: string
          dessert_count: number | null
          focus_item_qty: number | null
          id: string
          last_year_customer_count: number | null
          last_year_sales: number | null
          location_id: string
          source: string | null
          total_cents: number | null
          updated_at: string
        }
        Insert: {
          actual_customer_count?: number | null
          actual_sales?: number | null
          business_date: string
          created_at?: string
          dessert_count?: number | null
          focus_item_qty?: number | null
          id?: string
          last_year_customer_count?: number | null
          last_year_sales?: number | null
          location_id: string
          source?: string | null
          total_cents?: number | null
          updated_at?: string
        }
        Update: {
          actual_customer_count?: number | null
          actual_sales?: number | null
          business_date?: string
          created_at?: string
          dessert_count?: number | null
          focus_item_qty?: number | null
          id?: string
          last_year_customer_count?: number | null
          last_year_sales?: number | null
          location_id?: string
          source?: string | null
          total_cents?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_sales_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_year_settings: {
        Row: {
          created_at: string
          fiscal_year: number
          start_date: string
        }
        Insert: {
          created_at?: string
          fiscal_year: number
          start_date: string
        }
        Update: {
          created_at?: string
          fiscal_year?: number
          start_date?: string
        }
        Relationships: []
      }
      locations: {
        Row: {
          active: boolean
          address: string | null
          created_at: string
          food_cost_pct_of_sales: number | null
          id: string
          name: string
          paper_goods_pct_of_sales: number | null
          payroll_pct_of_sales: number | null
          pos_provider: string | null
          region: string | null
          square_access_token: string | null
          square_location_id: string | null
          timezone: string | null
          toast_analytics_client_id: string | null
          toast_analytics_client_secret: string | null
          toast_api_url: string | null
          toast_client_id: string | null
          toast_client_secret: string | null
          toast_credential_name: string | null
          toast_restaurant_guid: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          created_at?: string
          food_cost_pct_of_sales?: number | null
          id?: string
          name: string
          paper_goods_pct_of_sales?: number | null
          payroll_pct_of_sales?: number | null
          pos_provider?: string | null
          region?: string | null
          square_access_token?: string | null
          square_location_id?: string | null
          timezone?: string | null
          toast_analytics_client_id?: string | null
          toast_analytics_client_secret?: string | null
          toast_api_url?: string | null
          toast_client_id?: string | null
          toast_client_secret?: string | null
          toast_credential_name?: string | null
          toast_restaurant_guid?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          created_at?: string
          food_cost_pct_of_sales?: number | null
          id?: string
          name?: string
          paper_goods_pct_of_sales?: number | null
          payroll_pct_of_sales?: number | null
          pos_provider?: string | null
          region?: string | null
          square_access_token?: string | null
          square_location_id?: string | null
          timezone?: string | null
          toast_analytics_client_id?: string | null
          toast_analytics_client_secret?: string | null
          toast_api_url?: string | null
          toast_client_id?: string | null
          toast_client_secret?: string | null
          toast_credential_name?: string | null
          toast_restaurant_guid?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pos_sync_log: {
        Row: {
          business_date: string
          created_at: string
          id: string
          location_id: string | null
          message: string | null
          source: string
          status: string
          total_cents: number | null
        }
        Insert: {
          business_date: string
          created_at?: string
          id?: string
          location_id?: string | null
          message?: string | null
          source: string
          status: string
          total_cents?: number | null
        }
        Update: {
          business_date?: string
          created_at?: string
          id?: string
          location_id?: string | null
          message?: string | null
          source?: string
          status?: string
          total_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_sync_log_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      regions: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          role: Database["public"]["Enums"]["app_role"]
          section: string
        }
        Insert: {
          role: Database["public"]["Enums"]["app_role"]
          section: string
        }
        Update: {
          role?: Database["public"]["Enums"]["app_role"]
          section?: string
        }
        Relationships: []
      }
      toast_report_jobs: {
        Row: {
          attempt_count: number
          business_date: string
          created_at: string
          error: string | null
          fiscal_week: number | null
          fiscal_year: number | null
          id: string
          location_id: string
          next_attempt_at: string
          report_request_guid: string | null
          report_type: string
          rows: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          business_date: string
          created_at?: string
          error?: string | null
          fiscal_week?: number | null
          fiscal_year?: number | null
          id?: string
          location_id: string
          next_attempt_at?: string
          report_request_guid?: string | null
          report_type: string
          rows?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          business_date?: string
          created_at?: string
          error?: string | null
          fiscal_week?: number | null
          fiscal_year?: number | null
          id?: string
          location_id?: string
          next_attempt_at?: string
          report_request_guid?: string | null
          report_type?: string
          rows?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "toast_report_jobs_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      trackable_items: {
        Row: {
          active_from: string | null
          active_to: string | null
          created_at: string
          id: string
          location_id: string
          name: string
          pos_product: string | null
        }
        Insert: {
          active_from?: string | null
          active_to?: string | null
          created_at?: string
          id?: string
          location_id: string
          name: string
          pos_product?: string | null
        }
        Update: {
          active_from?: string | null
          active_to?: string | null
          created_at?: string
          id?: string
          location_id?: string
          name?: string
          pos_product?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trackable_items_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_locations: {
        Row: {
          created_at: string
          location_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          location_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          location_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_locations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vendor_contacts: {
        Row: {
          active: boolean
          category: string | null
          contact_person: string | null
          created_at: string
          email: string | null
          id: string
          location_id: string | null
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          location_id?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          location_id?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_contacts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_pnl: {
        Row: {
          beer_wine_cost: number | null
          catering: number | null
          created_at: string
          fiscal_week: number | null
          fiscal_year: number | null
          id: string
          location_id: string
          repairs: number | null
          updated_at: string
          vendor_amounts: Json | null
          wages: number | null
          week_start_date: string | null
        }
        Insert: {
          beer_wine_cost?: number | null
          catering?: number | null
          created_at?: string
          fiscal_week?: number | null
          fiscal_year?: number | null
          id?: string
          location_id: string
          repairs?: number | null
          updated_at?: string
          vendor_amounts?: Json | null
          wages?: number | null
          week_start_date?: string | null
        }
        Update: {
          beer_wine_cost?: number | null
          catering?: number | null
          created_at?: string
          fiscal_week?: number | null
          fiscal_year?: number | null
          id?: string
          location_id?: string
          repairs?: number | null
          updated_at?: string
          vendor_amounts?: Json | null
          wages?: number | null
          week_start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "weekly_pnl_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_targets: {
        Row: {
          created_at: string
          customer_target: number | null
          dessert_target: number | null
          fiscal_week: number | null
          fiscal_year: number | null
          id: string
          location_id: string
          sales_target: number | null
          target_pct_over_ly: number | null
          updated_at: string
          week_start_date: string | null
        }
        Insert: {
          created_at?: string
          customer_target?: number | null
          dessert_target?: number | null
          fiscal_week?: number | null
          fiscal_year?: number | null
          id?: string
          location_id: string
          sales_target?: number | null
          target_pct_over_ly?: number | null
          updated_at?: string
          week_start_date?: string | null
        }
        Update: {
          created_at?: string
          customer_target?: number | null
          dessert_target?: number | null
          fiscal_week?: number | null
          fiscal_year?: number | null
          id?: string
          location_id?: string
          sales_target?: number | null
          target_pct_over_ly?: number | null
          updated_at?: string
          week_start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "weekly_targets_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "super_admin" | "admin" | "regional_manager" | "store_manager"
      sales_source: "square" | "toast" | "manual"
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
      app_role: ["super_admin", "admin", "regional_manager", "store_manager"],
      sales_source: ["square", "toast", "manual"],
    },
  },
} as const
