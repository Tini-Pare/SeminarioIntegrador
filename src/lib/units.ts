// Unit a repuesto's quantities are counted in (repuestos.rep_unidad,
// migration 0049). Closed list, same values as the repuestos_unidad_chk
// constraint. Quantities stay integers: the unit is only the label shown
// next to them, e.g. "Stock 12 L · Mín. 5 L".
export const UNIDADES = ["unidad", "litro", "kilogramo", "metro"] as const;

export type UnidadRepuesto = (typeof UNIDADES)[number];

export const UNIT_INFO: Record<UnidadRepuesto, { short: string; name: string }> = {
  unidad: { short: "u", name: "Unidad" },
  litro: { short: "L", name: "Litro" },
  kilogramo: { short: "kg", name: "Kilogramo" },
  metro: { short: "m", name: "Metro" },
};

function isUnidad(unit: string): unit is UnidadRepuesto {
  return (UNIDADES as readonly string[]).includes(unit);
}

// Symbol for a unit. Falls back to "u" for a missing or unknown value (a
// row read before migration 0049 ran), so a quantity is never left bare.
export function unitShort(unit: string | null | undefined): string {
  return unit && isUnidad(unit) ? UNIT_INFO[unit].short : UNIT_INFO.unidad.short;
}

// "12 L", "3 kg". `qty` may come already formatted (e.g. es-AR thousands).
export function formatUnitQty(qty: number | string, unit: string | null | undefined): string {
  return `${qty} ${unitShort(unit)}`;
}
