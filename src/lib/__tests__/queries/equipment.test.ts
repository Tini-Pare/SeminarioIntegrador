jest.mock("../../supabase", () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { getEquipmentById, listEquipment } from "../../queries/equipment";
import { supabase } from "../../supabase";

describe("listEquipment", () => {
  it("returns equipo ordered by lugar name then codigo, mapped to the flat Equipo shape", async () => {
    const orderByCode = jest.fn().mockResolvedValue({
      data: [
        {
          eq_id_equipo: 1,
          eq_codigo: "AC-014",
          eq_nombre: "Aire Acondicionado",
          eq_estado: "operational",
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
        location: "Planta A",
        status: "operational",
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
        eq_codigo: "AC-014",
        eq_nombre: "Aire Acondicionado",
        eq_estado: "operational",
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
      location: "Planta A",
      status: "operational",
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
