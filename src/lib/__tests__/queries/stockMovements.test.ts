jest.mock("../../supabase", () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

import { listStockMovements, registrarMovimientoStock } from "../../queries/stockMovements";
import { supabase } from "../../supabase";

describe("listStockMovements", () => {
  it("lists newest first and unwraps the repuesto's name and unit", async () => {
    const secondOrder = jest.fn().mockResolvedValue({
      data: [
        {
          ms_id: 2,
          rep_id: 3,
          ms_tipo: "egreso",
          repuestos: { rep_nombre: "Aceite", rep_unidad: "litro" },
        },
      ],
      error: null,
    });
    const order = jest.fn().mockReturnValue({ order: secondOrder });
    const select = jest.fn().mockReturnValue({ order });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    const result = await listStockMovements();

    expect(supabase.from).toHaveBeenCalledWith("movimiento_stock");
    expect(select).toHaveBeenCalledWith("*, repuestos(rep_nombre, rep_unidad)");
    expect(order).toHaveBeenCalledWith("ms_creado_en", { ascending: false });
    expect(secondOrder).toHaveBeenCalledWith("ms_id", { ascending: false });
    expect(result).toEqual([
      {
        ms_id: 2,
        rep_id: 3,
        ms_tipo: "egreso",
        repuesto: { rep_nombre: "Aceite", rep_unidad: "litro" },
      },
    ]);
  });

  it("throws when Supabase returns an error", async () => {
    const secondOrder = jest.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const order = jest.fn().mockReturnValue({ order: secondOrder });
    const select = jest.fn().mockReturnValue({ order });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    await expect(listStockMovements()).rejects.toThrow("boom");
  });
});

describe("registrarMovimientoStock", () => {
  it("calls the RPC with trimmed motivo and comentario", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: 9, error: null });

    const id = await registrarMovimientoStock({
      repId: 3,
      tipo: "egreso",
      cantidad: 2,
      motivo: " Otro ",
      comentario: "  Se cayó del estante ",
    });

    expect(id).toBe(9);
    expect(supabase.rpc).toHaveBeenCalledWith("registrar_movimiento_stock", {
      p_rep_id: 3,
      p_tipo: "egreso",
      p_cantidad: 2,
      p_motivo: "Otro",
      p_comentario: "Se cayó del estante",
    });
  });

  it("sends a null comentario when there is none", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: 10, error: null });

    await registrarMovimientoStock({ repId: 1, tipo: "ingreso", cantidad: 5, motivo: "Pérdida" });

    expect(supabase.rpc).toHaveBeenCalledWith(
      "registrar_movimiento_stock",
      expect.objectContaining({ p_comentario: null }),
    );
  });

  it("throws the RPC's message, e.g. not enough stock", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: "No hay stock suficiente: hay 1 y se quieren sacar 4" },
    });

    await expect(
      registrarMovimientoStock({ repId: 1, tipo: "egreso", cantidad: 4, motivo: "Pérdida" }),
    ).rejects.toThrow(/No hay stock suficiente/);
  });
});
