// Hand-written stand-in for `supabase gen types typescript --linked` (CLI can't
// link from this sandbox, no IPv6 egress). Views/Functions/Enums/CompositeTypes
// and each table's Relationships: [] exist only to satisfy postgrest-js's
// GenericSchema/GenericTable constraints — keep them on any future manual edit,
// don't strip them if this ever gets "cleaned up" by someone unfamiliar with why
// they're here (see mantia/README.md "Tipos TypeScript" section).
export type Database = {
  public: {
    Views: Record<string, never>;
    Functions: {
      sync_equipment_status: {
        Args: { p_equipment_id: string };
        Returns: void;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
    Tables: {
      profiles: {
        Row: {
          id: string;
          name: string;
          email: string;
          area: string | null;
          role: "admin" | "technician" | "user";
          active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          email: string;
          area?: string | null;
          role?: "admin" | "technician" | "user";
          active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          email?: string;
          area?: string | null;
          role?: "admin" | "technician" | "user";
          active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      equipment: {
        Row: {
          id: string;
          code: string;
          name: string;
          type: string;
          location: string;
          status: "operational" | "waiting" | "repair";
          last_maintenance: string | null;
          next_maintenance: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          type: string;
          location: string;
          status?: "operational" | "waiting" | "repair";
          last_maintenance?: string | null;
          next_maintenance?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          name?: string;
          type?: string;
          location?: string;
          status?: "operational" | "waiting" | "repair";
          last_maintenance?: string | null;
          next_maintenance?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      faults: {
        Row: {
          id: string;
          equipment_id: string;
          reported_by: string;
          description: string;
          urgency: "low" | "medium" | "high";
          status: "new" | "assigned" | "in_progress" | "resolved";
          technician_id: string | null;
          photo_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          equipment_id: string;
          reported_by: string;
          description: string;
          urgency?: "low" | "medium" | "high";
          status?: "new" | "assigned" | "in_progress" | "resolved";
          technician_id?: string | null;
          photo_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          equipment_id?: string;
          reported_by?: string;
          description?: string;
          urgency?: "low" | "medium" | "high";
          status?: "new" | "assigned" | "in_progress" | "resolved";
          technician_id?: string | null;
          photo_url?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      history: {
        Row: {
          id: string;
          equipment_id: string;
          type: string;
          note: string;
          author_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          equipment_id: string;
          type: string;
          note: string;
          author_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          equipment_id?: string;
          type?: string;
          note?: string;
          author_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      maintenance_plan: {
        Row: {
          id: string;
          equipment_id: string;
          task: string;
          frequency: string;
          date: string | null;
        };
        Insert: {
          id?: string;
          equipment_id: string;
          task: string;
          frequency: string;
          date?: string | null;
        };
        Update: {
          id?: string;
          equipment_id?: string;
          task?: string;
          frequency?: string;
          date?: string | null;
        };
        Relationships: [];
      };
    };
  };
};

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Equipment = Database["public"]["Tables"]["equipment"]["Row"];
export type Fault = Database["public"]["Tables"]["faults"]["Row"];
export type HistoryEntry = Database["public"]["Tables"]["history"]["Row"];
export type MaintenanceTask = Database["public"]["Tables"]["maintenance_plan"]["Row"];
