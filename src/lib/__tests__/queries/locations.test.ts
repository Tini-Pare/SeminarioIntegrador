jest.mock("../../supabase", () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import {
  createLocation,
  deleteLocation,
  listLocations,
  listLocationsWithCounts,
  updateLocation,
} from "../../queries/locations";
import { supabase } from "../../supabase";

describe("listLocations", () => {
  it("returns all locations ordered by name", async () => {
    const order = jest.fn().mockResolvedValue({
      data: [
        { id: "l1", name: "Planta A" },
        { id: "l2", name: "Planta B" },
      ],
      error: null,
    });
    const select = jest.fn().mockReturnValue({ order });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    const result = await listLocations();

    expect(supabase.from).toHaveBeenCalledWith("locations");
    expect(select).toHaveBeenCalledWith("*");
    expect(order).toHaveBeenCalledWith("name");
    expect(result).toEqual([
      { id: "l1", name: "Planta A" },
      { id: "l2", name: "Planta B" },
    ]);
  });

  it("throws when Supabase returns an error", async () => {
    const order = jest.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const select = jest.fn().mockReturnValue({ order });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    await expect(listLocations()).rejects.toThrow("boom");
  });
});

describe("listLocationsWithCounts", () => {
  it("flattens the embedded equipment(count) into equipmentCount", async () => {
    const order = jest.fn().mockResolvedValue({
      data: [
        { id: "l1", name: "Planta A", equipment: [{ count: 3 }] },
        { id: "l2", name: "Planta B", equipment: [{ count: 0 }] },
      ],
      error: null,
    });
    const select = jest.fn().mockReturnValue({ order });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    const result = await listLocationsWithCounts();

    expect(select).toHaveBeenCalledWith("*, equipment(count)");
    expect(result).toEqual([
      { id: "l1", name: "Planta A", equipment: [{ count: 3 }], equipmentCount: 3 },
      { id: "l2", name: "Planta B", equipment: [{ count: 0 }], equipmentCount: 0 },
    ]);
  });
});

describe("createLocation", () => {
  it("inserts a location with the given name", async () => {
    const single = jest
      .fn()
      .mockResolvedValue({ data: { id: "l1", name: "Planta A" }, error: null });
    const select = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select });
    (supabase.from as jest.Mock).mockReturnValue({ insert });

    const result = await createLocation("Planta A");

    expect(supabase.from).toHaveBeenCalledWith("locations");
    expect(insert).toHaveBeenCalledWith({ name: "Planta A" });
    expect(result).toEqual({ id: "l1", name: "Planta A" });
  });
});

describe("updateLocation", () => {
  it("updates the name for the given id", async () => {
    const eq = jest.fn().mockResolvedValue({ error: null });
    const update = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ update });

    await updateLocation("l1", "Planta A renombrada");

    expect(update).toHaveBeenCalledWith({ name: "Planta A renombrada" });
    expect(eq).toHaveBeenCalledWith("id", "l1");
  });
});

describe("deleteLocation", () => {
  it("deletes the location with the given id", async () => {
    const eq = jest.fn().mockResolvedValue({ error: null });
    const del = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ delete: del });

    await deleteLocation("l1");

    expect(del).toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith("id", "l1");
  });

  it("throws when equipment still references the location", async () => {
    const eq = jest.fn().mockResolvedValue({
      error: { message: "violates foreign key constraint", code: "23503" },
    });
    const del = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ delete: del });

    await expect(deleteLocation("l1")).rejects.toThrow("violates foreign key constraint");
  });
});
