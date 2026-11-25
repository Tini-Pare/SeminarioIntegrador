import { formatOrderNumber } from "./orderNumber";
import type { StockNotification } from "./queries/notifications";
import { timestampToDbDate } from "./statistics";
import { formatUnitQty } from "./units";
import type { Equipo, HistorialEntry, Solicitud, WorkOrder } from "../types/database";

// Inicio ("Hoy"): what happened today and what's still waiting. Pure
// functions over what the screen already loads, so they can be tested
// without Supabase.

type EquipmentRef = Pick<Equipo, "code" | "name">;

// An OT's creation day: ot_creada_en when present (0039), else its start date.
function orderCreatedDay(o: WorkOrder): string {
  return o.created_at ? timestampToDbDate(o.created_at) : o.start_date;
}

// An open OT nobody can work on yet: tareas without a técnico are dropped by
// mapTasks, so "no tareas" is also "no técnico" (shown as "Sin tareas" on
// the OT screen).
export function isOrderWithoutTechnician(o: WorkOrder): boolean {
  return o.status === "assigned" && o.tasks.length === 0;
}

// ---------------------------------------------------------------------------
// KPI tiles

export type TodayKpis = {
  newRequests: number;
  newRequestsUnassigned: number;
  preventiveOrders: number;
  preventiveWithoutTechnician: number;
  finishedTasks: number;
  finishingTechnicians: number;
  // Already formatted: a single unit sums ("11 u"); mixed units can't be
  // added up, so the value is the number of distinct repuestos instead.
  partsValue: string;
  partsMixedUnits: boolean;
  tasksWithParts: number;
};

export function computeTodayKpis(
  today: string,
  requests: Solicitud[],
  orders: WorkOrder[],
): TodayKpis {
  const newRequests = requests.filter((r) => timestampToDbDate(r.created_at) === today);
  const preventive = orders.filter((o) => o.type === "preventivo" && orderCreatedDay(o) === today);
  const finished = orders.flatMap((o) => o.tasks.filter((t) => t.endDate === today));
  const parts = finished.flatMap((t) => t.consumedParts);
  const units = new Set(parts.map((p) => p.unidad ?? "unidad"));
  const partsMixedUnits = units.size > 1;
  const partsValue = partsMixedUnits
    ? String(new Set(parts.map((p) => p.repId)).size)
    : formatUnitQty(
        parts.reduce((sum, p) => sum + p.cantidad, 0),
        [...units][0] ?? "unidad",
      );

  return {
    newRequests: newRequests.length,
    newRequestsUnassigned: newRequests.filter((r) => r.status === "new").length,
    preventiveOrders: preventive.length,
    preventiveWithoutTechnician: preventive.filter(isOrderWithoutTechnician).length,
    finishedTasks: finished.length,
    finishingTechnicians: new Set(finished.map((t) => t.technicianId)).size,
    partsValue,
    partsMixedUnits,
    tasksWithParts: finished.filter((t) => t.consumedParts.length > 0).length,
  };
}

// ---------------------------------------------------------------------------
// "Actividad de hoy"

export type ActivityKind = "solicitud" | "preventiva" | "ot" | "tarea" | "repuesto" | "stock";

export type ActivitySegment = { text: string; bold?: boolean };

export type ActivityItem = {
  key: string;
  kind: ActivityKind;
  // ISO timestamp; null when only the day is known (a tarea whose
  // "Tarea finalizada" historial row wasn't found).
  at: string | null;
  segments: ActivitySegment[];
  href: string;
  // Stock only: sin stock is worse than stock bajo.
  severe?: boolean;
};

// The historial row finishTask logs for this tarea: same equipo and a note
// that starts with "Tarea finalizada: <name>" (followed by the diagnóstico,
// if any). Rows already matched are skipped, so two tareas with the same
// name on one equipo each get their own time.
function findFinishLog(
  log: HistorialEntry[],
  used: Set<string>,
  equipmentId: number,
  taskName: string,
): HistorialEntry | undefined {
  const prefix = `Tarea finalizada: ${taskName}`;
  return log.find(
    (h) =>
      !used.has(h.id) &&
      h.equipment_id === equipmentId &&
      (h.note === prefix || h.note.startsWith(`${prefix}. `)),
  );
}

export function buildTodayActivity(input: {
  today: string;
  requests: Solicitud[];
  orders: WorkOrder[];
  equipmentById: Map<number, EquipmentRef>;
  technicianNames: Map<string, string>;
  taskFinishLog: HistorialEntry[];
  stockEvents: StockNotification[];
}): ActivityItem[] {
  const { today, equipmentById, technicianNames } = input;
  const eq = (id: number): EquipmentRef =>
    equipmentById.get(id) ?? { code: "—", name: "Equipo desconocido" };
  const items: ActivityItem[] = [];

  for (const r of input.requests) {
    if (timestampToDbDate(r.created_at) !== today) continue;
    const e = eq(r.equipment_id);
    const outcome =
      r.status === "new"
        ? "Sin asignar"
        : r.status === "rejected"
          ? "Cerrada sin OT"
          : r.order_id !== null
            ? formatOrderNumber(r.order_id)
            : null;
    items.push({
      key: `sol-${r.id}`,
      kind: "solicitud",
      at: r.created_at,
      segments: [
        { text: "Nueva: " },
        { text: e.name, bold: true },
        { text: ` (${e.code})${outcome ? ` · ${outcome}` : ""}` },
      ],
      href: "/requests",
    });
  }

  for (const o of input.orders) {
    if (orderCreatedDay(o) !== today) continue;
    const e = eq(o.equipment_id);
    const number = formatOrderNumber(o.id);
    const preventive = o.type === "preventivo";
    const detail = preventive
      ? ` del plan ${o.plan_name ?? "—"} · ${e.code}`
      : o.type === "instalacion"
        ? ` de instalación · ${e.name} (${e.code})`
        : ` para ${e.name} (${e.code})`;
    items.push({
      key: `ot-${o.id}`,
      kind: preventive ? "preventiva" : "ot",
      at: o.created_at ?? null,
      segments: [{ text: "Se generó la " }, { text: number, bold: true }, { text: detail }],
      href: `/work-orders/${o.id}`,
    });
  }

  const usedLogs = new Set<string>();
  for (const o of input.orders) {
    for (const t of o.tasks) {
      if (t.endDate !== today) continue;
      const log = findFinishLog(input.taskFinishLog, usedLogs, o.equipment_id, t.taskName);
      if (log) usedLogs.add(log.id);
      const at = log?.created_at ?? null;
      const number = formatOrderNumber(o.id);
      items.push({
        key: `task-${t.id}`,
        kind: "tarea",
        at,
        segments: [
          { text: technicianNames.get(t.technicianId) ?? "Un técnico", bold: true },
          { text: ` finalizó "${t.taskName}" (${number})` },
        ],
        href: `/work-orders/${o.id}`,
      });
      for (const p of t.consumedParts) {
        items.push({
          key: `part-${t.id}-${p.repId}`,
          kind: "repuesto",
          at,
          segments: [
            { text: "Usado: " },
            { text: p.nombre, bold: true },
            { text: ` × ${formatUnitQty(p.cantidad, p.unidad)} (${number})` },
          ],
          href: `/work-orders/${o.id}`,
        });
      }
    }
  }

  for (const s of input.stockEvents) {
    if (timestampToDbDate(s.createdAt) !== today) continue;
    const empty = s.eventType === "sin_stock";
    items.push({
      key: `stock-${s.id}`,
      kind: "stock",
      at: s.createdAt,
      segments: [
        { text: s.partName, bold: true },
        {
          text: `${empty ? " llegó a 0" : ` bajó a ${formatUnitQty(s.quantity, s.unit)}`} (mínimo ${formatUnitQty(s.minimum, s.unit)})`,
        },
      ],
      href: "/spare-parts",
      severe: empty,
    });
  }

  // Newest first; events without a time go last, in the order built.
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => {
      if (a.item.at && b.item.at) return +new Date(b.item.at) - +new Date(a.item.at) || a.i - b.i;
      if (a.item.at) return -1;
      if (b.item.at) return 1;
      return a.i - b.i;
    })
    .map(({ item }) => item);
}

// ---------------------------------------------------------------------------
// "Para resolver hoy"

// Open preventive OTs whose fecha requerida de cierre is today.
export function preventiveDueToday(orders: WorkOrder[], today: string): WorkOrder[] {
  return orders.filter(
    (o) => o.type === "preventivo" && o.status !== "resolved" && o.planned_end_date === today,
  );
}
