import type { Compra, ComprobanteTipo, FacturaLetra } from "../types/database";

// How a compra's comprobante is named everywhere it's shown (grid, detail,
// modal), so "Factura A 0001-00024352" reads the same on every screen.

export const TIPO_LABEL: Record<ComprobanteTipo, string> = {
  factura: "Factura",
  remito: "Remito",
  tique: "Tique",
};

// The three letters a factura can have, with their AFIP comprobante codes
// (printed under the letter on a real factura).
export const FACTURA_LETRAS: { letra: FacturaLetra; code: string }[] = [
  { letra: "A", code: "Cód. 01" },
  { letra: "B", code: "Cód. 06" },
  { letra: "C", code: "Cód. 11" },
];

// "Factura A", "Tique", "Remito".
export function comprobanteTipoLabel(p: Pick<Compra, "co_tipo_comprobante" | "co_letra">): string {
  const tipo = TIPO_LABEL[p.co_tipo_comprobante];
  return p.co_tipo_comprobante === "factura" && p.co_letra ? `${tipo} ${p.co_letra}` : tipo;
}

// "0001-00024352": punto de venta + número, or just the number if the
// punto de venta is missing (older compras). null when there's no number.
export function comprobanteRef(p: Pick<Compra, "co_punto_venta" | "co_nombre">): string | null {
  if (p.co_punto_venta && p.co_nombre) return `${p.co_punto_venta}-${p.co_nombre}`;
  if (p.co_nombre) return p.co_nombre;
  return null;
}
