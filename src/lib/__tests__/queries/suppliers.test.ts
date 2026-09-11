jest.mock("../../supabase", () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import {
  createSupplier,
  deleteSupplier,
  listSuppliers,
  listTiposProveedores,
  updateSupplier,
} from "../../queries/suppliers";
import { supabase } from "../../supabase";

beforeEach(() => jest.clearAllMocks());

describe("listSuppliers", () => {
  it("flattens the embedded rubro name", async () => {
    const order = jest.fn().mockResolvedValue({
      data: [
        {
          prov_id_proveedor: 1,
          prov_nombre: "ACME",
          tipos_proveedores: { tp_nombre_rubro: "Refrigeración" },
        },
        { prov_id_proveedor: 2, prov_nombre: "Beta", tipos_proveedores: null },
      ],
      error: null,
    });
    const select = jest.fn().mockReturnValue({ order });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    const result = await listSuppliers();

    expect(result[0].rubro).toBe("Refrigeración");
    expect(result[1].rubro).toBeNull();
  });
});

describe("listTiposProveedores", () => {
  it("returns the rubro catalog ordered by name", async () => {
    const order = jest.fn().mockResolvedValue({
      data: [
        { tp_id: 2, tp_nombre_rubro: "Electricidad", tp_descripcion: null },
        { tp_id: 1, tp_nombre_rubro: "Refrigeración", tp_descripcion: null },
      ],
      error: null,
    });
    const select = jest.fn().mockReturnValue({ order });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    const result = await listTiposProveedores();

    expect(supabase.from).toHaveBeenCalledWith("tipos_proveedores");
    expect(order).toHaveBeenCalledWith("tp_nombre_rubro");
    expect(result).toHaveLength(2);
  });
});

describe("createSupplier", () => {
  it("inserts the supplier with the chosen tp_id, trimming text fields", async () => {
    const insert = jest.fn().mockResolvedValue({ error: null });
    (supabase.from as jest.Mock).mockReturnValue({ insert });

    await createSupplier({
      name: "  ACME  ",
      phone: " 123 ",
      email: " a@b.com ",
      tpId: 9,
    });

    expect(supabase.from).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith({
      prov_nombre: "ACME",
      prov_telefono: "123",
      prov_correo: "a@b.com",
      tp_id: 9,
    });
  });

  it("maps a 23505 on the name index to the duplicate-name message", async () => {
    const insert = jest.fn().mockResolvedValue({
      error: {
        code: "23505",
        message: 'duplicate key value violates unique constraint "proveedores_nombre_unico_idx"',
      },
    });
    (supabase.from as jest.Mock).mockReturnValue({ insert });

    await expect(
      createSupplier({ name: "ACME", phone: null, email: null, tpId: 1 }),
    ).rejects.toThrow("Ya existe un proveedor con ese nombre");
  });

  it("maps a 23503 on tp_id to a stale-rubro message", async () => {
    const insert = jest.fn().mockResolvedValue({
      error: {
        code: "23503",
        message:
          'insert or update on table "proveedores" violates foreign key constraint "proveedores_tp_id_fkey"',
      },
    });
    (supabase.from as jest.Mock).mockReturnValue({ insert });

    await expect(
      createSupplier({ name: "ACME", phone: null, email: null, tpId: 999 }),
    ).rejects.toThrow(/rubro seleccionado ya no existe/);
  });
});

describe("updateSupplier", () => {
  it("updates by id with the chosen tp_id", async () => {
    const eq = jest.fn().mockResolvedValue({ error: null });
    const update = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ update });

    await updateSupplier(2, { name: "ACME", phone: null, email: null, tpId: 3 });

    expect(update).toHaveBeenCalledWith({
      prov_nombre: "ACME",
      prov_telefono: null,
      prov_correo: null,
      tp_id: 3,
    });
    expect(eq).toHaveBeenCalledWith("prov_id_proveedor", 2);
  });
});

describe("deleteSupplier", () => {
  it("maps a 23503 FK violation to a friendly message", async () => {
    const eq = jest.fn().mockResolvedValue({ error: { code: "23503", message: "fk" } });
    const del = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ delete: del });

    await expect(deleteSupplier(2)).rejects.toThrow(/tiene compras registradas/);
  });
});
