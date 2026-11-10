import { UNIDADES, UNIT_INFO, formatUnitQty, unitShort } from "../units";

describe("repuesto units", () => {
  it("is the closed list the migration's check constraint allows", () => {
    expect(UNIDADES).toEqual([
      "unidad",
      "litro",
      "kilogramo",
      "metro",
      "metro_cuadrado",
      "caja",
      "rollo",
      "par",
    ]);
  });

  it("has a short form for every unit", () => {
    expect(UNIDADES.map((u) => UNIT_INFO[u].short)).toEqual([
      "u",
      "L",
      "kg",
      "m",
      "m²",
      "caja",
      "rollo",
      "par",
    ]);
  });

  it("formats a quantity with its unit symbol", () => {
    expect(formatUnitQty(12, "litro")).toBe("12 L");
    expect(formatUnitQty(3, "kilogramo")).toBe("3 kg");
    expect(formatUnitQty(25, "metro")).toBe("25 m");
    expect(formatUnitQty(6, "metro_cuadrado")).toBe("6 m²");
    expect(formatUnitQty(1, "unidad")).toBe("1 u");
  });

  it("pluralises word units unless the quantity is exactly one", () => {
    expect(formatUnitQty(1, "caja")).toBe("1 caja");
    expect(formatUnitQty(3, "caja")).toBe("3 cajas");
    expect(formatUnitQty(0, "rollo")).toBe("0 rollos");
    expect(formatUnitQty(1, "par")).toBe("1 par");
    expect(formatUnitQty(4, "par")).toBe("4 pares");
    expect(formatUnitQty("12 / 5", "caja")).toBe("12 / 5 cajas");
  });

  it("never pluralises symbols", () => {
    expect(formatUnitQty(2, "metro_cuadrado")).toBe("2 m²");
    expect(formatUnitQty(10, "unidad")).toBe("10 u");
  });

  it("keeps an already formatted quantity as is", () => {
    expect(formatUnitQty("1.250", "litro")).toBe("1.250 L");
  });

  it("labels a unit by its plural for field labels and input suffixes", () => {
    expect(unitShort("caja")).toBe("cajas");
    expect(unitShort("par")).toBe("pares");
    expect(unitShort("litro")).toBe("L");
  });

  it("falls back to 'u' when the unit is missing or unknown", () => {
    expect(unitShort(null)).toBe("u");
    expect(unitShort(undefined)).toBe("u");
    expect(unitShort("galon")).toBe("u");
    expect(formatUnitQty(4, null)).toBe("4 u");
  });
});
