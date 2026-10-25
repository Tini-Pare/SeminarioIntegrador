import {
  countAlerts,
  isCriticalTask,
  listPreventiveAlerts,
  lowStockParts,
  preventiveDueLabel,
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

describe("preventiveDueLabel", () => {
  it("describes upcoming, today and overdue due dates", () => {
    expect(preventiveDueLabel(3)).toBe("Vence en 3 días");
    expect(preventiveDueLabel(1)).toBe("Vence en 1 día");
    expect(preventiveDueLabel(0)).toBe("Vence hoy");
    expect(preventiveDueLabel(-2)).toBe("Vencido hace 2 días");
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

describe("listPreventiveAlerts", () => {
  it("reads v_alertas_preventivas, most urgent first", async () => {
    const order2 = jest.fn().mockResolvedValue({ data: [{ eq_id_equipo: 1 }], error: null });
    const order1 = jest.fn().mockReturnValue({ order: order2 });
    const select = jest.fn().mockReturnValue({ order: order1 });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    const result = await listPreventiveAlerts();

    expect(supabase.from).toHaveBeenCalledWith("v_alertas_preventivas");
    expect(order1).toHaveBeenCalledWith("fecha_vencimiento");
    expect(result).toHaveLength(1);
  });
});

describe("countAlerts", () => {
  it("adds up stock and preventive alerts for an admin", async () => {
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === "repuestos") {
        return {
          select: jest.fn().mockResolvedValue({
            data: [part({ rep_id: 1, rep_cantidad_actual: 0 }), part({ rep_id: 2 })],
            error: null,
          }),
        };
      }
      const order2 = jest.fn().mockResolvedValue({ data: [{}, {}], error: null });
      return { select: () => ({ order: () => ({ order: order2 }) }) };
    });

    await expect(countAlerts("admin")).resolves.toBe(3);
  });

  it("has nothing to count for a plain user", async () => {
    await expect(countAlerts("user")).resolves.toBe(0);
  });
});
