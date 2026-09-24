import { formatGarantia } from "../../components/PurchaseDetailModal";
import { validatePurchaseRegistration } from "../../app/(app)/purchases/register";

describe("formatGarantia", () => {
  it("formats positive numeric months with plural 'meses'", () => {
    expect(formatGarantia("24")).toBe("24 meses");
    expect(formatGarantia("6")).toBe("6 meses");
    expect(formatGarantia("12")).toBe("12 meses");
  });

  it("formats 1 month with singular 'mes'", () => {
    expect(formatGarantia("1")).toBe("1 mes");
  });

  it("handles whitespace around numeric values", () => {
    expect(formatGarantia("  18  ")).toBe("18 meses");
  });

  it("returns empty string for null, undefined, or blank values", () => {
    expect(formatGarantia(null)).toBe("");
    expect(formatGarantia(undefined)).toBe("");
    expect(formatGarantia("")).toBe("");
    expect(formatGarantia("   ")).toBe("");
  });

  it("preserves non-numeric strings for backward compatibility", () => {
    expect(formatGarantia("1 año")).toBe("1 año");
    expect(formatGarantia("Garantía de fábrica")).toBe("Garantía de fábrica");
  });
});

describe("Warranty validation rules", () => {
  function validateWarranty(val: string): { valid: boolean; error?: string } {
    const trimmed = val.trim();
    const num = Number(trimmed);
    if (!trimmed || !Number.isInteger(num) || num <= 0) {
      return { valid: false, error: "Ingresá la garantía en meses." };
    }
    return { valid: true };
  }

  it("accepts positive integer months", () => {
    expect(validateWarranty("1")).toEqual({ valid: true });
    expect(validateWarranty("12")).toEqual({ valid: true });
    expect(validateWarranty("24")).toEqual({ valid: true });
    expect(validateWarranty("36")).toEqual({ valid: true });
  });

  it("rejects empty or whitespace-only values", () => {
    expect(validateWarranty("")).toEqual({
      valid: false,
      error: "Ingresá la garantía en meses.",
    });
    expect(validateWarranty("   ")).toEqual({
      valid: false,
      error: "Ingresá la garantía en meses.",
    });
  });

  it("rejects 0 or negative numbers", () => {
    expect(validateWarranty("0")).toEqual({
      valid: false,
      error: "Ingresá la garantía en meses.",
    });
    expect(validateWarranty("-5")).toEqual({
      valid: false,
      error: "Ingresá la garantía en meses.",
    });
  });

  it("rejects decimals and non-numeric inputs", () => {
    expect(validateWarranty("12.5")).toEqual({
      valid: false,
      error: "Ingresá la garantía en meses.",
    });
    expect(validateWarranty("abc")).toEqual({
      valid: false,
      error: "Ingresá la garantía en meses.",
    });
  });
});

describe("PurchaseModal lines LIFO behavior", () => {
  type LineDraft = { key: string; repId: number | null; cantidad: string; costo: string };

  it("prepends new lines to the list in LIFO order", () => {
    let list: LineDraft[] = [{ key: "l0", repId: 1, cantidad: "5", costo: "100" }];

    // Add a new line
    const newLine1: LineDraft = { key: "l1", repId: 2, cantidad: "10", costo: "50" };
    list = [newLine1, ...list];

    expect(list).toHaveLength(2);
    expect(list[0].key).toBe("l1");
    expect(list[1].key).toBe("l0");

    // Add another new line
    const newLine2: LineDraft = { key: "l2", repId: 3, cantidad: "1", costo: "20" };
    list = [newLine2, ...list];

    expect(list).toHaveLength(3);
    expect(list[0].key).toBe("l2");
    expect(list[1].key).toBe("l1");
    expect(list[2].key).toBe("l0");
  });

  it("removes target line without altering order of others", () => {
    let list: LineDraft[] = [
      { key: "l2", repId: 3, cantidad: "1", costo: "20" },
      { key: "l1", repId: 2, cantidad: "10", costo: "50" },
      { key: "l0", repId: 1, cantidad: "5", costo: "100" },
    ];

    list = list.filter((l) => l.key !== "l1");

    expect(list).toHaveLength(2);
    expect(list[0].key).toBe("l2");
    expect(list[1].key).toBe("l0");
  });
});

describe("validatePurchaseRegistration", () => {
  const validBaseForm = {
    tipoComprobante: "factura" as const,
    puntoVenta: "0001",
    numero: "00001111",
    fecha: "24/09/2026",
    garantia: "12",
    proveedorId: 5,
    lines: [{ repId: 10, cantidad: "2", costo: "1500" }],
  };

  it("returns valid and parsed lines when all required fields are complete", () => {
    const result = validatePurchaseRegistration(validBaseForm);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.parsedLines).toEqual([
        { repId: 10, cantidad: 2, costoUnitario: 1500 },
      ]);
    }
  });

  it("returns singular 'Completá el campo obligatorio.' when only puntoVenta is missing", () => {
    const result = validatePurchaseRegistration({
      ...validBaseForm,
      puntoVenta: "",
    });
    expect(result).toEqual({
      valid: false,
      error: "Completá el campo obligatorio.",
    });
  });

  it("returns singular 'Completá el campo obligatorio.' when only numero is missing", () => {
    const result = validatePurchaseRegistration({
      ...validBaseForm,
      numero: "  ",
    });
    expect(result).toEqual({
      valid: false,
      error: "Completá el campo obligatorio.",
    });
  });

  it("returns singular 'Completá el campo obligatorio.' when only fecha is invalid", () => {
    const result = validatePurchaseRegistration({
      ...validBaseForm,
      fecha: "invalid-date",
    });
    expect(result).toEqual({
      valid: false,
      error: "Completá el campo obligatorio.",
    });
  });

  it("returns singular 'Completá el campo obligatorio.' when only garantia is missing", () => {
    const result = validatePurchaseRegistration({
      ...validBaseForm,
      garantia: "",
    });
    expect(result).toEqual({
      valid: false,
      error: "Completá el campo obligatorio.",
    });
  });

  it("returns singular 'Completá el campo obligatorio.' when only proveedor is missing", () => {
    const result = validatePurchaseRegistration({
      ...validBaseForm,
      proveedorId: null,
    });
    expect(result).toEqual({
      valid: false,
      error: "Completá el campo obligatorio.",
    });
  });

  it("returns singular 'Completá el campo obligatorio.' when only repuesto is missing on line", () => {
    const result = validatePurchaseRegistration({
      ...validBaseForm,
      lines: [{ repId: null, cantidad: "2", costo: "1500" }],
    });
    expect(result).toEqual({
      valid: false,
      error: "Completá el campo obligatorio.",
    });
  });

  it("returns singular 'Completá el campo obligatorio.' when only cantidad is missing on line", () => {
    const result = validatePurchaseRegistration({
      ...validBaseForm,
      lines: [{ repId: 10, cantidad: "", costo: "1500" }],
    });
    expect(result).toEqual({
      valid: false,
      error: "Completá el campo obligatorio.",
    });
  });

  it("returns singular 'Completá el campo obligatorio.' when only costo is missing on factura line", () => {
    const result = validatePurchaseRegistration({
      ...validBaseForm,
      lines: [{ repId: 10, cantidad: "2", costo: "" }],
    });
    expect(result).toEqual({
      valid: false,
      error: "Completá el campo obligatorio.",
    });
  });

  it("returns plural 'Completá los campos obligatorios.' when multiple fields are missing", () => {
    const result = validatePurchaseRegistration({
      tipoComprobante: "factura",
      puntoVenta: "",
      numero: "",
      fecha: "24/09/2026",
      garantia: "",
      proveedorId: null,
      lines: [{ repId: null, cantidad: "", costo: "" }],
    });
    expect(result).toEqual({
      valid: false,
      error: "Completá los campos obligatorios.",
    });
  });

  it("returns error on duplicate spare parts across lines when all fields are filled", () => {
    const result = validatePurchaseRegistration({
      ...validBaseForm,
      lines: [
        { repId: 10, cantidad: "2", costo: "1500" },
        { repId: 10, cantidad: "3", costo: "1500" },
      ],
    });
    expect(result).toEqual({
      valid: false,
      error: "Hay un repuesto repetido en dos líneas. Sumá las cantidades en una sola.",
    });
  });

  it("allows remito without costo unitario", () => {
    const result = validatePurchaseRegistration({
      ...validBaseForm,
      tipoComprobante: "remito",
      lines: [{ repId: 10, cantidad: "5", costo: "" }],
    });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.parsedLines).toEqual([
        { repId: 10, cantidad: 5, costoUnitario: null },
      ]);
    }
  });
});
