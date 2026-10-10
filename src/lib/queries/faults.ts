import { getTodayDbDate } from "../../components/CustomDatePicker";
import { supabase } from "../supabase";
import type { Database } from "../../types/database";
import type { Solicitud, SolicitudTask } from "../../types/database";

type SolicitudRow = Database["public"]["Tables"]["solicitudes"]["Row"];
type OrdenRow = Database["public"]["Tables"]["orden_de_trabajo"]["Row"];
type SolicitudFotoRow = Database["public"]["Tables"]["solicitud_foto"]["Row"];
type FalloRow = Database["public"]["Tables"]["fallo"]["Row"];
type TareaRow = Database["public"]["Tables"]["tareas_realizadas_orden"]["Row"];

// A solicitud in this app gets at most one orden_de_trabajo (created once
// by generateOrder) — the embedded array from PostgREST only ever has 0 or
// 1 entries in practice. Same for fallo_por_orden under it: the app only
// ever links one fallo genérico per order. tareas_realizadas_orden is the
// actual many side: an OT has no single responsable anymore (see
// migration 0017's header comment) — each tarea genérica added to it has
// its own técnico. Rows with pe_cuit_cuil (external provider) instead of
// p_id_tecnico are filtered out below — no UI yet to manage those.
type RepuestoParaTareaRow = { rep_id: number; repta_canti_usada: number };
type ConsumedPartRow = RepuestoParaTareaRow & { repuestos: { rep_nombre: string } | null };

function mapConsumedParts(rows: ConsumedPartRow[] | undefined) {
  return (rows ?? []).map((r) => ({
    repId: r.rep_id,
    nombre: r.repuestos?.rep_nombre ?? `Repuesto ${r.rep_id}`,
    cantidad: r.repta_canti_usada,
  }));
}

type TareaWithGeneral = TareaRow & {
  tareas_generales: { tag_nombre_tarea: string } | null;
  repuesto_para_tarea?: ConsumedPartRow[];
};
type OrdenWithTasks = OrdenRow & {
  fallo_por_orden?: { fallo: FalloRow }[];
  tareas_realizadas_orden?: TareaWithGeneral[];
};
export type SolicitudWithOrden = SolicitudRow & {
  orden_de_trabajo: OrdenWithTasks[];
  solicitud_foto?: SolicitudFotoRow[];
};

// The select string every read below uses: the solicitud, its (at most
// one) orden_de_trabajo with the fallo genérico diagnosed on it and every
// tarea added to it (with the técnico's id and the tarea's name), and
// every photo attached to the solicitud.
const SOLICITUD_SELECT =
  "*, orden_de_trabajo(*, fallo_por_orden(fallo(*)), tareas_realizadas_orden(*, tareas_generales(tag_nombre_tarea), repuesto_para_tarea(rep_id, repta_canti_usada, repuestos(rep_nombre)))), solicitud_foto(*)";

function resolvePhotoUrls(
  fotos: SolicitudFotoRow[] | undefined,
  legacyUrl: string | null,
): string[] {
  const photoUrls = (fotos ?? [])
    .slice()
    .sort((a, b) => a.sf_orden - b.sf_orden)
    .map((f) => f.sf_foto_url);
  // Rows written before solicitud_foto existed (migration 0015) only have
  // the legacy sol_foto_url column — fall back to it so old solicitudes
  // don't lose their photo.
  return photoUrls.length > 0 ? photoUrls : legacyUrl ? [legacyUrl] : [];
}

// Maps solicitud+orden_de_trabajo onto the old flat "Fault" shape (id,
// status, tasks, etc.) so screens/components barely change.
export function mapSolicitudRow(row: SolicitudWithOrden): Solicitud {
  const orden = row.orden_de_trabajo[0] ?? null;
  const tasks: SolicitudTask[] = (orden?.tareas_realizadas_orden ?? [])
    .filter((t): t is TareaWithGeneral & { p_id_tecnico: string } => t.p_id_tecnico !== null)
    .map((t) => ({
      id: t.taro_id_tarea_orden,
      taskId: t.tag_id_tarea,
      taskName: t.tareas_generales?.tag_nombre_tarea ?? "Tarea",
      technicianId: t.p_id_tecnico,
      startDate: t.taro_fecha_inicio,
      endDate: t.taro_fecha_fin,
      consumedParts: mapConsumedParts(t.repuesto_para_tarea),
    }))
    // PostgREST doesn't guarantee the order of embedded rows (an updated
    // row can come back in a different position), so sort by id: tareas
    // always show in the order they were added, new ones at the end.
    .sort((a, b) => a.id - b.id);
  let status: Solicitud["status"] = "new";
  if (row.sol_estado === "rechazada") {
    status = "rejected";
  } else if (orden) {
    status = orden.ot_estado;
  } else if (row.sol_estado === "resuelta") {
    status = "resolved";
  } else if (row.sol_estado === "en_proceso") {
    status = "in_progress";
  } else {
    status = "new";
  }

  return {
    id: row.sol_id_solicitud,
    equipment_id: row.eq_id_equipo,
    reported_by: row.p_legajo_solicitante,
    description: row.sol_descripcion,
    status,
    motivo_rechazo: row.sol_motivo_rechazo ?? null,
    comentario_rechazo: row.sol_comentario_rechazo ?? null,
    priority: orden?.ot_prioridad ?? null,
    order_id: orden?.ot_id_orden ?? null,
    order_start_date: orden?.ot_fecha_inicio ?? null,
    order_end_date: orden?.ot_fecha_fin ?? null,
    order_planned_end_date: orden?.ot_fecha_estimada_fin ?? null,
    fault_type_name: orden?.fallo_por_orden?.[0]?.fallo.fa_nombre ?? null,
    tasks,
    photo_url: resolvePhotoUrls(row.solicitud_foto, row.sol_foto_url)[0] ?? null,
    photo_urls: resolvePhotoUrls(row.solicitud_foto, row.sol_foto_url),
    created_at: row.sol_fecha_hora,
  };
}

// Compact "quién está en esto" label for list rows that don't have room
// for a full tareas breakdown (RequestList, work-orders table, dashboard).
// null (like the old technician_id-based one) means "nadie todavía".
export function summarizeTechnicians(
  tasks: SolicitudTask[],
  profileById: Map<string, { name: string }>,
): string | null {
  if (tasks.length === 0) return null;
  const uniqueIds = [...new Set(tasks.map((t) => t.technicianId))];
  if (uniqueIds.length === 1) {
    return profileById.get(uniqueIds[0])?.name ?? "Técnico desconocido";
  }
  return `${uniqueIds.length} técnicos`;
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

// SCRUM-31: el personal de la tienda solo ve SUS propias solicitudes.
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

// El admin es el único que ve todas las solicitudes — es quien las gestiona
// (generar OT, cerrar, agregar/reasignar tareas, etc.).
export async function listAllRequests(): Promise<Solicitud[]> {
  const { data, error } = await supabase
    .from("solicitudes")
    .select(SOLICITUD_SELECT)
    .order("sol_fecha_hora", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as SolicitudWithOrden[]).map(mapSolicitudRow);
}

// The OT full-screen page (work-orders/[id]) loads one solicitud/OT by id
// instead of the whole list.
export async function getSolicitudById(solicitudId: number): Promise<Solicitud | null> {
  const { data, error } = await supabase
    .from("solicitudes")
    .select(SOLICITUD_SELECT)
    .eq("sol_id_solicitud", solicitudId)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(error.message);
  }
  return mapSolicitudRow(data as SolicitudWithOrden);
}

// SCRUM-27: el admin puede cerrar una solicitud pendiente sin generar una
// OT (duplicada, falsa alarma, se resolvió sin intervención técnica). Solo
// válida para solicitudes que todavía no tienen orden.
export async function closeSolicitud(
  solicitudId: number,
  reason: string,
  comment?: string | null,
): Promise<void> {
  const trimmedReason = reason.trim();
  if (!trimmedReason) throw new Error("Indicá el motivo del cierre.");

  const { data: sol, error: solError } = await supabase
    .from("solicitudes")
    .select("eq_id_equipo, sol_estado")
    .eq("sol_id_solicitud", solicitudId)
    .single();
  if (solError) throw new Error(solError.message);
  if (sol.sol_estado !== "pendiente") {
    throw new Error("Esta solicitud ya no está pendiente.");
  }

  const { error: updateError } = await supabase
    .from("solicitudes")
    .update({
      sol_estado: "rechazada",
      sol_motivo_rechazo: trimmedReason,
      sol_comentario_rechazo: comment?.trim() || null,
    })
    .eq("sol_id_solicitud", solicitudId);
  if (updateError) throw new Error(updateError.message);

  await syncEquipoEstado(sol.eq_id_equipo);
  const noteSuffix = comment?.trim() ? ` - ${comment.trim()}` : "";
  await logHistorial(
    sol.eq_id_equipo,
    "Cerrada",
    `Solicitud cerrada sin orden de trabajo: ${trimmedReason}${noteSuffix}`,
  );
}

// SCRUM-24: el admin evalúa la solicitud y genera la OT. Se crea vacía —
// solo con los datos de la solicitud y la prioridad, que el admin elige
// siempre (sin valor por defecto). Las tareas (cada una con su técnico) y la
// falla genérica se cargan después desde la pantalla de la OT
// (work-orders/[id]), no desde Solicitudes. A 0-tarea OT is valid in the
// DB: sync_orden_estado (0017) leaves it 'assigned' until a tarea starts.
export async function generateOrder(
  solicitudId: number,
  input: { priority: Exclude<Solicitud["priority"], null> },
): Promise<void> {
  if (!input.priority) throw new Error("Elegí una prioridad.");

  const { data: sol, error: solError } = await supabase
    .from("solicitudes")
    .select("eq_id_equipo, sol_descripcion, sol_estado")
    .eq("sol_id_solicitud", solicitudId)
    .single();
  if (solError) throw new Error(solError.message);
  // Guards a double click or a second admin generating the same OT.
  if (sol.sol_estado !== "pendiente") {
    throw new Error("Esta solicitud ya no está pendiente.");
  }

  const { error: insertError } = await supabase.from("orden_de_trabajo").insert({
    sol_id_solicitud: solicitudId,
    eq_id_equipo: sol.eq_id_equipo,
    ot_prioridad: input.priority,
  });
  if (insertError) throw new Error(insertError.message);

  const { error: updateError } = await supabase
    .from("solicitudes")
    .update({ sol_estado: "en_proceso" })
    .eq("sol_id_solicitud", solicitudId);
  if (updateError) throw new Error(updateError.message);

  await syncEquipoEstado(sol.eq_id_equipo);
  await logHistorial(
    sol.eq_id_equipo,
    "Asignada",
    `Orden de trabajo generada: ${sol.sol_descripcion}`,
  );
}

const PRIORITY_HIST_LABELS: Record<Exclude<Solicitud["priority"], null>, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
};

// Changes the OT's prioridad from the OT screen.
export async function updateOrderPriority(
  solicitudId: number,
  priority: Exclude<Solicitud["priority"], null>,
): Promise<void> {
  const { data: orden, error: updateError } = await supabase
    .from("orden_de_trabajo")
    .update({ ot_prioridad: priority })
    .eq("sol_id_solicitud", solicitudId)
    .select("eq_id_equipo")
    .single();
  if (updateError) throw new Error(updateError.message);

  await logHistorial(
    orden.eq_id_equipo,
    "Replanificada",
    `Prioridad de la orden cambiada a ${PRIORITY_HIST_LABELS[priority]}.`,
  );
}

// Sets (or clears, with null) the OT's falla genérica. The app only ever
// links one fallo per order through fallo_por_orden (see the comment at
// the top of this file), so changing it replaces the existing link.
export async function updateOrderFaultType(
  solicitudId: number,
  faultTypeId: number | null,
): Promise<void> {
  const { data: orden, error: selectError } = await supabase
    .from("orden_de_trabajo")
    .select("ot_id_orden, eq_id_equipo")
    .eq("sol_id_solicitud", solicitudId)
    .single();
  if (selectError) throw new Error(selectError.message);

  const { error: deleteError } = await supabase
    .from("fallo_por_orden")
    .delete()
    .eq("ot_id_orden", orden.ot_id_orden);
  if (deleteError) throw new Error(deleteError.message);

  if (faultTypeId != null) {
    const { error: insertError } = await supabase.from("fallo_por_orden").insert({
      fa_id_fallo: faultTypeId,
      ot_id_orden: orden.ot_id_orden,
      fpo_fecha_deteccion: getTodayDbDate(),
    });
    if (insertError) throw new Error(insertError.message);
  }

  await logHistorial(
    orden.eq_id_equipo,
    "Diagnóstico",
    faultTypeId != null
      ? "Falla genérica de la orden actualizada."
      : "Se quitó la falla genérica de la orden.",
  );
}

// Adds one more tarea to an OT that already exists — e.g. the admin
// realizes mid-repair that another tarea genérica is needed.
export async function addTaskToOrder(
  solicitudId: number,
  input: { taskId: number; technicianId: string },
): Promise<void> {
  const { data: orden, error: selectError } = await supabase
    .from("orden_de_trabajo")
    .select("ot_id_orden, eq_id_equipo")
    .eq("sol_id_solicitud", solicitudId)
    .single();
  if (selectError) throw new Error(selectError.message);

  const { data: task, error: insertError } = await supabase
    .from("tareas_realizadas_orden")
    .insert({
      ot_id_orden: orden.ot_id_orden,
      tag_id_tarea: input.taskId,
      p_id_tecnico: input.technicianId,
    })
    .select("*, tareas_generales(tag_nombre_tarea)")
    .single();
  if (insertError) throw new Error(insertError.message);

  const taskName =
    (task.tareas_generales as { tag_nombre_tarea: string } | null)?.tag_nombre_tarea ?? "Tarea";
  await logHistorial(orden.eq_id_equipo, "Asignada", `Tarea agregada a la orden: ${taskName}`);
}

// SCRUM-26: reasignar el técnico de una tarea puntual (no de toda la OT —
// cada tarea tiene el suyo).
export async function reassignTaskTechnician(taskId: number, technicianId: string): Promise<void> {
  const { data: task, error: updateError } = await supabase
    .from("tareas_realizadas_orden")
    .update({ p_id_tecnico: technicianId })
    .eq("taro_id_tarea_orden", taskId)
    .select("*, tareas_generales(tag_nombre_tarea), orden_de_trabajo(eq_id_equipo)")
    .single();
  if (updateError) throw new Error(updateError.message);

  const eqId = (task.orden_de_trabajo as { eq_id_equipo: number } | null)?.eq_id_equipo;
  const taskName =
    (task.tareas_generales as { tag_nombre_tarea: string } | null)?.tag_nombre_tarea ?? "Tarea";
  if (eqId) {
    await logHistorial(eqId, "Reasignada", `Tarea reasignada: ${taskName}`);
  }
}

// Counts open (not yet finished) tareas per técnico, so the admin can see
// who's overloaded before assigning one to a new tarea (feedback:
// "estaría bueno ver la carga actual de ese técnico").
export async function listActiveTaskCountsByTechnician(): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("tareas_realizadas_orden")
    .select("p_id_tecnico")
    .is("taro_fecha_fin", null)
    .not("p_id_tecnico", "is", null);
  if (error) throw new Error(error.message);

  const counts: Record<string, number> = {};
  for (const row of data as { p_id_tecnico: string }[]) {
    counts[row.p_id_tecnico] = (counts[row.p_id_tecnico] ?? 0) + 1;
  }
  return counts;
}

// SCRUM-28: reprogramar cuándo arranca la orden en su conjunto (planificación
// del admin) — independiente de cuándo cada técnico arranca su propia tarea.
export async function updateOrderStartDate(solicitudId: number, newDate: string): Promise<void> {
  const { data: orden, error: updateError } = await supabase
    .from("orden_de_trabajo")
    .update({ ot_fecha_inicio: newDate })
    .eq("sol_id_solicitud", solicitudId)
    .select("eq_id_equipo")
    .single();
  if (updateError) throw new Error(updateError.message);

  await logHistorial(
    orden.eq_id_equipo,
    "Replanificada",
    `Fecha de inicio de la orden reprogramada al ${newDate}.`,
  );
}

// The target date for closing the OT, set and rescheduled by the admin.
// Separate from ot_fecha_fin (the real close date, written by
// sync_orden_estado) so planning never fights the automatic calculation.
// Passing null clears the estimate.
export async function updateOrderPlannedEndDate(
  solicitudId: number,
  newDate: string | null,
): Promise<void> {
  const { data: orden, error: updateError } = await supabase
    .from("orden_de_trabajo")
    .update({ ot_fecha_estimada_fin: newDate })
    .eq("sol_id_solicitud", solicitudId)
    .select("eq_id_equipo")
    .single();
  if (updateError) {
    // Backstop for orden_fecha_estimada_chk (0018) — the UI already blocks
    // this before it gets here, but a stale form or a second caller could
    // still hit the constraint, and the raw "violates check constraint
    // ..." message is meaningless to a user.
    if (updateError.code === "23514" && updateError.message.includes("orden_fecha_estimada_chk")) {
      throw new Error("La fecha estimada no puede ser anterior a la fecha de inicio de la orden.");
    }
    throw new Error(updateError.message);
  }

  await logHistorial(
    orden.eq_id_equipo,
    "Replanificada",
    newDate
      ? `Fecha estimada de resolución fijada para el ${newDate}.`
      : "Se quitó la fecha estimada de resolución de la orden.",
  );
}

// A técnico's own view of their work: one row per tarea assigned to them,
// with just enough of the parent OT/solicitud/equipo to show it — a
// solicitud isn't a work item a técnico "has", a tarea is.
export type MyTask = {
  taskRowId: number;
  taskName: string;
  orderId: number;
  orderStatus: Solicitud["status"];
  priority: Exclude<Solicitud["priority"], null>;
  startDate: string | null;
  endDate: string | null;
  equipmentId: number;
  description: string;
  reportedBy: string;
  createdAt: string;
  photoUrl: string | null;
  photoUrls: string[];
  faultTypeName: string | null;
  consumedParts: { repId: number; nombre: string; cantidad: number }[];
};

type MyTaskRow = TareaRow & {
  tareas_generales: { tag_nombre_tarea: string } | null;
  repuesto_para_tarea?: ConsumedPartRow[];
  orden_de_trabajo:
    | (OrdenRow & {
        fallo_por_orden?: { fallo: FalloRow }[];
        solicitudes:
          | (Pick<
              SolicitudRow,
              "sol_descripcion" | "p_legajo_solicitante" | "sol_fecha_hora" | "sol_foto_url"
            > & { solicitud_foto?: SolicitudFotoRow[] })
          | null;
      })
    | null;
};

export async function listMyTasks(): Promise<MyTask[]> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("tareas_realizadas_orden")
    .select(
      "*, tareas_generales(tag_nombre_tarea), repuesto_para_tarea(rep_id, repta_canti_usada, repuestos(rep_nombre)), orden_de_trabajo(*, fallo_por_orden(fallo(*)), solicitudes(sol_descripcion, p_legajo_solicitante, sol_fecha_hora, sol_foto_url, solicitud_foto(*)))",
    )
    .eq("p_id_tecnico", userId);
  if (error) throw new Error(error.message);

  return (data as MyTaskRow[]).map((row) => {
    const orden = row.orden_de_trabajo;
    const sol = orden?.solicitudes ?? null;
    const photoUrls = resolvePhotoUrls(sol?.solicitud_foto, sol?.sol_foto_url ?? null);
    return {
      taskRowId: row.taro_id_tarea_orden,
      taskName: row.tareas_generales?.tag_nombre_tarea ?? "Tarea",
      orderId: row.ot_id_orden,
      orderStatus: orden?.ot_estado ?? "assigned",
      priority: orden?.ot_prioridad ?? "medium",
      startDate: row.taro_fecha_inicio,
      endDate: row.taro_fecha_fin,
      equipmentId: orden?.eq_id_equipo ?? 0,
      description: sol?.sol_descripcion ?? "",
      reportedBy: sol?.p_legajo_solicitante ?? "",
      createdAt: sol?.sol_fecha_hora ?? "",
      photoUrl: photoUrls[0] ?? null,
      photoUrls,
      faultTypeName: orden?.fallo_por_orden?.[0]?.fallo.fa_nombre ?? null,
      consumedParts: mapConsumedParts(row.repuesto_para_tarea),
    };
  });
}

// El técnico arranca su propia tarea — nadie más puede hacerlo por él/ella
// (ni el admin), se valida acá y no solo ocultando el botón en la UI. El
// estado de la OT (y de la solicitud) se recalcula solo (sync_orden_estado,
// 0017) apenas esto cambia.
export async function startTask(taskId: number): Promise<void> {
  const userId = await currentUserId();
  const { data: task, error: checkError } = await supabase
    .from("tareas_realizadas_orden")
    .select(
      "p_id_tecnico, ot_id_orden, tareas_generales(tag_nombre_tarea), orden_de_trabajo(eq_id_equipo)",
    )
    .eq("taro_id_tarea_orden", taskId)
    .single();
  if (checkError) throw new Error(checkError.message);
  if (task.p_id_tecnico !== userId) {
    throw new Error("Solo el técnico asignado puede iniciar esta tarea.");
  }

  const { error: updateError } = await supabase
    .from("tareas_realizadas_orden")
    .update({ taro_fecha_inicio: getTodayDbDate() })
    .eq("taro_id_tarea_orden", taskId);
  if (updateError) throw new Error(updateError.message);

  const eqId = (task.orden_de_trabajo as { eq_id_equipo: number } | null)?.eq_id_equipo;
  const taskName =
    (task.tareas_generales as { tag_nombre_tarea: string } | null)?.tag_nombre_tarea ?? "Tarea";
  if (eqId) {
    await logHistorial(eqId, "En curso", `Tarea iniciada: ${taskName}`);
  }
}

// El técnico finaliza su propia tarea. Si era la última pendiente de la
// OT, sync_orden_estado ya la dejó (y a la solicitud) como resuelta — acá
// solo se agrega esa entrada al historial, igual que hacía el viejo
// advanceStatus("resolved").
export type ConsumedPart = { repId: number; cantidad: number };

export async function finishTask(taskId: number, repuestos: ConsumedPart[] = []): Promise<void> {
  const userId = await currentUserId();
  const { data: task, error: checkError } = await supabase
    .from("tareas_realizadas_orden")
    .select(
      "p_id_tecnico, ot_id_orden, taro_fecha_inicio, tareas_generales(tag_nombre_tarea), orden_de_trabajo(eq_id_equipo)",
    )
    .eq("taro_id_tarea_orden", taskId)
    .single();
  if (checkError) throw new Error(checkError.message);
  if (task.p_id_tecnico !== userId) {
    throw new Error("Solo el técnico asignado puede finalizar esta tarea.");
  }
  if (!task.taro_fecha_inicio) {
    throw new Error("Iniciá la tarea antes de finalizarla.");
  }

  // security definer: registra el consumo de repuestos (resta stock) y
  // marca la tarea finalizada en la misma transacción — si el stock no
  // alcanza, ninguna de las dos cosas queda guardada (ver migración 0021).
  const { error: rpcError } = await supabase.rpc("finalizar_tarea", {
    p_taro_id_tarea_orden: taskId,
    p_repuestos: repuestos.map((r) => ({ rep_id: r.repId, cantidad: r.cantidad })),
  });
  if (rpcError) throw new Error(rpcError.message);

  const eqId = (task.orden_de_trabajo as { eq_id_equipo: number } | null)?.eq_id_equipo;
  const taskName =
    (task.tareas_generales as { tag_nombre_tarea: string } | null)?.tag_nombre_tarea ?? "Tarea";
  if (!eqId) return;

  await logHistorial(eqId, "Tarea finalizada", `Tarea finalizada: ${taskName}`);

  const { data: siblings, error: siblingsError } = await supabase
    .from("tareas_realizadas_orden")
    .select("taro_fecha_fin")
    .eq("ot_id_orden", task.ot_id_orden);
  if (siblingsError) throw new Error(siblingsError.message);

  const allDone = (siblings ?? []).every((t) => t.taro_fecha_fin !== null);
  if (allDone) {
    await logHistorial(eqId, "Resuelta", "Todas las tareas de la orden fueron completadas.");
  }
}
