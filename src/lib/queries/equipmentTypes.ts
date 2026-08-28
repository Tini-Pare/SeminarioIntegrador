import { supabase } from "../supabase";
import type { TipoEquipo } from "../../types/database";

export type EquipmentTypeWithCount = TipoEquipo & { equipmentCount: number };

// Same shape as listLocations: a plain select + client-side grouping rather
// than an embedded `equipo(count)` aggregate — keeps this testable with the
// chained-mock style used across the query layer and doesn't depend on
// PostgREST's aggregate-functions setting.
export async function listEquipmentTypes(): Promise<EquipmentTypeWithCount[]> {
  const [tiposRes, equipoRes] = await Promise.all([
    supabase.from("tipos_de_equipos").select("*").order("te_nombre"),
    supabase.from("equipo").select("te_id"),
  ]);
  if (tiposRes.error) throw new Error(tiposRes.error.message);
  if (equipoRes.error) throw new Error(equipoRes.error.message);

  const counts = new Map<number, number>();
  for (const row of equipoRes.data as { te_id: number }[]) {
    counts.set(row.te_id, (counts.get(row.te_id) ?? 0) + 1);
  }

  return (tiposRes.data as TipoEquipo[]).map((t) => ({
    ...t,
    equipmentCount: counts.get(t.te_id) ?? 0,
  }));
}

export async function createEquipmentType(input: { name: string }): Promise<TipoEquipo> {
  const { data, error } = await supabase
    .from("tipos_de_equipos")
    .insert({ te_nombre: input.name.trim() })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as TipoEquipo;
}

export async function updateEquipmentType(id: number, changes: { name: string }): Promise<void> {
  const { error } = await supabase
    .from("tipos_de_equipos")
    .update({ te_nombre: changes.name.trim() })
    .eq("te_id", id);
  if (error) throw new Error(error.message);
}

// 23503 = Postgres foreign_key_violation — equipo.te_id has no ON DELETE
// CASCADE on purpose (deleting a tipo shouldn't wipe equipment), so surface
// a friendly message instead of the raw constraint error.
export async function deleteEquipmentType(id: number): Promise<void> {
  const { error } = await supabase.from("tipos_de_equipos").delete().eq("te_id", id);
  if (error) {
    if (error.code === "23503") {
      throw new Error(
        "No se puede eliminar: hay equipos de este tipo. Reasigná esos equipos a otro tipo primero.",
      );
    }
    throw new Error(error.message);
  }
}
