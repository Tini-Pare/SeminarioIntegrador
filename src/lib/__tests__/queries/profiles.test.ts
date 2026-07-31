jest.mock("../../supabase", () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { listProfiles, updateProfile } from "../../queries/profiles";
import { supabase } from "../../supabase";

describe("listProfiles", () => {
  it("returns all profiles ordered by name", async () => {
    const order = jest.fn().mockResolvedValue({
      data: [
        { id: "p1", name: "Ana" },
        { id: "p2", name: "Beto" },
      ],
      error: null,
    });
    const select = jest.fn().mockReturnValue({ order });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    const result = await listProfiles();

    expect(supabase.from).toHaveBeenCalledWith("profiles");
    expect(select).toHaveBeenCalledWith("*");
    expect(order).toHaveBeenCalledWith("name");
    expect(result).toEqual([
      { id: "p1", name: "Ana" },
      { id: "p2", name: "Beto" },
    ]);
  });

  it("throws when Supabase returns an error", async () => {
    const order = jest.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const select = jest.fn().mockReturnValue({ order });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    await expect(listProfiles()).rejects.toThrow("boom");
  });
});

describe("updateProfile", () => {
  it("updates only the given fields for the given id", async () => {
    const eq = jest.fn().mockResolvedValue({ error: null });
    const update = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ update });

    await updateProfile("p1", { role: "technician", active: false });

    expect(supabase.from).toHaveBeenCalledWith("profiles");
    expect(update).toHaveBeenCalledWith({ role: "technician", active: false });
    expect(eq).toHaveBeenCalledWith("id", "p1");
  });

  it("throws when Supabase returns an error", async () => {
    const eq = jest.fn().mockResolvedValue({ error: { message: "update failed" } });
    const update = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ update });

    await expect(updateProfile("p1", { active: true })).rejects.toThrow("update failed");
  });
});
