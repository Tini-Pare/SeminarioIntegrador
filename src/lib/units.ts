// Unit a repuesto's stock is counted in (repuestos.rep_unidad, migration
// 0049). Closed list, same values as the repuestos_unidad_chk constraint.
// Quantities stay integers: the unit is only the label shown next to them,
// e.g. "Stock 12 L · Mín. 5 L", "3 cajas".
//
// It's what the stock is counted in, not a size: "Cristal templado 10mm" is
// counted in paños (u), the 10 mm is part of its name.
export const UNIDADES = [
  "unidad",
  "litro",
  "kilogramo",
  "metro",
  "metro_cuadrado",
  "caja",
  "rollo",
  "par",
] as const;

export type UnidadRepuesto = (typeof UNIDADES)[number];

// `short` is what follows a quantity. Symbols (u, L, kg, m, m²) never change;
// word units (caja, rollo, par) take `plural` for any quantity but 1, since
// "3 caja" reads wrong and an abbreviation like "cj" isn't understood.
export const UNIT_INFO: Record<UnidadRepuesto, { short: string; plural?: string; name: string }> = {
  unidad: { short: "u", name: "Unidad" },
  litro: { short: "L", name: "Litro" },
  kilogramo: { short: "kg", name: "Kilogramo" },
  metro: { short: "m", name: "Metro" },
  metro_cuadrado: { short: "m²", name: "Metro cuadrado" },
  caja: { short: "caja", plural: "cajas", name: "Caja" },
  rollo: { short: "rollo", plural: "rollos", name: "Rollo" },
  par: { short: "par", plural: "pares", name: "Par" },
};

function isUnidad(unit: string): unit is UnidadRepuesto {
  return (UNIDADES as readonly string[]).includes(unit);
}

// Missing or unknown values (a row read before migration 0049 ran) fall back
// to "unidad", so a quantity is never left bare.
function infoOf(unit: string | null | undefined) {
  return unit && isUnidad(unit) ? UNIT_INFO[unit] : UNIT_INFO.unidad;
}

// The unit as a label with no quantity attached: field labels ("Stock
// mínimo (cajas)") and the suffix after a quantity input. Plural, since it
// stands for "how many".
export function unitShort(unit: string | null | undefined): string {
  const info = infoOf(unit);
  return info.plural ?? info.short;
}

// "12 L", "3 cajas", "1 par". `qty` may come already formatted (es-AR
// thousands, or a "12 / 5" pair); only an exact 1 keeps a word unit singular.
export function formatUnitQty(qty: number | string, unit: string | null | undefined): string {
  const info = infoOf(unit);
  const isOne = String(qty).trim() === "1";
  return `${qty} ${isOne || !info.plural ? info.short : info.plural}`;
}
