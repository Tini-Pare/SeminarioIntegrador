import type { Compra } from "../types/database";

type DocumentReference = Pick<Compra, "co_tipo_comprobante" | "co_punto_venta" | "co_nombre">;

export function purchaseDocumentReference(purchase: DocumentReference): string | null {
  const number = purchase.co_nombre?.trim();
  if (!number) return null;

  const pointOfSale = purchase.co_punto_venta?.trim();
  const invoice = purchase.co_tipo_comprobante === "factura" ? /^([ABC])-(.+)$/.exec(number) : null;
  if (invoice) {
    return [invoice[1], pointOfSale, invoice[2]].filter(Boolean).join("-");
  }

  return pointOfSale ? `${pointOfSale}-${number}` : number;
}
