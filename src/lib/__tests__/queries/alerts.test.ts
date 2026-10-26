import {
  countAlerts,
  isCriticalTask,
  lowStockParts,
} from "../../queries/alerts";
import { supabase } from "../../supabase";
import type { Repuesto } from "../../../types/database";

jest.mock("../../supabase", () => ({
  supabase: {
    from: jest.fn(),
    auth: { getSession: jest.fn() },
  },
}));

function part(overrides: Partial<Repuesto>): Repuesto {
  return {
    rep_id: 1,
    rep_nombre: "Filtro",
    rep_cantidad_actual: 10,
    rep_stock_minimo: 5,
    rep_stock_maximo: null,
    rep_estado: "activo",
    ...overrides,
  } as Repuesto;
}

describe("lowStockParts", () => {
  it("keeps active parts at or below their minimum, emptiest first", () => {
    const result = lowStockParts([
      part({ rep_id: 1, rep_cantidad_actual: 10 }),
      part({ rep_id: 2, rep_cantidad_actual: 5 }),
      part({ rep_id: 3, rep_cantidad_actual: 0 }),
      part({ rep_id: 4, rep_cantidad_actual: 0, rep_estado: "inactivo" }),
    ]);

    expect(result.map((p) => p.rep_id)).toEqual([3, 2]);
  });
});

describe("isCriticalTask", () => {
  it("is an unfinished tarea of a correctivo OT with prioridad alta", () => {
    expect(isCriticalTask({ priority: "high", orderType: "correctivo", endDate: null })).toBe(true);
    expect(
      isCriticalTask({ priority: "high", orderType: "correctivo", endDate: "2026-10-20" }),
    ).toBe(false);
    expect(isCriticalTask({ priority: "medium", orderType: "correctivo", endDate: null })).toBe(
      false,
    );
    expect(isCriticalTask({ priority: "high", orderType: "preventivo", endDate: null })).toBe(
      false,
    );
  });
});

describe("countAlerts", () => {
  it("counts critical tasks for a technician", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { user: { id: "tech-1" } } },
    });
    const eq = jest.fn().mockResolvedValue({ count: 2, error: null });
    const is = jest.fn().mockReturnValue({ eq: () => ({ eq }) });
    const select = jest.fn().mockReturnValue({ eq: () => ({ is }) });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    await expect(countAlerts("technician")).resolves.toBe(2);
  });

  it("has nothing to count for a plain user", async () => {
    await expect(countAlerts("user")).resolves.toBe(0);
  });
});
