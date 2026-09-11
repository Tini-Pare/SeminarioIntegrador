jest.mock("../../supabase", () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import {
  createSparePart,
  deleteSparePart,
  listSpareParts,
  stockStatus,
  updateSparePart,
} from "../../queries/spareParts";
import { supabase } from "../../supabase";

describe("stockStatus", () => {
  it("agotado when nothing left", () => {
    expect(stockStatus({ rep_cantidad_actual: 0, rep_stock_minimo: 3 })).toBe("agotado");
  });

  it("bajo when at or below the minimum", () => {
    expect(stockStatus({ rep_cantidad_actual: 3, rep_stock_minimo: 3 })).toBe("bajo");
    expect(stockStatus({ rep_cantidad_actual: 2, rep_stock_minimo: 3 })).toBe("bajo");
  });

  it("ok when above the minimum", () => {
    expect(stockStatus({ rep_cantidad_actual: 4, rep_stock_minimo: 3 })).toBe("ok");
    expect(stockStatus({ rep_cantidad_actual: 1, rep_stock_minimo: 0 })).toBe("ok");
  });
});

describe("listSpareParts", () => {
  it("returns spare parts ordered by name", async () => {
    const order = jest.fn().mockResolvedValue({
      data: [{ rep_id: 1, rep_nombre: "Filtro" }],
      error: null,
    });
    const select = jest.fn().mockReturnValue({ order });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    const result = await listSpareParts();

    expect(supabase.from).toHaveBeenCalledWith("repuestos");
    expect(order).toHaveBeenCalledWith("rep_nombre");
    expect(result).toHaveLength(1);
  });

  it("throws when Supabase returns an error", async () => {
    const order = jest.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const select = jest.fn().mockReturnValue({ order });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    await expect(listSpareParts()).rejects.toThrow("boom");
  });
});

describe("createSparePart", () => {
  it("inserts trimmed name plus stock fields and returns the row", async () => {
    const single = jest.fn().mockResolvedValue({ data: { rep_id: 5 }, error: null });
    const select = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select });
    (supabase.from as jest.Mock).mockReturnValue({ insert });

    await createSparePart({
      name: "  Correa A42  ",
      stockMin: 2,
      stockMax: 10,
      estado: "activo",
      initialQty: 4,
    });

    expect(insert).toHaveBeenCalledWith({
      rep_nombre: "Correa A42",
      rep_cantidad_actual: 4,
      rep_stock_minimo: 2,
      rep_stock_maximo: 10,
      rep_estado: "activo",
    });
  });

  it("maps a 23505 on the name index to the duplicate-name message", async () => {
    const single = jest.fn().mockResolvedValue({
      data: null,
      error: {
        code: "23505",
        message: 'duplicate key value violates unique constraint "repuestos_nombre_unico_idx"',
      },
    });
    const select = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select });
    (supabase.from as jest.Mock).mockReturnValue({ insert });

    await expect(
      createSparePart({
        name: "Repetido",
        stockMin: 0,
        stockMax: null,
        estado: "activo",
        initialQty: 0,
      }),
    ).rejects.toThrow("Ya existe un repuesto con ese nombre");
  });

  it("rethrows a 23505 primary-key collision as-is", async () => {
    const single = jest.fn().mockResolvedValue({
      data: null,
      error: {
        code: "23505",
        message: 'duplicate key value violates unique constraint "repuestos_pkey"',
      },
    });
    const select = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select });
    (supabase.from as jest.Mock).mockReturnValue({ insert });

    await expect(
      createSparePart({
        name: "Nuevo",
        stockMin: 0,
        stockMax: null,
        estado: "activo",
        initialQty: 0,
      }),
    ).rejects.toThrow("repuestos_pkey");
  });
});

describe("updateSparePart", () => {
  it("updates name and stock fields but not the current quantity", async () => {
    const eq = jest.fn().mockResolvedValue({ error: null });
    const update = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ update });

    await updateSparePart(5, { name: " Correa ", stockMin: 1, stockMax: null, estado: "inactivo" });

    expect(update).toHaveBeenCalledWith({
      rep_nombre: "Correa",
      rep_stock_minimo: 1,
      rep_stock_maximo: null,
      rep_estado: "inactivo",
    });
    expect(eq).toHaveBeenCalledWith("rep_id", 5);
  });
});

describe("deleteSparePart", () => {
  it("deletes by id", async () => {
    const eq = jest.fn().mockResolvedValue({ error: null });
    const del = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ delete: del });

    await deleteSparePart(7);

    expect(eq).toHaveBeenCalledWith("rep_id", 7);
  });

  it("maps a 23503 FK violation to a friendly message", async () => {
    const eq = jest.fn().mockResolvedValue({ error: { code: "23503", message: "fk" } });
    const del = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ delete: del });

    await expect(deleteSparePart(7)).rejects.toThrow(/ya figura en una compra/);
  });

  it("rethrows other errors as-is", async () => {
    const eq = jest.fn().mockResolvedValue({ error: { code: "500", message: "server error" } });
    const del = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ delete: del });

    await expect(deleteSparePart(7)).rejects.toThrow("server error");
  });
});
