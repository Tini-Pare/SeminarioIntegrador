import { UNIDADES, UNIT_INFO, formatUnitQty, unitShort } from "../units";

describe("repuesto units", () => {
  it("is the closed list the migration's check constraint allows", () => {
    expect(UNIDADES).toEqual(["unidad", "litro", "kilogramo", "metro"]);
  });

  it("has a short symbol for every unit", () => {
    expect(UNIDADES.map((u) => UNIT_INFO[u].short)).toEqual(["u", "L", "kg", "m"]);
  });

  it("formats a quantity with its unit symbol", () => {
    expect(formatUnitQty(12, "litro")).toBe("12 L");
    expect(formatUnitQty(3, "kilogramo")).toBe("3 kg");
    expect(formatUnitQty(25, "metro")).toBe("25 m");
    expect(formatUnitQty(1, "unidad")).toBe("1 u");
  });

  it("keeps an already formatted quantity as is", () => {
    expect(formatUnitQty("1.250", "litro")).toBe("1.250 L");
  });

  it("falls back to 'u' when the unit is missing or unknown", () => {
    expect(unitShort(null)).toBe("u");
    expect(unitShort(undefined)).toBe("u");
    expect(unitShort("galon")).toBe("u");
    expect(formatUnitQty(4, null)).toBe("4 u");
  });
});
