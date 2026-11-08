import {
  NEUTRAL_BAR,
  ORDER_TYPE_SERIES,
  REQUEST_STATUS_SERIES,
} from "../components/charts/palette";
import type { ChartSeries } from "../components/charts/palette";
import { fromDbDate } from "../components/CustomDatePicker";
import {
  ORDER_STATUS_LABELS,
  ORDER_TYPE_LABELS,
  PRIORITY_LABELS,
  personName,
} from "../components/statistics/shared";
import { formatOrderNumber } from "./orderNumber";
import { GRAVEDAD_LABELS } from "./queries/faultTypes";
import type { StatisticsData } from "./queries/statistics";
import {
  IDLE_DAYS,
  RECURRENCE_WINDOW_DAYS,
  REORDER_DAYS,
  bucketGranularity,
  computeOrderKpis,
  computeRequestKpis,
  equipmentReport,
  faultTypeRanking,
  formatDays,
  formatHours,
  formatMoney,
  formatNumber,
  formatPct,
  formatSignedDays,
  lastUnitCosts,
  orderResolutionRows,
  ordersByBucket,
  partConsumption,
  priceComparison,
  purchasedParts,
  purchasesBySupplier,
  requestsByLocation,
  stockCoverage,
  taskComplexityRanking,
  tasksByTechnician,
  technicianPerformance,
  topConsumedParts,
  topFailingEquipment,
  type CoverageStatus,
  type OrderTypeFilter,
  type StatsPeriod,
} from "./statistics";
import { LOGO_MARK_DATA_URI } from "./statisticsPdfLogo";
import { light } from "./theme";
import type { Equipo, Profile } from "../types/database";

// HU-077: the active Estadísticas tab, with the period (and OT type) the
// admin has selected, as a printable HTML document. The same HTML becomes a
// PDF file on mobile (expo-print) and goes through the browser's print
// dialog on web, where "Guardar como PDF" is one of the destinations — see
// lib/exportPdf. Every number comes from the same lib/statistics functions
// the screen uses, so the paper can't disagree with the screen.
//
// Paper is always light: it uses the light palette regardless of the app
// theme. Things that only make sense on screen (hover details, "tocá uno")
// are replaced by text: stacked bars print their per-series split, and
// lists the screen trims (an equipo's history) print in full.

export type StatisticsTabKey = "orders" | "technicians" | "equipment" | "requests" | "parts";

export const STATISTICS_TAB_LABELS: Record<StatisticsTabKey, string> = {
  orders: "Órdenes de trabajo",
  technicians: "Técnicos",
  equipment: "Equipos",
  requests: "Solicitudes",
  parts: "Repuestos y compras",
};

export const TAB_USES_TYPE: Record<StatisticsTabKey, boolean> = {
  orders: true,
  technicians: true,
  equipment: false,
  requests: false,
  parts: false,
};

const TYPE_FILTER_LABELS: Record<OrderTypeFilter, string> = {
  all: "Todas",
  correctivo: "Correctivas",
  preventivo: "Preventivas",
};

const FILE_SLUGS: Record<StatisticsTabKey, string> = {
  orders: "Ordenes-de-trabajo",
  technicians: "Tecnicos",
  equipment: "Equipos",
  requests: "Solicitudes",
  parts: "Repuestos-y-compras",
};

const COMPLEXITY_LIMIT = 10;

const COVERAGE_LABELS: Record<CoverageStatus, string> = {
  reponer: "Reponer pronto",
  cubierto: "Cubierto",
  sin_uso: "Sin uso",
};

export type StatisticsPdfInput = {
  tab: StatisticsTabKey;
  data: StatisticsData;
  period: StatsPeriod;
  type: OrderTypeFilter;
  today: string;
  equipmentById: Map<number, Equipo>;
  profileById: Map<string, Profile>;
  // What the Equipos / Repuestos tabs have picked in their selectors; null
  // falls back to the same default the tab shows (the ranking's leader).
  selectedEquipmentId: number | null;
  selectedPartId: number | null;
  generatedAt: Date;
  generatedBy: string | null;
};

// e.g. "Mantia_Estadisticas_Equipos_2026-08-11_a_2026-11-08" (no extension:
// the web print dialog adds ".pdf" itself, mobile appends it).
export function statisticsPdfBaseName(tab: StatisticsTabKey, period: StatsPeriod): string {
  return `Mantia_Estadisticas_${FILE_SLUGS[tab]}_${period.from}_a_${period.to}`;
}

export function buildStatisticsHtml(input: StatisticsPdfInput): string {
  const { tab, period, type } = input;
  const body = SECTION_BUILDERS[tab](input);
  const generated = `${formatDateTime(input.generatedAt)}${input.generatedBy ? ` por ${esc(input.generatedBy)}` : ""}`;

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${esc(statisticsPdfBaseName(tab, period))}</title>
<style>${CSS}</style>
</head>
<body>
<header class="doc-header">
  <div class="brand">
    <img class="brand-logo" src="${LOGO_MARK_DATA_URI}" alt="Logo de Mantia">
    <div>
      <div class="brand-name">Mantia</div>
      <div class="brand-sub">Sistema de mantenimiento</div>
    </div>
  </div>
  <div class="doc-meta">
    <div class="doc-kicker">Estadísticas</div>
    <div class="doc-title">${esc(STATISTICS_TAB_LABELS[tab])}</div>
    <div>Período: <strong>${fromDbDate(period.from)} al ${fromDbDate(period.to)}</strong></div>
    ${TAB_USES_TYPE[tab] ? `<div>Tipo de OT: <strong>${TYPE_FILTER_LABELS[type]}</strong></div>` : ""}
  </div>
</header>
<main>
${body}
</main>
<footer class="doc-footer">Generado el ${generated} · Mantia — Sistema de mantenimiento</footer>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// One builder per tab, mirroring the blocks of components/statistics/*Tab.

const SECTION_BUILDERS: Record<StatisticsTabKey, (input: StatisticsPdfInput) => string> = {
  orders: ordersSection,
  technicians: techniciansSection,
  equipment: equipmentSection,
  requests: requestsSection,
  parts: partsSection,
};

function ordersSection({ data, period, type, today, equipmentById }: StatisticsPdfInput): string {
  const kpis = computeOrderKpis(data.orders, period, type);
  const granularity = bucketGranularity(period);
  const buckets = ordersByBucket(data.orders, period);
  const rows = orderResolutionRows(data.orders, period, type, today);

  const priorityTone = {
    low: light.urgencyLow,
    medium: light.urgencyMedium,
    high: light.urgencyHigh,
  };

  return [
    kpiRow([
      { label: "OT cerradas", value: String(kpis.closed), hint: "Cerradas en el período" },
      {
        label: "Cerradas en término",
        value: formatPct(kpis.onTimePct),
        hint: kpis.withPlannedDate
          ? `Sobre ${kpis.withPlannedDate} con fecha estimada`
          : "Ninguna cerrada tenía fecha estimada",
      },
      {
        label: "Desvío promedio",
        value: formatSignedDays(kpis.avgDeviationDays),
        hint: "Cierre − fecha estimada (+ = tarde)",
      },
    ]),
    panel(
      "Correctivas vs. preventivas",
      `OT iniciadas por ${granularity === "week" ? "semana" : "mes"}. Compara los dos tipos, así que no usa el filtro de tipo.`,
      buckets.length === 0
        ? empty("No hay órdenes de trabajo iniciadas en el período.")
        : barList(
            ORDER_TYPE_SERIES,
            buckets.map((b) => ({
              label: granularity === "week" ? `Semana del ${b.label}` : b.label,
              values: { correctivo: b.correctivo, preventivo: b.preventivo },
            })),
          ),
      { keep: true },
    ),
    panel(
      "OT del período, de la más demorada a la menos",
      "Iniciadas en el período. Desvío = cierre (o hoy, si sigue abierta) − fecha estimada. * sigue abierta: cuenta hasta hoy.",
      rows.length === 0
        ? empty("No hay órdenes de trabajo iniciadas en el período.")
        : table(
            [
              { label: "N° OT" },
              { label: "Equipo" },
              { label: "Tipo" },
              { label: "Prioridad" },
              { label: "Estado" },
              { label: "Resolución", right: true },
              { label: "Desvío", right: true },
            ],
            rows.map((r) => [
              esc(formatOrderNumber(r.id)),
              esc(equipmentById.get(r.equipmentId)?.name ?? "Equipo desconocido"),
              esc(ORDER_TYPE_LABELS[r.type]),
              pill(PRIORITY_LABELS[r.priority], priorityTone[r.priority]),
              esc(ORDER_STATUS_LABELS[r.status]),
              esc(r.endDate ? formatDays(r.resolutionDays) : `${formatDays(r.resolutionDays)}*`),
              signed(formatSignedDays(r.deviationDays), r.deviationDays, {
                goodWhenNegative: false,
              }),
            ]),
          ),
    ),
  ].join("\n");
}

function techniciansSection({ data, period, type, profileById }: StatisticsPdfInput): string {
  const counts = tasksByTechnician(data.orders, period, type);
  const performance = technicianPerformance(data.orders, period, type);
  const complexity = taskComplexityRanking(data.orders, period, type).slice(0, COMPLEXITY_LIMIT);
  const series = ORDER_TYPE_SERIES.filter((s) => type === "all" || s.key === type);
  const noTasks = empty("Ningún técnico terminó tareas en el período.");

  return [
    panel(
      "Rendimiento por técnico",
      "“Vs. el área”: cuántos días más (+) o menos (−) que el promedio del área tardó en cada tarea, comparando siempre la misma tarea general. Así no se castiga a quien hace los trabajos largos.",
      performance.length === 0
        ? noTasks
        : table(
            [
              { label: "Técnico" },
              { label: "Tareas", right: true },
              { label: "Promedio por tarea", right: true },
              { label: "Vs. el área", right: true },
            ],
            performance.map((r) => [
              esc(personName(profileById, r.technicianId)),
              String(r.finished),
              esc(formatDays(r.avgDays)),
              signed(formatSignedDays(r.vsAreaDays), r.vsAreaDays, { goodWhenNegative: true }),
            ]),
          ),
    ),
    panel(
      "Tareas finalizadas por técnico",
      "Terminadas en el período.",
      counts.length === 0
        ? noTasks
        : barList(
            series,
            counts.map((c) => ({
              label: personName(profileById, c.technicianId),
              values: { correctivo: c.correctivo, preventivo: c.preventivo },
            })),
          ),
      { keep: true },
    ),
    panel(
      "Tareas, de la más compleja a la más simple",
      "Días promedio que lleva cada tarea general, de inicio a fin.",
      complexity.length === 0
        ? empty("No hay tareas terminadas en el período.")
        : barList(
            [{ key: "days", label: "Días promedio", color: light.accent }],
            complexity.map((t) => ({
              label: t.name,
              sublabel: `${t.count} ${t.count === 1 ? "realizada" : "realizadas"}`,
              values: { days: t.avgDays },
              valueText: formatDays(t.avgDays),
            })),
          ),
      { keep: true },
    ),
  ].join("\n");
}

function equipmentSection(input: StatisticsPdfInput): string {
  const { data, period, today, equipmentById } = input;
  const top = topFailingEquipment(data.orders, period);
  const faults = faultTypeRanking(data.orders, period, data.gravedadByFault);
  const gravedadColor = {
    low: light.urgencyLow.accent,
    medium: light.urgencyMedium.accent,
    high: light.urgencyHigh.accent,
  };
  const noFaults = empty("No se reportaron fallas en el período.");

  const selectedId = input.selectedEquipmentId ?? top[0]?.equipmentId ?? null;
  const selected = selectedId != null ? equipmentById.get(selectedId) : undefined;
  const report = selected
    ? equipmentReport(data.orders, selected, lastUnitCosts(data.purchases), today)
    : null;

  let ficha: string;
  if (!selected || !report) {
    ficha = empty("No hay un equipo seleccionado.");
  } else {
    const stats = miniGrid([
      { label: "Roturas", value: String(report.failures.length) },
      {
        label: "Tiempo entre fallas",
        value: formatDays(report.mtbfDays),
        hint: report.mtbfDays == null ? "Hacen falta 2 roturas" : "Promedio (MTBF)",
      },
      {
        label: "Tiempo de reparación",
        value: formatDays(report.mttrDays),
        hint: "Promedio (MTTR)",
      },
      {
        label: "Reincidencias",
        value: String(report.recurrences),
        hint: `Misma falla en ≤ ${RECURRENCE_WINDOW_DAYS} días`,
        alert: report.recurrences > 0,
      },
      {
        label: "Gasto en repuestos",
        value: formatMoney(report.partsCost),
        hint: report.partsCostIncomplete
          ? "Hay repuestos sin precio de compra"
          : "A último precio de compra",
      },
      {
        label: "Antigüedad",
        value: formatAge(report.ageDays),
        hint: selected.installDate
          ? `Instalado el ${fromDbDate(selected.installDate)}`
          : "Sin fecha de instalación",
      },
    ]);
    const history =
      report.failures.length === 0
        ? empty("Este equipo no tiene roturas registradas.")
        : table(
            [
              { label: "Fecha" },
              { label: "Falla" },
              { label: "N° OT" },
              { label: "Reparación" },
              { label: "" },
            ],
            report.failures.map((f) => [
              fromDbDate(f.date),
              esc(f.faultType ?? "Sin tipo de falla"),
              esc(formatOrderNumber(f.orderId)),
              esc(
                f.repairDays == null ? "En reparación" : `Reparada en ${formatDays(f.repairDays)}`,
              ),
              f.recurrence ? pill("Reincidencia", light.urgencyHigh) : "",
            ]),
          );
    ficha = `<div class="ficha-name">${esc(`${selected.code} · ${selected.name}`)}</div>
${stats}
<h3>Historial de roturas</h3>
${history}`;
  }

  return [
    panel(
      "Equipos con más fallas",
      "Roturas (OT correctivas) reportadas en el período.",
      top.length === 0
        ? noFaults
        : barList(
            [{ key: "count", label: "Fallas", color: light.eqRepair.dot }],
            top.map((t) => {
              const e = equipmentById.get(t.equipmentId);
              return {
                label: e?.name ?? "Equipo desconocido",
                sublabel: e ? `${e.code} · ${e.location || "Sin ubicación"}` : undefined,
                values: { count: t.count },
              };
            }),
          ),
      { keep: true },
    ),
    panel(
      "Fallas más frecuentes",
      "Tipos de falla diagnosticados en las OT correctivas del período, coloreados por gravedad.",
      faults.length === 0
        ? noFaults
        : barList(
            [{ key: "count", label: "Fallas", color: NEUTRAL_BAR }],
            faults.map((f) => ({
              label: f.name,
              sublabel: f.gravedad
                ? `Gravedad ${GRAVEDAD_LABELS[f.gravedad].toLowerCase()}`
                : undefined,
              values: { count: f.count },
              color: f.gravedad ? gravedadColor[f.gravedad] : NEUTRAL_BAR,
            })),
            [
              { key: "high", label: GRAVEDAD_LABELS.high, color: gravedadColor.high },
              { key: "medium", label: GRAVEDAD_LABELS.medium, color: gravedadColor.medium },
              { key: "low", label: GRAVEDAD_LABELS.low, color: gravedadColor.low },
              { key: "none", label: "Sin tipo de falla", color: NEUTRAL_BAR },
            ],
          ),
      { keep: true },
    ),
    panel(
      "Ficha del equipo",
      "Historial completo del equipo (no usa el filtro de período): lo que hace falta para decidir si conviene seguir reparándolo o reemplazarlo.",
      ficha,
    ),
  ].join("\n");
}

function requestsSection({ data, period, equipmentById }: StatisticsPdfInput): string {
  const kpis = computeRequestKpis(data.requests, data.orders, period);
  const byLocation = requestsByLocation(data.requests, equipmentById, period);

  return [
    kpiRow([
      {
        label: "Tiempo de atención",
        value: formatHours(kpis.attentionHoursMedian),
        hint: `Mediana, de la solicitud a la OT · ${kpis.attendedCount} ${kpis.attendedCount === 1 ? "solicitud" : "solicitudes"}`,
      },
      {
        label: "Tiempo en darle curso",
        value: formatDays(kpis.startDaysMedian),
        hint: `Mediana, hasta que arranca la primera tarea · ${kpis.startedCount} ${kpis.startedCount === 1 ? "solicitud" : "solicitudes"}`,
      },
      {
        label: "Tasa de rechazo",
        value: formatPct(kpis.rejectedPct),
        hint:
          kpis.total === 0
            ? "No hubo solicitudes en el período"
            : `${kpis.rejectedCount} de ${kpis.total}${kpis.topRejectReason ? ` · motivo principal: ${kpis.topRejectReason}` : ""}`,
      },
    ]),
    panel(
      "Ubicaciones con más solicitudes",
      "Solicitudes reportadas en el período por sector, según su estado actual.",
      byLocation.length === 0
        ? empty("No hubo solicitudes en el período.")
        : barList(
            REQUEST_STATUS_SERIES,
            byLocation.map((l) => ({
              label: l.location,
              values: {
                resolved: l.resolved,
                pending: l.pending,
                inProgress: l.inProgress,
                rejected: l.rejected,
              },
            })),
          ),
      { keep: true },
    ),
  ].join("\n");
}

function partsSection(input: StatisticsPdfInput): string {
  const { data, period, today } = input;
  const consumed = topConsumedParts(
    partConsumption(data.orders, data.movements, period),
    data.parts,
  );
  const coverage = stockCoverage(data.parts, data.orders, data.movements, period, today);
  const suppliers = purchasesBySupplier(data.purchases, period);
  const bought = purchasedParts(data.purchases);

  const partId = input.selectedPartId ?? bought[0]?.repId ?? null;
  const part = bought.find((p) => p.repId === partId);
  const prices = partId != null ? priceComparison(data.purchases, partId) : [];

  const coverageTone: Record<CoverageStatus, { bg: string; fg: string }> = {
    reponer: light.urgencyHigh,
    cubierto: light.eqOperational,
    sin_uso: light.eqWaiting,
  };

  return [
    panel(
      "Repuestos más consumidos",
      "Unidades usadas en tareas terminadas más egresos externos del período.",
      consumed.length === 0
        ? empty("No se consumieron repuestos en el período.")
        : barList(
            [{ key: "qty", label: "Unidades", color: light.accent }],
            consumed.map((p) => ({
              label: p.name,
              values: { qty: p.qty },
              valueText: formatNumber(p.qty),
            })),
          ),
      { keep: true },
    ),
    panel(
      "Compras por proveedor",
      "Monto comprado a cada proveedor en el período.",
      suppliers.length === 0
        ? empty("No hubo compras en el período.")
        : barList(
            [{ key: "total", label: "Monto", color: light.accent }],
            suppliers.map((s) => ({
              label: s.name,
              sublabel: `${s.count} ${s.count === 1 ? "compra" : "compras"}`,
              values: { total: s.total },
              valueText: formatMoney(s.total),
            })),
          ),
      { keep: true },
    ),
    panel(
      "Cobertura de stock",
      `Cuántos días alcanza el stock al ritmo de consumo del período. “Reponer pronto”: ya está en su mínimo o se agota en ${REORDER_DAYS} días o menos. “Sin uso”: tiene stock pero no se usó en más de ${IDLE_DAYS} días (plata inmovilizada).`,
      coverage.length === 0
        ? empty("No hay repuestos activos.")
        : table(
            [
              { label: "Repuesto" },
              { label: "Stock / mín.", right: true },
              { label: "Consumo", right: true },
              { label: "Alcanza para", right: true },
              { label: "Último uso", right: true },
              { label: "Estado" },
            ],
            coverage.map((r) => [
              esc(r.name),
              esc(`${formatNumber(r.stock)} / ${formatNumber(r.minimum)}`),
              esc(formatNumber(r.consumed)),
              esc(formatStockDays(r.daysLeft)),
              r.lastUse ? fromDbDate(r.lastUse) : "Nunca",
              pill(COVERAGE_LABELS[r.status], coverageTone[r.status]),
            ]),
          ),
    ),
    panel(
      part ? `Precio por proveedor · ${part.name}` : "Precio por proveedor",
      "Historial completo de compras del repuesto (no usa el filtro de período), del precio actual más barato al más caro. Variación = primera → última compra a ese proveedor.",
      prices.length === 0
        ? empty("Todavía no hay compras con precio registrado.")
        : table(
            [
              { label: "Proveedor" },
              { label: "Último precio", right: true },
              { label: "Mín. – máx.", right: true },
              { label: "Variación", right: true },
              { label: "Compras", right: true },
              { label: "Última compra", right: true },
            ],
            prices.map((r) => [
              esc(r.supplier),
              esc(formatMoney(r.lastPrice)),
              esc(
                r.minPrice === r.maxPrice
                  ? formatMoney(r.minPrice)
                  : `${formatMoney(r.minPrice)} – ${formatMoney(r.maxPrice)}`,
              ),
              signed(
                r.changePct == null
                  ? "—"
                  : `${r.changePct > 0 ? "+" : ""}${formatPct(r.changePct)}`,
                r.changePct,
                { goodWhenNegative: true, bold: false },
              ),
              String(r.purchases),
              r.lastDate ? fromDbDate(r.lastDate) : "—",
            ]),
          ),
      { keep: true },
    ),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// HTML pieces

export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// A panel that fits on one page shouldn't be split between two ("keep");
// tables may run across pages, repeating their header.
function panel(title: string, caption: string, content: string, opts: { keep?: boolean } = {}) {
  return `<section class="panel${opts.keep ? " keep" : ""}">
<h2>${esc(title)}</h2>
<p class="caption">${esc(caption)}</p>
${content}
</section>`;
}

function empty(text: string): string {
  return `<p class="empty">${esc(text)}</p>`;
}

function kpiRow(tiles: { label: string; value: string; hint: string }[]): string {
  return `<div class="kpis keep">${tiles
    .map(
      (t) => `<div class="kpi">
<div class="kpi-label">${esc(t.label)}</div>
<div class="kpi-value">${esc(t.value)}</div>
<div class="kpi-hint">${esc(t.hint)}</div>
</div>`,
    )
    .join("")}</div>`;
}

function miniGrid(
  items: { label: string; value: string; hint?: string; alert?: boolean }[],
): string {
  return `<div class="mini-grid">${items
    .map(
      (m) => `<div class="mini">
<div class="kpi-label">${esc(m.label)}</div>
<div class="mini-value${m.alert ? " alert" : ""}">${esc(m.value)}</div>
${m.hint ? `<div class="kpi-hint">${esc(m.hint)}</div>` : ""}
</div>`,
    )
    .join("")}</div>`;
}

type PdfBarRow = {
  label: string;
  sublabel?: string;
  values: Record<string, number>;
  valueText?: string;
  color?: string;
};

// Horizontal bars like components/charts/BarList. With more than one series
// the split that the screen shows on hover is printed under the label.
function barList(series: ChartSeries[], rows: PdfBarRow[], legendItems?: ChartSeries[]): string {
  const totalOf = (r: PdfBarRow) => series.reduce((s, ser) => s + (r.values[ser.key] ?? 0), 0);
  const max = Math.max(1, ...rows.map(totalOf));
  const legend = legendItems ?? (series.length > 1 ? series : []);

  const legendHtml =
    legend.length > 0
      ? `<div class="legend">${legend
          .map((l) => `<span><i style="background:${l.color}"></i>${esc(l.label)}</span>`)
          .join("")}</div>`
      : "";

  const rowsHtml = rows
    .map((r) => {
      const total = totalOf(r);
      const split =
        series.length > 1
          ? series.map((s) => `${s.label} ${formatNumber(r.values[s.key] ?? 0)}`).join(" · ")
          : undefined;
      const sub = [r.sublabel, split].filter(Boolean).join(" · ");
      const segments = series
        .filter((s) => (r.values[s.key] ?? 0) > 0)
        .map(
          (s) =>
            `<span style="width:${(((r.values[s.key] ?? 0) / max) * 100).toFixed(2)}%;background:${r.color ?? s.color}"></span>`,
        )
        .join("");
      return `<div class="bar-row">
<div class="bar-label"><div>${esc(r.label)}</div>${sub ? `<small>${esc(sub)}</small>` : ""}</div>
<div class="bar-track">${segments}</div>
<div class="bar-value">${esc(r.valueText ?? formatNumber(total))}</div>
</div>`;
    })
    .join("");

  return `${legendHtml}<div class="bars">${rowsHtml}</div>`;
}

// Cells arrive as ready HTML: callers escape text and may pass a pill.
function table(columns: { label: string; right?: boolean }[], rows: string[][]): string {
  const cls = (c: { right?: boolean }) => (c.right ? ' class="num"' : "");
  return `<table>
<thead><tr>${columns.map((c) => `<th${cls(c)}>${esc(c.label)}</th>`).join("")}</tr></thead>
<tbody>${rows
    .map((r) => `<tr>${r.map((cell, i) => `<td${cls(columns[i])}>${cell}</td>`).join("")}</tr>`)
    .join("")}</tbody>
</table>`;
}

function pill(text: string, tone: { bg: string; fg: string }): string {
  return `<span class="pill" style="background:${tone.bg};color:${tone.fg}">${esc(text)}</span>`;
}

// A signed value colored like on screen: bad direction red and bold,
// good direction green (where the screen shows it), zero/unknown neutral.
function signed(
  text: string,
  value: number | null,
  { goodWhenNegative, bold = true }: { goodWhenNegative: boolean; bold?: boolean },
): string {
  const rounded = value == null ? 0 : Math.round(value * 10) / 10;
  const bad = rounded > 0;
  const good = rounded < 0 && goodWhenNegative;
  const color = bad ? light.destructive : good ? light.success : light.textLabel;
  const weight = bold && rounded !== 0 && (bad || goodWhenNegative) ? "700" : "400";
  return `<span style="color:${color};font-weight:${weight}">${esc(text)}</span>`;
}

function formatAge(days: number | null): string {
  if (days == null) return "—";
  if (days < 60) return formatDays(days);
  const months = Math.floor(days / 30.44);
  if (months < 24) return `${months} meses`;
  return `${Math.floor(days / 365.25)} años`;
}

function formatStockDays(days: number | null): string {
  if (days == null) return "—";
  if (days > 365) return "+1 año";
  return `${formatNumber(Math.floor(days), 0)} días`;
}

function formatDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} a las ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const c = light;

const CSS = `
@page { size: A4; margin: 14mm 12mm; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { margin: 0; padding: 0; background: #ffffff; }
body {
  font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 11px; line-height: 1.4; color: ${c.text};
}
.doc-header {
  display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;
  padding-bottom: 12px; margin-bottom: 16px; border-bottom: 2px solid ${c.accent};
}
.brand { display: flex; align-items: center; gap: 10px; }
.brand-logo { width: 52px; height: 52px; }
.brand-name { font-size: 20px; font-weight: 700; letter-spacing: 0.5px; }
.brand-sub { font-size: 10px; letter-spacing: 1.2px; text-transform: uppercase; color: ${c.textSecondary}; }
.doc-meta { text-align: right; color: ${c.textSecondary}; }
.doc-meta strong { color: ${c.text}; }
.doc-kicker { font-size: 10px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; color: ${c.accent}; }
.doc-title { font-size: 17px; font-weight: 700; color: ${c.text}; margin-bottom: 2px; }
.keep { break-inside: avoid; page-break-inside: avoid; }
.panel { margin-bottom: 14px; border: 1px solid ${c.border}; border-radius: 8px; padding: 12px 14px; }
.panel h2 { font-size: 13px; margin: 0 0 2px; }
.panel h3 { font-size: 12px; margin: 14px 0 6px; }
.caption { margin: 0 0 10px; color: ${c.textSecondary}; font-size: 10px; }
.empty { margin: 4px 0; color: ${c.textMuted}; font-style: italic; }
.kpis { display: flex; gap: 10px; margin-bottom: 14px; }
.kpi, .mini { flex: 1; border: 1px solid ${c.border}; border-radius: 8px; padding: 10px 12px; background: ${c.bgStatCard}; }
.kpi-label { font-size: 9px; font-weight: 600; letter-spacing: 0.4px; text-transform: uppercase; color: ${c.textMuted}; }
.kpi-value { font-size: 20px; font-weight: 700; margin-top: 2px; }
.kpi-hint { font-size: 9.5px; color: ${c.textSecondary}; margin-top: 2px; }
.mini-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.mini { flex: 1 1 30%; }
.mini-value { font-size: 15px; font-weight: 700; margin-top: 2px; }
.mini-value.alert { color: ${c.destructive}; }
.ficha-name { font-size: 12px; font-weight: 600; margin-bottom: 8px; }
.legend { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 8px; font-size: 10px; color: ${c.textSecondary}; }
.legend i { display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 4px; vertical-align: -1px; }
.bars { display: flex; flex-direction: column; gap: 6px; }
.bar-row { display: flex; align-items: center; gap: 10px; break-inside: avoid; page-break-inside: avoid; }
.bar-label { width: 34%; min-width: 0; }
.bar-label small { display: block; font-size: 9px; color: ${c.textMuted}; }
.bar-track { flex: 1; display: flex; gap: 2px; height: 12px; }
.bar-track span { display: block; height: 12px; border-radius: 2px; }
.bar-value { width: 70px; text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }
table { width: 100%; border-collapse: collapse; font-size: 10px; }
thead { display: table-header-group; }
th { text-align: left; background: ${c.bgTableHeader}; color: ${c.textLabel}; font-weight: 600; padding: 5px 6px; }
td { padding: 5px 6px; border-top: 1px solid ${c.borderRow}; vertical-align: middle; }
tr { break-inside: avoid; page-break-inside: avoid; }
.num { text-align: right; font-variant-numeric: tabular-nums; }
.pill { display: inline-block; padding: 1px 7px; border-radius: 999px; font-size: 9.5px; font-weight: 600; white-space: nowrap; }
.doc-footer { margin-top: 18px; padding-top: 8px; border-top: 1px solid ${c.border}; font-size: 9px; color: ${c.textMuted}; text-align: center; }
`;
