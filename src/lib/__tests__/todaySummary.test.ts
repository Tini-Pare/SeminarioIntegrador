import type { StockNotification } from "../queries/notifications";
import {
  buildTodayActivity,
  computeTodayKpis,
  isOrderWithoutTechnician,
  preventiveDueToday,
} from "../todaySummary";
import type { HistorialEntry, Solicitud, SolicitudTask, WorkOrder } from "../../types/database";

const TODAY = "2026-11-08";

// Local-time timestamps, so timestampToDbDate gives back TODAY in any TZ.
function at(hour: number, minute = 0, date = TODAY): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d, hour, minute).toISOString();
}

function task(over: Partial<SolicitudTask> = {}): SolicitudTask {
  return {
    id: 1,
    taskId: 1,
    taskName: "Desobstrucción del desagüe",
    technicianId: "tec-1",
    startDate: TODAY,
    endDate: null,
    consumedParts: [],
    diagnosis: null,
    suspension: null,
    lastSuspension: null,
    ...over,
  };
}

function order(over: Partial<WorkOrder> = {}): WorkOrder {
  return {
    id: 22,
    equipment_id: 1,
    type: "correctivo",
    status: "assigned",
    priority: "medium",
    start_date: "2026-11-01",
    end_date: null,
    planned_end_date: null,
    created_at: at(9, 0, "2026-11-01"),
    observation: null,
    plan_name: null,
    fault_type_name: null,
    tasks: [],
    solicitud: null,
    ...over,
  };
}

function request(over: Partial<Solicitud> = {}): Solicitud {
  return {
    id: 1,
    equipment_id: 1,
    reported_by: "u-1",
    description: "No enfría",
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
    created_at: at(18, 32),
    ...over,
  };
}

const equipmentById = new Map([
  [1, { code: "PC-001", name: "PC Oficina Principal" }],
  [2, { code: "EX-110", name: "Exhibidora" }],
]);
const technicianNames = new Map([["tec-1", "Joaquin"]]);

describe("computeTodayKpis", () => {
  it("counts today's solicitudes, preventive OTs, finished tareas and parts", () => {
    const kpis = computeTodayKpis(
      TODAY,
      [
        request({ id: 1 }),
        request({ id: 2, status: "assigned", order_id: 9 }),
        request({ id: 3, created_at: at(10, 0, "2026-11-07") }),
      ],
      [
        order({ id: 30, type: "preventivo", created_at: at(6) }),
        order({ id: 31, type: "preventivo", created_at: at(6), tasks: [task({ id: 5 })] }),
        order({
          id: 22,
          tasks: [
            task({
              id: 7,
              endDate: TODAY,
              consumedParts: [
                { repId: 1, nombre: "Burlete", cantidad: 2, unidad: "unidad" },
                { repId: 2, nombre: "Tuerca", cantidad: 9, unidad: "unidad" },
              ],
            }),
            task({ id: 8, technicianId: "tec-2", endDate: TODAY }),
            task({ id: 9, endDate: "2026-11-07" }),
          ],
        }),
      ],
    );

    expect(kpis).toMatchObject({
      newRequests: 2,
      newRequestsUnassigned: 1,
      preventiveOrders: 2,
      preventiveWithoutTechnician: 1,
      finishedTasks: 2,
      finishingTechnicians: 2,
      partsValue: "11 u",
      partsMixedUnits: false,
      tasksWithParts: 1,
    });
  });

  it("counts distinct repuestos when units differ", () => {
    const kpis = computeTodayKpis(
      TODAY,
      [],
      [
        order({
          tasks: [
            task({
              endDate: TODAY,
              consumedParts: [
                { repId: 1, nombre: "Aceite", cantidad: 2, unidad: "litro" },
                { repId: 2, nombre: "Tuerca", cantidad: 9, unidad: "unidad" },
              ],
            }),
          ],
        }),
      ],
    );
    expect(kpis.partsValue).toBe("2");
    expect(kpis.partsMixedUnits).toBe(true);
  });
});

describe("buildTodayActivity", () => {
  it("lists today's events newest first, timing tareas from the historial", () => {
    const log: HistorialEntry[] = [
      {
        id: "h1",
        equipment_id: 1,
        type: "Tarea finalizada",
        note: "Tarea finalizada: Desobstrucción del desagüe. Diagnóstico: tapado",
        author_id: "tec-1",
        created_at: at(16, 40),
      },
    ];
    const stock: StockNotification[] = [
      {
        kind: "stock_minimo",
        id: "stock-1",
        notificationIds: [1],
        partId: 3,
        partName: "Tuerca",
        eventType: "sin_stock",
        quantity: 0,
        minimum: 5,
        unit: "unidad",
        createdAt: at(9, 5),
        isRead: false,
        title: "",
        subtitle: "",
      },
    ];

    const items = buildTodayActivity({
      today: TODAY,
      requests: [request(), request({ id: 2, created_at: at(8, 0, "2026-11-07") })],
      orders: [
        order({
          id: 31,
          equipment_id: 2,
          type: "preventivo",
          plan_name: "Limpieza de condensador",
          created_at: at(17, 5),
        }),
        order({
          id: 22,
          tasks: [
            task({
              id: 7,
              endDate: TODAY,
              consumedParts: [{ repId: 1, nombre: "Burlete", cantidad: 2, unidad: "unidad" }],
            }),
          ],
        }),
      ],
      equipmentById,
      technicianNames,
      taskFinishLog: log,
      stockEvents: stock,
    });

    expect(items.map((i) => i.kind)).toEqual([
      "solicitud",
      "preventiva",
      "tarea",
      "repuesto",
      "stock",
    ]);
    expect(items.map((i) => i.segments.map((s) => s.text).join(""))).toEqual([
      "Nueva: PC Oficina Principal (PC-001) · Sin asignar",
      "Se generó la OT-0031 del plan Limpieza de condensador · EX-110",
      'Joaquin finalizó "Desobstrucción del desagüe" (OT-0022)',
      "Usado: Burlete × 2 u (OT-0022)",
      "Tuerca llegó a 0 (mínimo 5 u)",
    ]);
    expect(items[2].at).toBe(at(16, 40));
    expect(items[4].severe).toBe(true);
  });

  it("puts a tarea with no matching historial row last, without a time", () => {
    const items = buildTodayActivity({
      today: TODAY,
      requests: [request({ created_at: at(7) })],
      orders: [order({ tasks: [task({ endDate: TODAY, taskName: "Otra" })] })],
      equipmentById,
      technicianNames,
      taskFinishLog: [
        {
          id: "h1",
          equipment_id: 1,
          type: "Tarea finalizada",
          note: "Tarea finalizada: Otra cosa",
          author_id: "tec-1",
          created_at: at(12),
        },
      ],
      stockEvents: [],
    });

    expect(items.map((i) => i.kind)).toEqual(["solicitud", "tarea"]);
    expect(items[1].at).toBeNull();
  });
});

describe("to resolve today", () => {
  it("flags open OTs without tareas as sin técnico", () => {
    expect(isOrderWithoutTechnician(order())).toBe(true);
    expect(isOrderWithoutTechnician(order({ tasks: [task()] }))).toBe(false);
    expect(isOrderWithoutTechnician(order({ status: "resolved" }))).toBe(false);
  });

  it("finds open preventive OTs due today", () => {
    const due = preventiveDueToday(
      [
        order({ id: 1, type: "preventivo", planned_end_date: TODAY }),
        order({ id: 2, type: "preventivo", planned_end_date: TODAY, status: "resolved" }),
        order({ id: 3, type: "correctivo", planned_end_date: TODAY }),
        order({ id: 4, type: "preventivo", planned_end_date: "2026-11-09" }),
      ],
      TODAY,
    );
    expect(due.map((o) => o.id)).toEqual([1]);
  });
});
