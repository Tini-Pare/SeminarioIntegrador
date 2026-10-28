import { supabase } from "../supabase";
import type { Profile, Repuesto } from "../../types/database";
import { stockStatus } from "./spareParts";

// SCRUM-43: active repuestos at or below their stock mínimo (sin stock
// included). Inactive ones aren't bought anymore, so they don't warn.
export function lowStockParts(parts: Repuesto[]): Repuesto[] {
  return parts
    .filter((p) => p.rep_estado !== "inactivo" && stockStatus(p) !== "ok")
    .sort((a, b) => a.rep_cantidad_actual - b.rep_cantidad_actual);
}

export async function listLowStockParts(): Promise<Repuesto[]> {
  const { data, error } = await supabase.from("repuestos").select("*");
  if (error) throw new Error(error.message);
  return lowStockParts(data as Repuesto[]);
}

// SCRUM-59: a falla is critical when the solicitud's OT was given
// prioridad Alta (solicitudes have no urgency of their own since 0016 —
// the admin sets it when generating the OT). Only correctivo OTs come
// from a reported falla.
export function isCriticalTask(task: {
  priority: string;
  orderType: string;
  endDate: string | null;
}): boolean {
  return task.priority === "high" && task.orderType === "correctivo" && !task.endDate;
}

// Every unfinished tarea of the signed-in técnico (pending, en curso or
// suspendida), whatever its priority: the queue's nav badge is the work
// they have left. Fallas críticas are told apart by the bell (0045) and
// the queue's banner, which filters with isCriticalTask.
export async function countMyOpenTasks(): Promise<number> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return 0;
  const { count, error } = await supabase
    .from("tareas_realizadas_orden")
    .select("taro_id_tarea_orden", { count: "exact", head: true })
    .eq("p_id_tecnico", session.user.id)
    .is("taro_fecha_fin", null);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

// How many items the nav badge shows for each role: a técnico's open tareas.
export async function countAlerts(role: Profile["role"]): Promise<number> {
  if (role === "technician") return countMyOpenTasks();
  return 0;
}
