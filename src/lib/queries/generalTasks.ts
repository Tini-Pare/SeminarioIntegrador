import { supabase } from "../supabase";
import type { Database, GeneralTask } from "../../types/database";

type GeneralTaskRow = Database["public"]["Tables"]["tareas_generales"]["Row"];

export async function listGeneralTasks(): Promise<GeneralTask[]> {
  const { data, error } = await supabase
    .from("tareas_generales")
    .select("*")
    .order("tag_nombre_tarea");
  if (error) throw new Error(error.message);
  return data as GeneralTaskRow[];
}

export async function createGeneralTask(input: {
  name: string;
  description: string | null;
}): Promise<GeneralTask> {
  const { data, error } = await supabase
    .from("tareas_generales")
    .insert({
      tag_nombre_tarea: input.name.trim(),
      tag_descripcion_tarea: input.description?.trim() || null,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as GeneralTask;
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

export async function setGeneralTaskActive(id: number, active: boolean): Promise<void> {
  const { error } = await supabase
    .from("tareas_generales")
    .update({ tag_activo: active })
    .eq("tag_id_tarea", id);
  if (error) throw new Error(error.message);
}
