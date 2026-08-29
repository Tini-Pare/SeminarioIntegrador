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
          te_id: 7,
          lu_codigo: 3,
          eq_codigo: "AC-014",
          eq_nombre: "Aire Acondicionado",
          eq_estado: "operational",
          eq_modelo: "Split 3000F",
          eq_fecha_instalacion: "2026-01-15",
          eq_fecha_garantia: "2028-01-15",
          lugares: { lu_nombre_sector: "Planta A" },
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
        type: "Climatización",
        typeId: 7,
        location: "Planta A",
        locationId: 3,
        status: "operational",
        model: "Split 3000F",
        installDate: "2026-01-15",
        warrantyDate: "2028-01-15",
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
        te_id: 7,
        lu_codigo: 3,
        eq_codigo: "AC-014",
        eq_nombre: "Aire Acondicionado",
        eq_estado: "operational",
        eq_modelo: null,
        eq_fecha_instalacion: null,
        eq_fecha_garantia: null,
        lugares: { lu_nombre_sector: "Planta A" },
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
      type: "Climatización",
      typeId: 7,
      location: "Planta A",
      locationId: 3,
      status: "operational",
      model: null,
      installDate: null,
      warrantyDate: null,
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

describe("createEquipment", () => {
  it("inserts te_id/lu_codigo directly from the given ids", async () => {
    const single = jest.fn().mockResolvedValue({
      data: {
        eq_id_equipo: 5,
        te_id: 7,
        lu_codigo: 3,
        eq_codigo: "AC-015",
        eq_nombre: "AA Sala",
        eq_estado: "operational",
        eq_modelo: "Split 3000F",
        eq_fecha_instalacion: "2026-02-01",
        eq_fecha_garantia: "2028-02-01",
        lugares: { lu_nombre_sector: "Planta A" },
        tipos_de_equipos: { te_nombre: "Climatización" },
      },
      error: null,
    });
    const select = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select });
    (supabase.from as jest.Mock).mockReturnValue({ insert });

    const result = await createEquipment({
      code: "AC-015",
      name: "AA Sala",
      typeId: 7,
      locationId: 3,
      model: "Split 3000F",
      installDate: "2026-02-01",
      warrantyDate: "2028-02-01",
    });

    expect(supabase.from).toHaveBeenCalledWith("equipo");
    expect(insert).toHaveBeenCalledWith({
      eq_codigo: "AC-015",
      eq_nombre: "AA Sala",
      te_id: 7,
      lu_codigo: 3,
      eq_modelo: "Split 3000F",
      eq_fecha_instalacion: "2026-02-01",
      eq_fecha_garantia: "2028-02-01",
    });
    expect(result.id).toBe(5);
    expect(result.typeId).toBe(7);
    expect(result.locationId).toBe(3);
  });

  it("throws when Supabase returns an error", async () => {
    const single = jest.fn().mockResolvedValue({ data: null, error: { message: "insert failed" } });
    const select = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select });
    (supabase.from as jest.Mock).mockReturnValue({ insert });

    await expect(
      createEquipment({
        code: "X",
        name: "Y",
        typeId: 1,
        locationId: 1,
        model: null,
        installDate: null,
        warrantyDate: null,
      }),
    ).rejects.toThrow("insert failed");
  });
});

describe("updateEquipment", () => {
  it("updates te_id/lu_codigo directly for the given id", async () => {
    const eq = jest.fn().mockResolvedValue({ error: null });
    const update = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ update });

    await updateEquipment(5, {
      code: "AC-015",
      name: "AA Sala",
      typeId: 9,
      locationId: 4,
      model: "Split 3000F",
      installDate: "2026-02-01",
      warrantyDate: "2028-02-01",
    });

    expect(supabase.from).toHaveBeenCalledWith("equipo");
    expect(update).toHaveBeenCalledWith({
      eq_codigo: "AC-015",
      eq_nombre: "AA Sala",
      te_id: 9,
      lu_codigo: 4,
      eq_modelo: "Split 3000F",
      eq_fecha_instalacion: "2026-02-01",
      eq_fecha_garantia: "2028-02-01",
    });
    expect(eq).toHaveBeenCalledWith("eq_id_equipo", 5);
  });

  it("throws when Supabase returns an error", async () => {
    const eq = jest.fn().mockResolvedValue({ error: { message: "update failed" } });
    const update = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ update });

    await expect(
      updateEquipment(5, {
        code: "X",
        name: "Y",
        typeId: 1,
        locationId: 1,
        model: null,
        installDate: null,
        warrantyDate: null,
      }),
    ).rejects.toThrow("update failed");
  });
});
