import { supabase } from "../supabase";
import type { TareaGeneral } from "../../types/database";

// 23505 = Postgres unique_violation. It's also raised by a primary-key
// collision (tareas_generales_pkey) when the tag_id_tarea identity sequence is
// behind, so match the specific index name (tareas_generales_nombre_unico_idx,
// migration 0005) in the error message rather than trusting the code alone.
const DUPLICATE_NAME_MESSAGE = "Ya existe una tarea general con ese nombre";

function isDuplicateNameError(error: { code?: string; message?: string } | null): boolean {
  return (
    error?.code === "23505" && !!error.message?.includes("tareas_generales_nombre_unico_idx")
  );
}

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
  if (error) {
    if (isDuplicateNameError(error)) throw new Error(DUPLICATE_NAME_MESSAGE);
    throw new Error(error.message);
  }
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
  if (error) {
    if (isDuplicateNameError(error)) throw new Error(DUPLICATE_NAME_MESSAGE);
    throw new Error(error.message);
  }
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
