import { supabase } from "../supabase";
import type { Repuesto } from "../../types/database";

// 23505 = Postgres unique_violation. Also raised by a primary-key collision
// (repuestos_pkey) when the rep_id identity sequence is behind, so match the
// specific index name (repuestos_nombre_unico_idx, migration 0010) rather
// than trusting the code alone — same pattern as generalTasks/faultTypes.
const DUPLICATE_NAME_MESSAGE = "Ya existe un repuesto con ese nombre";

function isDuplicateNameError(error: { code?: string; message?: string } | null): boolean {
  return error?.code === "23505" && !!error.message?.includes("repuestos_nombre_unico_idx");
}

export type StockStatus = "ok" | "bajo" | "sin_stock";

// Stock health derived from cantidad vs minimo — the table never stores it.
// sin_stock: nothing on hand. bajo: at or below the reorder point. ok: above it.
// Nothing consumes stock yet, so a part at 0 has never been purchased; calling
// that "agotado" would be wrong. Telling the two apart is planned for the
// sprint that adds stock consumption.
export function stockStatus(
  rep: Pick<Repuesto, "rep_cantidad_actual" | "rep_stock_minimo">,
): StockStatus {
  if (rep.rep_cantidad_actual <= 0) return "sin_stock";
  if (rep.rep_cantidad_actual <= rep.rep_stock_minimo) return "bajo";
  return "ok";
}

export async function listSpareParts(): Promise<Repuesto[]> {
  const { data, error } = await supabase.from("repuestos").select("*").order("rep_nombre");
  if (error) throw new Error(error.message);
  return data as Repuesto[];
}

export type SparePartInput = {
  name: string;
  stockMin: number;
  stockMax: number | null;
  estado: Repuesto["rep_estado"];
};

// rep_cantidad_actual is deliberately left out: a new spare part starts at the
// column default (0) and only registrar_compra moves it, so every unit in stock
// traces back to a linea_compra. Neither create nor update can set it.
export async function createSparePart(input: SparePartInput): Promise<Repuesto> {
  const { data, error } = await supabase
    .from("repuestos")
    .insert({
      rep_nombre: input.name.trim(),
      rep_stock_minimo: input.stockMin,
      rep_stock_maximo: input.stockMax,
      rep_estado: input.estado,
    })
    .select("*")
    .single();
  if (error) {
    if (isDuplicateNameError(error)) throw new Error(DUPLICATE_NAME_MESSAGE);
    throw new Error(error.message);
  }
  return data as Repuesto;
}

export async function updateSparePart(id: number, changes: SparePartInput): Promise<void> {
  const { error } = await supabase
    .from("repuestos")
    .update({
      rep_nombre: changes.name.trim(),
      rep_stock_minimo: changes.stockMin,
      rep_stock_maximo: changes.stockMax,
      rep_estado: changes.estado,
    })
    .eq("rep_id", id);
  if (error) {
    if (isDuplicateNameError(error)) throw new Error(DUPLICATE_NAME_MESSAGE);
    throw new Error(error.message);
  }
}

// 23503 = Postgres foreign_key_violation — linea_compra / linea_pedido /
// repuesto_para_tarea reference rep_id with no ON DELETE CASCADE (deleting a
// spare part shouldn't wipe purchase or order history), so surface a friendly
// message instead of the raw constraint error.
export async function deleteSparePart(id: number): Promise<void> {
  const { error } = await supabase.from("repuestos").delete().eq("rep_id", id);
  if (error) {
    if (error.code === "23503") {
      throw new Error(
        "No se puede eliminar: el repuesto ya figura en una compra, un pedido o una tarea. Marcalo como inactivo en su lugar.",
      );
    }
    throw new Error(error.message);
  }
}
