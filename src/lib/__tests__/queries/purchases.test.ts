jest.mock("../../supabase", () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

import {
  anularRemitoCompra,
  editarRemitoCompra,
  listPurchases,
  registrarCompra,
  registrarRemitoCompra,
} from "../../queries/purchases";
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
          remito_compra: [],
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

  it("unwraps each remito's embedded `remito_compra_linea` as `lineas`", async () => {
    const secondOrder = jest.fn().mockResolvedValue({
      data: [
        {
          co_id_compra: 1,
          proveedores: { prov_nombre: "ACME" },
          linea_compra: [],
          remito_compra: [
            {
              rc_id: 5,
              co_id_compra: 1,
              rc_fecha: "2026-09-01",
              remito_compra_linea: [{ rc_id: 5, co_id_compra: 1, rep_id: 7, rcl_cantidad: 2 }],
            },
          ],
        },
      ],
      error: null,
    });
    const firstOrder = jest.fn().mockReturnValue({ order: secondOrder });
    const select = jest.fn().mockReturnValue({ order: firstOrder });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    const result = await listPurchases();

    expect(result[0].remitos[0].lineas).toEqual([
      { rc_id: 5, co_id_compra: 1, rep_id: 7, rcl_cantidad: 2 },
    ]);
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
      tipoComprobante: "factura",
      puntoVenta: "0002",
      proveedorId: 3,
      nombre: "  Remito 5  ",
      fecha: "2026-09-01",
      garantia: "24",
      lineas: [
        { repId: 7, cantidad: 3, costoUnitario: 120.5 },
        { repId: 8, cantidad: 1, costoUnitario: 900 },
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
        { rep_id: 8, cantidad: 1, costo_unitario: 900 },
      ],
      p_ped_id_ped_compra: 9,
      p_co_tipo_comprobante: "factura",
      p_co_punto_venta: "0002",
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
        tipoComprobante: "remito",
        puntoVenta: null,
        proveedorId: 1,
        nombre: null,
        fecha: null,
        garantia: null,
        lineas: [{ repId: 1, cantidad: 1, costoUnitario: null }],
      }),
    ).rejects.toThrow("Solo un administrador");
  });
});

describe("registrarRemitoCompra", () => {
  it("calls the RPC with mapped line payloads and returns the new remito id", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: 5, error: null });

    const id = await registrarRemitoCompra(1, "2026-09-10", [
      { repId: 7, cantidad: 2 },
      { repId: 8, cantidad: 1 },
    ]);

    expect(supabase.rpc).toHaveBeenCalledWith("registrar_remito_compra", {
      p_co_id_compra: 1,
      p_fecha: "2026-09-10",
      p_lineas: [
        { rep_id: 7, cantidad: 2 },
        { rep_id: 8, cantidad: 1 },
      ],
    });
    expect(id).toBe(5);
  });

  it("throws when the RPC returns an error", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: "La cantidad recibida del repuesto 7 supera lo facturado" },
    });

    await expect(
      registrarRemitoCompra(1, "2026-09-10", [{ repId: 7, cantidad: 99 }]),
    ).rejects.toThrow("supera lo facturado");
  });
});

describe("editarRemitoCompra", () => {
  it("calls the RPC with the remito id, fecha, and mapped lines", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: null });

    await editarRemitoCompra(5, "2026-09-11", [{ repId: 7, cantidad: 3 }]);

    expect(supabase.rpc).toHaveBeenCalledWith("editar_remito_compra", {
      p_rc_id: 5,
      p_fecha: "2026-09-11",
      p_lineas: [{ rep_id: 7, cantidad: 3 }],
    });
  });

  it("throws when the RPC returns an error", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: { message: "boom" } });

    await expect(editarRemitoCompra(5, "2026-09-11", [{ repId: 7, cantidad: 3 }])).rejects.toThrow(
      "boom",
    );
  });
});

describe("anularRemitoCompra", () => {
  it("calls the RPC with the remito id", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: null });

    await anularRemitoCompra(5);

    expect(supabase.rpc).toHaveBeenCalledWith("anular_remito_compra", { p_rc_id: 5 });
  });

  it("throws when the RPC returns an error", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: { message: "boom" } });

    await expect(anularRemitoCompra(5)).rejects.toThrow("boom");
  });
});
