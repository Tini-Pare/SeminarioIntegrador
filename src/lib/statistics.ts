import type { Equipo, MovimientoStock, Repuesto, Solicitud, WorkOrder } from "../types/database";
import type { Gravedad } from "./queries/faultTypes";
import type { PurchaseWithDetail } from "./queries/purchases";

// Pure calculations behind the admin's "Estadísticas" screen (HU-071..076).
// Every date the app stores for OTs and tareas is a plain `date`
// (YYYY-MM-DD, no time of day), so durations here are whole days — only
// the solicitud → OT gap has timestamps on both sides and is measured in
// hours. Installation OTs (0033) aren't maintenance work, so the OT and
// técnico stats only look at correctivo/preventivo ones.

export type StatsPeriod = { from: string; to: string };
export type AnalyzedType = "correctivo" | "preventivo";
export type OrderTypeFilter = "all" | AnalyzedType;

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Date & number helpers

// YYYY-MM-DD in local time — a timestamp's calendar day as the admin sees it.
export function localDbDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function timestampToDbDate(ts: string): string {
  return localDbDate(new Date(ts));
}

function dbDateToUtc(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

// Whole days from `from` to `to` (negative when `to` is earlier).
export function daysBetween(from: string, to: string): number {
  return Math.round((dbDateToUtc(to) - dbDateToUtc(from)) / DAY_MS);
}

export function addDays(date: string, days: number): string {
  return new Date(dbDateToUtc(date) + days * DAY_MS).toISOString().slice(0, 10);
}

export function inPeriod(date: string | null | undefined, period: StatsPeriod): boolean {
  return !!date && date >= period.from && date <= period.to;
}

export function periodLengthDays(period: StatsPeriod): number {
  return Math.max(1, daysBetween(period.from, period.to) + 1);
}

export function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function isAnalyzed(order: Pick<WorkOrder, "type">): order is WorkOrder & { type: AnalyzedType } {
  return order.type === "correctivo" || order.type === "preventivo";
}

function matchesType(order: Pick<WorkOrder, "type">, filter: OrderTypeFilter): boolean {
  return isAnalyzed(order) && (filter === "all" || order.type === filter);
}

// ---------------------------------------------------------------------------
// Órdenes de trabajo (HU-074)

export type OrderKpis = {
  closed: number;
  // Among closed OTs that had a fecha estimada (older ones may not).
  withPlannedDate: number;
  onTimePct: number | null;
  // end − estimated, averaged: positive = closed late on average.
  avgDeviationDays: number | null;
};

export function computeOrderKpis(
  orders: WorkOrder[],
  period: StatsPeriod,
  type: OrderTypeFilter,
): OrderKpis {
  const closed = orders.filter((o) => matchesType(o, type) && inPeriod(o.end_date, period));
  const planned = closed.filter((o) => o.planned_end_date);
  const deviations = planned.map((o) => daysBetween(o.planned_end_date!, o.end_date!));
  const onTime = deviations.filter((d) => d <= 0).length;
  return {
    closed: closed.length,
    withPlannedDate: planned.length,
    onTimePct: planned.length ? (onTime / planned.length) * 100 : null,
    avgDeviationDays: average(deviations),
  };
}

export type TypeBucket = { key: string; label: string; correctivo: number; preventivo: number };

const MONTHS_SHORT = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

// Monday of the date's week.
function weekStart(date: string): string {
  const weekday = new Date(dbDateToUtc(date)).getUTCDay(); // 0 = Sunday
  return addDays(date, -((weekday + 6) % 7));
}

// Short periods (up to ~2 months) are bucketed by week, longer ones by month.
export function bucketGranularity(period: StatsPeriod): "week" | "month" {
  return periodLengthDays(period) <= 62 ? "week" : "month";
}

function bucketKey(date: string, granularity: "week" | "month"): string {
  return granularity === "week" ? weekStart(date) : date.slice(0, 7);
}

function bucketLabel(key: string, granularity: "week" | "month"): string {
  if (granularity === "week") {
    const [, m, d] = key.split("-");
    return `${d}/${m}`;
  }
  const [y, m] = key.split("-");
  return `${MONTHS_SHORT[Number(m) - 1]} ${y.slice(2)}`;
}

// Every bucket in the period, empty ones included, so gaps show as gaps.
function periodBuckets(period: StatsPeriod, granularity: "week" | "month"): string[] {
  const keys: string[] = [];
  if (granularity === "week") {
    for (let k = weekStart(period.from); k <= period.to; k = addDays(k, 7)) keys.push(k);
  } else {
    let [y, m] = period.from.split("-").map(Number);
    const last = period.to.slice(0, 7);
    for (;;) {
      const key = `${y}-${String(m).padStart(2, "0")}`;
      if (key > last) break;
      keys.push(key);
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
  }
  return keys;
}

// OTs started in each week/month of the period, correctivas vs preventivas.
export function ordersByBucket(orders: WorkOrder[], period: StatsPeriod): TypeBucket[] {
  const granularity = bucketGranularity(period);
  const buckets = new Map<string, TypeBucket>(
    periodBuckets(period, granularity).map((key) => [
      key,
      { key, label: bucketLabel(key, granularity), correctivo: 0, preventivo: 0 },
    ]),
  );
  for (const o of orders) {
    if (!isAnalyzed(o) || !inPeriod(o.start_date, period)) continue;
    const bucket = buckets.get(bucketKey(o.start_date, granularity));
    if (bucket) bucket[o.type] += 1;
  }
  return [...buckets.values()];
}

export type OrderRow = {
  id: number;
  equipmentId: number;
  type: AnalyzedType;
  priority: WorkOrder["priority"];
  status: WorkOrder["status"];
  startDate: string;
  endDate: string | null;
  plannedEndDate: string | null;
  // Days from start to close — or to today while it's still open.
  resolutionDays: number;
  // Close (or today) − fecha estimada: positive = late. null without one.
  deviationDays: number | null;
};

// HU-074's list: OTs started in the period, most delayed first.
export function orderResolutionRows(
  orders: WorkOrder[],
  period: StatsPeriod,
  type: OrderTypeFilter,
  today: string,
): OrderRow[] {
  return orders
    .filter((o) => matchesType(o, type) && inPeriod(o.start_date, period))
    .map((o) => {
      const until = o.end_date ?? today;
      return {
        id: o.id,
        equipmentId: o.equipment_id,
        type: o.type as AnalyzedType,
        priority: o.priority,
        status: o.status,
        startDate: o.start_date,
        endDate: o.end_date,
        plannedEndDate: o.planned_end_date,
        resolutionDays: Math.max(0, daysBetween(o.start_date, until)),
        deviationDays: o.planned_end_date ? daysBetween(o.planned_end_date, until) : null,
      };
    })
    .sort(
      (a, b) =>
        (b.deviationDays ?? -Infinity) - (a.deviationDays ?? -Infinity) ||
        b.resolutionDays - a.resolutionDays,
    );
}

// ---------------------------------------------------------------------------
// Técnicos (HU-076)

type FinishedTask = {
  technicianId: string;
  taskId: number;
  taskName: string;
  orderType: AnalyzedType;
  days: number;
};

// Tareas finished in the period, with how many days each one took.
function finishedTasks(
  orders: WorkOrder[],
  period: StatsPeriod,
  type: OrderTypeFilter,
): FinishedTask[] {
  const result: FinishedTask[] = [];
  for (const o of orders) {
    if (!matchesType(o, type)) continue;
    for (const t of o.tasks) {
      if (!t.startDate || !inPeriod(t.endDate, period)) continue;
      result.push({
        technicianId: t.technicianId,
        taskId: t.taskId,
        taskName: t.taskName,
        orderType: o.type as AnalyzedType,
        days: Math.max(0, daysBetween(t.startDate, t.endDate!)),
      });
    }
  }
  return result;
}

export type TechnicianTaskCount = {
  technicianId: string;
  correctivo: number;
  preventivo: number;
  total: number;
};

export function tasksByTechnician(
  orders: WorkOrder[],
  period: StatsPeriod,
  type: OrderTypeFilter,
): TechnicianTaskCount[] {
  const byTech = new Map<string, TechnicianTaskCount>();
  for (const t of finishedTasks(orders, period, type)) {
    const row = byTech.get(t.technicianId) ?? {
      technicianId: t.technicianId,
      correctivo: 0,
      preventivo: 0,
      total: 0,
    };
    row[t.orderType] += 1;
    row.total += 1;
    byTech.set(t.technicianId, row);
  }
  return [...byTech.values()].sort((a, b) => b.total - a.total);
}

export type TechnicianPerformance = {
  technicianId: string;
  finished: number;
  avgDays: number;
  // How many days more (+) or fewer (−) than the área's average each of
  // their tareas took, compared tarea-type by tarea-type — so someone who
  // gets the long jobs isn't penalized for it.
  vsAreaDays: number;
};

export function technicianPerformance(
  orders: WorkOrder[],
  period: StatsPeriod,
  type: OrderTypeFilter,
): TechnicianPerformance[] {
  const tasks = finishedTasks(orders, period, type);
  const areaAvgByTask = new Map<number, number>();
  for (const taskId of new Set(tasks.map((t) => t.taskId))) {
    areaAvgByTask.set(
      taskId,
      average(tasks.filter((t) => t.taskId === taskId).map((t) => t.days))!,
    );
  }

  const byTech = new Map<string, FinishedTask[]>();
  for (const t of tasks) byTech.set(t.technicianId, [...(byTech.get(t.technicianId) ?? []), t]);

  return [...byTech.entries()]
    .map(([technicianId, own]) => ({
      technicianId,
      finished: own.length,
      avgDays: average(own.map((t) => t.days))!,
      vsAreaDays: average(own.map((t) => t.days - areaAvgByTask.get(t.taskId)!))!,
    }))
    .sort((a, b) => b.finished - a.finished || a.vsAreaDays - b.vsAreaDays);
}

export type TaskComplexity = { taskId: number; name: string; avgDays: number; count: number };

// Tareas generales from the longest (most complex) to the quickest.
export function taskComplexityRanking(
  orders: WorkOrder[],
  period: StatsPeriod,
  type: OrderTypeFilter,
): TaskComplexity[] {
  const byTask = new Map<number, { name: string; days: number[] }>();
  for (const t of finishedTasks(orders, period, type)) {
    const entry = byTask.get(t.taskId) ?? { name: t.taskName, days: [] };
    entry.days.push(t.days);
    byTask.set(t.taskId, entry);
  }
  return [...byTask.entries()]
    .map(([taskId, { name, days }]) => ({
      taskId,
      name,
      avgDays: average(days)!,
      count: days.length,
    }))
    .sort((a, b) => b.avgDays - a.avgDays || b.count - a.count);
}

// ---------------------------------------------------------------------------
// Equipos (HU-071)

// A rotura is a correctivo OT. It happened when the solicitud was reported,
// which can be days before the OT starts.
function failureDate(order: WorkOrder): string {
  return order.solicitud ? timestampToDbDate(order.solicitud.created_at) : order.start_date;
}

export type EquipmentFailureCount = { equipmentId: number; count: number };

export function topFailingEquipment(
  orders: WorkOrder[],
  period: StatsPeriod,
  limit = 10,
): EquipmentFailureCount[] {
  const counts = new Map<number, number>();
  for (const o of orders) {
    if (o.type !== "correctivo" || !inPeriod(failureDate(o), period)) continue;
    counts.set(o.equipment_id, (counts.get(o.equipment_id) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([equipmentId, count]) => ({ equipmentId, count }))
    .sort((a, b) => b.count - a.count || a.equipmentId - b.equipmentId)
    .slice(0, limit);
}

// The last price each repuesto was bought at — what consumed parts are
// valued at, since repuesto_para_tarea stores no cost of its own.
export function lastUnitCosts(purchases: PurchaseWithDetail[]): Map<number, number> {
  const latest = new Map<number, { date: string; id: number; cost: number }>();
  for (const p of purchases) {
    const date = p.co_fecha_compra ?? "";
    for (const l of p.linea_compra) {
      if (l.lc_costo_unitario == null) continue;
      const prev = latest.get(l.rep_id);
      if (!prev || date > prev.date || (date === prev.date && p.co_id_compra > prev.id)) {
        latest.set(l.rep_id, { date, id: p.co_id_compra, cost: Number(l.lc_costo_unitario) });
      }
    }
  }
  return new Map([...latest.entries()].map(([repId, v]) => [repId, v.cost]));
}

export type EquipmentFailure = {
  orderId: number;
  date: string;
  faultType: string | null;
  endDate: string | null;
  repairDays: number | null;
  // Same falla as an earlier rotura of this equipo within the window.
  recurrence: boolean;
};

export type EquipmentReport = {
  failures: EquipmentFailure[]; // newest first
  mtbfDays: number | null;
  mttrDays: number | null;
  recurrences: number;
  partsCost: number;
  // Some consumed repuesto was never bought, so it has no price.
  partsCostIncomplete: boolean;
  ageDays: number | null;
};

export const RECURRENCE_WINDOW_DAYS = 30;

// The ficha for HU-071's repair-or-replace call, over the equipo's whole
// history (not the selected period: the decision needs all of it).
export function equipmentReport(
  orders: WorkOrder[],
  equipment: Pick<Equipo, "id" | "installDate">,
  unitCosts: Map<number, number>,
  today: string,
): EquipmentReport {
  const own = orders.filter((o) => o.equipment_id === equipment.id);
  const correctives = own
    .filter((o) => o.type === "correctivo")
    .map((o) => ({ order: o, date: failureDate(o) }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.order.id - b.order.id));

  const failures: EquipmentFailure[] = correctives.map(({ order, date }, i) => {
    const faultType = order.fault_type_name;
    const recurrence =
      !!faultType &&
      correctives
        .slice(0, i)
        .some(
          (prev) =>
            prev.order.fault_type_name === faultType &&
            daysBetween(prev.date, date) <= RECURRENCE_WINDOW_DAYS,
        );
    return {
      orderId: order.id,
      date,
      faultType,
      endDate: order.end_date,
      repairDays: order.end_date
        ? Math.max(0, daysBetween(order.start_date, order.end_date))
        : null,
      recurrence,
    };
  });

  const gaps = correctives.slice(1).map((c, i) => daysBetween(correctives[i].date, c.date));
  const repairs = failures.flatMap((f) => (f.repairDays == null ? [] : [f.repairDays]));

  let partsCost = 0;
  let partsCostIncomplete = false;
  for (const o of own) {
    if (!isAnalyzed(o)) continue;
    for (const t of o.tasks) {
      for (const part of t.consumedParts) {
        const cost = unitCosts.get(part.repId);
        if (cost == null) partsCostIncomplete = true;
        else partsCost += cost * part.cantidad;
      }
    }
  }

  return {
    failures: [...failures].reverse(),
    mtbfDays: average(gaps),
    mttrDays: average(repairs),
    recurrences: failures.filter((f) => f.recurrence).length,
    partsCost,
    partsCostIncomplete,
    ageDays: equipment.installDate ? Math.max(0, daysBetween(equipment.installDate, today)) : null,
  };
}

export type FaultTypeCount = { name: string; count: number; gravedad: Gravedad | null };

export const UNDIAGNOSED_FAULT = "Sin tipo de falla";

export function faultTypeRanking(
  orders: WorkOrder[],
  period: StatsPeriod,
  gravedadByName: Map<string, Gravedad>,
  limit = 8,
): FaultTypeCount[] {
  const counts = new Map<string, number>();
  for (const o of orders) {
    if (o.type !== "correctivo" || !inPeriod(failureDate(o), period)) continue;
    const name = o.fault_type_name ?? UNDIAGNOSED_FAULT;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count, gravedad: gravedadByName.get(name) ?? null }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Solicitudes (HU-075)

export type RequestKpis = {
  total: number;
  // Solicitud reported → OT created, in hours.
  attentionHoursMedian: number | null;
  attendedCount: number;
  // Solicitud reported → first tarea started, in days.
  startDaysMedian: number | null;
  startedCount: number;
  rejectedCount: number;
  rejectedPct: number | null;
  topRejectReason: string | null;
};

export function computeRequestKpis(
  requests: Solicitud[],
  orders: WorkOrder[],
  period: StatsPeriod,
): RequestKpis {
  const inRange = requests.filter((r) => inPeriod(timestampToDbDate(r.created_at), period));
  const orderBySolicitud = new Map(
    orders.filter((o) => o.sol_id_solicitud != null).map((o) => [o.sol_id_solicitud!, o]),
  );

  const attentionHours: number[] = [];
  const startDays: number[] = [];
  for (const r of inRange) {
    const order = orderBySolicitud.get(r.id);
    if (!order) continue;
    if (order.created_at) {
      const hours =
        (new Date(order.created_at).getTime() - new Date(r.created_at).getTime()) / 3.6e6;
      attentionHours.push(Math.max(0, hours));
    }
    const starts = order.tasks.flatMap((t) => (t.startDate ? [t.startDate] : [])).sort();
    if (starts.length > 0) {
      startDays.push(Math.max(0, daysBetween(timestampToDbDate(r.created_at), starts[0])));
    }
  }

  const rejected = inRange.filter((r) => r.status === "rejected");
  const reasons = new Map<string, number>();
  for (const r of rejected) {
    const reason = r.motivo_rechazo ?? "Sin motivo";
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }
  const topReason = [...reasons.entries()].sort((a, b) => b[1] - a[1])[0];

  return {
    total: inRange.length,
    attentionHoursMedian: median(attentionHours),
    attendedCount: attentionHours.length,
    startDaysMedian: median(startDays),
    startedCount: startDays.length,
    rejectedCount: rejected.length,
    rejectedPct: inRange.length ? (rejected.length / inRange.length) * 100 : null,
    topRejectReason: topReason?.[0] ?? null,
  };
}

export type LocationRequests = {
  location: string;
  resolved: number;
  pending: number;
  inProgress: number;
  rejected: number;
  total: number;
};

export function requestsByLocation(
  requests: Solicitud[],
  equipmentById: Map<number, Pick<Equipo, "location">>,
  period: StatsPeriod,
  limit = 10,
): LocationRequests[] {
  const byLocation = new Map<string, LocationRequests>();
  for (const r of requests) {
    if (!inPeriod(timestampToDbDate(r.created_at), period)) continue;
    const location = equipmentById.get(r.equipment_id)?.location || "Sin ubicación";
    const row = byLocation.get(location) ?? {
      location,
      resolved: 0,
      pending: 0,
      inProgress: 0,
      rejected: 0,
      total: 0,
    };
    if (r.status === "resolved") row.resolved += 1;
    else if (r.status === "rejected") row.rejected += 1;
    else if (r.status === "new") row.pending += 1;
    else row.inProgress += 1;
    row.total += 1;
    byLocation.set(location, row);
  }
  return [...byLocation.values()]
    .sort((a, b) => b.total - a.total || a.location.localeCompare(b.location))
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Repuestos y compras (HU-072, HU-073)

type PartUse = { repId: number; date: string; qty: number };

// Every repuesto that left the depósito: consumed on a finished tarea (any
// OT type — an installation uses stock too) or an egreso externo (0048).
function partUses(orders: WorkOrder[], movements: MovimientoStock[]): PartUse[] {
  const uses: PartUse[] = [];
  for (const o of orders) {
    for (const t of o.tasks) {
      if (!t.endDate) continue;
      for (const p of t.consumedParts)
        uses.push({ repId: p.repId, date: t.endDate, qty: p.cantidad });
    }
  }
  for (const m of movements) {
    if (m.ms_tipo !== "egreso") continue;
    uses.push({ repId: m.rep_id, date: timestampToDbDate(m.ms_creado_en), qty: m.ms_cantidad });
  }
  return uses;
}

export function partConsumption(
  orders: WorkOrder[],
  movements: MovimientoStock[],
  period: StatsPeriod,
): Map<number, number> {
  const totals = new Map<number, number>();
  for (const u of partUses(orders, movements)) {
    if (!inPeriod(u.date, period)) continue;
    totals.set(u.repId, (totals.get(u.repId) ?? 0) + u.qty);
  }
  return totals;
}

export type ConsumedPartTotal = { repId: number; name: string; qty: number };

export function topConsumedParts(
  consumption: Map<number, number>,
  parts: Pick<Repuesto, "rep_id" | "rep_nombre">[],
  limit = 10,
): ConsumedPartTotal[] {
  const names = new Map(parts.map((p) => [p.rep_id, p.rep_nombre]));
  return [...consumption.entries()]
    .filter(([, qty]) => qty > 0)
    .map(([repId, qty]) => ({ repId, name: names.get(repId) ?? `Repuesto ${repId}`, qty }))
    .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export type CoverageStatus = "reponer" | "cubierto" | "sin_uso";

export type CoverageRow = {
  repId: number;
  name: string;
  stock: number;
  minimum: number;
  consumed: number;
  perDay: number;
  // Days the current stock lasts at the period's pace; null without use.
  daysLeft: number | null;
  lastUse: string | null;
  status: CoverageStatus;
};

export const REORDER_DAYS = 30;
export const IDLE_DAYS = 90;

const COVERAGE_RANK: Record<CoverageStatus, number> = { reponer: 0, cubierto: 1, sin_uso: 2 };

// HU-072's "anticipar la reposición": how long each active repuesto's stock
// lasts at the period's consumption pace. "Reponer" = already at its
// mínimo or out in REORDER_DAYS or less; "sin uso" = stock that hasn't
// moved in IDLE_DAYS (money sitting on a shelf).
export function stockCoverage(
  parts: Repuesto[],
  orders: WorkOrder[],
  movements: MovimientoStock[],
  period: StatsPeriod,
  today: string,
): CoverageRow[] {
  const consumption = partConsumption(orders, movements, period);
  const lastUse = new Map<number, string>();
  for (const u of partUses(orders, movements)) {
    if ((lastUse.get(u.repId) ?? "") < u.date) lastUse.set(u.repId, u.date);
  }
  const days = periodLengthDays(period);

  return parts
    .filter((p) => p.rep_estado !== "inactivo")
    .map((p) => {
      const consumed = consumption.get(p.rep_id) ?? 0;
      const perDay = consumed / days;
      const daysLeft = perDay > 0 ? p.rep_cantidad_actual / perDay : null;
      const last = lastUse.get(p.rep_id) ?? null;
      let status: CoverageStatus = "cubierto";
      if (
        p.rep_cantidad_actual <= p.rep_stock_minimo ||
        (daysLeft != null && daysLeft <= REORDER_DAYS)
      ) {
        status = "reponer";
      } else if (p.rep_cantidad_actual > 0 && (!last || daysBetween(last, today) > IDLE_DAYS)) {
        status = "sin_uso";
      }
      return {
        repId: p.rep_id,
        name: p.rep_nombre,
        stock: p.rep_cantidad_actual,
        minimum: p.rep_stock_minimo,
        consumed,
        perDay,
        daysLeft,
        lastUse: last,
        status,
      };
    })
    .sort(
      (a, b) =>
        COVERAGE_RANK[a.status] - COVERAGE_RANK[b.status] ||
        (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity) ||
        a.name.localeCompare(b.name),
    );
}

function purchaseTotal(p: PurchaseWithDetail): number {
  if (p.co_costo_total != null) return Number(p.co_costo_total);
  return p.linea_compra.reduce(
    (s, l) => s + Number(l.lc_cantidad ?? 0) * Number(l.lc_costo_unitario ?? 0),
    0,
  );
}

export type SupplierPurchases = { supplierId: number; name: string; total: number; count: number };

export function purchasesBySupplier(
  purchases: PurchaseWithDetail[],
  period: StatsPeriod,
): SupplierPurchases[] {
  const bySupplier = new Map<number, SupplierPurchases>();
  for (const p of purchases) {
    if (!inPeriod(p.co_fecha_compra, period)) continue;
    const row = bySupplier.get(p.prov_id_proveedor) ?? {
      supplierId: p.prov_id_proveedor,
      name: p.proveedores?.prov_nombre ?? `Proveedor ${p.prov_id_proveedor}`,
      total: 0,
      count: 0,
    };
    row.total += purchaseTotal(p);
    row.count += 1;
    bySupplier.set(p.prov_id_proveedor, row);
  }
  return [...bySupplier.values()].sort((a, b) => b.total - a.total || b.count - a.count);
}

export type PurchasedPart = { repId: number; name: string; purchases: number };

// Repuestos that were ever bought, most often bought first — the options
// for the price comparison.
export function purchasedParts(purchases: PurchaseWithDetail[]): PurchasedPart[] {
  const byPart = new Map<number, PurchasedPart>();
  for (const p of purchases) {
    for (const l of p.linea_compra) {
      if (l.lc_costo_unitario == null) continue;
      const row = byPart.get(l.rep_id) ?? {
        repId: l.rep_id,
        name: l.repuesto?.rep_nombre ?? `Repuesto ${l.rep_id}`,
        purchases: 0,
      };
      row.purchases += 1;
      byPart.set(l.rep_id, row);
    }
  }
  return [...byPart.values()].sort(
    (a, b) => b.purchases - a.purchases || a.name.localeCompare(b.name),
  );
}

export type SupplierPrice = {
  supplierId: number;
  supplier: string;
  lastPrice: number;
  lastDate: string | null;
  minPrice: number;
  maxPrice: number;
  purchases: number;
  // First → last price bought from this proveedor, in %; null with one buy.
  changePct: number | null;
};

// HU-073: what each proveedor charged for the same repuesto over time,
// cheapest current price first.
export function priceComparison(purchases: PurchaseWithDetail[], repId: number): SupplierPrice[] {
  const bySupplier = new Map<
    number,
    { supplier: string; buys: { date: string; id: number; price: number }[] }
  >();
  for (const p of purchases) {
    for (const l of p.linea_compra) {
      if (l.rep_id !== repId || l.lc_costo_unitario == null) continue;
      const entry = bySupplier.get(p.prov_id_proveedor) ?? {
        supplier: p.proveedores?.prov_nombre ?? `Proveedor ${p.prov_id_proveedor}`,
        buys: [],
      };
      entry.buys.push({
        date: p.co_fecha_compra ?? "",
        id: p.co_id_compra,
        price: Number(l.lc_costo_unitario),
      });
      bySupplier.set(p.prov_id_proveedor, entry);
    }
  }
  return [...bySupplier.entries()]
    .map(([supplierId, { supplier, buys }]) => {
      const sorted = [...buys].sort((a, b) =>
        a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id,
      );
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const prices = sorted.map((b) => b.price);
      return {
        supplierId,
        supplier,
        lastPrice: last.price,
        lastDate: last.date || null,
        minPrice: Math.min(...prices),
        maxPrice: Math.max(...prices),
        purchases: sorted.length,
        changePct:
          sorted.length > 1 && first.price > 0
            ? ((last.price - first.price) / first.price) * 100
            : null,
      };
    })
    .sort((a, b) => a.lastPrice - b.lastPrice || a.supplier.localeCompare(b.supplier));
}

// ---------------------------------------------------------------------------
// Inicio (today's alerts)

// Open OTs whose fecha estimada already passed, most overdue first.
export function overdueOrders(orders: WorkOrder[], today: string): WorkOrder[] {
  return orders
    .filter((o) => o.status !== "resolved" && !!o.planned_end_date && o.planned_end_date < today)
    .sort((a, b) => (a.planned_end_date! < b.planned_end_date! ? -1 : 1));
}

// ---------------------------------------------------------------------------
// Formatting (UI strings are Spanish)

export function formatNumber(n: number, maxDecimals = 1): string {
  return n.toLocaleString("es-AR", { maximumFractionDigits: maxDecimals });
}

export function formatMoney(n: number): string {
  return `$${n.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

export function formatDays(n: number | null): string {
  if (n == null) return "—";
  // Dates have no time of day: a tarea started and finished the same day
  // counts 0 days, which really means "less than a day".
  if (n < 1) return "< 1 día";
  const rounded = Math.round(n * 10) / 10;
  return `${formatNumber(rounded)} ${rounded === 1 ? "día" : "días"}`;
}

export function formatSignedDays(n: number | null): string {
  if (n == null) return "—";
  const rounded = Math.round(n * 10) / 10;
  if (rounded === 0) return "0 días";
  const abs = formatNumber(Math.abs(rounded));
  return `${rounded > 0 ? "+" : "−"}${abs} ${Math.abs(rounded) === 1 ? "día" : "días"}`;
}

export function formatHours(n: number | null): string {
  if (n == null) return "—";
  if (n < 1) return `${Math.max(1, Math.round(n * 60))} min`;
  if (n < 48) return `${formatNumber(n)} h`;
  return formatDays(n / 24);
}

export function formatPct(n: number | null): string {
  return n == null ? "—" : `${formatNumber(n, 0)}%`;
}
