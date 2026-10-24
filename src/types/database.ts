// Hand-written stand-in for `supabase gen types typescript --linked` (CLI can't
// link from this sandbox, no IPv6 egress). Views/Functions/Enums/CompositeTypes
// and each table's Relationships: [] exist only to satisfy postgrest-js's
// GenericSchema/GenericTable constraints — keep them on any future manual edit,
// don't strip them if this ever gets "cleaned up" by someone unfamiliar with why
// they're here (see mantia/README.md "Tipos TypeScript" section).
//
// Only tables the app's query layer actually calls `.from()` on are declared
// here (profiles, lugares, tipos_de_equipos, equipo, solicitudes,
// orden_de_trabajo, historial, plus the Sprint 3 consumibles tables:
// repuestos, tipos_proveedores, proveedores, compras, linea_compra,
// pedido_compra, linea_pedido, remito_compra, remito_compra_linea) — the
// rest of the schema (planes de mantenimiento, catalogo de fallas, etc., see
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
      email_for_legajo: {
        Args: { p_legajo: string };
        Returns: string;
      };
      registrar_compra: {
        Args: {
          p_prov_id_proveedor: number;
          p_co_nombre: string | null;
          p_co_fecha_compra: string | null;
          p_lineas: {
            rep_id: number;
            cantidad: number;
            costo_unitario: number | null;
          }[];
          p_ped_id_ped_compra?: number | null;
          p_co_tipo_comprobante?: string;
          p_co_punto_venta?: string | null;
          p_co_letra?: string | null;
          p_con_remito?: boolean;
        };
        Returns: number;
      };
      resolver_pedido_compra: {
        Args: { p_ped_id: number; p_estado: string; p_motivo?: string | null };
        Returns: void;
      };
      registrar_remito_compra: {
        Args: {
          p_co_id_compra: number;
          p_fecha: string | null;
          p_lineas: { rep_id: number; cantidad: number }[];
        };
        Returns: number;
      };
      editar_remito_compra: {
        Args: {
          p_rc_id: number;
          p_fecha: string | null;
          p_lineas: { rep_id: number; cantidad: number }[];
        };
        Returns: void;
      };
      anular_remito_compra: {
        Args: { p_rc_id: number };
        Returns: void;
      };
      alta_equipo: {
        Args: {
          p_codigo: string;
          p_nombre: string;
          p_te_id: number;
          p_lu_codigo: number;
          p_modelo: string | null;
          p_pendiente: boolean;
          p_fecha_instalacion?: string | null;
          p_tecnico?: string | null;
          p_prioridad?: "low" | "medium" | "high" | null;
        };
        Returns: { eq_id: number; ot_id: number | null };
      };
      finalizar_tarea: {
        Args: {
          p_taro_id_tarea_orden: number;
          p_repuestos?: { rep_id: number; cantidad: number }[] | null;
          p_diagnostico?: string | null;
        };
        Returns: void;
      };
      crear_plan_mantenimiento: {
        Args: {
          p_te_id: number;
          p_nombre: string;
          p_descripcion: string | null;
          p_frecuencia: number;
          p_estado: string;
          p_tareas: number[];
          p_equipos: { eq_id: number; fecha_ult_mant: string }[];
        };
        Returns: number;
      };
      editar_plan_mantenimiento: {
        Args: {
          p_pm_id: number;
          p_nombre: string;
          p_descripcion: string | null;
          p_frecuencia: number;
          p_estado: string;
          p_tareas: number[];
          p_equipos: { eq_id: number; fecha_ult_mant: string }[];
        };
        Returns: void;
      };
      eliminar_plan_mantenimiento: {
        Args: {
          p_pm_id: number;
        };
        Returns: boolean;
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
          legajo: string | null;
          role: "admin" | "technician" | "user";
          active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          email: string;
          legajo?: string | null;
          role?: "admin" | "technician" | "user";
          active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          email?: string;
          legajo?: string | null;
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
          tag_estado: "activo" | "inactivo";
          // Set only on system tareas the app relies on (0032): 'instalacion'.
          tag_codigo_sistema: string | null;
        };
        Insert: {
          tag_id_tarea?: number;
          tag_nombre_tarea: string;
          tag_descripcion_tarea?: string | null;
          tag_estado?: "activo" | "inactivo";
        };
        Update: {
          tag_id_tarea?: number;
          tag_nombre_tarea?: string;
          tag_descripcion_tarea?: string | null;
          tag_estado?: "activo" | "inactivo";
        };
        Relationships: [];
      };
      fallo: {
        Row: {
          fa_id_fallo: number;
          fa_nombre: string;
          fa_desperfecto: string | null;
          fa_gravedad: string | null;
          fa_estado: "activo" | "inactivo";
        };
        Insert: {
          fa_id_fallo?: number;
          fa_nombre: string;
          fa_desperfecto?: string | null;
          fa_gravedad?: string | null;
          fa_estado?: "activo" | "inactivo";
        };
        Update: {
          fa_id_fallo?: number;
          fa_nombre?: string;
          fa_desperfecto?: string | null;
          fa_gravedad?: string | null;
          fa_estado?: "activo" | "inactivo";
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
          eq_fecha_instalacion: string | null;
          eq_estado_registro: "activo" | "inactivo";
          eq_pendiente_instalacion: boolean;
        };
        Insert: {
          eq_id_equipo?: number;
          te_id: number;
          lu_codigo: number;
          eq_codigo: string;
          eq_nombre: string;
          eq_estado?: "operational" | "waiting" | "repair";
          eq_modelo?: string | null;
          eq_fecha_instalacion?: string | null;
          eq_estado_registro?: "activo" | "inactivo";
          eq_pendiente_instalacion?: boolean;
        };
        Update: {
          eq_id_equipo?: number;
          te_id?: number;
          lu_codigo?: number;
          eq_codigo?: string;
          eq_nombre?: string;
          eq_estado?: "operational" | "waiting" | "repair";
          eq_modelo?: string | null;
          eq_fecha_instalacion?: string | null;
          eq_estado_registro?: "activo" | "inactivo";
          eq_pendiente_instalacion?: boolean;
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
          sol_foto_url: string | null;
          sol_estado: "pendiente" | "en_proceso" | "resuelta" | "rechazada";
          sol_motivo_rechazo: string | null;
          sol_comentario_rechazo: string | null;
          sol_fecha_hora: string;
        };
        Insert: {
          sol_id_solicitud?: number;
          eq_id_equipo: number;
          p_legajo_solicitante: string;
          p_legajo_admin?: string | null;
          sol_descripcion: string;
          sol_foto_url?: string | null;
          sol_estado?: "pendiente" | "en_proceso" | "resuelta" | "rechazada";
          sol_motivo_rechazo?: string | null;
          sol_comentario_rechazo?: string | null;
          sol_fecha_hora?: string;
        };
        Update: {
          sol_id_solicitud?: number;
          eq_id_equipo?: number;
          p_legajo_solicitante?: string;
          p_legajo_admin?: string | null;
          sol_descripcion?: string;
          sol_foto_url?: string | null;
          sol_estado?: "pendiente" | "en_proceso" | "resuelta" | "rechazada";
          sol_motivo_rechazo?: string | null;
          sol_comentario_rechazo?: string | null;
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
      solicitud_foto: {
        Row: {
          sf_id: number;
          sol_id_solicitud: number;
          sf_foto_url: string;
          sf_orden: number;
          sf_creado_en: string;
        };
        Insert: {
          sf_id?: number;
          sol_id_solicitud: number;
          sf_foto_url: string;
          sf_orden?: number;
          sf_creado_en?: string;
        };
        Update: {
          sf_id?: number;
          sol_id_solicitud?: number;
          sf_foto_url?: string;
          sf_orden?: number;
          sf_creado_en?: string;
        };
        Relationships: [
          {
            foreignKeyName: "solicitud_foto_sol_id_solicitud_fkey";
            columns: ["sol_id_solicitud"];
            isOneToOne: false;
            referencedRelation: "solicitudes";
            referencedColumns: ["sol_id_solicitud"];
          },
        ];
      };
      fallo_por_orden: {
        Row: {
          fa_id_fallo: number;
          ot_id_orden: number;
          fpo_fecha_deteccion: string | null;
        };
        Insert: {
          fa_id_fallo: number;
          ot_id_orden: number;
          fpo_fecha_deteccion?: string | null;
        };
        Update: {
          fa_id_fallo?: number;
          ot_id_orden?: number;
          fpo_fecha_deteccion?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "fallo_por_orden_fa_id_fallo_fkey";
            columns: ["fa_id_fallo"];
            isOneToOne: false;
            referencedRelation: "fallo";
            referencedColumns: ["fa_id_fallo"];
          },
          {
            foreignKeyName: "fallo_por_orden_ot_id_orden_fkey";
            columns: ["ot_id_orden"];
            isOneToOne: false;
            referencedRelation: "orden_de_trabajo";
            referencedColumns: ["ot_id_orden"];
          },
        ];
      };
      orden_de_trabajo: {
        Row: {
          ot_id_orden: number;
          sol_id_solicitud: number | null;
          plan_id_manequipo: number | null;
          eq_id_equipo: number;
          // No longer "the" responsable — that now lives per tarea
          // (tareas_realizadas_orden.p_id_tecnico). Kept nullable for old
          // rows; never set on new ones (see 0017).
          ot_p_id_responsable: string | null;
          ot_tipo_orden: string;
          ot_fecha_inicio: string;
          ot_fecha_fin: string | null;
          ot_fecha_estimada_fin: string | null;
          ot_observacion: string | null;
          ot_estado: "assigned" | "in_progress" | "resolved";
          ot_prioridad: "low" | "medium" | "high";
        };
        Insert: {
          ot_id_orden?: number;
          sol_id_solicitud?: number | null;
          plan_id_manequipo?: number | null;
          eq_id_equipo: number;
          ot_p_id_responsable?: string | null;
          ot_tipo_orden?: string;
          ot_fecha_inicio?: string;
          ot_fecha_fin?: string | null;
          ot_fecha_estimada_fin?: string | null;
          ot_observacion?: string | null;
          ot_estado?: "assigned" | "in_progress" | "resolved";
          ot_prioridad: "low" | "medium" | "high";
        };
        Update: {
          ot_id_orden?: number;
          sol_id_solicitud?: number | null;
          plan_id_manequipo?: number | null;
          eq_id_equipo?: number;
          ot_p_id_responsable?: string | null;
          ot_tipo_orden?: string;
          ot_fecha_inicio?: string;
          ot_fecha_fin?: string | null;
          ot_fecha_estimada_fin?: string | null;
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
      tareas_realizadas_orden: {
        Row: {
          taro_id_tarea_orden: number;
          ot_id_orden: number;
          tag_id_tarea: number;
          pe_cuit_cuil: string | null;
          p_id_tecnico: string | null;
          taro_fecha_inicio: string | null;
          taro_fecha_fin: string | null;
          taro_diagnostico: string | null;
          // SCRUM-37 (migration 0029): all three null until the tarea is
          // suspended for the first time. Since 0030 they're kept after
          // resuming (the last suspension), with its end date below.
          taro_fecha_suspension: string | null;
          taro_motivo_suspension: string | null;
          taro_comentario_suspension: string | null;
          // Migration 0030: set on resume; null while suspended right now.
          taro_fecha_fin_suspension: string | null;
        };
        Insert: {
          taro_id_tarea_orden?: number;
          ot_id_orden: number;
          tag_id_tarea: number;
          pe_cuit_cuil?: string | null;
          p_id_tecnico?: string | null;
          taro_fecha_inicio?: string | null;
          taro_fecha_fin?: string | null;
          taro_diagnostico?: string | null;
          taro_fecha_suspension?: string | null;
          taro_motivo_suspension?: string | null;
          taro_comentario_suspension?: string | null;
          taro_fecha_fin_suspension?: string | null;
        };
        Update: {
          taro_id_tarea_orden?: number;
          ot_id_orden?: number;
          tag_id_tarea?: number;
          pe_cuit_cuil?: string | null;
          p_id_tecnico?: string | null;
          taro_fecha_inicio?: string | null;
          taro_fecha_fin?: string | null;
          taro_diagnostico?: string | null;
          taro_fecha_suspension?: string | null;
          taro_motivo_suspension?: string | null;
          taro_comentario_suspension?: string | null;
          taro_fecha_fin_suspension?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "tareas_realizadas_orden_ot_id_orden_fkey";
            columns: ["ot_id_orden"];
            isOneToOne: false;
            referencedRelation: "orden_de_trabajo";
            referencedColumns: ["ot_id_orden"];
          },
          {
            foreignKeyName: "tareas_realizadas_orden_tag_id_tarea_fkey";
            columns: ["tag_id_tarea"];
            isOneToOne: false;
            referencedRelation: "tareas_generales";
            referencedColumns: ["tag_id_tarea"];
          },
          {
            foreignKeyName: "tareas_realizadas_orden_p_id_tecnico_fkey";
            columns: ["p_id_tecnico"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      repuesto_para_tarea: {
        Row: {
          taro_id_tarea_orden: number;
          rep_id: number;
          repta_canti_usada: number;
          repta_desc_uso: string | null;
        };
        Insert: {
          taro_id_tarea_orden: number;
          rep_id: number;
          repta_canti_usada: number;
          repta_desc_uso?: string | null;
        };
        Update: {
          taro_id_tarea_orden?: number;
          rep_id?: number;
          repta_canti_usada?: number;
          repta_desc_uso?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "repuesto_para_tarea_taro_id_tarea_orden_fkey";
            columns: ["taro_id_tarea_orden"];
            isOneToOne: false;
            referencedRelation: "tareas_realizadas_orden";
            referencedColumns: ["taro_id_tarea_orden"];
          },
          {
            foreignKeyName: "repuesto_para_tarea_rep_id_fkey";
            columns: ["rep_id"];
            isOneToOne: false;
            referencedRelation: "repuestos";
            referencedColumns: ["rep_id"];
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
      repuestos: {
        Row: {
          rep_id: number;
          rep_nombre: string;
          rep_cantidad_actual: number;
          rep_stock_minimo: number;
          rep_stock_maximo: number | null;
          rep_estado: "activo" | "inactivo";
        };
        Insert: {
          rep_id?: number;
          rep_nombre: string;
          rep_cantidad_actual?: number;
          rep_stock_minimo?: number;
          rep_stock_maximo?: number | null;
          rep_estado?: "activo" | "inactivo";
        };
        Update: {
          rep_id?: number;
          rep_nombre?: string;
          rep_cantidad_actual?: number;
          rep_stock_minimo?: number;
          rep_stock_maximo?: number | null;
          rep_estado?: "activo" | "inactivo";
        };
        Relationships: [];
      };
      tipos_proveedores: {
        Row: { tp_id: number; tp_nombre_rubro: string; tp_descripcion: string | null };
        Insert: { tp_id?: number; tp_nombre_rubro: string; tp_descripcion?: string | null };
        Update: { tp_id?: number; tp_nombre_rubro?: string; tp_descripcion?: string | null };
        Relationships: [];
      };
      proveedores: {
        Row: {
          prov_id_proveedor: number;
          tp_id: number | null;
          prov_nombre: string;
          prov_telefono: string | null;
          prov_correo: string | null;
          prov_cuit: string | null;
        };
        Insert: {
          prov_id_proveedor?: number;
          tp_id?: number | null;
          prov_nombre: string;
          prov_telefono?: string | null;
          prov_correo?: string | null;
          prov_cuit?: string | null;
        };
        Update: {
          prov_id_proveedor?: number;
          tp_id?: number | null;
          prov_nombre?: string;
          prov_telefono?: string | null;
          prov_correo?: string | null;
          prov_cuit?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "proveedores_tp_id_fkey";
            columns: ["tp_id"];
            isOneToOne: false;
            referencedRelation: "tipos_proveedores";
            referencedColumns: ["tp_id"];
          },
        ];
      };
      compras: {
        Row: {
          co_id_compra: number;
          prov_id_proveedor: number;
          co_nombre: string | null;
          co_fecha_compra: string | null;
          co_costo_total: number | null;
          co_p_id_registrador: string | null;
          co_tipo_comprobante: ComprobanteTipo;
          co_punto_venta: string | null;
          co_letra: FacturaLetra | null;
        };
        Insert: {
          co_id_compra?: number;
          prov_id_proveedor: number;
          co_nombre?: string | null;
          co_fecha_compra?: string | null;
          co_costo_total?: number | null;
          co_p_id_registrador?: string | null;
          co_tipo_comprobante?: ComprobanteTipo;
          co_punto_venta?: string | null;
          co_letra?: FacturaLetra | null;
        };
        Update: {
          co_id_compra?: number;
          prov_id_proveedor?: number;
          co_nombre?: string | null;
          co_fecha_compra?: string | null;
          co_costo_total?: number | null;
          co_p_id_registrador?: string | null;
          co_tipo_comprobante?: ComprobanteTipo;
          co_punto_venta?: string | null;
          co_letra?: FacturaLetra | null;
        };
        Relationships: [
          {
            foreignKeyName: "compras_prov_id_proveedor_fkey";
            columns: ["prov_id_proveedor"];
            isOneToOne: false;
            referencedRelation: "proveedores";
            referencedColumns: ["prov_id_proveedor"];
          },
        ];
      };
      linea_compra: {
        Row: {
          co_id_compra: number;
          rep_id: number;
          lc_nro_linea: number | null;
          lc_cantidad: number | null;
          lc_costo_unitario: number | null;
        };
        Insert: {
          co_id_compra: number;
          rep_id: number;
          lc_nro_linea?: number | null;
          lc_cantidad?: number | null;
          lc_costo_unitario?: number | null;
        };
        Update: {
          co_id_compra?: number;
          rep_id?: number;
          lc_nro_linea?: number | null;
          lc_cantidad?: number | null;
          lc_costo_unitario?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "linea_compra_co_id_compra_fkey";
            columns: ["co_id_compra"];
            isOneToOne: false;
            referencedRelation: "compras";
            referencedColumns: ["co_id_compra"];
          },
          {
            foreignKeyName: "linea_compra_rep_id_fkey";
            columns: ["rep_id"];
            isOneToOne: false;
            referencedRelation: "repuestos";
            referencedColumns: ["rep_id"];
          },
        ];
      };
      pedido_compra: {
        Row: {
          ped_id_ped_compra: number;
          p_id_tecnico: string;
          co_id_compra: number | null;
          ped_fecha_solicitud: string | null;
          ped_estado: "pendiente" | "aprobado" | "rechazado" | "recibido";
          ped_observacion: string | null;
          ped_motivo_rechazo: string | null;
          ped_p_id_resolutor: string | null;
          ped_fecha_resolucion: string | null;
        };
        Insert: {
          ped_id_ped_compra?: number;
          p_id_tecnico: string;
          co_id_compra?: number | null;
          ped_fecha_solicitud?: string | null;
          ped_estado?: "pendiente" | "aprobado" | "rechazado" | "recibido";
          ped_observacion?: string | null;
          ped_motivo_rechazo?: string | null;
          ped_p_id_resolutor?: string | null;
          ped_fecha_resolucion?: string | null;
        };
        Update: {
          ped_id_ped_compra?: number;
          p_id_tecnico?: string;
          co_id_compra?: number | null;
          ped_fecha_solicitud?: string | null;
          ped_estado?: "pendiente" | "aprobado" | "rechazado" | "recibido";
          ped_observacion?: string | null;
          ped_motivo_rechazo?: string | null;
          ped_p_id_resolutor?: string | null;
          ped_fecha_resolucion?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "pedido_compra_p_id_tecnico_fkey";
            columns: ["p_id_tecnico"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      linea_pedido: {
        Row: {
          ped_id_ped_compra: number;
          rep_id: number;
          lp_nro_linea: number | null;
          lp_cantidad: number | null;
        };
        Insert: {
          ped_id_ped_compra: number;
          rep_id: number;
          lp_nro_linea?: number | null;
          lp_cantidad?: number | null;
        };
        Update: {
          ped_id_ped_compra?: number;
          rep_id?: number;
          lp_nro_linea?: number | null;
          lp_cantidad?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "linea_pedido_ped_id_ped_compra_fkey";
            columns: ["ped_id_ped_compra"];
            isOneToOne: false;
            referencedRelation: "pedido_compra";
            referencedColumns: ["ped_id_ped_compra"];
          },
          {
            foreignKeyName: "linea_pedido_rep_id_fkey";
            columns: ["rep_id"];
            isOneToOne: false;
            referencedRelation: "repuestos";
            referencedColumns: ["rep_id"];
          },
        ];
      };
      remito_compra: {
        Row: {
          rc_id: number;
          co_id_compra: number;
          rc_fecha: string;
          rc_p_id_registrador: string | null;
          rc_creado_en: string;
        };
        Insert: {
          rc_id?: number;
          co_id_compra: number;
          rc_fecha?: string;
          rc_p_id_registrador?: string | null;
          rc_creado_en?: string;
        };
        Update: {
          rc_id?: number;
          co_id_compra?: number;
          rc_fecha?: string;
          rc_p_id_registrador?: string | null;
          rc_creado_en?: string;
        };
        Relationships: [
          {
            foreignKeyName: "remito_compra_co_id_compra_fkey";
            columns: ["co_id_compra"];
            isOneToOne: false;
            referencedRelation: "compras";
            referencedColumns: ["co_id_compra"];
          },
        ];
      };
      remito_compra_linea: {
        Row: {
          rc_id: number;
          co_id_compra: number;
          rep_id: number;
          rcl_cantidad: number;
        };
        Insert: {
          rc_id: number;
          co_id_compra: number;
          rep_id: number;
          rcl_cantidad: number;
        };
        Update: {
          rc_id?: number;
          co_id_compra?: number;
          rep_id?: number;
          rcl_cantidad?: number;
        };
        Relationships: [
          {
            foreignKeyName: "remito_compra_linea_rc_id_fkey";
            columns: ["rc_id"];
            isOneToOne: false;
            referencedRelation: "remito_compra";
            referencedColumns: ["rc_id"];
          },
          {
            foreignKeyName: "remito_compra_linea_co_id_compra_rep_id_fkey";
            columns: ["co_id_compra", "rep_id"];
            isOneToOne: false;
            referencedRelation: "linea_compra";
            referencedColumns: ["co_id_compra", "rep_id"];
          },
        ];
      };
      plan_mantenimiento: {
        Row: {
          pm_id_plan: number;
          te_id: number;
          pm_nombre_plan: string;
          pm_descripcion_plan: string | null;
          pm_frecuencia: number;
          pm_estado: "activo" | "inactivo";
        };
        Insert: {
          pm_id_plan?: number;
          te_id: number;
          pm_nombre_plan: string;
          pm_descripcion_plan?: string | null;
          pm_frecuencia: number;
          pm_estado?: "activo" | "inactivo";
        };
        Update: {
          pm_id_plan?: number;
          te_id?: number;
          pm_nombre_plan?: string;
          pm_descripcion_plan?: string | null;
          pm_frecuencia?: number;
          pm_estado?: "activo" | "inactivo";
        };
        Relationships: [
          {
            foreignKeyName: "plan_mantenimiento_te_id_fkey";
            columns: ["te_id"];
            isOneToOne: false;
            referencedRelation: "tipos_de_equipos";
            referencedColumns: ["te_id"];
          },
        ];
      };
      mantenimiento_equipo: {
        Row: {
          pm_id_plan: number;
          eq_id_equipo: number;
          me_fecha_ult_mant: string;
        };
        Insert: {
          pm_id_plan: number;
          eq_id_equipo: number;
          me_fecha_ult_mant: string;
        };
        Update: {
          pm_id_plan?: number;
          eq_id_equipo?: number;
          me_fecha_ult_mant?: string;
        };
        Relationships: [
          {
            foreignKeyName: "mantenimiento_equipo_pm_id_plan_fkey";
            columns: ["pm_id_plan"];
            isOneToOne: false;
            referencedRelation: "plan_mantenimiento";
            referencedColumns: ["pm_id_plan"];
          },
          {
            foreignKeyName: "mantenimiento_equipo_eq_id_equipo_fkey";
            columns: ["eq_id_equipo"];
            isOneToOne: false;
            referencedRelation: "equipo";
            referencedColumns: ["eq_id_equipo"];
          },
        ];
      };
      tarea_prevista_plan: {
        Row: {
          tag_id_tarea: number;
          pm_id_plan: number;
        };
        Insert: {
          tag_id_tarea: number;
          pm_id_plan: number;
        };
        Update: {
          tag_id_tarea?: number;
          pm_id_plan?: number;
        };
        Relationships: [
          {
            foreignKeyName: "tarea_prevista_plan_tag_id_tarea_fkey";
            columns: ["tag_id_tarea"];
            isOneToOne: false;
            referencedRelation: "tareas_generales";
            referencedColumns: ["tag_id_tarea"];
          },
          {
            foreignKeyName: "tarea_prevista_plan_pm_id_plan_fkey";
            columns: ["pm_id_plan"];
            isOneToOne: false;
            referencedRelation: "plan_mantenimiento";
            referencedColumns: ["pm_id_plan"];
          },
        ];
      };
      v_planes_mantenimiento: {
        Row: {
          pm_id_plan: number;
          te_id: number;
          te_nombre: string;
          pm_nombre_plan: string;
          pm_descripcion_plan: string | null;
          pm_frecuencia: number;
          pm_estado: "activo" | "inactivo";
          task_count: number;
          equipment_count: number;
          prox_vencimiento: string | null;
        };
        Insert: {
          pm_id_plan?: number;
          te_id: number;
          te_nombre: string;
          pm_nombre_plan: string;
          pm_descripcion_plan?: string | null;
          pm_frecuencia: number;
          pm_estado?: "activo" | "inactivo";
          task_count?: number;
          equipment_count?: number;
          prox_vencimiento?: string | null;
        };
        Update: {
          pm_id_plan?: number;
          te_id?: number;
          te_nombre?: string;
          pm_nombre_plan?: string;
          pm_descripcion_plan?: string | null;
          pm_frecuencia?: number;
          pm_estado?: "activo" | "inactivo";
          task_count?: number;
          equipment_count?: number;
          prox_vencimiento?: string | null;
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
export type PlanMantenimiento = Database["public"]["Tables"]["plan_mantenimiento"]["Row"];
export type MantenimientoEquipo = Database["public"]["Tables"]["mantenimiento_equipo"]["Row"];
export type TareaPrevistaPlan = Database["public"]["Tables"]["tarea_prevista_plan"]["Row"];
export type PlanMantenimientoItem = Database["public"]["Tables"]["v_planes_mantenimiento"]["Row"];
export type Fallo = Database["public"]["Tables"]["fallo"]["Row"];
export type Repuesto = Database["public"]["Tables"]["repuestos"]["Row"];
export type TipoProveedor = Database["public"]["Tables"]["tipos_proveedores"]["Row"];
export type Proveedor = Database["public"]["Tables"]["proveedores"]["Row"];
export type ComprobanteTipo = "factura" | "remito" | "tique";
// Only a factura has one (migración 0025); tique/remito are always null.
export type FacturaLetra = "A" | "B" | "C";
export type Compra = Database["public"]["Tables"]["compras"]["Row"];
export type LineaCompra = Database["public"]["Tables"]["linea_compra"]["Row"];
export type PedidoCompra = Database["public"]["Tables"]["pedido_compra"]["Row"];
export type LineaPedido = Database["public"]["Tables"]["linea_pedido"]["Row"];
export type RemitoCompra = Database["public"]["Tables"]["remito_compra"]["Row"];
export type RemitoCompraLinea = Database["public"]["Tables"]["remito_compra_linea"]["Row"];

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
  // "pending_install" isn't an eq_estado value: it's eq_pendiente_instalacion
  // (0032) taking precedence over the automatic estado until the
  // installation tarea is finished.
  status: "operational" | "waiting" | "repair" | "pending_install";
  // Registration state, separate from the automatic operational `status`.
  active: boolean;
  model: string | null;
  installDate: string | null;
};

// One tarea genérica added to an orden_de_trabajo, with its own técnico and
// start/end dates — the OT itself has no single responsable anymore (see
// migration 0017's header comment).
export type SolicitudTask = {
  id: number; // taro_id_tarea_orden
  taskId: number; // tag_id_tarea
  taskName: string;
  technicianId: string;
  startDate: string | null; // taro_fecha_inicio — null until the técnico starts it
  endDate: string | null; // taro_fecha_fin — null until the técnico finishes it
  // What the técnico registered as used on this tarea (finalizar_tarea,
  // migration 0021) — empty until finished, and stays empty if none was used.
  consumedParts: { repId: number; nombre: string; cantidad: number }[];
  // The técnico's diagnóstico/observación written when finishing the tarea
  // (finalizar_tarea, migration 0023) — null if none was written.
  diagnosis: string | null;
  // The current suspension (SCRUM-37, migration 0029) — null unless the
  // tarea is on hold right now.
  suspension: TaskSuspension | null;
  // The last suspension that already ended (migration 0030) — null until
  // the tarea is resumed for the first time.
  lastSuspension: PastTaskSuspension | null;
};

export type TaskSuspension = {
  since: string; // taro_fecha_suspension (date)
  reason: string;
  comment: string | null; // only for reason "Otro"
};

export type PastTaskSuspension = TaskSuspension & {
  until: string; // taro_fecha_fin_suspension (date): when it was resumed
};

export type Solicitud = {
  id: number;
  equipment_id: number;
  reported_by: string;
  description: string;
  status: "new" | "assigned" | "in_progress" | "resolved" | "rejected";
  motivo_rechazo: string | null;
  comentario_rechazo: string | null;
  // Priority is never set by the reporting employee (they'd always pick
  // "alta") — it only exists once someone evaluates the solicitud and
  // creates the orden_de_trabajo, so it's null until then.
  priority: "low" | "medium" | "high" | null;
  // The orden_de_trabajo's own id/dates/diagnosis/tareas — null/empty while
  // the solicitud has no order yet (status "new"). ot_estado (-> status
  // above) and order_end_date are both derived from `tasks` by the DB
  // (sync_orden_estado, 0017), never set directly by the app.
  order_id: number | null;
  order_start_date: string | null;
  order_end_date: string | null;
  // The admin's target date for closing the OT (HU 8). Unlike
  // order_end_date it's set by hand and can be rescheduled while the order
  // is open; null on orders planned before migration 0018.
  order_planned_end_date: string | null;
  fault_type_name: string | null;
  tasks: SolicitudTask[];
  // photo_url is kept as photo_urls[0] for screens that only show a single
  // thumbnail (list rows, the equipment detail's fault card); photo_urls
  // holds every photo attached to the solicitud, in gallery order.
  photo_url: string | null;
  photo_urls: string[];
  created_at: string;
};

// An orden_de_trabajo on its own, keyed by ot_id_orden — what the OT screens
// work with. Unlike Solicitud it also covers OTs that don't come from a
// solicitud (preventivo, instalación): `solicitud` is null for those.
export type WorkOrder = {
  id: number;
  equipment_id: number;
  type: string;
  status: "assigned" | "in_progress" | "resolved";
  priority: "low" | "medium" | "high";
  start_date: string;
  end_date: string | null;
  planned_end_date: string | null;
  observation: string | null;
  fault_type_name: string | null;
  tasks: SolicitudTask[];
  solicitud: {
    id: number;
    reported_by: string;
    description: string;
    created_at: string;
    photo_urls: string[];
  } | null;
};

export type HistorialEntry = {
  id: string;
  equipment_id: number;
  type: string;
  note: string;
  author_id: string;
  created_at: string;
};
