import type { PurchaseWithDetail } from "../queries/purchases";
import {
  bucketGranularity,
  computeOrderKpis,
  computeRequestKpis,
  daysBetween,
  equipmentReport,
  faultTypeRanking,
  formatDays,
  formatHours,
  formatSignedDays,
  lastUnitCosts,
  median,
  orderResolutionRows,
  ordersByBucket,
  overdueOrders,
  partConsumption,
  planCompliance,
  preventiveDeadline,
  priceComparison,
  purchaseOrderStats,
  purchasesBySupplier,
  reliabilityByEquipmentType,
  requestsByLocation,
  resolutionByPriority,
  stockCoverage,
  suspensionsByReason,
  taskComplexityRanking,
  tasksByTechnician,
  technicianPerformance,
  topFailingEquipment,
  UNDIAGNOSED_FAULT,
} from "../statistics";
import type {
  MovimientoStock,
  Repuesto,
  Solicitud,
  SolicitudTask,
  WorkOrder,
} from "../../types/database";

// Midday UTC, so the local calendar day is the same in any test timezone.
const ts = (date: string) => `${date}T15:00:00Z`;

function task(overrides: Partial<SolicitudTask>): SolicitudTask {
  return {
    id: 1,
    taskId: 1,
    taskName: "Revisión",
    technicianId: "t1",
    startDate: null,
    endDate: null,
    consumedParts: [],
    diagnosis: null,
    suspension: null,
    lastSuspension: null,
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
    status: "assigned",
    priority: "medium",
    start_date: "2026-03-01",
    end_date: null,
    planned_end_date: null,
    created_at: null,
    observation: null,
    plan_name: null,
    fault_type_name: null,
    tasks: [],
    solicitud: null,
    ...overrides,
  };
}

function request(overrides: Partial<Solicitud>): Solicitud {
  return {
    id: 1,
    equipment_id: 1,
    reported_by: "u1",
    description: "",
    status: "new",
    motivo_rechazo: null,
    comentario_rechazo: null,
    priority: null,
    order_id: null,
    order_start_date: null,
    order_end_date: null,
    order_planned_end_date: null,
    fault_type_name: null,
    tasks: [],
    photo_url: null,
    photo_urls: [],
    created_at: ts("2026-03-01"),
    ...overrides,
  };
}

function part(overrides: Partial<Repuesto>): Repuesto {
  return {
    rep_id: 1,
    rep_nombre: "Filtro",
    rep_cantidad_actual: 10,
    rep_stock_minimo: 2,
    rep_stock_maximo: null,
    rep_estado: "activo",
    ...overrides,
  };
}

function purchase(
  id: number,
  supplierId: number,
  date: string,
  lines: { repId: number; qty: number; cost: number }[],
  total: number | null = null,
): PurchaseWithDetail {
  return {
    co_id_compra: id,
    prov_id_proveedor: supplierId,
    co_nombre: null,
    co_fecha_compra: date,
    co_costo_total: total,
    co_p_id_registrador: null,
    co_tipo_comprobante: "factura",
    co_punto_venta: null,
    co_letra: "A",
    proveedores: { prov_nombre: `Proveedor ${supplierId}`, prov_cuit: null },
    linea_compra: lines.map((l, i) => ({
      co_id_compra: id,
      rep_id: l.repId,
      lc_nro_linea: i + 1,
      lc_cantidad: l.qty,
      lc_costo_unitario: l.cost,
      repuesto: { rep_nombre: `Repuesto ${l.repId}` },
    })),
    remitos: [],
  };
}

const MARCH = { from: "2026-03-01", to: "2026-03-31" };

describe("date helpers", () => {
  it("counts whole days between dates, across months", () => {
    expect(daysBetween("2026-02-27", "2026-03-02")).toBe(3);
    expect(daysBetween("2026-03-02", "2026-02-27")).toBe(-3);
  });

  it("takes the median of an odd and an even list", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it("buckets by week up to two months, by month beyond", () => {
    expect(bucketGranularity({ from: "2026-03-01", to: "2026-03-30" })).toBe("week");
    expect(bucketGranularity({ from: "2026-01-01", to: "2026-03-31" })).toBe("month");
  });
});

describe("formatting", () => {
  it("shows same-day durations as less than a day", () => {
    expect(formatDays(0)).toBe("< 1 día");
    expect(formatDays(1)).toBe("1 día");
    expect(formatDays(2.25)).toBe("2,3 días");
    expect(formatDays(null)).toBe("—");
  });

  it("signs deviations", () => {
    expect(formatSignedDays(2)).toBe("+2 días");
    expect(formatSignedDays(-1)).toBe("−1 día");
    expect(formatSignedDays(0)).toBe("0 días");
  });

  it("switches hours to days after two days", () => {
    expect(formatHours(0.5)).toBe("30 min");
    expect(formatHours(5)).toBe("5 h");
    expect(formatHours(72)).toBe("3 días");
  });
});

describe("computeOrderKpis", () => {
  const orders = [
    order({ id: 1, end_date: "2026-03-05", planned_end_date: "2026-03-06" }), // 1 day early
    order({ id: 2, end_date: "2026-03-10", planned_end_date: "2026-03-07" }), // 3 days late
    order({ id: 3, end_date: "2026-03-12", type: "preventivo" }), // no estimate
    order({ id: 4, end_date: "2026-04-02", planned_end_date: "2026-04-01" }), // outside period
    order({ id: 5, end_date: "2026-03-08", type: "instalacion" }), // not maintenance
  ];

  it("counts closed OTs and measures them against their fecha estimada", () => {
    expect(computeOrderKpis(orders, MARCH, "all")).toEqual({
      closed: 3,
      withPlannedDate: 2,
      onTimePct: 50,
      avgDeviationDays: 1,
    });
  });

  it("applies the type filter", () => {
    expect(computeOrderKpis(orders, MARCH, "preventivo")).toEqual({
      closed: 1,
      withPlannedDate: 0,
      onTimePct: null,
      avgDeviationDays: null,
    });
  });
});

describe("ordersByBucket", () => {
  it("splits OTs per month into correctivas and preventivas, keeping empty months", () => {
    const result = ordersByBucket(
      [
        order({ start_date: "2026-01-10" }),
        order({ start_date: "2026-01-20", type: "preventivo" }),
        order({ start_date: "2026-03-05" }),
        order({ start_date: "2026-03-06", type: "instalacion" }),
      ],
      { from: "2026-01-01", to: "2026-03-31" },
    );
    expect(result.map((b) => [b.label, b.correctivo, b.preventivo])).toEqual([
      ["ene 26", 1, 1],
      ["feb 26", 0, 0],
      ["mar 26", 1, 0],
    ]);
  });

  it("starts weekly buckets on Monday", () => {
    // 2026-03-04 is a Wednesday; its week starts Monday 2026-03-02.
    const result = ordersByBucket([order({ start_date: "2026-03-04" })], {
      from: "2026-03-04",
      to: "2026-03-10",
    });
    expect(result.map((b) => [b.key, b.correctivo])).toEqual([
      ["2026-03-02", 1],
      ["2026-03-09", 0],
    ]);
  });
});

describe("orderResolutionRows", () => {
  it("lists the most delayed first, counting open OTs up to today", () => {
    const rows = orderResolutionRows(
      [
        order({
          id: 1,
          start_date: "2026-03-01",
          end_date: "2026-03-03",
          planned_end_date: "2026-03-05",
        }),
        order({ id: 2, start_date: "2026-03-02", planned_end_date: "2026-03-04" }),
        order({ id: 3, start_date: "2026-03-03" }),
      ],
      MARCH,
      "all",
      "2026-03-10",
    );
    expect(rows.map((r) => [r.id, r.resolutionDays, r.deviationDays])).toEqual([
      [2, 8, 6],
      [1, 2, -2],
      [3, 7, null],
    ]);
  });
});

describe("technician stats", () => {
  // Same tarea (id 1): t1 took 1 and 3 days, t2 took 2 → área average 2.
  const orders = [
    order({
      tasks: [
        task({ technicianId: "t1", taskId: 1, startDate: "2026-03-01", endDate: "2026-03-02" }),
        task({ technicianId: "t1", taskId: 1, startDate: "2026-03-01", endDate: "2026-03-04" }),
        task({ technicianId: "t2", taskId: 1, startDate: "2026-03-01", endDate: "2026-03-03" }),
        task({
          technicianId: "t2",
          taskId: 2,
          taskName: "Limpieza",
          startDate: "2026-03-05",
          endDate: "2026-03-05",
        }),
        task({ technicianId: "t2", taskId: 1, startDate: "2026-03-01", endDate: null }), // open
      ],
    }),
    order({
      type: "preventivo",
      tasks: [
        task({
          technicianId: "t1",
          taskId: 2,
          taskName: "Limpieza",
          startDate: "2026-03-07",
          endDate: "2026-03-07",
        }),
      ],
    }),
  ];

  it("counts finished tareas per técnico by OT type", () => {
    expect(tasksByTechnician(orders, MARCH, "all")).toEqual([
      { technicianId: "t1", correctivo: 2, preventivo: 1, total: 3 },
      { technicianId: "t2", correctivo: 2, preventivo: 0, total: 2 },
    ]);
  });

  it("compares each técnico with the área on the same tarea", () => {
    const result = technicianPerformance(orders, MARCH, "correctivo");
    const t1 = result.find((r) => r.technicianId === "t1")!;
    const t2 = result.find((r) => r.technicianId === "t2")!;
    expect(t1).toMatchObject({ finished: 2, avgDays: 2, vsAreaDays: 0 });
    // t2: tarea 1 took 2 (área 2 → 0), Limpieza 0 (only one → 0).
    expect(t2).toMatchObject({ finished: 2, avgDays: 1, vsAreaDays: 0 });
  });

  it("ranks tareas generales from the longest to the quickest", () => {
    expect(
      taskComplexityRanking(orders, MARCH, "all").map((t) => [t.name, t.avgDays, t.count]),
    ).toEqual([
      ["Revisión", 2, 3],
      ["Limpieza", 0, 2],
    ]);
  });
});

describe("equipment stats", () => {
  const orders = [
    order({
      id: 1,
      equipment_id: 7,
      start_date: "2026-01-02",
      end_date: "2026-01-04",
      fault_type_name: "Pérdida de gas",
      solicitud: {
        id: 1,
        reported_by: "u",
        description: "",
        created_at: ts("2026-01-01"),
        photo_urls: [],
      },
      tasks: [
        task({ endDate: "2026-01-04", consumedParts: [{ repId: 1, nombre: "Gas", cantidad: 2 }] }),
      ],
    }),
    order({
      id: 2,
      equipment_id: 7,
      start_date: "2026-01-21",
      end_date: "2026-01-22",
      fault_type_name: "Pérdida de gas",
      solicitud: {
        id: 2,
        reported_by: "u",
        description: "",
        created_at: ts("2026-01-21"),
        photo_urls: [],
      },
    }),
    order({
      id: 3,
      equipment_id: 7,
      start_date: "2026-03-01",
      fault_type_name: "Motor",
      tasks: [
        task({
          endDate: "2026-03-02",
          consumedParts: [{ repId: 9, nombre: "Nunca comprado", cantidad: 1 }],
        }),
      ],
    }),
    order({ id: 4, equipment_id: 7, type: "preventivo", start_date: "2026-02-01" }),
    order({ id: 5, equipment_id: 8, start_date: "2026-01-05" }),
  ];
  const costs = lastUnitCosts([
    purchase(1, 1, "2025-12-01", [{ repId: 1, qty: 1, cost: 100 }]),
    purchase(2, 1, "2026-01-01", [{ repId: 1, qty: 1, cost: 150 }]),
  ]);

  it("ranks equipos by roturas reported in the period", () => {
    expect(topFailingEquipment(orders, { from: "2026-01-01", to: "2026-01-31" })).toEqual([
      { equipmentId: 7, count: 2 },
      { equipmentId: 8, count: 1 },
    ]);
  });

  it("values parts at their last purchase price", () => {
    expect(costs.get(1)).toBe(150);
  });

  it("builds the repair-or-replace ficha from the whole history", () => {
    const report = equipmentReport(
      orders,
      { id: 7, installDate: "2025-03-01" },
      costs,
      "2026-03-01",
    );
    expect(report.failures.map((f) => [f.orderId, f.recurrence])).toEqual([
      [3, false],
      [2, true], // same falla 20 days after the first one
      [1, false],
    ]);
    // Failures on 01/01, 21/01 and 01/03 → gaps of 20 and 39 days.
    expect(report.mtbfDays).toBe(29.5);
    // Closed repairs took 2 and 1 days.
    expect(report.mttrDays).toBe(1.5);
    expect(report.recurrences).toBe(1);
    expect(report.partsCost).toBe(300);
    expect(report.partsCostIncomplete).toBe(true);
    expect(report.ageDays).toBe(365);
  });

  it("ranks fault types with their gravedad", () => {
    const result = faultTypeRanking(
      [...orders, order({ id: 6, start_date: "2026-01-10" })],
      { from: "2026-01-01", to: "2026-01-31" },
      new Map([["Pérdida de gas", "high" as const]]),
    );
    expect(result).toEqual([
      { name: "Pérdida de gas", count: 2, gravedad: "high" },
      { name: UNDIAGNOSED_FAULT, count: 2, gravedad: null },
    ]);
  });
});

describe("request stats", () => {
  const requests = [
    request({ id: 1, equipment_id: 1, created_at: "2026-03-02T10:00:00Z", status: "resolved" }),
    request({ id: 2, equipment_id: 1, created_at: "2026-03-03T10:00:00Z", status: "in_progress" }),
    request({
      id: 3,
      equipment_id: 2,
      created_at: ts("2026-03-04"),
      status: "rejected",
      motivo_rechazo: "Duplicada",
    }),
    request({ id: 4, equipment_id: 2, created_at: ts("2026-03-05"), status: "new" }),
    request({ id: 5, equipment_id: 2, created_at: ts("2026-04-05"), status: "new" }),
  ];
  const orders = [
    order({
      sol_id_solicitud: 1,
      created_at: "2026-03-02T12:00:00Z",
      tasks: [task({ startDate: "2026-03-04" }), task({ startDate: "2026-03-03" })],
    }),
    order({ sol_id_solicitud: 2, created_at: "2026-03-03T16:00:00Z" }),
  ];

  it("measures attention in hours and start in days, as medians", () => {
    expect(computeRequestKpis(requests, orders, MARCH)).toEqual({
      total: 4,
      attentionHoursMedian: 4, // 2 h and 6 h
      attendedCount: 2,
      startDaysMedian: 1, // 02/03 → first tarea 03/03
      startedCount: 1,
      rejectedCount: 1,
      rejectedPct: 25,
      topRejectReason: "Duplicada",
    });
  });

  it("groups solicitudes by the equipo's ubicación and status", () => {
    const equipmentById = new Map([
      [1, { location: "Carnicería" }],
      [2, { location: "Panadería" }],
    ]);
    expect(requestsByLocation(requests, equipmentById, MARCH)).toEqual([
      { location: "Carnicería", resolved: 1, pending: 0, inProgress: 1, rejected: 0, total: 2 },
      { location: "Panadería", resolved: 0, pending: 1, inProgress: 0, rejected: 1, total: 2 },
    ]);
  });
});

describe("parts and purchases", () => {
  const orders = [
    order({
      tasks: [
        task({
          endDate: "2026-03-10",
          consumedParts: [{ repId: 1, nombre: "Filtro", cantidad: 6 }],
        }),
        task({
          endDate: "2025-10-01",
          consumedParts: [{ repId: 3, nombre: "Correa", cantidad: 1 }],
        }),
      ],
    }),
  ];
  const movements: MovimientoStock[] = [
    {
      ms_id: 1,
      rep_id: 1,
      ms_tipo: "egreso",
      ms_cantidad: 3,
      ms_motivo: "Rotura",
      ms_comentario: null,
      ms_p_id_registrador: null,
      ms_creado_en: ts("2026-03-15"),
    },
    {
      ms_id: 2,
      rep_id: 1,
      ms_tipo: "ingreso",
      ms_cantidad: 50,
      ms_motivo: "Donación",
      ms_comentario: null,
      ms_p_id_registrador: null,
      ms_creado_en: ts("2026-03-16"),
    },
  ];

  it("adds tarea consumption and egresos externos, not ingresos", () => {
    expect(partConsumption(orders, movements, MARCH)).toEqual(new Map([[1, 9]]));
  });

  it("flags what to restock and what's idle", () => {
    const rows = stockCoverage(
      [
        part({ rep_id: 1, rep_nombre: "Filtro", rep_cantidad_actual: 6 }), // 9 in 31 days → ~21 days left
        part({ rep_id: 2, rep_nombre: "Junta", rep_cantidad_actual: 1, rep_stock_minimo: 2 }), // at mínimo
        part({ rep_id: 3, rep_nombre: "Correa", rep_cantidad_actual: 4 }), // last used Oct 2025
        part({ rep_id: 4, rep_nombre: "Inactivo", rep_estado: "inactivo" }),
      ],
      orders,
      movements,
      MARCH,
      "2026-03-31",
    );
    expect(rows.map((r) => [r.name, r.status])).toEqual([
      ["Filtro", "reponer"],
      ["Junta", "reponer"],
      ["Correa", "sin_uso"],
    ]);
    expect(Math.round(rows[0].daysLeft!)).toBe(21);
  });

  const purchases = [
    purchase(1, 1, "2026-01-10", [{ repId: 1, qty: 2, cost: 100 }], 200),
    purchase(2, 1, "2026-03-10", [{ repId: 1, qty: 1, cost: 120 }]),
    purchase(3, 2, "2026-03-12", [{ repId: 1, qty: 4, cost: 110 }]),
  ];

  it("totals purchases per proveedor in the period, from lines when there's no total", () => {
    expect(purchasesBySupplier(purchases, MARCH)).toEqual([
      { supplierId: 2, name: "Proveedor 2", total: 440, count: 1 },
      { supplierId: 1, name: "Proveedor 1", total: 120, count: 1 },
    ]);
  });

  it("compares a repuesto's price per proveedor over its whole history", () => {
    expect(priceComparison(purchases, 1)).toEqual([
      {
        supplierId: 2,
        supplier: "Proveedor 2",
        lastPrice: 110,
        lastDate: "2026-03-12",
        minPrice: 110,
        maxPrice: 110,
        purchases: 1,
        changePct: null,
      },
      {
        supplierId: 1,
        supplier: "Proveedor 1",
        lastPrice: 120,
        lastDate: "2026-03-10",
        minPrice: 100,
        maxPrice: 120,
        purchases: 2,
        changePct: 20,
      },
    ]);
  });
});

describe("overdueOrders", () => {
  it("keeps open OTs past their fecha estimada, most overdue first", () => {
    const result = overdueOrders(
      [
        order({ id: 1, planned_end_date: "2026-03-05" }),
        order({ id: 2, planned_end_date: "2026-03-01" }),
        order({ id: 3, planned_end_date: "2026-03-01", status: "resolved" }),
        order({ id: 4, planned_end_date: "2026-03-10" }), // due today, not late
        order({ id: 5 }),
      ],
      "2026-03-10",
    );
    expect(result.map((o) => o.id)).toEqual([2, 1]);
  });
});

describe("resolutionByPriority", () => {
  it("gives each priority its median resolution and on-time rate, Alta first", () => {
    const result = resolutionByPriority(
      [
        order({ priority: "high", start_date: "2026-03-01", end_date: "2026-03-02" }),
        order({
          priority: "high",
          start_date: "2026-03-01",
          end_date: "2026-03-04",
          planned_end_date: "2026-03-03",
        }),
        order({ priority: "high", start_date: "2026-03-01", end_date: "2026-03-06" }),
        order({ priority: "low", start_date: "2026-03-01", end_date: "2026-03-11" }),
        order({ priority: "low", start_date: "2026-03-01" }), // still open
      ],
      MARCH,
      "all",
    );
    expect(result).toEqual([
      { priority: "high", closed: 3, medianDays: 3, withPlannedDate: 1, onTimePct: 0 },
      { priority: "medium", closed: 0, medianDays: null, withPlannedDate: 0, onTimePct: null },
      { priority: "low", closed: 1, medianDays: 10, withPlannedDate: 0, onTimePct: null },
    ]);
  });
});

describe("planCompliance", () => {
  const plans = [
    { pm_id_plan: 1, pm_nombre_plan: "Heladeras mensual", pm_frecuencia: 30 },
    { pm_id_plan: 2, pm_nombre_plan: "Hornos semanal", pm_frecuencia: 7 },
  ];

  it("uses the fecha estimada, or else the plan's frequency, as the deadline", () => {
    expect(
      preventiveDeadline({ start_date: "2026-03-01", planned_end_date: "2026-03-05" }, 30),
    ).toBe("2026-03-05");
    expect(preventiveDeadline({ start_date: "2026-03-01", planned_end_date: null }, 7)).toBe(
      "2026-03-08",
    );
    expect(
      preventiveDeadline({ start_date: "2026-03-01", planned_end_date: null }, null),
    ).toBeNull();
  });

  it("classifies each preventive OT and puts the worst plan first", () => {
    const pre = (overrides: Partial<WorkOrder>) => order({ type: "preventivo", ...overrides });
    const result = planCompliance(
      [
        // Hornos (every 7 days): one on time, one late, one overdue.
        pre({ plan_id_manequipo: 2, start_date: "2026-03-01", end_date: "2026-03-05" }),
        pre({ plan_id_manequipo: 2, start_date: "2026-03-08", end_date: "2026-03-20" }),
        pre({ plan_id_manequipo: 2, start_date: "2026-03-15" }),
        // Heladeras (every 30 days): on time, plus one still within its deadline.
        pre({ plan_id_manequipo: 1, start_date: "2026-03-01", end_date: "2026-03-10" }),
        pre({ plan_id_manequipo: 1, start_date: "2026-03-20" }),
        order({ start_date: "2026-03-01" }), // correctivo, ignored
      ],
      plans,
      MARCH,
      "2026-03-31",
    );
    expect(result.map((r) => [r.name, r.onTime, r.late, r.overdue, r.inProgress])).toEqual([
      ["Hornos semanal", 1, 1, 1, 0],
      ["Heladeras mensual", 1, 0, 0, 1],
    ]);
    expect(result[0].compliancePct).toBeCloseTo(33.33, 1);
    expect(result[1].compliancePct).toBe(100);
  });
});

describe("suspensionsByReason", () => {
  it("groups the last suspension of each tarea by motivo, timing it", () => {
    const result = suspensionsByReason(
      [
        order({
          tasks: [
            task({
              lastSuspension: {
                since: "2026-03-02",
                until: "2026-03-06",
                reason: "Falta de repuesto",
                comment: null,
              },
            }),
            task({
              suspension: { since: "2026-03-08", reason: "Falta de repuesto", comment: null },
            }),
            task({
              lastSuspension: {
                since: "2026-03-10",
                until: "2026-03-11",
                reason: "Otro",
                comment: "lluvia",
              },
            }),
            task({
              lastSuspension: {
                since: "2026-02-01",
                until: "2026-02-03",
                reason: "Otro",
                comment: null,
              },
            }), // outside the period
          ],
        }),
      ],
      MARCH,
      "all",
      "2026-03-10",
    );
    expect(result).toEqual([
      { reason: "Falta de repuesto", count: 2, ongoing: 1, avgDaysStopped: 3 }, // 4 and 2 days
      { reason: "Otro", count: 1, ongoing: 0, avgDaysStopped: 1 },
    ]);
  });
});

describe("purchaseOrderStats", () => {
  const ped = (
    estado: "pendiente" | "aprobado" | "rechazado" | "recibido",
    solicitud: string,
    resolucion: string | null = null,
    motivo: string | null = null,
  ) => ({
    ped_estado: estado,
    ped_fecha_solicitud: solicitud,
    ped_fecha_resolucion: resolucion,
    ped_motivo_rechazo: motivo,
  });

  it("counts received pedidos as approved and times their arrival", () => {
    const result = purchaseOrderStats(
      [
        ped("recibido", "2026-03-01", "2026-03-05"),
        ped("recibido", "2026-03-02", "2026-03-04"),
        ped("aprobado", "2026-03-03", "2026-03-03"),
        ped("rechazado", "2026-03-04", "2026-03-04", "Sin presupuesto"),
        ped("pendiente", "2026-03-20"),
        ped("pendiente", "2026-02-20"), // outside the period
      ],
      MARCH,
      "2026-03-31",
    );
    expect(result).toEqual({
      total: 5,
      pending: 1,
      approved: 3,
      rejected: 1,
      approvalPct: 75,
      receiveDaysMedian: 3, // 4 and 2 days
      receivedCount: 2,
      oldestPendingDays: 11,
      topRejectReason: "Sin presupuesto",
    });
  });
});

describe("reliabilityByEquipmentType", () => {
  it("pools gaps between roturas of each equipo per tipo, most fragile first", () => {
    const equipment = [
      { id: 1, typeId: 10, type: "Heladera", active: true },
      { id: 2, typeId: 10, type: "Heladera", active: true },
      { id: 3, typeId: 20, type: "Horno", active: true },
      { id: 4, typeId: 30, type: "Balanza", active: true },
    ];
    const result = reliabilityByEquipmentType(
      [
        // Heladera 1 breaks on 01/03 and 11/03; Heladera 2 on 01/03 and 21/03.
        order({ equipment_id: 1, start_date: "2026-03-01", end_date: "2026-03-02" }),
        order({ equipment_id: 1, start_date: "2026-03-11", end_date: "2026-03-14" }),
        order({ equipment_id: 2, start_date: "2026-03-01" }),
        order({ equipment_id: 2, start_date: "2026-03-21" }),
        // Horno: one rotura, no gap yet.
        order({ equipment_id: 3, start_date: "2026-03-05", end_date: "2026-03-05" }),
        order({ equipment_id: 3, type: "preventivo", start_date: "2026-03-06" }),
      ],
      equipment,
    );
    expect(
      result.map((r) => [r.name, r.equipmentCount, r.failures, r.mtbfDays, r.mttrDays]),
    ).toEqual([
      ["Heladera", 2, 4, 15, 2], // gaps 10 and 20; repairs 1 and 3
      ["Horno", 1, 1, null, 0],
      ["Balanza", 1, 0, null, null],
    ]);
  });
});
