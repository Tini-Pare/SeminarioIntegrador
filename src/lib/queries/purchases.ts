import { supabase } from "../supabase";
import type { Compra, LineaCompra } from "../../types/database";

export type PurchaseLine = LineaCompra & { repuesto: { rep_nombre: string } | null };

export type PurchaseWithDetail = Compra & {
  proveedores: { prov_nombre: string } | null;
  linea_compra: PurchaseLine[];
};

export async function listPurchases(): Promise<PurchaseWithDetail[]> {
  const { data, error } = await supabase
    .from("compras")
    .select("*, proveedores(prov_nombre), linea_compra(*, repuestos(rep_nombre))")
    .order("co_fecha_compra", { ascending: false })
    .order("co_id_compra", { ascending: false });
  if (error) throw new Error(error.message);

  // PostgREST embeds repuestos as `repuestos`; expose it as `repuesto` to
  // match the singular relation it actually is per line.
  return (
    data as (Compra & {
      proveedores: { prov_nombre: string } | null;
      linea_compra: (LineaCompra & { repuestos: { rep_nombre: string } | null })[];
    })[]
  ).map((row) => ({
    ...row,
    linea_compra: row.linea_compra.map((l) => ({ ...l, repuesto: l.repuestos })),
  }));
}

export type RegisterPurchaseInput = {
  proveedorId: number;
  nombre: string | null;
  fecha: string | null;
  garantia: string | null;
  lineas: { repId: number; cantidad: number; costoUnitario: number | null }[];
  // When set, the purchase fulfils this pedido_compra: registrar_compra
  // links it and flips the pedido to 'recibido' in the same transaction.
  pedidoId?: number | null;
};

// All-or-nothing: the RPC inserts compras + linea_compra and bumps
// repuestos.rep_cantidad_actual in one transaction (see migration 0010).
export async function registrarCompra(input: RegisterPurchaseInput): Promise<number> {
  const { data, error } = await supabase.rpc("registrar_compra", {
    p_prov_id_proveedor: input.proveedorId,
    p_co_nombre: input.nombre?.trim() || null,
    p_co_fecha_compra: input.fecha ?? null,
    p_co_garantia: input.garantia?.trim() || null,
    p_lineas: input.lineas.map((l) => ({
      rep_id: l.repId,
      cantidad: l.cantidad,
      costo_unitario: l.costoUnitario,
    })),
    p_ped_id_ped_compra: input.pedidoId ?? null,
  });
  if (error) throw new Error(error.message);
  return data as number;
}
