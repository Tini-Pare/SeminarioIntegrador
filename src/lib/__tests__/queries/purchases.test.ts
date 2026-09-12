jest.mock("../../supabase", () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

import { listPurchases, registrarCompra } from "../../queries/purchases";
import { supabase } from "../../supabase";

describe("listPurchases", () => {
  it("renames each line's embedded `repuestos` to `repuesto`", async () => {
    const secondOrder = jest.fn().mockResolvedValue({
      data: [
        {
          co_id_compra: 1,
          proveedores: { prov_nombre: "ACME" },
          linea_compra: [
            { co_id_compra: 1, rep_id: 7, lc_cantidad: 3, repuestos: { rep_nombre: "Filtro" } },
          ],
        },
      ],
      error: null,
    });
    const firstOrder = jest.fn().mockReturnValue({ order: secondOrder });
    const select = jest.fn().mockReturnValue({ order: firstOrder });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    const result = await listPurchases();

    expect(result[0].linea_compra[0].repuesto).toEqual({ rep_nombre: "Filtro" });
  });

  it("throws when Supabase returns an error", async () => {
    const secondOrder = jest.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const firstOrder = jest.fn().mockReturnValue({ order: secondOrder });
    const select = jest.fn().mockReturnValue({ order: firstOrder });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    await expect(listPurchases()).rejects.toThrow("boom");
  });
});

describe("registrarCompra", () => {
  it("calls the RPC with mapped line payloads and returns the new id", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: 42, error: null });

    const id = await registrarCompra({
      proveedorId: 3,
      nombre: "  Remito 5  ",
      fecha: "2026-09-01",
      garantia: "24",
      lineas: [
        { repId: 7, cantidad: 3, costoUnitario: 120.5 },
        { repId: 8, cantidad: 1, costoUnitario: null },
      ],
      pedidoId: 9,
    });

    expect(supabase.rpc).toHaveBeenCalledWith("registrar_compra", {
      p_prov_id_proveedor: 3,
      p_co_nombre: "Remito 5",
      p_co_fecha_compra: "2026-09-01",
      p_co_garantia: "24",
      p_lineas: [
        { rep_id: 7, cantidad: 3, costo_unitario: 120.5 },
        { rep_id: 8, cantidad: 1, costo_unitario: null },
      ],
      p_ped_id_ped_compra: 9,
    });
    expect(id).toBe(42);
  });

  it("throws when the RPC returns an error", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: "Solo un administrador puede registrar compras" },
    });

    await expect(
      registrarCompra({
        proveedorId: 1,
        nombre: null,
        fecha: null,
        garantia: null,
        lineas: [{ repId: 1, cantidad: 1, costoUnitario: null }],
      }),
    ).rejects.toThrow("Solo un administrador");
  });
});
