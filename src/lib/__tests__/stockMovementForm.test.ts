import {
  STOCK_MOVEMENT_REASONS,
  validateStockMovement,
  type StockMovementFormInput,
} from "../../app/(app)/stock-movements/register";

const valid: StockMovementFormInput = {
  tipo: "egreso",
  repId: 4,
  cantidad: "3",
  motivo: "Pérdida",
  comentario: "",
  stockActual: 10,
  unidad: "litro",
};

describe("validateStockMovement", () => {
  it("accepts a complete form and parses the quantity", () => {
    expect(validateStockMovement(valid)).toEqual({
      valid: true,
      parsed: { tipo: "egreso", repId: 4, cantidad: 3, motivo: "Pérdida", comentario: null },
    });
  });

  it("asks for the one missing field", () => {
    expect(validateStockMovement({ ...valid, motivo: null })).toEqual({
      valid: false,
      error: "Completá el campo obligatorio.",
    });
  });

  it("asks for several missing fields", () => {
    expect(validateStockMovement({ ...valid, tipo: null, repId: null, cantidad: "" })).toEqual({
      valid: false,
      error: "Completá los campos obligatorios.",
    });
  });

  it.each(["0", "-2", "1.5", "abc"])("rejects %s as a quantity", (cantidad) => {
    expect(validateStockMovement({ ...valid, cantidad }).valid).toBe(false);
  });

  it('requires the detail when the reason is "Otro" and keeps it trimmed', () => {
    expect(validateStockMovement({ ...valid, motivo: "Otro", comentario: "  " }).valid).toBe(false);

    const result = validateStockMovement({ ...valid, motivo: "Otro", comentario: " Robo " });
    expect(result.valid && result.parsed.comentario).toBe("Robo");
  });

  it("rejects an egreso bigger than the stock on hand", () => {
    expect(validateStockMovement({ ...valid, cantidad: "11" })).toEqual({
      valid: false,
      error: "No hay stock suficiente: hay 10 L y se quieren sacar 11 L.",
    });
  });

  it("lets an egreso take the whole stock, and an ingreso any amount", () => {
    expect(validateStockMovement({ ...valid, cantidad: "10" }).valid).toBe(true);
    expect(
      validateStockMovement({
        ...valid,
        tipo: "ingreso",
        motivo: "Compra por fuera del sistema",
        cantidad: "50",
      }).valid,
    ).toBe(true);
  });
});

describe("STOCK_MOVEMENT_REASONS", () => {
  it('ends both lists with "Otro"', () => {
    expect(STOCK_MOVEMENT_REASONS.ingreso.at(-1)?.value).toBe("Otro");
    expect(STOCK_MOVEMENT_REASONS.egreso.at(-1)?.value).toBe("Otro");
  });
});
