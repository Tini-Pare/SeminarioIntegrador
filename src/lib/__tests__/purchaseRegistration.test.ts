import { validatePurchaseRegistration } from "../../app/(app)/purchases/register";

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
    letra: "A" as const,
    puntoVenta: "0001",
    numero: "00001111",
    fecha: "24/09/2026",
    proveedorId: 5,
    proveedorCuit: "20-22725470-0",
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
      letra: null,
      puntoVenta: "",
      numero: "",
      fecha: "24/09/2026",
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

  it("requires the letra (A/B/C) for a factura", () => {
    const result = validatePurchaseRegistration({ ...validBaseForm, letra: null });
    expect(result).toEqual({
      valid: false,
      error: "Completá el campo obligatorio.",
    });
  });

  it("doesn't ask for a letra on a tique", () => {
    const result = validatePurchaseRegistration({
      ...validBaseForm,
      tipoComprobante: "tique",
      letra: null,
    });
    expect(result.valid).toBe(true);
  });

  it("blocks a supplier with no CUIT loaded", () => {
    const result = validatePurchaseRegistration({ ...validBaseForm, proveedorCuit: null });
    expect(result).toEqual({
      valid: false,
      error:
        "El proveedor elegido no tiene CUIT. Cargalo en Proveedores antes de registrar la compra.",
    });
    expect(validatePurchaseRegistration({ ...validBaseForm, proveedorCuit: "  " }).valid).toBe(
      false,
    );
  });
});
