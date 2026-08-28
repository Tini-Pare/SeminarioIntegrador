jest.mock("../../supabase", () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import {
  createFaultType,
  deleteFaultType,
  listFaultTypes,
  normalizeGravedad,
  updateFaultType,
} from "../../queries/faultTypes";
import { supabase } from "../../supabase";

describe("normalizeGravedad", () => {
  it("passes through low/high and defaults everything else to medium", () => {
    expect(normalizeGravedad("low")).toBe("low");
    expect(normalizeGravedad("high")).toBe("high");
    expect(normalizeGravedad("medium")).toBe("medium");
    expect(normalizeGravedad(null)).toBe("medium");
    expect(normalizeGravedad("Alta")).toBe("medium");
  });
});

describe("listFaultTypes", () => {
  it("returns fault types ordered by name", async () => {
    const order = jest.fn().mockResolvedValue({
      data: [
        { fa_id_fallo: 1, fa_nombre: "Corte eléctrico", fa_desperfecto: null, fa_gravedad: "high" },
      ],
      error: null,
    });
    const select = jest.fn().mockReturnValue({ order });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    const result = await listFaultTypes();

    expect(supabase.from).toHaveBeenCalledWith("fallo");
    expect(select).toHaveBeenCalledWith("*");
    expect(order).toHaveBeenCalledWith("fa_nombre");
    expect(result).toHaveLength(1);
  });

  it("throws when Supabase returns an error", async () => {
    const order = jest.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const select = jest.fn().mockReturnValue({ order });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    await expect(listFaultTypes()).rejects.toThrow("boom");
  });
});

describe("createFaultType", () => {
  it("inserts trimmed fields with gravedad", async () => {
    const single = jest.fn().mockResolvedValue({ data: { fa_id_fallo: 7 }, error: null });
    const select = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select });
    (supabase.from as jest.Mock).mockReturnValue({ insert });

    await createFaultType({
      name: "  Pérdida de gas  ",
      desperfecto: "  Zumbido  ",
      gravedad: "high",
    });

    expect(insert).toHaveBeenCalledWith({
      fa_nombre: "Pérdida de gas",
      fa_desperfecto: "Zumbido",
      fa_gravedad: "high",
    });
  });

  it("stores an empty desperfecto as null", async () => {
    const single = jest.fn().mockResolvedValue({ data: {}, error: null });
    const select = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select });
    (supabase.from as jest.Mock).mockReturnValue({ insert });

    await createFaultType({ name: "X", desperfecto: "  ", gravedad: "medium" });

    expect(insert).toHaveBeenCalledWith({
      fa_nombre: "X",
      fa_desperfecto: null,
      fa_gravedad: "medium",
    });
  });
});

describe("updateFaultType", () => {
  it("updates fields for the given id", async () => {
    const eq = jest.fn().mockResolvedValue({ error: null });
    const update = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ update });

    await updateFaultType(7, { name: " Corte ", desperfecto: null, gravedad: "low" });

    expect(update).toHaveBeenCalledWith({
      fa_nombre: "Corte",
      fa_desperfecto: null,
      fa_gravedad: "low",
    });
    expect(eq).toHaveBeenCalledWith("fa_id_fallo", 7);
  });
});

describe("deleteFaultType", () => {
  it("deletes by id", async () => {
    const eq = jest.fn().mockResolvedValue({ error: null });
    const del = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ delete: del });

    await deleteFaultType(7);

    expect(eq).toHaveBeenCalledWith("fa_id_fallo", 7);
  });

  it("maps a 23503 FK violation to a friendly message", async () => {
    const eq = jest.fn().mockResolvedValue({ error: { code: "23503", message: "fk" } });
    const del = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ delete: del });

    await expect(deleteFaultType(7)).rejects.toThrow(/asociada a una orden de trabajo/);
  });

  it("rethrows other errors as-is", async () => {
    const eq = jest.fn().mockResolvedValue({ error: { code: "500", message: "server error" } });
    const del = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ delete: del });

    await expect(deleteFaultType(7)).rejects.toThrow("server error");
  });
});
