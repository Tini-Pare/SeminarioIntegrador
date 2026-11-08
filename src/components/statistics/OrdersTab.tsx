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
  type OrderRow,
} from "../../lib/statistics";
import { useTheme } from "../../lib/ThemeContext";
import { ColumnChart } from "../charts/ColumnChart";
import { KpiRow, KpiTile } from "../charts/KpiTile";
import { ORDER_TYPE_SERIES } from "../charts/palette";
import { EmptyChart, StatPanel } from "../charts/StatPanel";
import { StatTable, type StatColumn } from "../charts/StatTable";
import {
  ORDER_STATUS_LABELS,
  ORDER_TYPE_LABELS,
  PRIORITY_LABELS,
  Pill,
  TabStack,
  type StatsTabProps,
} from "./shared";

// HU-074: OTs by period, type and resolution time. Instead of one average
// resolution time (OTs differ too much for it to mean anything, per the
// cátedra), each OT is measured against its own fecha estimada.
export function OrdersTab({ data, period, type, today, equipmentById }: StatsTabProps) {
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

      <StatPanel
        title="Correctivas vs. preventivas"
        caption={`OT iniciadas por ${granularity === "week" ? "semana" : "mes"}. Compara los dos tipos, así que no usa el filtro de tipo.`}
      >
        <ColumnChart buckets={buckets} series={ORDER_TYPE_SERIES} />
      </StatPanel>

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
