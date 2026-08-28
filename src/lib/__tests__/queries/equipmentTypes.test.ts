jest.mock("../../supabase", () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import {
  createEquipmentType,
  deleteEquipmentType,
  listEquipmentTypes,
  updateEquipmentType,
} from "../../queries/equipmentTypes";
import { supabase } from "../../supabase";

describe("listEquipmentTypes", () => {
  it("returns tipos ordered by name, each with a client-side equipment count", async () => {
    const tiposOrder = jest.fn().mockResolvedValue({
      data: [
        { te_id: 1, te_nombre: "Aires", te_cantidad: null },
        { te_id: 2, te_nombre: "Heladeras", te_cantidad: null },
      ],
      error: null,
    });
    const tiposSelect = jest.fn().mockReturnValue({ order: tiposOrder });
    const equipoSelect = jest.fn().mockResolvedValue({
      data: [{ te_id: 1 }, { te_id: 1 }, { te_id: 2 }],
      error: null,
    });

    (supabase.from as jest.Mock).mockImplementation((table: string) =>
      table === "tipos_de_equipos" ? { select: tiposSelect } : { select: equipoSelect },
    );

    const result = await listEquipmentTypes();

    expect(tiposSelect).toHaveBeenCalledWith("*");
    expect(tiposOrder).toHaveBeenCalledWith("te_nombre");
    expect(equipoSelect).toHaveBeenCalledWith("te_id");
    expect(result).toEqual([
      { te_id: 1, te_nombre: "Aires", te_cantidad: null, equipmentCount: 2 },
      { te_id: 2, te_nombre: "Heladeras", te_cantidad: null, equipmentCount: 1 },
    ]);
  });

  it("throws when the tipos query errors", async () => {
    const tiposOrder = jest.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const tiposSelect = jest.fn().mockReturnValue({ order: tiposOrder });
    const equipoSelect = jest.fn().mockResolvedValue({ data: [], error: null });
    (supabase.from as jest.Mock).mockImplementation((table: string) =>
      table === "tipos_de_equipos" ? { select: tiposSelect } : { select: equipoSelect },
    );

    await expect(listEquipmentTypes()).rejects.toThrow("boom");
  });
});

describe("createEquipmentType", () => {
  it("inserts the trimmed name and returns the row", async () => {
    const single = jest.fn().mockResolvedValue({
      data: { te_id: 3, te_nombre: "Hornos", te_cantidad: null },
      error: null,
    });
    const select = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select });
    (supabase.from as jest.Mock).mockReturnValue({ insert });

    const result = await createEquipmentType({ name: "  Hornos  " });

    expect(supabase.from).toHaveBeenCalledWith("tipos_de_equipos");
    expect(insert).toHaveBeenCalledWith({ te_nombre: "Hornos" });
    expect(result).toEqual({ te_id: 3, te_nombre: "Hornos", te_cantidad: null });
  });
});

describe("updateEquipmentType", () => {
  it("updates the trimmed name for the given id", async () => {
    const eq = jest.fn().mockResolvedValue({ error: null });
    const update = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ update });

    await updateEquipmentType(3, { name: " Hornos industriales " });

    expect(update).toHaveBeenCalledWith({ te_nombre: "Hornos industriales" });
    expect(eq).toHaveBeenCalledWith("te_id", 3);
  });
});

describe("deleteEquipmentType", () => {
  it("deletes by id", async () => {
    const eq = jest.fn().mockResolvedValue({ error: null });
    const del = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ delete: del });

    await deleteEquipmentType(3);

    expect(eq).toHaveBeenCalledWith("te_id", 3);
  });

  it("maps a 23503 FK violation to a friendly message", async () => {
    const eq = jest.fn().mockResolvedValue({ error: { code: "23503", message: "fk" } });
    const del = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ delete: del });

    await expect(deleteEquipmentType(3)).rejects.toThrow(/hay equipos de este tipo/);
  });

  it("rethrows other errors as-is", async () => {
    const eq = jest.fn().mockResolvedValue({ error: { code: "500", message: "server error" } });
    const del = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ delete: del });

    await expect(deleteEquipmentType(3)).rejects.toThrow("server error");
  });
});
