import type { PurchaseWithDetail } from "./queries/purchases";
import type { ThemeColors } from "./theme";

export type ReceiptState = "pendiente" | "parcial" | "completa";

export const RECEIPT_STATE_LABEL: Record<ReceiptState, string> = {
  pendiente: "Pendiente",
  parcial: "Parcial",
  completa: "Completa",
};

// Reuses the equipment status palette (red/amber/green) so a compra's
// receipt badge reads the same way as every other three-state badge in the
// app instead of introducing a fourth color set just for this screen.
export function receiptStateColors(
  c: ThemeColors,
): Record<ReceiptState, { bg: string; fg: string }> {
  return { pendiente: c.eqRepair, parcial: c.eqWaiting, completa: c.eqOperational };
}

// Sum of every remito line loaded against the purchase, per repuesto — the
// single source of truth for "how much arrived" (see migration 0013's
// header: nothing caches this, it's always recomputed from remito_compra_linea).
export function receivedQuantities(
  purchase: Pick<PurchaseWithDetail, "remitos">,
): Map<number, number> {
  const map = new Map<number, number>();
  for (const remito of purchase.remitos) {
    for (const linea of remito.lineas) {
      map.set(linea.rep_id, (map.get(linea.rep_id) ?? 0) + linea.rcl_cantidad);
    }
  }
  return map;
}

export function lineReceiptState(facturado: number, recibido: number): ReceiptState {
  if (recibido <= 0) return "pendiente";
  if (recibido >= facturado) return "completa";
  return "parcial";
}

// remito/tique purchases move their stock in full at registrarCompra time —
// there's nothing to track, so they always read as "completa". Only factura
// purchases derive their state from the accumulated remitos.
export function purchaseReceiptState(purchase: PurchaseWithDetail): ReceiptState {
  if (purchase.co_tipo_comprobante !== "factura") return "completa";

  const received = receivedQuantities(purchase);
  const lineStates = purchase.linea_compra.map((l) =>
    lineReceiptState(l.lc_cantidad ?? 0, received.get(l.rep_id) ?? 0),
  );

  if (lineStates.length === 0) return "pendiente";
  if (lineStates.every((s) => s === "completa")) return "completa";
  if (lineStates.some((s) => s !== "pendiente")) return "parcial";
  return "pendiente";
}

// How much of a single line is still open to receive — the cap a "cargar
// remito" form must enforce client-side (the RPC re-validates it server-side).
export function lineRemaining(facturado: number, recibido: number): number {
  return Math.max(0, facturado - recibido);
}
