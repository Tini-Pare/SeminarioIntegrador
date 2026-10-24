import { supabase } from "../supabase";
import type { Database, Equipo, HistorialEntry, Solicitud } from "../../types/database";
import { SOLICITUD_SELECT, mapSolicitudRow, type SolicitudWithOrden } from "./faults";

type EquipoRow = Database["public"]["Tables"]["equipo"]["Row"] & {
  lugares: Database["public"]["Tables"]["lugares"]["Row"] | null;
  tipos_de_equipos: Database["public"]["Tables"]["tipos_de_equipos"]["Row"] | null;
};

function mapEquipo(row: EquipoRow): Equipo {
  return {
    id: row.eq_id_equipo,
    code: row.eq_codigo,
    name: row.eq_nombre,
    type: row.tipos_de_equipos?.te_nombre ?? "",
    typeId: row.te_id,
    location: row.lugares?.lu_nombre_sector ?? "",
    locationId: row.lu_codigo,
    status: row.eq_pendiente_instalacion ? "pending_install" : row.eq_estado,
    active: row.eq_estado_registro === "activo",
    model: row.eq_modelo,
    installDate: row.eq_fecha_instalacion,
  };
}

export async function listEquipment(): Promise<Equipo[]> {
  const { data, error } = await supabase
    .from("equipo")
    .select("*, lugares(*), tipos_de_equipos(*)")
    .order("lu_nombre_sector", { referencedTable: "lugares" })
    .order("eq_codigo");
  if (error) throw new Error(error.message);
  return (data as EquipoRow[]).map(mapEquipo);
}

// status isn't passed here on purpose: it's born 'operational' (the
// column's default) and from then on only sync_equipo_estado changes it
// based on active solicitudes/ordenes — allowing manual edits created a
// second writer that clashed with the automatic calculation (equipment
// showed "En reparación" with "Sin fallas activas" at the same time).
// installDate is null on update while the equipo is pending installation
// (equipo_pendiente_sin_fecha_chk, 0033): finishing the tarea sets it.
type EquipmentInput = {
  code: string;
  name: string;
  typeId: number;
  locationId: number;
  model: string | null;
  installDate: string | null;
  // Only sent on update: a new equipment is born 'activo' (column default).
  active?: boolean;
};

// An equipo is registered either already installed (with its date) or
// pending installation, which also generates its installation OT for the
// chosen técnico. Either way alta_equipo (0033) also handles the plans de
// mantenimiento of its tipo, all in one transaction.
export type NewEquipmentInput = Omit<EquipmentInput, "installDate" | "active"> &
  (
    | { pending: false; installDate: string }
    | { pending: true; technicianId: string; priority: "low" | "medium" | "high" }
  );

// 23505 = Postgres unique_violation — eq_codigo has a UNIQUE constraint
// (equipo_eq_codigo_key). Surface a friendly Spanish message instead of the
// raw database error.
export async function createEquipment(
  input: NewEquipmentInput,
): Promise<{ equipmentId: number; orderId: number | null }> {
  const { data, error } = await supabase.rpc("alta_equipo", {
    p_codigo: input.code,
    p_nombre: input.name,
    p_te_id: input.typeId,
    p_lu_codigo: input.locationId,
    p_modelo: input.model,
    p_pendiente: input.pending,
    ...(input.pending
      ? { p_tecnico: input.technicianId, p_prioridad: input.priority }
      : { p_fecha_instalacion: input.installDate }),
  });
  if (error) {
    if (error.code === "23505" || error.message.includes("equipo_eq_codigo_key")) {
      throw new Error("Ya existe un equipo con el código ingresado. Probá con otro código.");
    }
    throw new Error(error.message);
  }
  const result = data as { eq_id: number; ot_id: number | null };
  return { equipmentId: result.eq_id, orderId: result.ot_id };
}

export async function updateEquipment(id: number, changes: EquipmentInput): Promise<void> {
  const { error } = await supabase
    .from("equipo")
    .update({
      eq_codigo: changes.code,
      eq_nombre: changes.name,
      te_id: changes.typeId,
      lu_codigo: changes.locationId,
      eq_modelo: changes.model,
      eq_fecha_instalacion: changes.installDate,
      ...(changes.active !== undefined
        ? { eq_estado_registro: changes.active ? ("activo" as const) : ("inactivo" as const) }
        : {}),
    })
    .eq("eq_id_equipo", id);
  if (error) {
    if (error.code === "23505" || error.message.includes("equipo_eq_codigo_key")) {
      throw new Error("Ya existe un equipo con el código ingresado. Probá con otro código.");
    }
    throw new Error(error.message);
  }
}

// 23503 = Postgres foreign_key_violation — solicitudes / orden_de_trabajo /
// historial reference eq_id_equipo without ON DELETE CASCADE since migration
// 0014 (before that, deleting an equipment silently wiped its history), so an
// equipment with history can't be deleted; surface a friendly message.
export async function deleteEquipment(id: number): Promise<void> {
  const { error } = await supabase.from("equipo").delete().eq("eq_id_equipo", id);
  if (error) {
    if (error.code === "23503") {
      throw new Error(
        "No se puede eliminar: el equipo ya figura en una solicitud, una orden de trabajo o el historial. Marcalo como inactivo en su lugar.",
      );
    }
    throw new Error(error.message);
  }
}

export async function getEquipmentById(id: number): Promise<Equipo | null> {
  const { data, error } = await supabase
    .from("equipo")
    .select("*, lugares(*), tipos_de_equipos(*)")
    .eq("eq_id_equipo", id)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(error.message);
  }
  return mapEquipo(data as EquipoRow);
}

// Every solicitud ever reported on the equipo (active and closed), newest
// first, with its OT, tareas, diagnósticos and repuestos used — the
// equipment detail's "Historial de fallas" (SCRUM-35). The "Fallas activas"
// block filters this same list with isActiveFault instead of a second query.
export async function listFaultHistoryByEquipment(equipmentId: number): Promise<Solicitud[]> {
  const { data, error } = await supabase
    .from("solicitudes")
    .select(SOLICITUD_SELECT)
    .eq("eq_id_equipo", equipmentId)
    .order("sol_fecha_hora", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as SolicitudWithOrden[]).map(mapSolicitudRow);
}

// A solicitud closed without an OT ("rejected") is just as closed as a
// resolved one — it must not count as an active fault on the equipo.
export function isActiveFault(fault: Solicitud): boolean {
  return fault.status !== "resolved" && fault.status !== "rejected";
}

export type FaultHistorySummary = {
  total: number;
  active: number;
  lastReportedAt: string | null;
  mostFrequentType: { name: string; count: number } | null;
};

// Header numbers of the "Historial de fallas" tab. Faults without a fallo
// genérico (not evaluated yet, or closed without OT) don't compete for
// "most frequent type"; on a tie the type of the most recent fault wins
// (Map keeps insertion order and `faults` comes newest first).
export function summarizeFaultHistory(faults: Solicitud[]): FaultHistorySummary {
  const typeCounts = new Map<string, number>();
  for (const f of faults) {
    if (f.fault_type_name) {
      typeCounts.set(f.fault_type_name, (typeCounts.get(f.fault_type_name) ?? 0) + 1);
    }
  }
  let mostFrequentType: FaultHistorySummary["mostFrequentType"] = null;
  for (const [name, count] of typeCounts) {
    if (!mostFrequentType || count > mostFrequentType.count) mostFrequentType = { name, count };
  }
  const lastReportedAt = faults.reduce<string | null>(
    (latest, f) => (!latest || f.created_at > latest ? f.created_at : latest),
    null,
  );
  return {
    total: faults.length,
    active: faults.filter(isActiveFault).length,
    lastReportedAt,
    mostFrequentType,
  };
}

export async function listHistoryByEquipment(equipmentId: number): Promise<HistorialEntry[]> {
  const { data, error } = await supabase
    .from("historial")
    .select("*")
    .eq("eq_id_equipo", equipmentId)
    .order("hi_fecha_hora", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as Database["public"]["Tables"]["historial"]["Row"][]).map((row) => ({
    id: row.hi_id,
    equipment_id: row.eq_id_equipo,
    type: row.hi_tipo,
    note: row.hi_nota,
    author_id: row.hi_autor_id,
    created_at: row.hi_fecha_hora,
  }));
}
