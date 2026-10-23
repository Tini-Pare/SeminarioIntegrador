import { supabase } from "../supabase";
import type { TareaGeneral } from "../../types/database";
import { includesSearch, normalizeSearch } from "../search";

// 23505 = Postgres unique_violation. It's also raised by a primary-key
// collision (tareas_generales_pkey) when the tag_id_tarea identity sequence is
// behind, so match the specific index name (tareas_generales_nombre_unico_idx,
// migration 0005) in the error message rather than trusting the code alone.
const DUPLICATE_NAME_MESSAGE = "Ya existe una tarea general con ese nombre";

function isDuplicateNameError(error: { code?: string; message?: string } | null): boolean {
  return error?.code === "23505" && !!error.message?.includes("tareas_generales_nombre_unico_idx");
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
  estado: TareaGeneral["tag_estado"];
}): Promise<TareaGeneral> {
  const { data, error } = await supabase
    .from("tareas_generales")
    .insert({
      tag_nombre_tarea: input.name.trim(),
      tag_descripcion_tarea: input.description?.trim() || null,
      tag_estado: input.estado,
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
  changes: { name: string; description: string | null; estado: TareaGeneral["tag_estado"] },
): Promise<void> {
  const { error } = await supabase
    .from("tareas_generales")
    .update({
      tag_nombre_tarea: changes.name.trim(),
      tag_descripcion_tarea: changes.description?.trim() || null,
      tag_estado: changes.estado,
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
        "No se puede eliminar: la tarea ya figura en un plan de mantenimiento o en una orden de trabajo. Marcala como inactiva en su lugar.",
      );
    }
    throw new Error(error.message);
  }
}

// Searches active general tasks matching query in name or description.
// Performs server-side ilike query with accent-insensitive filtering.
export async function searchGeneralTasks(
  query: string,
  limit = 8,
): Promise<TareaGeneral[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const sanitized = trimmed.replace(/[%_,()]/g, "");
  const { data, error } = await supabase
    .from("tareas_generales")
    .select("*")
    .eq("tag_estado", "activo")
    .or(`tag_nombre_tarea.ilike.%${sanitized}%,tag_descripcion_tarea.ilike.%${sanitized}%`)
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  const qNorm = normalizeSearch(trimmed);
  const items = (data as TareaGeneral[]) ?? [];
  return items
    .filter(
      (t) =>
        includesSearch(t.tag_nombre_tarea, qNorm) ||
        includesSearch(t.tag_descripcion_tarea, qNorm),
    )
    .slice(0, limit);
}
