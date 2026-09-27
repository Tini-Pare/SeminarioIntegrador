import { getTodayDbDate } from "../../components/CustomDatePicker";
import { supabase } from "../supabase";
import type { Database } from "../../types/database";
import type { Solicitud } from "../../types/database";

type SolicitudRow = Database["public"]["Tables"]["solicitudes"]["Row"];
type OrdenRow = Database["public"]["Tables"]["orden_de_trabajo"]["Row"];
type SolicitudFotoRow = Database["public"]["Tables"]["solicitud_foto"]["Row"];

// A solicitud in this app gets at most one orden_de_trabajo (created once
// by assignToMe) — the embedded array from PostgREST only ever has 0 or 1
// entries in practice.
export type SolicitudWithOrden = SolicitudRow & {
  orden_de_trabajo: OrdenRow[];
  solicitud_foto?: SolicitudFotoRow[];
};

// The select string every read below uses: the solicitud, its (at most
// one) orden_de_trabajo, and every photo attached to it.
const SOLICITUD_SELECT = "*, orden_de_trabajo(*), solicitud_foto(*)";

// Maps solicitud+orden_de_trabajo onto the old flat "Fault" shape (id,
// status, technician_id, etc.) so screens/components barely change: no
// orden_de_trabajo row yet means status "new", otherwise status/technician
// come straight from the order.
export function mapSolicitudRow(row: SolicitudWithOrden): Solicitud {
  const orden = row.orden_de_trabajo[0] ?? null;
  const photoUrls = (row.solicitud_foto ?? [])
    .slice()
    .sort((a, b) => a.sf_orden - b.sf_orden)
    .map((f) => f.sf_foto_url);
  // Rows written before solicitud_foto existed (migration 0015) only have
  // the legacy sol_foto_url column — fall back to it so old solicitudes
  // don't lose their photo.
  const effectivePhotoUrls =
    photoUrls.length > 0 ? photoUrls : row.sol_foto_url ? [row.sol_foto_url] : [];
  return {
    id: row.sol_id_solicitud,
    equipment_id: row.eq_id_equipo,
    reported_by: row.p_legajo_solicitante,
    description: row.sol_descripcion,
    status: orden ? orden.ot_estado : "new",
    technician_id: orden?.ot_p_id_responsable ?? null,
    priority: orden?.ot_prioridad ?? null,
    photo_url: effectivePhotoUrls[0] ?? null,
    photo_urls: effectivePhotoUrls,
    created_at: row.sol_fecha_hora,
  };
}

async function currentUserId(errorMessage = "no session"): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error(errorMessage);
  return session.user.id;
}

function validateCreateFaultInput(input: { equipmentId: number; description: string }): string {
  if (!Number.isInteger(input.equipmentId) || input.equipmentId <= 0) {
    throw new Error("El equipo seleccionado no es válido.");
  }

  const description = input.description.trim();
  if (!description) throw new Error("Describí la falla para poder registrarla.");
  if (description.length > 2000) {
    throw new Error("La descripción no puede superar los 2000 caracteres.");
  }

  return description;
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
  photoUrls?: string[];
}): Promise<Solicitud> {
  const description = validateCreateFaultInput(input);
  const userId = await currentUserId("Necesitás iniciar sesión para reportar una falla.");
  const { data, error } = await supabase
    .from("solicitudes")
    .insert({
      eq_id_equipo: input.equipmentId,
      p_legajo_solicitante: userId,
      sol_descripcion: description,
    })
    .select("*, orden_de_trabajo(*)")
    .single();
  if (error) {
    if (error.code === "23503" && error.message.includes("solicitudes_eq_id_equipo_fkey")) {
      throw new Error("El equipo seleccionado no existe.");
    }
    if (error.code === "42501") {
      throw new Error("No tenés permisos para registrar esta solicitud.");
    }
    throw new Error(error.message);
  }

  const photoUrls = input.photoUrls ?? [];
  if (photoUrls.length > 0) {
    const { error: photosError } = await supabase.from("solicitud_foto").insert(
      photoUrls.map((url, i) => ({
        sol_id_solicitud: data.sol_id_solicitud,
        sf_foto_url: url,
        sf_orden: i,
      })),
    );
    if (photosError) throw new Error(photosError.message);
  }

  await syncEquipoEstado(input.equipmentId);
  await logHistorial(input.equipmentId, "Reporte", description);
  const solicitud = mapSolicitudRow({ ...(data as SolicitudWithOrden), solicitud_foto: [] });
  return { ...solicitud, photo_url: photoUrls[0] ?? null, photo_urls: photoUrls };
}

export async function listMyRequests(): Promise<Solicitud[]> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("solicitudes")
    .select(SOLICITUD_SELECT)
    .eq("p_legajo_solicitante", userId)
    .order("sol_fecha_hora", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as SolicitudWithOrden[]).map(mapSolicitudRow);
}

export async function listAllRequests(): Promise<Solicitud[]> {
  const { data, error } = await supabase
    .from("solicitudes")
    .select(SOLICITUD_SELECT)
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
      .select(SOLICITUD_SELECT)
      .eq("sol_estado", "pendiente")
      .order("sol_fecha_hora", { ascending: false }),
    supabase
      .from("solicitudes")
      .select("*, orden_de_trabajo!inner(*), solicitud_foto(*)")
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

// faultTypeId and priority are both decided *now*, by whoever is taking
// the solicitud — the reporting employee only described symptoms ("no
// enfría"), they don't know the actual fault, and everyone reporting one
// has an incentive to always call it urgent, so neither ever came from
// them. faultTypeId is optional (the order can be taken before a
// diagnosis); priority defaults to "medium" like it always has.
export async function assignToMe(
  solicitudId: number,
  options?: { faultTypeId?: number | null; priority?: Exclude<Solicitud["priority"], null> },
): Promise<void> {
  const userId = await currentUserId();
  const { data: sol, error: solError } = await supabase
    .from("solicitudes")
    .select("eq_id_equipo, sol_descripcion")
    .eq("sol_id_solicitud", solicitudId)
    .single();
  if (solError) throw new Error(solError.message);

  const { data: orden, error: insertError } = await supabase
    .from("orden_de_trabajo")
    .insert({
      sol_id_solicitud: solicitudId,
      eq_id_equipo: sol.eq_id_equipo,
      ot_p_id_responsable: userId,
      ot_prioridad: options?.priority ?? "medium",
    })
    .select("ot_id_orden")
    .single();
  if (insertError) throw new Error(insertError.message);

  // Links the diagnosed fallo genérico to the new order, through the
  // fallo_por_orden catalog link (0003) — fallo <-> orden_de_trabajo, not
  // fallo <-> solicitud, on purpose (see 0015's header comment).
  if (options?.faultTypeId) {
    const { error: falloError } = await supabase.from("fallo_por_orden").insert({
      fa_id_fallo: options.faultTypeId,
      ot_id_orden: orden.ot_id_orden,
      fpo_fecha_deteccion: getTodayDbDate(),
    });
    if (falloError) throw new Error(falloError.message);
  }

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
      ...(nextStatus === "resolved" ? { ot_fecha_fin: getTodayDbDate() } : {}),
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

  const description =
    (orden.solicitudes as { sol_descripcion: string } | null)?.sol_descripcion ?? "";
  if (nextStatus === "in_progress") {
    await logHistorial(orden.eq_id_equipo, "En curso", `Reparación iniciada: ${description}`);
  }
  if (nextStatus === "resolved") {
    await logHistorial(orden.eq_id_equipo, "Resuelta", `Falla resuelta: ${description}`);
  }
}
