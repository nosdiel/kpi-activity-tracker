// Placeholder DB types. Regenerate with:
//   npx supabase gen types typescript --project-id gcplpjgpwxwezouhnkly > src/integrations/supabase/database.types.ts
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: Record<string, { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> }>;
    Views: Record<string, { Row: Record<string, unknown> }>;
    Functions: Record<string, { Args: Record<string, unknown>; Returns: unknown }>;
    Enums: {
      app_role: "admin" | "regional_manager" | "store_manager" | "super_admin";
      sales_source: "square" | "manual" | "toast";
    };
    CompositeTypes: Record<string, Record<string, unknown>>;
  };
}
