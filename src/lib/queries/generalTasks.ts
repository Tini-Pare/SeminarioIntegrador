import { supabase } from "../supabase";
import type { TareaGeneral } from "../../types/database";

export async function listGeneralTasks(): Promise<TareaGeneral[]> {
  const { data, error } = await supabase
    .from("tareas_generales")
    .select("*")
    .order("tag_nombre_tarea");
  if (error) throw new Error(error.message);
  return data as TareaGeneral[];
}

export async function createGeneralTask(input: {
  name: string;
  description: string | null;
}): Promise<TareaGeneral> {
  const { data, error } = await supabase
    .from("tareas_generales")
    .insert({
      tag_nombre_tarea: input.name.trim(),
      tag_descripcion_tarea: input.description?.trim() || null,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as TareaGeneral;
}

export async function updateGeneralTask(
  id: number,
  changes: { name: string; description: string | null },
): Promise<void> {
  const { error } = await supabase
    .from("tareas_generales")
    .update({
      tag_nombre_tarea: changes.name.trim(),
      tag_descripcion_tarea: changes.description?.trim() || null,
    })
    .eq("tag_id_tarea", id);
  if (error) throw new Error(error.message);
}

// 23503 = Postgres foreign_key_violation — tarea_prevista_plan and
// tareas_realizadas_orden reference tag_id_tarea with no ON DELETE CASCADE
// on purpose (deleting a task shouldn't silently gut a plan or an order's
// history), so surface a friendly message instead of the raw error.
export async function deleteGeneralTask(id: number): Promise<void> {
  const { error } = await supabase.from("tareas_generales").delete().eq("tag_id_tarea", id);
  if (error) {
    if (error.code === "23503") {
      throw new Error(
        "No se puede eliminar: la tarea ya está usada en un plan de mantenimiento o en una orden de trabajo.",
      );
    }
    throw new Error(error.message);
  }
}
