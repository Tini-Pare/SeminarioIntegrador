import { supabase } from "../supabase";
import type { MovimientoStock, MovimientoStockTipo } from "../../types/database";

// Ingresos/egresos externos: stock moved by hand, outside compras and
// tareas (migration 0048). Rows are never edited or deleted — a wrong one
// is corrected with an opposite movement — so there's only list + register.

export type StockMovement = MovimientoStock & { repuesto: { rep_nombre: string } | null };

type StockMovementRow = MovimientoStock & { repuestos: { rep_nombre: string } | null };

// Newest first. ms_id breaks ties between movements saved in the same
// instant, same as compras orders by co_id_compra after the date.
export async function listStockMovements(): Promise<StockMovement[]> {
  const { data, error } = await supabase
    .from("movimiento_stock")
    .select("*, repuestos(rep_nombre)")
    .order("ms_creado_en", { ascending: false })
    .order("ms_id", { ascending: false });
  if (error) throw new Error(error.message);
  // PostgREST embeds under the table name; the app reads the singular
  // `repuesto`, same as purchases.ts does for linea_compra.
  return (data as unknown as StockMovementRow[]).map(({ repuestos, ...row }) => ({
    ...row,
    repuesto: repuestos,
  }));
}

export type StockMovementInput = {
  repId: number;
  tipo: MovimientoStockTipo;
  cantidad: number;
  motivo: string;
  // The reason's detail, only for "Otro".
  comentario?: string | null;
};

// The RPC records the movement and moves the stock in one transaction, and
// rejects an egreso bigger than the stock on hand.
export async function registrarMovimientoStock(input: StockMovementInput): Promise<number> {
  const { data, error } = await supabase.rpc("registrar_movimiento_stock", {
    p_rep_id: input.repId,
    p_tipo: input.tipo,
    p_cantidad: input.cantidad,
    p_motivo: input.motivo.trim(),
    p_comentario: input.comentario?.trim() || null,
  });
  if (error) throw new Error(error.message);
  return data as number;
}
