import { supabase } from "../supabase";
import type { LineaPedido, PedidoCompra } from "../../types/database";

export type PurchaseOrderLine = LineaPedido & { repuesto: { rep_nombre: string } | null };

export type PurchaseOrderWithLines = PedidoCompra & {
  linea_pedido: PurchaseOrderLine[];
};

async function currentUserId(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Sin sesión activa");
  return session.user.id;
}

// scope "mine" filters to the caller's own pedidos (technician view);
// "all" relies on RLS (admin sees every pedido, see migration 0010).
export async function listPurchaseOrders(scope: "mine" | "all"): Promise<PurchaseOrderWithLines[]> {
  let query = supabase
    .from("pedido_compra")
    .select("*, linea_pedido(*, repuestos(rep_nombre))")
    .order("ped_fecha_solicitud", { ascending: false })
    .order("ped_id_ped_compra", { ascending: false });

  if (scope === "mine") {
    query = query.eq("p_id_tecnico", await currentUserId());
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (
    data as (PedidoCompra & {
      linea_pedido: (LineaPedido & { repuestos: { rep_nombre: string } | null })[];
    })[]
  ).map((row) => ({
    ...row,
    linea_pedido: row.linea_pedido.map((l) => ({ ...l, repuesto: l.repuestos })),
  }));
}

export type CreatePurchaseOrderInput = {
  observacion: string | null;
  lineas: { repId: number; cantidad: number }[];
};

export async function createPurchaseOrder(input: CreatePurchaseOrderInput): Promise<void> {
  if (input.lineas.length === 0) {
    throw new Error("El pedido necesita al menos un repuesto.");
  }

  const userId = await currentUserId();
  const { data: pedido, error: pedidoErr } = await supabase
    .from("pedido_compra")
    .insert({
      p_id_tecnico: userId,
      ped_observacion: input.observacion?.trim() || null,
    })
    .select("ped_id_ped_compra")
    .single();
  if (pedidoErr) throw new Error(pedidoErr.message);

  const { error: lineErr } = await supabase.from("linea_pedido").insert(
    input.lineas.map((l, i) => ({
      ped_id_ped_compra: pedido.ped_id_ped_compra,
      rep_id: l.repId,
      lp_nro_linea: i + 1,
      lp_cantidad: l.cantidad,
    })),
  );
  if (lineErr) {
    // Roll back the now-empty pedido so a failed line insert doesn't leave
    // a headless order behind.
    await supabase.from("pedido_compra").delete().eq("ped_id_ped_compra", pedido.ped_id_ped_compra);
    throw new Error(lineErr.message);
  }
}

export type ResolveEstado = "aprobado" | "rechazado" | "recibido";

export async function resolvePurchaseOrder(
  id: number,
  estado: ResolveEstado,
  motivo?: string | null,
): Promise<void> {
  const { error } = await supabase.rpc("resolver_pedido_compra", {
    p_ped_id: id,
    p_estado: estado,
    p_motivo: motivo?.trim() || null,
  });
  if (error) throw new Error(error.message);
}
