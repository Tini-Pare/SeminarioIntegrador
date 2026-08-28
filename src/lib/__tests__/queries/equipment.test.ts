jest.mock("../../supabase", () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import {
  createEquipment,
  getEquipmentById,
  listEquipment,
  updateEquipment,
} from "../../queries/equipment";
import { supabase } from "../../supabase";

describe("listEquipment", () => {
  it("returns equipo ordered by lugar name then codigo, mapped to the flat Equipo shape", async () => {
    const orderByCode = jest.fn().mockResolvedValue({
      data: [
        {
          eq_id_equipo: 1,
          te_id: 2,
          lu_codigo: 3,
          eq_codigo: "AC-014",
          eq_nombre: "Aire Acondicionado",
          eq_activo: true,
          eq_estado: "operational",
          eq_modelo: "M-100",
          eq_fecha_garantia: "2027-01-15",
          eq_fecha_instalacion: "2026-01-15",
          eq_fecha_compra: "2026-01-10",
          lugares: { lu_codigo: 3, lu_nombre_sector: "Planta A", lu_piso: "1" },
          tipos_de_equipos: { te_nombre: "Climatización" },
        },
      ],
      error: null,
    });
    const orderByLugar = jest.fn().mockReturnValue({ order: orderByCode });
    const select = jest.fn().mockReturnValue({ order: orderByLugar });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    const result = await listEquipment();

    expect(supabase.from).toHaveBeenCalledWith("equipo");
    expect(select).toHaveBeenCalledWith("*, lugares(*), tipos_de_equipos(*)");
    expect(orderByLugar).toHaveBeenCalledWith("lu_nombre_sector", { referencedTable: "lugares" });
    expect(orderByCode).toHaveBeenCalledWith("eq_codigo");
    expect(result).toEqual([
      {
        id: 1,
        code: "AC-014",
        name: "Aire Acondicionado",
        typeId: 2,
        locationId: 3,
        active: true,
        type: "Climatización",
        location: "Planta A",
        status: "operational",
        model: "M-100",
        warrantyDate: "2027-01-15",
        installationDate: "2026-01-15",
        purchaseDate: "2026-01-10",
      },
    ]);
  });

  it("throws when Supabase returns an error", async () => {
    const orderByCode = jest.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const orderByLugar = jest.fn().mockReturnValue({ order: orderByCode });
    const select = jest.fn().mockReturnValue({ order: orderByLugar });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    await expect(listEquipment()).rejects.toThrow("boom");
  });
});

describe("getEquipmentById", () => {
  it("returns a single equipo row by id, mapped to the flat Equipo shape", async () => {
    const single = jest.fn().mockResolvedValue({
      data: {
        eq_id_equipo: 1,
        te_id: 2,
        lu_codigo: 3,
        eq_codigo: "AC-014",
        eq_nombre: "Aire Acondicionado",
        eq_activo: true,
        eq_estado: "operational",
        eq_modelo: null,
        eq_fecha_garantia: null,
        eq_fecha_instalacion: null,
        eq_fecha_compra: null,
        lugares: { lu_codigo: 3, lu_nombre_sector: "Planta A", lu_piso: "1" },
        tipos_de_equipos: { te_nombre: "Climatización" },
      },
      error: null,
    });
    const eq = jest.fn().mockReturnValue({ single });
    const select = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    const result = await getEquipmentById(1);

    expect(eq).toHaveBeenCalledWith("eq_id_equipo", 1);
    expect(result).toEqual({
      id: 1,
      code: "AC-014",
      name: "Aire Acondicionado",
      typeId: 2,
      locationId: 3,
      active: true,
      type: "Climatización",
      location: "Planta A",
      status: "operational",
      model: null,
      warrantyDate: null,
      installationDate: null,
      purchaseDate: null,
    });
  });

  it("returns null when not found", async () => {
    const single = jest
      .fn()
      .mockResolvedValue({ data: null, error: { message: "no rows", code: "PGRST116" } });
    const eq = jest.fn().mockReturnValue({ single });
    const select = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    const result = await getEquipmentById(999);

    expect(result).toBeNull();
  });
});

describe("equipment writes", () => {
  it("creates equipment with FK ids and separate dates", async () => {
    const single = jest.fn().mockResolvedValue({
      data: {
        eq_id_equipo: 5,
        te_id: 2,
        lu_codigo: 3,
        eq_codigo: "AC-015",
        eq_nombre: "Aire Acondicionado",
        eq_activo: true,
        eq_estado: "operational",
        eq_modelo: "M-200",
        eq_fecha_garantia: "2028-01-01",
        eq_fecha_instalacion: "2026-02-01",
        eq_fecha_compra: "2026-01-01",
        lugares: { lu_nombre_sector: "Planta A" },
        tipos_de_equipos: { te_nombre: "Climatización" },
      },
      error: null,
    });
    const select = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select });
    (supabase.from as jest.Mock).mockReturnValue({ insert });

    await createEquipment({
      code: "AC-015",
      name: "Aire Acondicionado",
      typeId: 2,
      locationId: 3,
      model: "M-200",
      warrantyDate: "2028-01-01",
      installationDate: "2026-02-01",
      purchaseDate: "2026-01-01",
    });

    expect(insert).toHaveBeenCalledWith({
      eq_codigo: "AC-015",
      eq_nombre: "Aire Acondicionado",
      te_id: 2,
      lu_codigo: 3,
      eq_modelo: "M-200",
      eq_fecha_garantia: "2028-01-01",
      eq_fecha_instalacion: "2026-02-01",
      eq_fecha_compra: "2026-01-01",
    });
  });

  it("updates equipment FKs and dates without creating catalog rows", async () => {
    const eq = jest.fn().mockResolvedValue({ error: null });
    const update = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ update });

    await updateEquipment(5, {
      code: "AC-015",
      name: "Aire Acondicionado",
      typeId: 4,
      locationId: 8,
      model: null,
      warrantyDate: null,
      installationDate: "2026-03-01",
      purchaseDate: "2026-02-15",
    });

    expect(update).toHaveBeenCalledWith({
      eq_codigo: "AC-015",
      eq_nombre: "Aire Acondicionado",
      te_id: 4,
      lu_codigo: 8,
      eq_modelo: null,
      eq_fecha_garantia: null,
      eq_fecha_instalacion: "2026-03-01",
      eq_fecha_compra: "2026-02-15",
    });
    expect(eq).toHaveBeenCalledWith("eq_id_equipo", 5);
  });
});
