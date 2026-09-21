import { supabase } from "../supabase";
import type { Fallo } from "../../types/database";

// fa_gravedad is a varchar(50) in the schema; the app stores it as one of
// these (same convention as sol_urgencia / ot_prioridad, English in code /
// Spanish in the UI).
export type Gravedad = "low" | "medium" | "high";

export const GRAVEDAD_OPTIONS: Gravedad[] = ["low", "medium", "high"];

export const GRAVEDAD_LABELS: Record<Gravedad, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
};

export function normalizeGravedad(raw: string | null | undefined): Gravedad {
  return raw === "low" || raw === "high" ? raw : "medium";
}

// 23505 = Postgres unique_violation. It's also raised by a primary-key
// collision (fallo_pkey) when the fa_id_fallo identity sequence is behind, so
// match the specific index name (fallo_nombre_unico_idx, migration 0006) in
// the error message rather than trusting the code alone.
const DUPLICATE_NAME_MESSAGE = "Ya existe una falla genérica con ese nombre.";

function isDuplicateNameError(error: { code?: string; message?: string } | null): boolean {
  return error?.code === "23505" && !!error.message?.includes("fallo_nombre_unico_idx");
}

export async function listFaultTypes(): Promise<Fallo[]> {
  const { data, error } = await supabase.from("fallo").select("*").order("fa_nombre");
  if (error) throw new Error(error.message);
  return data as Fallo[];
}

export async function createFaultType(input: {
  name: string;
  desperfecto: string | null;
  gravedad: Gravedad;
}): Promise<Fallo> {
  const { data, error } = await supabase
    .from("fallo")
    .insert({
      fa_nombre: input.name.trim(),
      fa_desperfecto: input.desperfecto?.trim() || null,
      fa_gravedad: input.gravedad,
    })
    .select("*")
    .single();
  if (error) {
    if (isDuplicateNameError(error)) throw new Error(DUPLICATE_NAME_MESSAGE);
    throw new Error(error.message);
  }
  return data as Fallo;
}

export async function updateFaultType(
  id: number,
  changes: { name: string; desperfecto: string | null; gravedad: Gravedad },
): Promise<void> {
  const { error } = await supabase
    .from("fallo")
    .update({
      fa_nombre: changes.name.trim(),
      fa_desperfecto: changes.desperfecto?.trim() || null,
      fa_gravedad: changes.gravedad,
    })
    .eq("fa_id_fallo", id);
  if (error) {
    if (isDuplicateNameError(error)) throw new Error(DUPLICATE_NAME_MESSAGE);
    throw new Error(error.message);
  }
}

// 23503 = Postgres foreign_key_violation — fallo_por_orden references
// fa_id_fallo with no ON DELETE CASCADE, so a fault type that's already
// tied to a work order can't be deleted; surface a friendly message.
export async function deleteFaultType(id: number): Promise<void> {
  const { error } = await supabase.from("fallo").delete().eq("fa_id_fallo", id);
  if (error) {
    if (error.code === "23503") {
      throw new Error(
        "No se puede eliminar: esta falla genérica ya está asociada a una orden de trabajo.",
      );
    }
    throw new Error(error.message);
  }
}
