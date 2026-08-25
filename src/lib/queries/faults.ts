import { supabase } from "../supabase";
import type { Database } from "../../types/database";
import type { Solicitud } from "../../types/database";

type SolicitudRow = Database["public"]["Tables"]["solicitudes"]["Row"];
type OrdenRow = Database["public"]["Tables"]["orden_de_trabajo"]["Row"];

// A solicitud in this app gets at most one orden_de_trabajo (created once
// by assignToMe) — the embedded array from PostgREST only ever has 0 or 1
// entries in practice.
export type SolicitudWithOrden = SolicitudRow & { orden_de_trabajo: OrdenRow[] };

// Maps solicitud+orden_de_trabajo onto the old flat "Fault" shape (id,
// status, technician_id, etc.) so screens/components barely change: no
// orden_de_trabajo row yet means status "new", otherwise status/technician
// come straight from the order.
export function mapSolicitudRow(row: SolicitudWithOrden): Solicitud {
  const orden = row.orden_de_trabajo[0] ?? null;
  return {
    id: row.sol_id_solicitud,
    equipment_id: row.eq_id_equipo,
    reported_by: row.p_legajo_solicitante,
    description: row.sol_descripcion,
    urgency: row.sol_urgencia,
    status: orden ? orden.ot_estado : "new",
    technician_id: orden?.ot_p_id_responsable ?? null,
    photo_url: row.sol_foto_url,
    created_at: row.sol_fecha_hora,
  };
}

async function currentUserId(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("no session");
  return session.user.id;
}

async function syncEquipoEstado(equipoId: number): Promise<void> {
  const { error } = await supabase.rpc("sync_equipo_estado", { p_eq_id: equipoId });
  if (error) throw new Error(error.message);
}

async function logHistorial(equipoId: number, tipo: string, nota: string): Promise<void> {
  const userId = await currentUserId();
  const { error } = await supabase
    .from("historial")
    .insert({ eq_id_equipo: equipoId, hi_tipo: tipo, hi_nota: nota, hi_autor_id: userId });
  if (error) throw new Error(error.message);
}

export async function createFault(input: {
  equipmentId: number;
  description: string;
  urgency: Solicitud["urgency"];
  photoUrl?: string;
}): Promise<Solicitud> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("solicitudes")
    .insert({
      eq_id_equipo: input.equipmentId,
      p_legajo_solicitante: userId,
      sol_descripcion: input.description,
      sol_urgencia: input.urgency,
      sol_foto_url: input.photoUrl ?? null,
    })
    .select("*, orden_de_trabajo(*)")
    .single();
  if (error) throw new Error(error.message);
  await syncEquipoEstado(input.equipmentId);
  await logHistorial(input.equipmentId, "Reporte", input.description);
  return mapSolicitudRow(data as SolicitudWithOrden);
}

export async function listMyRequests(): Promise<Solicitud[]> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("solicitudes")
    .select("*, orden_de_trabajo(*)")
    .eq("p_legajo_solicitante", userId)
    .order("sol_fecha_hora", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as SolicitudWithOrden[]).map(mapSolicitudRow);
}

export async function listAllRequests(): Promise<Solicitud[]> {
  const { data, error } = await supabase
    .from("solicitudes")
    .select("*, orden_de_trabajo(*)")
    .order("sol_fecha_hora", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as SolicitudWithOrden[]).map(mapSolicitudRow);
}

// Mirrors the old `.or("technician_id.eq.me,status.eq.new")` filter, split
// into two queries since PostgREST can't express "child row missing OR
// child row matches" against an embedded relationship in one call:
// solicitudes still pending (no orden_de_trabajo at all) plus orders
// already assigned to me.
export async function listWorkQueue(): Promise<Solicitud[]> {
  const userId = await currentUserId();
  const [pending, mine] = await Promise.all([
    supabase
      .from("solicitudes")
      .select("*, orden_de_trabajo(*)")
      .eq("sol_estado", "pendiente")
      .order("sol_fecha_hora", { ascending: false }),
    supabase
      .from("solicitudes")
      .select("*, orden_de_trabajo!inner(*)")
      .eq("orden_de_trabajo.ot_p_id_responsable", userId)
      .order("sol_fecha_hora", { ascending: false }),
  ]);
  if (pending.error) throw new Error(pending.error.message);
  if (mine.error) throw new Error(mine.error.message);

  const byId = new Map<number, Solicitud>();
  for (const row of pending.data as SolicitudWithOrden[]) {
    byId.set(row.sol_id_solicitud, mapSolicitudRow(row));
  }
  for (const row of mine.data as SolicitudWithOrden[]) {
    byId.set(row.sol_id_solicitud, mapSolicitudRow(row));
  }
  return [...byId.values()];
}

export async function assignToMe(solicitudId: number): Promise<void> {
  const userId = await currentUserId();
  const { data: sol, error: solError } = await supabase
    .from("solicitudes")
    .select("eq_id_equipo, sol_descripcion, sol_urgencia")
    .eq("sol_id_solicitud", solicitudId)
    .single();
  if (solError) throw new Error(solError.message);

  const { error: insertError } = await supabase.from("orden_de_trabajo").insert({
    sol_id_solicitud: solicitudId,
    eq_id_equipo: sol.eq_id_equipo,
    ot_p_id_responsable: userId,
    ot_prioridad: sol.sol_urgencia,
  });
  if (insertError) throw new Error(insertError.message);

  const { error: updateError } = await supabase
    .from("solicitudes")
    .update({ sol_estado: "en_proceso" })
    .eq("sol_id_solicitud", solicitudId);
  if (updateError) throw new Error(updateError.message);

  await syncEquipoEstado(sol.eq_id_equipo);
  await logHistorial(sol.eq_id_equipo, "Asignada", `Falla asignada: ${sol.sol_descripcion}`);
}

export async function advanceStatus(
  solicitudId: number,
  nextStatus: Solicitud["status"],
): Promise<void> {
  if (nextStatus === "new") throw new Error("cannot advance a solicitud back to 'new'");

  const { data: orden, error: ordenError } = await supabase
    .from("orden_de_trabajo")
    .update({
      ot_estado: nextStatus,
      ...(nextStatus === "resolved"
        ? { ot_fecha_fin: new Date().toISOString().slice(0, 10) }
        : {}),
    })
    .eq("sol_id_solicitud", solicitudId)
    .select("eq_id_equipo, solicitudes(sol_descripcion)")
    .single();
  if (ordenError) throw new Error(ordenError.message);

  if (nextStatus === "resolved") {
    const { error: solError } = await supabase
      .from("solicitudes")
      .update({ sol_estado: "resuelta" })
      .eq("sol_id_solicitud", solicitudId);
    if (solError) throw new Error(solError.message);
  }

  await syncEquipoEstado(orden.eq_id_equipo);

  const description = (orden.solicitudes as { sol_descripcion: string } | null)?.sol_descripcion ?? "";
  if (nextStatus === "in_progress") {
    await logHistorial(orden.eq_id_equipo, "En curso", `Reparación iniciada: ${description}`);
  }
  if (nextStatus === "resolved") {
    await logHistorial(orden.eq_id_equipo, "Resuelta", `Falla resuelta: ${description}`);
  }
}
