import { supabase } from "../supabase";
import type { PlanMantenimientoItem, TareaGeneral } from "../../types/database";

export type MaintenancePlanEquipmentRow = {
  equipmentId: number;
  equipmentCode: string;
  equipmentName: string;
  locationName: string;
  // YYYY-MM-DD; null until the equipo's first preventive OT of the plan is
  // resolved (0035).
  lastMaintenanceDate: string | null;
};

export type MaintenancePlanDetail = {
  id: number;
  typeId: number;
  typeName: string;
  name: string;
  description: string | null;
  frequency: number;
  // Days before an equipo's due date its preventive alert shows up
  // (pm_dias_aviso, 0036).
  warningDays: number;
  estado: "activo" | "inactivo";
  tasks: TareaGeneral[];
  equipments: MaintenancePlanEquipmentRow[];
};

export type MaintenancePlanInput = {
  typeId: number;
  name: string;
  description?: string | null;
  frequency: number;
  warningDays: number;
  estado: "activo" | "inactivo";
  taskIds: number[];
};

export async function listMaintenancePlans(): Promise<PlanMantenimientoItem[]> {
  const { data, error } = await supabase
    .from("v_planes_mantenimiento")
    .select("*")
    .order("pm_nombre_plan");

  if (error) {
    throw new Error(error.message);
  }

  return (data as PlanMantenimientoItem[]) ?? [];
}

export async function getMaintenancePlan(id: number): Promise<MaintenancePlanDetail> {
  const { data: plan, error: planError } = await supabase
    .from("plan_mantenimiento")
    .select("*, tipos_de_equipos(*)")
    .eq("pm_id_plan", id)
    .single();

  if (planError || !plan) {
    throw new Error(planError?.message ?? "Plan no encontrado");
  }

  // Fetch associated general tasks
  const { data: tasksData, error: tasksError } = await supabase
    .from("tarea_prevista_plan")
    .select("tag_id_tarea, tareas_generales(*)")
    .eq("pm_id_plan", id);

  if (tasksError) {
    throw new Error(tasksError.message);
  }

  const tasks: TareaGeneral[] = (tasksData ?? [])
    .map((row: any) => row.tareas_generales)
    .filter((t): t is TareaGeneral => !!t);

  // Fetch associated equipment maintenance rows
  const { data: equipData, error: equipError } = await supabase
    .from("mantenimiento_equipo")
    .select("eq_id_equipo, me_fecha_ult_mant, equipo(*, lugares(*))")
    .eq("pm_id_plan", id);

  if (equipError) {
    throw new Error(equipError.message);
  }

  const equipments: MaintenancePlanEquipmentRow[] = (equipData ?? []).map((row: any) => ({
    equipmentId: row.eq_id_equipo,
    equipmentCode: row.equipo?.eq_codigo ?? "",
    equipmentName: row.equipo?.eq_nombre ?? "",
    locationName: row.equipo?.lugares?.lu_nombre_sector ?? "",
    lastMaintenanceDate: row.me_fecha_ult_mant ?? null,
  }));

  const typeInfo = (plan as any).tipos_de_equipos;

  return {
    id: plan.pm_id_plan,
    typeId: plan.te_id,
    typeName: typeInfo?.te_nombre ?? "",
    name: plan.pm_nombre_plan,
    description: plan.pm_descripcion_plan,
    frequency: plan.pm_frecuencia,
    warningDays: plan.pm_dias_aviso,
    estado: plan.pm_estado,
    tasks,
    equipments,
  };
}

export type EquipmentOptionForType = {
  id: number;
  code: string;
  name: string;
  location: string;
};

export async function listActiveEquipmentByType(typeId: number): Promise<EquipmentOptionForType[]> {
  const { data, error } = await supabase
    .from("equipo")
    .select("eq_id_equipo, eq_codigo, eq_nombre, lugares(lu_nombre_sector)")
    .eq("te_id", typeId)
    .eq("eq_estado_registro", "activo")
    // A pending-installation equipo joins the plans when it's installed
    // (finalizar_tarea, 0032), not before.
    .eq("eq_pendiente_instalacion", false)
    .order("eq_codigo");

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row: any) => ({
    id: row.eq_id_equipo,
    code: row.eq_codigo,
    name: row.eq_nombre,
    location: row.lugares?.lu_nombre_sector ?? "Sin ubicación",
  }));
}

// The plan's equipos (every installed active one of its tipo) are added by
// crear_plan_mantenimiento itself, with no last maintenance yet, and an
// active plan generates their preventive OTs right away (0035) — so no
// dates are sent.
export async function createMaintenancePlan(input: MaintenancePlanInput): Promise<number> {
  const { data, error } = await supabase.rpc("crear_plan_mantenimiento", {
    p_te_id: input.typeId,
    p_nombre: input.name.trim(),
    p_descripcion: input.description?.trim() || null,
    p_frecuencia: input.frequency,
    p_estado: input.estado,
    p_tareas: input.taskIds,
    p_equipos: [],
    p_dias_aviso: input.warningDays,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as number;
}

// Editing a plan never touches its equipos' last maintenance dates: only
// resolving the plan's preventive OTs moves them (0034/0035 —
// editar_plan_mantenimiento ignores p_equipos, so it's sent empty).
export async function updateMaintenancePlan(
  id: number,
  input: MaintenancePlanInput,
): Promise<void> {
  const { error } = await supabase.rpc("editar_plan_mantenimiento", {
    p_pm_id: id,
    p_nombre: input.name.trim(),
    p_descripcion: input.description?.trim() || null,
    p_frecuencia: input.frequency,
    p_estado: input.estado,
    p_tareas: input.taskIds,
    p_equipos: [],
    p_dias_aviso: input.warningDays,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteMaintenancePlan(id: number): Promise<void> {
  const { error } = await supabase.rpc("eliminar_plan_mantenimiento", {
    p_pm_id: id,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function deactivateMaintenancePlan(id: number): Promise<void> {
  const { error } = await supabase
    .from("plan_mantenimiento")
    .update({ pm_estado: "inactivo" })
    .eq("pm_id_plan", id);

  if (error) {
    throw new Error(error.message);
  }
}
