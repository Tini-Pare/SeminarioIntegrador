jest.mock("../../supabase", () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { getEquipmentById, listEquipment } from "../../queries/equipment";
import { supabase } from "../../supabase";

describe("listEquipment", () => {
  it("returns equipment ordered by location then code", async () => {
    const orderByCode = jest.fn().mockResolvedValue({
      data: [{ id: "1", code: "AC-014", name: "Aire Acondicionado" }],
      error: null,
    });
    const orderByLocation = jest.fn().mockReturnValue({ order: orderByCode });
    const select = jest.fn().mockReturnValue({ order: orderByLocation });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    const result = await listEquipment();

    expect(supabase.from).toHaveBeenCalledWith("equipment");
    expect(select).toHaveBeenCalledWith("*");
    expect(orderByLocation).toHaveBeenCalledWith("location");
    expect(orderByCode).toHaveBeenCalledWith("code");
    expect(result).toEqual([{ id: "1", code: "AC-014", name: "Aire Acondicionado" }]);
  });

  it("throws when Supabase returns an error", async () => {
    const orderByCode = jest.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const orderByLocation = jest.fn().mockReturnValue({ order: orderByCode });
    const select = jest.fn().mockReturnValue({ order: orderByLocation });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    await expect(listEquipment()).rejects.toThrow("boom");
  });
});

describe("getEquipmentById", () => {
  it("returns a single equipment row by id", async () => {
    const single = jest.fn().mockResolvedValue({ data: { id: "1", code: "AC-014" }, error: null });
    const eq = jest.fn().mockReturnValue({ single });
    const select = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    const result = await getEquipmentById("1");

    expect(eq).toHaveBeenCalledWith("id", "1");
    expect(result).toEqual({ id: "1", code: "AC-014" });
  });

  it("returns null when not found", async () => {
    const single = jest
      .fn()
      .mockResolvedValue({ data: null, error: { message: "no rows", code: "PGRST116" } });
    const eq = jest.fn().mockReturnValue({ single });
    const select = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    const result = await getEquipmentById("missing");

    expect(result).toBeNull();
  });
});
