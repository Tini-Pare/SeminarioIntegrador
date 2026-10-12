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

describe("validatePurchaseRegistration", () => {
  const validBaseForm = {
    tipoComprobante: "factura" as const,
    letra: "A" as const,
    puntoVenta: "0001",
    numero: "00001111",
    fecha: "24/09/2026",
    proveedorId: 5,
    proveedorCuit: "30-12345678-9",
    lines: [{ repId: 10, cantidad: "2", costo: "1500" }],
  };

  it("returns valid and parsed lines when all required fields are complete", () => {
    const result = validatePurchaseRegistration(validBaseForm);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.parsedLines).toEqual([{ repId: 10, cantidad: 2, costoUnitario: 1500 }]);
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

  it("requires an invoice letter", () => {
    const result = validatePurchaseRegistration({
      ...validBaseForm,
      letra: null,
    });
    expect(result).toEqual({
      valid: false,
      error: "Completá el campo obligatorio.",
    });
  });

  it("requires the selected supplier to have a CUIT", () => {
    expect(validatePurchaseRegistration({ ...validBaseForm, proveedorCuit: null })).toEqual({
      valid: false,
      error: "El proveedor necesita un CUIT cargado para registrar la compra.",
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
      letra: null,
      proveedorId: null,
      proveedorCuit: null,
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

  it("validates tique requires costo unitario", () => {
    const result = validatePurchaseRegistration({
      ...validBaseForm,
      tipoComprobante: "tique",
      lines: [{ repId: 10, cantidad: "5", costo: "" }],
    });
    expect(result).toEqual({
      valid: false,
      error: "Completá el campo obligatorio.",
    });
  });

  it("accepts a remito without a point of sale but with unit costs", () => {
    const result = validatePurchaseRegistration({
      ...validBaseForm,
      tipoComprobante: "remito",
      letra: null,
      puntoVenta: "",
    });
    expect(result.valid).toBe(true);
  });
});
