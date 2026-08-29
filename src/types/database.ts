// Hand-written stand-in for `supabase gen types typescript --linked` (CLI can't
// link from this sandbox, no IPv6 egress). Views/Functions/Enums/CompositeTypes
// and each table's Relationships: [] exist only to satisfy postgrest-js's
// GenericSchema/GenericTable constraints — keep them on any future manual edit,
// don't strip them if this ever gets "cleaned up" by someone unfamiliar with why
// they're here (see mantia/README.md "Tipos TypeScript" section).
//
// Only tables the app's query layer actually calls `.from()` on are declared
// here (profiles, lugares, tipos_de_equipos, equipo, solicitudes,
// orden_de_trabajo, historial) — the rest of the schema (proveedores, compras,
// repuestos, planes de mantenimiento, catalogo de fallas, etc., see
// supabase/migrations/0003_reemplazo_gestion_mantenimiento.sql) has no UI yet
// and nothing here queries it.
export type Database = {
  public: {
    Views: Record<string, never>;
    Functions: {
      sync_equipo_estado: {
        Args: { p_eq_id: number };
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
      lugares: {
        Row: { lu_codigo: number; lu_nombre_sector: string; lu_piso: string | null };
        Insert: { lu_codigo?: number; lu_nombre_sector: string; lu_piso?: string | null };
        Update: { lu_codigo?: number; lu_nombre_sector?: string; lu_piso?: string | null };
        Relationships: [];
      };
      tipos_de_equipos: {
        Row: { te_id: number; te_nombre: string; te_cantidad: number | null };
        Insert: { te_id?: number; te_nombre: string; te_cantidad?: number | null };
        Update: { te_id?: number; te_nombre?: string; te_cantidad?: number | null };
        Relationships: [];
      };
      tareas_generales: {
        Row: {
          tag_id_tarea: number;
          tag_nombre_tarea: string;
          tag_descripcion_tarea: string | null;
        };
        Insert: {
          tag_id_tarea?: number;
          tag_nombre_tarea: string;
          tag_descripcion_tarea?: string | null;
        };
        Update: {
          tag_id_tarea?: number;
          tag_nombre_tarea?: string;
          tag_descripcion_tarea?: string | null;
        };
        Relationships: [];
      };
      fallo: {
        Row: {
          fa_id_fallo: number;
          fa_nombre: string;
          fa_desperfecto: string | null;
          fa_gravedad: string | null;
        };
        Insert: {
          fa_id_fallo?: number;
          fa_nombre: string;
          fa_desperfecto?: string | null;
          fa_gravedad?: string | null;
        };
        Update: {
          fa_id_fallo?: number;
          fa_nombre?: string;
          fa_desperfecto?: string | null;
          fa_gravedad?: string | null;
        };
        Relationships: [];
      };
      equipo: {
        Row: {
          eq_id_equipo: number;
          te_id: number;
          lu_codigo: number;
          eq_codigo: string;
          eq_nombre: string;
          eq_estado: "operational" | "waiting" | "repair";
          eq_modelo: string | null;
          eq_fecha_garantia: string | null;
          eq_fecha_instalacion: string | null;
        };
        Insert: {
          eq_id_equipo?: number;
          te_id: number;
          lu_codigo: number;
          eq_codigo: string;
          eq_nombre: string;
          eq_estado?: "operational" | "waiting" | "repair";
          eq_modelo?: string | null;
          eq_fecha_garantia?: string | null;
          eq_fecha_instalacion?: string | null;
        };
        Update: {
          eq_id_equipo?: number;
          te_id?: number;
          lu_codigo?: number;
          eq_codigo?: string;
          eq_nombre?: string;
          eq_estado?: "operational" | "waiting" | "repair";
          eq_modelo?: string | null;
          eq_fecha_garantia?: string | null;
          eq_fecha_instalacion?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "equipo_te_id_fkey";
            columns: ["te_id"];
            isOneToOne: false;
            referencedRelation: "tipos_de_equipos";
            referencedColumns: ["te_id"];
          },
          {
            foreignKeyName: "equipo_lu_codigo_fkey";
            columns: ["lu_codigo"];
            isOneToOne: false;
            referencedRelation: "lugares";
            referencedColumns: ["lu_codigo"];
          },
        ];
      };
      solicitudes: {
        Row: {
          sol_id_solicitud: number;
          eq_id_equipo: number;
          p_legajo_solicitante: string;
          p_legajo_admin: string | null;
          sol_descripcion: string;
          sol_urgencia: "low" | "medium" | "high";
          sol_foto_url: string | null;
          sol_estado: "pendiente" | "en_proceso" | "resuelta";
          sol_fecha_hora: string;
        };
        Insert: {
          sol_id_solicitud?: number;
          eq_id_equipo: number;
          p_legajo_solicitante: string;
          p_legajo_admin?: string | null;
          sol_descripcion: string;
          sol_urgencia?: "low" | "medium" | "high";
          sol_foto_url?: string | null;
          sol_estado?: "pendiente" | "en_proceso" | "resuelta";
          sol_fecha_hora?: string;
        };
        Update: {
          sol_id_solicitud?: number;
          eq_id_equipo?: number;
          p_legajo_solicitante?: string;
          p_legajo_admin?: string | null;
          sol_descripcion?: string;
          sol_urgencia?: "low" | "medium" | "high";
          sol_foto_url?: string | null;
          sol_estado?: "pendiente" | "en_proceso" | "resuelta";
          sol_fecha_hora?: string;
        };
        Relationships: [
          {
            foreignKeyName: "solicitudes_eq_id_equipo_fkey";
            columns: ["eq_id_equipo"];
            isOneToOne: false;
            referencedRelation: "equipo";
            referencedColumns: ["eq_id_equipo"];
          },
          {
            foreignKeyName: "solicitudes_p_legajo_solicitante_fkey";
            columns: ["p_legajo_solicitante"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      orden_de_trabajo: {
        Row: {
          ot_id_orden: number;
          sol_id_solicitud: number | null;
          plan_id_manequipo: number | null;
          eq_id_equipo: number;
          ot_p_id_responsable: string;
          ot_tipo_orden: string;
          ot_fecha_inicio: string;
          ot_fecha_fin: string | null;
          ot_observacion: string | null;
          ot_estado: "assigned" | "in_progress" | "resolved";
          ot_prioridad: "low" | "medium" | "high";
        };
        Insert: {
          ot_id_orden?: number;
          sol_id_solicitud?: number | null;
          plan_id_manequipo?: number | null;
          eq_id_equipo: number;
          ot_p_id_responsable: string;
          ot_tipo_orden?: string;
          ot_fecha_inicio?: string;
          ot_fecha_fin?: string | null;
          ot_observacion?: string | null;
          ot_estado?: "assigned" | "in_progress" | "resolved";
          ot_prioridad?: "low" | "medium" | "high";
        };
        Update: {
          ot_id_orden?: number;
          sol_id_solicitud?: number | null;
          plan_id_manequipo?: number | null;
          eq_id_equipo?: number;
          ot_p_id_responsable?: string;
          ot_tipo_orden?: string;
          ot_fecha_inicio?: string;
          ot_fecha_fin?: string | null;
          ot_observacion?: string | null;
          ot_estado?: "assigned" | "in_progress" | "resolved";
          ot_prioridad?: "low" | "medium" | "high";
        };
        Relationships: [
          {
            foreignKeyName: "orden_de_trabajo_sol_id_solicitud_fkey";
            columns: ["sol_id_solicitud"];
            isOneToOne: false;
            referencedRelation: "solicitudes";
            referencedColumns: ["sol_id_solicitud"];
          },
          {
            foreignKeyName: "orden_de_trabajo_eq_id_equipo_fkey";
            columns: ["eq_id_equipo"];
            isOneToOne: false;
            referencedRelation: "equipo";
            referencedColumns: ["eq_id_equipo"];
          },
          {
            foreignKeyName: "orden_de_trabajo_ot_p_id_responsable_fkey";
            columns: ["ot_p_id_responsable"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      historial: {
        Row: {
          hi_id: string;
          eq_id_equipo: number;
          hi_tipo: string;
          hi_nota: string;
          hi_autor_id: string;
          hi_fecha_hora: string;
        };
        Insert: {
          hi_id?: string;
          eq_id_equipo: number;
          hi_tipo: string;
          hi_nota: string;
          hi_autor_id: string;
          hi_fecha_hora?: string;
        };
        Update: {
          hi_id?: string;
          eq_id_equipo?: number;
          hi_tipo?: string;
          hi_nota?: string;
          hi_autor_id?: string;
          hi_fecha_hora?: string;
        };
        Relationships: [];
      };
    };
  };
};

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Lugar = Database["public"]["Tables"]["lugares"]["Row"];
export type TipoEquipo = Database["public"]["Tables"]["tipos_de_equipos"]["Row"];
export type TareaGeneral = Database["public"]["Tables"]["tareas_generales"]["Row"];
export type Fallo = Database["public"]["Tables"]["fallo"]["Row"];

// Equipo/Solicitud/HistorialEntry are the query layer's computed/joined
// view shapes (see src/lib/queries/equipment.ts and faults.ts), not raw
// table rows — kept close to the old Equipment/Fault/HistoryEntry shapes
// on purpose, to minimize churn in every screen/component that consumes
// them.
export type Equipo = {
  id: number;
  code: string;
  name: string;
  type: string;
  typeId: number;
  location: string;
  locationId: number;
  status: "operational" | "waiting" | "repair";
  model: string | null;
  installDate: string | null;
  warrantyDate: string | null;
};

export type Solicitud = {
  id: number;
  equipment_id: number;
  reported_by: string;
  description: string;
  urgency: "low" | "medium" | "high";
  status: "new" | "assigned" | "in_progress" | "resolved";
  technician_id: string | null;
  photo_url: string | null;
  created_at: string;
};

export type HistorialEntry = {
  id: string;
  equipment_id: number;
  type: string;
  note: string;
  author_id: string;
  created_at: string;
};
