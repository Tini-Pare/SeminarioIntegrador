jest.mock("../../supabase", () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import {
  createLocation,
  deleteLocation,
  listLocations,
  updateLocation,
} from "../../queries/locations";
import { supabase } from "../../supabase";

describe("listLocations", () => {
  it("returns locations ordered by name, each with a client-side equipment count", async () => {
    const lugaresOrder = jest.fn().mockResolvedValue({
      data: [
        { lu_codigo: 1, lu_nombre_sector: "Planta A", lu_piso: "PB" },
        { lu_codigo: 2, lu_nombre_sector: "Taller", lu_piso: null },
      ],
      error: null,
    });
    const lugaresSelect = jest.fn().mockReturnValue({ order: lugaresOrder });
    const equipoSelect = jest.fn().mockResolvedValue({
      data: [{ lu_codigo: 1 }, { lu_codigo: 1 }, { lu_codigo: 2 }],
      error: null,
    });

    (supabase.from as jest.Mock).mockImplementation((table: string) =>
      table === "lugares" ? { select: lugaresSelect } : { select: equipoSelect },
    );

    const result = await listLocations();

    expect(lugaresSelect).toHaveBeenCalledWith("*");
    expect(lugaresOrder).toHaveBeenCalledWith("lu_nombre_sector");
    expect(equipoSelect).toHaveBeenCalledWith("lu_codigo");
    expect(result).toEqual([
      { lu_codigo: 1, lu_nombre_sector: "Planta A", lu_piso: "PB", equipmentCount: 2 },
      { lu_codigo: 2, lu_nombre_sector: "Taller", lu_piso: null, equipmentCount: 1 },
    ]);
  });

  it("throws when the lugares query errors", async () => {
    const lugaresOrder = jest.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const lugaresSelect = jest.fn().mockReturnValue({ order: lugaresOrder });
    const equipoSelect = jest.fn().mockResolvedValue({ data: [], error: null });
    (supabase.from as jest.Mock).mockImplementation((table: string) =>
      table === "lugares" ? { select: lugaresSelect } : { select: equipoSelect },
    );

    await expect(listLocations()).rejects.toThrow("boom");
  });
});

describe("createLocation", () => {
  it("inserts the trimmed name and floor, returning the new location", async () => {
    const checkIlike = jest.fn().mockResolvedValue({ data: [], error: null });
    const checkSelect = jest.fn().mockReturnValue({ ilike: checkIlike });

    const single = jest.fn().mockResolvedValue({
      data: { lu_codigo: 3, lu_nombre_sector: "Depósito", lu_piso: "1° piso" },
      error: null,
    });
    const select = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select });

    (supabase.from as jest.Mock).mockImplementation(() => ({
      select: checkSelect,
      insert,
    }));

    const result = await createLocation({ name: "  Depósito  ", floor: " 1° piso " });

    expect(insert).toHaveBeenCalledWith({ lu_nombre_sector: "Depósito", lu_piso: "1° piso" });
    expect(result).toEqual({ lu_codigo: 3, lu_nombre_sector: "Depósito", lu_piso: "1° piso" });
  });

  it("throws an error when a location with the same name and floor already exists", async () => {
    const checkIlike = jest.fn().mockResolvedValue({
      data: [{ lu_codigo: 1, lu_nombre_sector: "Planta A", lu_piso: "PB" }],
      error: null,
    });
    const checkSelect = jest.fn().mockReturnValue({ ilike: checkIlike });

    (supabase.from as jest.Mock).mockReturnValue({ select: checkSelect });

    await expect(createLocation({ name: "planta a", floor: "pb" })).rejects.toThrow(
      "La ubicación ya existe.",
    );
  });
});

describe("updateLocation", () => {
  it("updates the trimmed name and floor for the given id", async () => {
    const checkIlike = jest.fn().mockResolvedValue({
      data: [{ lu_codigo: 3, lu_nombre_sector: "Depósito", lu_piso: "1° piso" }],
      error: null,
    });
    const checkSelect = jest.fn().mockReturnValue({ ilike: checkIlike });

    const eq = jest.fn().mockResolvedValue({ error: null });
    const update = jest.fn().mockReturnValue({ eq });

    (supabase.from as jest.Mock).mockImplementation(() => ({
      select: checkSelect,
      update,
    }));

    await updateLocation(3, { name: " Depósito Central ", floor: " 2° piso " });

    expect(update).toHaveBeenCalledWith({
      lu_nombre_sector: "Depósito Central",
      lu_piso: "2° piso",
    });
    expect(eq).toHaveBeenCalledWith("lu_codigo", 3);
  });

  it("throws an error when renaming to a name and floor that belongs to another location", async () => {
    const checkIlike = jest.fn().mockResolvedValue({
      data: [{ lu_codigo: 1, lu_nombre_sector: "Planta A", lu_piso: "PB" }],
      error: null,
    });
    const checkSelect = jest.fn().mockReturnValue({ ilike: checkIlike });

    (supabase.from as jest.Mock).mockReturnValue({ select: checkSelect });

    await expect(updateLocation(2, { name: "Planta A", floor: "PB" })).rejects.toThrow(
      "La ubicación ya existe.",
    );
  });
});

describe("deleteLocation", () => {
  it("deletes by id", async () => {
    const eq = jest.fn().mockResolvedValue({ error: null });
    const del = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ delete: del });

    await deleteLocation(3);

    expect(eq).toHaveBeenCalledWith("lu_codigo", 3);
  });

  it("maps a 23503 FK violation to a friendly message", async () => {
    const eq = jest.fn().mockResolvedValue({ error: { code: "23503", message: "fk" } });
    const del = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ delete: del });

    await expect(deleteLocation(3)).rejects.toThrow(/hay equipos asignados a esta ubicación/);
  });

  it("rethrows other errors as-is", async () => {
    const eq = jest.fn().mockResolvedValue({ error: { code: "500", message: "server error" } });
    const del = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ delete: del });

    await expect(deleteLocation(3)).rejects.toThrow("server error");
  });
});
