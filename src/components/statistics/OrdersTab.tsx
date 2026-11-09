import { router } from "expo-router";
import { useMemo } from "react";
import { Text } from "react-native";
import { formatOrderNumber } from "../../lib/orderNumber";
import {
  bucketGranularity,
  computeOrderKpis,
  formatDays,
  formatPct,
  formatSignedDays,
  orderResolutionRows,
  ordersByBucket,
  planCompliance,
  resolutionByPriority,
  type OrderRow,
  type PlanCompliance,
} from "../../lib/statistics";
import { useTheme } from "../../lib/ThemeContext";
import { BarList } from "../charts/BarList";
import { ColumnChart } from "../charts/ColumnChart";
import { KpiRow, KpiTile } from "../charts/KpiTile";
import { ORDER_TYPE_SERIES } from "../charts/palette";
import { EmptyChart, StatPanel } from "../charts/StatPanel";
import { StatTable, type StatColumn } from "../charts/StatTable";
import {
  ORDER_STATUS_LABELS,
  ORDER_TYPE_LABELS,
  PRIORITY_LABELS,
  Column,
  Pill,
  TabStack,
  TwoColumns,
  type StatsTabProps,
} from "./shared";

// HU-074: OTs by period, type and resolution time. Instead of one average
// resolution time (OTs differ too much for it to mean anything, per the
// cátedra), each OT is measured against its own fecha estimada.
export function OrdersTab({ data, period, type, today, equipmentById, isWide }: StatsTabProps) {
  const { colors } = useTheme();

  const kpis = useMemo(() => computeOrderKpis(data.orders, period, type), [data, period, type]);
  const granularity = bucketGranularity(period);
  const buckets = useMemo(
    () =>
      ordersByBucket(data.orders, period).map((b) => ({
        key: b.key,
        label: b.label,
        detailLabel: granularity === "week" ? `Semana del ${b.label}` : b.label,
        values: { correctivo: b.correctivo, preventivo: b.preventivo },
      })),
    [data, period, granularity],
  );
  const rows = useMemo(
    () => orderResolutionRows(data.orders, period, type, today),
    [data, period, type, today],
  );

  const byPriority = useMemo(
    () => resolutionByPriority(data.orders, period, type),
    [data, period, type],
  );
  const plans = useMemo(
    () => planCompliance(data.orders, data.plans, period, today),
    [data, period, today],
  );

  const priorityColors = {
    low: colors.urgencyLow,
    medium: colors.urgencyMedium,
    high: colors.urgencyHigh,
  };

  const columns: StatColumn<OrderRow>[] = [
    { key: "id", label: "N° OT", flex: 0.8, render: (r) => formatOrderNumber(r.id) },
    {
      key: "equipo",
      label: "Equipo",
      flex: 1.7,
      render: (r) => equipmentById.get(r.equipmentId)?.name ?? "Equipo desconocido",
    },
    { key: "tipo", label: "Tipo", flex: 1, render: (r) => ORDER_TYPE_LABELS[r.type] },
    {
      key: "prioridad",
      label: "Prioridad",
      flex: 0.9,
      render: (r) => (
        <Pill
          text={PRIORITY_LABELS[r.priority]}
          bg={priorityColors[r.priority].bg}
          fg={priorityColors[r.priority].fg}
        />
      ),
    },
    { key: "estado", label: "Estado", flex: 0.9, render: (r) => ORDER_STATUS_LABELS[r.status] },
    {
      key: "resolucion",
      label: "Resolución",
      flex: 1,
      align: "right",
      render: (r) =>
        r.endDate ? formatDays(r.resolutionDays) : `${formatDays(r.resolutionDays)}*`,
    },
    {
      key: "desvio",
      label: "Desvío",
      flex: 0.9,
      align: "right",
      render: (r) => (
        <Text
          style={{
            fontSize: 13.5,
            fontWeight: r.deviationDays != null && r.deviationDays > 0 ? "700" : "400",
            color:
              r.deviationDays != null && r.deviationDays > 0
                ? colors.destructive
                : colors.textLabel,
            textAlign: "right",
          }}
        >
          {formatSignedDays(r.deviationDays)}
        </Text>
      ),
    },
  ];

  const planColumns: StatColumn<PlanCompliance>[] = [
    { key: "plan", label: "Plan", flex: 2, render: (r) => r.name },
    {
      key: "frecuencia",
      label: "Frecuencia",
      flex: 1.1,
      render: (r) => (r.frequencyDays ? `Cada ${r.frequencyDays} días` : "—"),
    },
    { key: "total", label: "OT", flex: 0.6, align: "right", render: (r) => String(r.total) },
    {
      key: "atiempo",
      label: "A tiempo",
      flex: 0.9,
      align: "right",
      render: (r) => String(r.onTime),
    },
    { key: "tarde", label: "Tarde", flex: 0.7, align: "right", render: (r) => String(r.late) },
    {
      key: "vencidas",
      label: "Vencidas",
      flex: 0.9,
      align: "right",
      render: (r) => (
        <Text
          style={{
            fontSize: 13.5,
            textAlign: "right",
            fontWeight: r.overdue > 0 ? "700" : "400",
            color: r.overdue > 0 ? colors.destructive : colors.textLabel,
          }}
        >
          {r.overdue}
        </Text>
      ),
    },
    {
      key: "encurso",
      label: "En plazo",
      flex: 0.9,
      align: "right",
      render: (r) => String(r.inProgress),
    },
    {
      key: "cumplimiento",
      label: "Cumplimiento",
      flex: 1.1,
      align: "right",
      render: (r) => formatPct(r.compliancePct),
    },
  ];

  return (
    <TabStack>
      <KpiRow>
        <KpiTile label="OT cerradas" value={String(kpis.closed)} hint="Cerradas en el período" />

        <KpiTile
          label="Cerradas en término"
          value={formatPct(kpis.onTimePct)}
          hint={
            kpis.withPlannedDate
              ? `Sobre ${kpis.withPlannedDate} con fecha estimada`
              : "Ninguna cerrada tenía fecha estimada"
          }
        />

        <KpiTile
          label="Desvío promedio"
          value={formatSignedDays(kpis.avgDeviationDays)}
          hint="Cierre − fecha estimada (+ = tarde)"
        />
      </KpiRow>

      <TwoColumns isWide={isWide}>
        <Column>
          <StatPanel
            title="Correctivas vs. preventivas"
            caption={`OT iniciadas por ${granularity === "week" ? "semana" : "mes"}. Compara los dos tipos, así que no usa el filtro de tipo.`}
          >
            <ColumnChart buckets={buckets} series={ORDER_TYPE_SERIES} />
          </StatPanel>
        </Column>

        <Column>
          <StatPanel
            title="Tiempo de resolución por prioridad"
            caption="Mediana de días de inicio a cierre de las OT cerradas en el período. ¿Las urgentes se resuelven más rápido?"
          >
            {byPriority.every((p) => p.closed === 0) ? (
              <EmptyChart text="No se cerraron órdenes de trabajo en el período." />
            ) : (
              <BarList
                series={[{ key: "days", label: "Mediana", color: colors.accent }]}
                rows={byPriority.map((p) => ({
                  key: p.priority,
                  label: PRIORITY_LABELS[p.priority],
                  sublabel: `${p.closed} ${p.closed === 1 ? "cerrada" : "cerradas"}${p.withPlannedDate ? ` · ${formatPct(p.onTimePct)} en término` : ""}`,
                  values: { days: p.medianDays ?? 0 },
                  valueText: p.closed ? formatDays(p.medianDays) : "—",
                  color: priorityColors[p.priority].accent,
                }))}
                legend={[]}
                labelWidth={190}
              />
            )}
          </StatPanel>
        </Column>
      </TwoColumns>

      {type !== "correctivo" && (
        <StatPanel
          title="Cumplimiento por plan preventivo"
          caption="OT preventivas iniciadas en el período. El plazo es la fecha estimada si se cargó; si no, la frecuencia del plan (tiene que hacerse antes de que toque la siguiente). Cumplimiento = a tiempo / (a tiempo + tarde + vencidas)."
        >
          {plans.length === 0 ? (
            <EmptyChart text="No hay OT preventivas iniciadas en el período." />
          ) : (
            <StatTable
              columns={planColumns}
              rows={plans}
              rowKey={(r) => `${r.planId ?? r.name}`}
              minWidth={720}
              resetKey={`${period.from}|${period.to}`}
            />
          )}
        </StatPanel>
      )}

      <StatPanel
        title="OT del período, de la más demorada a la menos"
        caption="Iniciadas en el período. Desvío = cierre (o hoy, si sigue abierta) − fecha estimada. * sigue abierta: cuenta hasta hoy."
      >
        {rows.length === 0 ? (
          <EmptyChart text="No hay órdenes de trabajo iniciadas en el período." />
        ) : (
          <StatTable
            columns={columns}
            rows={rows}
            rowKey={(r) => r.id}
            onRowPress={(r) => router.push(`/work-orders/${r.id}` as never)}
            minWidth={720}
            resetKey={`${period.from}|${period.to}|${type}`}
          />
        )}
      </StatPanel>
    </TabStack>
  );
}
