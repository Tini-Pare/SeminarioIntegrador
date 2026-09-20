jest.mock("../../supabase", () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
    auth: { getSession: jest.fn() },
  },
}));

import {
  createPurchaseOrder,
  listPurchaseOrders,
  resolvePurchaseOrder,
} from "../../queries/purchaseOrders";
import { supabase } from "../../supabase";

const session = { data: { session: { user: { id: "tech-1" } } } };

beforeEach(() => {
  jest.clearAllMocks();
  (supabase.auth.getSession as jest.Mock).mockResolvedValue(session);
});

describe("listPurchaseOrders", () => {
  it("filters by the current user for scope 'mine' and flattens lines", async () => {
    const rows = [
      {
        ped_id_ped_compra: 1,
        p_id_tecnico: "tech-1",
        linea_pedido: [
          { ped_id_ped_compra: 1, rep_id: 7, lp_cantidad: 2, repuestos: { rep_nombre: "Filtro" } },
        ],
      },
    ];
    const eq = jest.fn().mockResolvedValue({ data: rows, error: null });
    const order2 = jest.fn().mockReturnValue({ eq });
    const order1 = jest.fn().mockReturnValue({ order: order2 });
    const select = jest.fn().mockReturnValue({ order: order1 });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    const result = await listPurchaseOrders("mine");

    expect(eq).toHaveBeenCalledWith("p_id_tecnico", "tech-1");
    expect(result[0].linea_pedido[0].repuesto).toEqual({ rep_nombre: "Filtro" });
  });

  it("does not filter by user for scope 'all'", async () => {
    const order2 = jest.fn().mockResolvedValue({ data: [], error: null });
    const order1 = jest.fn().mockReturnValue({ order: order2 });
    const select = jest.fn().mockReturnValue({ order: order1 });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    await listPurchaseOrders("all");

    expect(supabase.auth.getSession).not.toHaveBeenCalled();
  });
});

describe("createPurchaseOrder", () => {
  it("inserts the pedido then its numbered lines", async () => {
    const single = jest.fn().mockResolvedValue({ data: { ped_id_ped_compra: 12 }, error: null });
    const selectPedido = jest.fn().mockReturnValue({ single });
    const insertPedido = jest.fn().mockReturnValue({ select: selectPedido });
    const insertLines = jest.fn().mockResolvedValue({ error: null });

    (supabase.from as jest.Mock).mockImplementation((table: string) =>
      table === "pedido_compra" ? { insert: insertPedido } : { insert: insertLines },
    );

    await createPurchaseOrder({
      observacion: "  urgente  ",
      lineas: [
        { repId: 7, cantidad: 2 },
        { repId: 8, cantidad: 1 },
      ],
    });

    expect(insertPedido).toHaveBeenCalledWith({
      p_id_tecnico: "tech-1",
      ped_observacion: "urgente",
    });
    expect(insertLines).toHaveBeenCalledWith([
      { ped_id_ped_compra: 12, rep_id: 7, lp_nro_linea: 1, lp_cantidad: 2 },
      { ped_id_ped_compra: 12, rep_id: 8, lp_nro_linea: 2, lp_cantidad: 1 },
    ]);
  });

  it("rolls back the pedido when the line insert fails", async () => {
    const single = jest.fn().mockResolvedValue({ data: { ped_id_ped_compra: 12 }, error: null });
    const selectPedido = jest.fn().mockReturnValue({ single });
    const insertPedido = jest.fn().mockReturnValue({ select: selectPedido });
    const insertLines = jest.fn().mockResolvedValue({ error: { message: "line boom" } });
    const eqDelete = jest.fn().mockResolvedValue({ error: null });
    const del = jest.fn().mockReturnValue({ eq: eqDelete });

    (supabase.from as jest.Mock).mockImplementation((table: string) =>
      table === "pedido_compra" ? { insert: insertPedido, delete: del } : { insert: insertLines },
    );

    await expect(
      createPurchaseOrder({ observacion: null, lineas: [{ repId: 7, cantidad: 2 }] }),
    ).rejects.toThrow("line boom");
    expect(eqDelete).toHaveBeenCalledWith("ped_id_ped_compra", 12);
  });

  it("rejects an empty pedido before touching Supabase", async () => {
    await expect(createPurchaseOrder({ observacion: null, lineas: [] })).rejects.toThrow(
      /al menos un repuesto/,
    );
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe("resolvePurchaseOrder", () => {
  it("calls the RPC with the estado and trimmed motivo", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ error: null });

    await resolvePurchaseOrder(5, "rechazado", "  sin presupuesto  ");

    expect(supabase.rpc).toHaveBeenCalledWith("resolver_pedido_compra", {
      p_ped_id: 5,
      p_estado: "rechazado",
      p_motivo: "sin presupuesto",
    });
  });

  it("sends a null motivo when none is given", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ error: null });

    await resolvePurchaseOrder(5, "aprobado");

    expect(supabase.rpc).toHaveBeenCalledWith("resolver_pedido_compra", {
      p_ped_id: 5,
      p_estado: "aprobado",
      p_motivo: null,
    });
  });

  it("throws when the RPC returns an error", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ error: { message: "nope" } });

    await expect(resolvePurchaseOrder(5, "aprobado")).rejects.toThrow("nope");
  });
});
