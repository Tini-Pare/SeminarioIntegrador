import { supabase } from "../supabase";
import type {
  Compra,
  ComprobanteTipo,
  LineaCompra,
  RemitoCompra,
  RemitoCompraLinea,
} from "../../types/database";

export type PurchaseLine = LineaCompra & { repuesto: { rep_nombre: string } | null };

export type RemitoWithLines = RemitoCompra & { lineas: RemitoCompraLinea[] };

export type PurchaseWithDetail = Compra & {
  proveedores: { prov_nombre: string } | null;
  linea_compra: PurchaseLine[];
  // Only ever populated for co_tipo_comprobante === "factura" — remito/tique
  // purchases never get a remito_compra row (see migration 0013).
  remitos: RemitoWithLines[];
};

const PURCHASE_SELECT =
  "*, proveedores(prov_nombre), linea_compra(*, repuestos(rep_nombre)), " +
  "remito_compra(*, remito_compra_linea(*))";

type PurchaseRow = Compra & {
  proveedores: { prov_nombre: string } | null;
  linea_compra: (LineaCompra & { repuestos: { rep_nombre: string } | null })[];
  remito_compra: (RemitoCompra & { remito_compra_linea: RemitoCompraLinea[] })[];
};

// PostgREST embeds repuestos/remito_compra(_linea) under the raw table/FK
// names; reshape to the singular `repuesto` and the friendlier `remitos` (with
// each remito's own lines already unwrapped as `lineas`) that the rest of the
// app consumes.
function mapPurchase(row: PurchaseRow): PurchaseWithDetail {
  return {
    ...row,
    linea_compra: row.linea_compra.map((l) => ({ ...l, repuesto: l.repuestos })),
    remitos: row.remito_compra.map((rc) => ({ ...rc, lineas: rc.remito_compra_linea })),
  };
}

export async function listPurchases(): Promise<PurchaseWithDetail[]> {
  const { data, error } = await supabase
    .from("compras")
    .select(PURCHASE_SELECT)
    .order("co_fecha_compra", { ascending: false })
    .order("co_id_compra", { ascending: false });
  if (error) throw new Error(error.message);
  // The select string nests two nullable-to-many relations (linea_compra and
  // remito_compra(remito_compra_linea)) deep enough that supabase-js's type
  // inference bails out to GenericStringError — cast through unknown same as
  // any other query layer escape hatch for a shape TS can't derive itself.
  return (data as unknown as PurchaseRow[]).map(mapPurchase);
}

export async function getPurchaseById(id: number): Promise<PurchaseWithDetail | null> {
  const { data, error } = await supabase
    .from("compras")
    .select(PURCHASE_SELECT)
    .eq("co_id_compra", id)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(error.message);
  }
  return mapPurchase(data as unknown as PurchaseRow);
}

export type RegisterPurchaseInput = {
  tipoComprobante: ComprobanteTipo;
  puntoVenta: string | null;
  proveedorId: number;
  nombre: string | null;
  fecha: string | null;
  garantia: string | null;
  // A remito has no unit cost; costoUnitario is null for those lines.
  lineas: { repId: number; cantidad: number; costoUnitario: number | null }[];
  // When set, the purchase fulfils this pedido_compra: registrar_compra
  // links it and flips the pedido to 'recibido' in the same transaction.
  pedidoId?: number | null;
};

// All-or-nothing: the RPC inserts compras + linea_compra in one transaction
// (see migrations 0010/0011). For remito/tique lines it also bumps
// repuestos.rep_cantidad_actual there; for factura lines stock only moves
// once remitos de recepción are loaded against the purchase (migration 0013).
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
    p_co_tipo_comprobante: input.tipoComprobante,
    p_co_punto_venta: input.puntoVenta?.trim() || null,
  });
  if (error) throw new Error(error.message);
  return data as number;
}

export type RemitoLineInput = { repId: number; cantidad: number };

// Loads a partial-delivery event against a factura purchase: bumps stock for
// each line and, if every line of the purchase is now fully received, flips
// its linked pedido_compra (if any) to 'recibido' (see migration 0013).
export async function registrarRemitoCompra(
  coIdCompra: number,
  fecha: string | null,
  lineas: RemitoLineInput[],
): Promise<number> {
  const { data, error } = await supabase.rpc("registrar_remito_compra", {
    p_co_id_compra: coIdCompra,
    p_fecha: fecha,
    p_lineas: lineas.map((l) => ({ rep_id: l.repId, cantidad: l.cantidad })),
  });
  if (error) throw new Error(error.message);
  return data as number;
}

// Replaces a remito's date + lines in one transaction: reverts the old
// lines' stock, then re-validates and re-applies the new ones against the
// same over-receipt cap as registrarRemitoCompra.
export async function editarRemitoCompra(
  rcId: number,
  fecha: string | null,
  lineas: RemitoLineInput[],
): Promise<void> {
  const { error } = await supabase.rpc("editar_remito_compra", {
    p_rc_id: rcId,
    p_fecha: fecha,
    p_lineas: lineas.map((l) => ({ rep_id: l.repId, cantidad: l.cantidad })),
  });
  if (error) throw new Error(error.message);
}

// Reverts the remito's stock and removes it. Fails (and leaves the remito
// untouched) if that stock was already consumed elsewhere in the meantime —
// see the function's comment in migration 0013.
export async function anularRemitoCompra(rcId: number): Promise<void> {
  const { error } = await supabase.rpc("anular_remito_compra", { p_rc_id: rcId });
  if (error) throw new Error(error.message);
}
