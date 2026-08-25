import { supabase } from "../supabase";
import type { Lugar } from "../../types/database";

export type LocationWithCount = Lugar & { equipmentCount: number };

// Counts equipo rows per lugar with a plain select + client-side grouping
// instead of an embedded `equipo(count)` aggregate — keeps this testable
// with the same chained-mock style as the rest of the query layer and
// doesn't depend on PostgREST's aggregate-functions setting being enabled.
export async function listLocations(): Promise<LocationWithCount[]> {
  const [lugaresRes, equipoRes] = await Promise.all([
    supabase.from("lugares").select("*").order("lu_nombre_sector"),
    supabase.from("equipo").select("lu_codigo"),
  ]);
  if (lugaresRes.error) throw new Error(lugaresRes.error.message);
  if (equipoRes.error) throw new Error(equipoRes.error.message);

  const counts = new Map<number, number>();
  for (const row of equipoRes.data as { lu_codigo: number }[]) {
    counts.set(row.lu_codigo, (counts.get(row.lu_codigo) ?? 0) + 1);
  }

  return (lugaresRes.data as Lugar[]).map((l) => ({
    ...l,
    equipmentCount: counts.get(l.lu_codigo) ?? 0,
  }));
}

export async function createLocation(input: {
  name: string;
  floor: string | null;
}): Promise<Lugar> {
  const { data, error } = await supabase
    .from("lugares")
    .insert({ lu_nombre_sector: input.name.trim(), lu_piso: input.floor?.trim() || null })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as Lugar;
}

export async function updateLocation(
  id: number,
  changes: { name: string; floor: string | null },
): Promise<void> {
  const { error } = await supabase
    .from("lugares")
    .update({ lu_nombre_sector: changes.name.trim(), lu_piso: changes.floor?.trim() || null })
    .eq("lu_codigo", id);
  if (error) throw new Error(error.message);
}

// 23503 = Postgres foreign_key_violation — equipo.lu_codigo has no ON
// DELETE CASCADE on purpose (deleting a lugar shouldn't silently orphan
// or wipe equipment), so surface a friendly message instead of the raw
// constraint error.
export async function deleteLocation(id: number): Promise<void> {
  const { error } = await supabase.from("lugares").delete().eq("lu_codigo", id);
  if (error) {
    if (error.code === "23503") {
      throw new Error(
        "No se puede eliminar: hay equipos asignados a esta ubicación. Reasigná esos equipos a otra ubicación primero.",
      );
    }
    throw new Error(error.message);
  }
}
