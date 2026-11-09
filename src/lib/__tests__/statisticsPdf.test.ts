jest.mock("../supabase", () => ({ supabase: {} }));

import type { StatisticsData } from "../queries/statistics";
import {
  STATISTICS_PDF_BLOCKS,
  availablePdfBlocks,
  buildStatisticsHtml,
  esc,
  statisticsPdfBaseName,
  type StatisticsPdfInput,
} from "../statisticsPdf";
import { LOGO_MARK_DATA_URI } from "../statisticsPdfLogo";
import type { Equipo, WorkOrder } from "../../types/database";

function equipo(overrides: Partial<Equipo>): Equipo {
  return {
    id: 1,
    code: "EQ-001",
    name: "Heladera",
    type: "Frío",
    typeId: 1,
    location: "Depósito",
    locationId: 1,
    status: "operational",
    active: true,
    model: null,
    installDate: null,
    ...overrides,
  };
}

function order(overrides: Partial<WorkOrder>): WorkOrder {
  return {
    id: 1,
    equipment_id: 1,
    sol_id_solicitud: null,
    plan_id_manequipo: null,
    type: "correctivo",
    status: "resolved",
    priority: "medium",
    start_date: "2026-03-01",
    end_date: "2026-03-03",
    planned_end_date: "2026-03-02",
    created_at: null,
    observation: null,
    plan_name: null,
    fault_type_name: null,
    tasks: [],
    solicitud: null,
    ...overrides,
  };
}

function input(overrides: Partial<StatisticsPdfInput> = {}): StatisticsPdfInput {
  const equipment = [
    equipo({ id: 1, code: "EQ-001", name: "Heladera <b>norte</b>" }),
    equipo({ id: 2, code: "EQ-002", name: "Horno" }),
  ];
  const data: StatisticsData = {
    orders: [
      order({ id: 10, equipment_id: 1, start_date: "2026-03-01" }),
      order({ id: 11, equipment_id: 1, start_date: "2026-03-10", end_date: "2026-03-12" }),
      order({ id: 12, equipment_id: 2, start_date: "2026-03-05", end_date: "2026-03-06" }),
    ],
    requests: [],
    equipment,
    profiles: [],
    parts: [],
    purchases: [],
    movements: [],
    gravedadByFault: new Map(),
    plans: [],
    purchaseOrders: [],
  };
  return {
    tab: "orders",
    data,
    period: { from: "2026-03-01", to: "2026-03-31" },
    type: "all",
    today: "2026-03-31",
    equipmentById: new Map(equipment.map((e) => [e.id, e])),
    profileById: new Map(),
    selectedEquipmentId: null,
    selectedPartId: null,
    generatedAt: new Date(2026, 3, 1, 9, 5),
    generatedBy: "Ana Admin",
    ...overrides,
  };
}

describe("buildStatisticsHtml", () => {
  it("brands the document with Mantia's name and logo, the tab and the period", () => {
    const html = buildStatisticsHtml(input());

    expect(html).toContain("Mantia");
    expect(html).toContain("Sistema de mantenimiento");
    expect(html).toContain(LOGO_MARK_DATA_URI);
    expect(html).toContain("Órdenes de trabajo");
    expect(html).toContain("01/03/2026 al 31/03/2026");
    expect(html).toContain("Generado el 01/04/2026 a las 09:05 por Ana Admin");
  });

  it("shows the OT type filter only on the tabs that use it", () => {
    expect(buildStatisticsHtml(input({ type: "preventivo" }))).toContain(
      "Tipo de OT: <strong>Preventivas</strong>",
    );
    expect(buildStatisticsHtml(input({ tab: "equipment" }))).not.toContain("Tipo de OT");
  });

  it("escapes names typed by users", () => {
    const html = buildStatisticsHtml(input());
    expect(html).toContain("Heladera &lt;b&gt;norte&lt;/b&gt;");
    expect(html).not.toContain("<b>norte</b>");
  });

  it("prints the ficha of the ranking's leader when no equipo was picked", () => {
    const html = buildStatisticsHtml(input({ tab: "equipment" }));
    expect(html).toContain("EQ-001 · Heladera &lt;b&gt;norte&lt;/b&gt;");
  });

  it("prints the ficha of the equipo the admin picked", () => {
    const html = buildStatisticsHtml(input({ tab: "equipment", selectedEquipmentId: 2 }));
    expect(html).toContain("EQ-002 · Horno");
  });

  it.each(["orders", "technicians", "equipment", "requests", "parts"] as const)(
    "builds the %s tab with empty data",
    (tab) => {
      const base = input();
      const html = buildStatisticsHtml({
        ...base,
        tab,
        data: { ...base.data, orders: [], equipment: [] },
        equipmentById: new Map(),
      });
      expect(html).toContain("</html>");
    },
  );
});

describe("choosing which blocks to export", () => {
  // A panel or a KPI row is one printed block.
  const countBlocks = (html: string) =>
    (html.match(/<section class="panel/g) ?? []).length +
    (html.match(/<div class="kpis/g) ?? []).length;

  it.each(Object.keys(STATISTICS_PDF_BLOCKS) as (keyof typeof STATISTICS_PDF_BLOCKS)[])(
    "prints exactly one block per catalog entry in the %s tab",
    (tab) => {
      for (const block of STATISTICS_PDF_BLOCKS[tab]) {
        const html = buildStatisticsHtml(input({ tab, blocks: [block.key] }));
        expect(countBlocks(html)).toBe(1);
      }
      expect(countBlocks(buildStatisticsHtml(input({ tab })))).toBe(
        STATISTICS_PDF_BLOCKS[tab].length,
      );
    },
  );

  it("prints only the picked blocks", () => {
    const html = buildStatisticsHtml(input({ blocks: ["byPriority", "list"] }));
    expect(html).toContain("Tiempo de resolución por prioridad");
    expect(html).toContain("OT del período, de la más demorada a la menos");
    expect(html).not.toContain("Correctivas vs. preventivas");
    expect(html).not.toContain('class="kpis');
  });

  it("doesn't offer the preventive plans' block while only correctivas are shown", () => {
    const keys = (type: "all" | "correctivo") =>
      availablePdfBlocks("orders", type).map((b) => b.key);
    expect(keys("all")).toContain("plans");
    expect(keys("correctivo")).not.toContain("plans");
  });
});

describe("statisticsPdfBaseName", () => {
  it("names the file after the tab and the period", () => {
    expect(statisticsPdfBaseName("parts", { from: "2026-01-01", to: "2026-03-31" })).toBe(
      "Mantia_Estadisticas_Repuestos-y-compras_2026-01-01_a_2026-03-31",
    );
  });
});

describe("esc", () => {
  it("escapes HTML special characters", () => {
    expect(esc(`<a href="x">Tom & Jerry's</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;",
    );
  });
});
