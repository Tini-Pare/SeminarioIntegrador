import { useMemo } from "react";
import { Text } from "react-native";
import {
  formatDays,
  formatSignedDays,
  suspensionsByReason,
  taskComplexityRanking,
  tasksByTechnician,
  technicianPerformance,
  type TechnicianPerformance,
} from "../../lib/statistics";
import { useTheme } from "../../lib/ThemeContext";
import { BarList } from "../charts/BarList";
import { ORDER_TYPE_SERIES } from "../charts/palette";
import { EmptyChart, StatPanel } from "../charts/StatPanel";
import { StatTable, type StatColumn } from "../charts/StatTable";
import { Column, TabStack, TwoColumns, personName, type StatsTabProps } from "./shared";

const COMPLEXITY_LIMIT = 10;

// HU-076 + "cuánto me rinde mi personal": tareas finished per técnico, how
// long they take compared with the rest of the área on the same tarea, and
// which tareas generales are simple or complex (by how long they take).
export function TechniciansTab({ data, period, type, today, profileById, isWide }: StatsTabProps) {
  const { colors } = useTheme();

  const counts = useMemo(() => tasksByTechnician(data.orders, period, type), [data, period, type]);
  const performance = useMemo(
    () => technicianPerformance(data.orders, period, type),
    [data, period, type],
  );
  const complexity = useMemo(
    () => taskComplexityRanking(data.orders, period, type).slice(0, COMPLEXITY_LIMIT),
    [data, period, type],
  );

  const suspensions = useMemo(
    () => suspensionsByReason(data.orders, period, type, today),
    [data, period, type, today],
  );

  // A type filter leaves one series: drop the other from bars and legend.
  const series = ORDER_TYPE_SERIES.filter((s) => type === "all" || s.key === type);

  const columns: StatColumn<TechnicianPerformance>[] = [
    {
      key: "tecnico",
      label: "Técnico",
      flex: 1.8,
      render: (r) => personName(profileById, r.technicianId),
    },
    {
      key: "tareas",
      label: "Tareas",
      flex: 0.8,
      align: "right",
      render: (r) => String(r.finished),
    },
    {
      key: "promedio",
      label: "Promedio por tarea",
      flex: 1.3,
      align: "right",
      render: (r) => formatDays(r.avgDays),
    },
    {
      key: "area",
      label: "Vs. el área",
      flex: 1.2,
      align: "right",
      render: (r) => {
        const rounded = Math.round(r.vsAreaDays * 10) / 10;
        return (
          <Text
            style={{
              fontSize: 13.5,
              fontWeight: rounded === 0 ? "400" : "700",
              color:
                rounded > 0 ? colors.destructive : rounded < 0 ? colors.success : colors.textLabel,
              textAlign: "right",
            }}
          >
            {formatSignedDays(r.vsAreaDays)}
          </Text>
        );
      },
    },
  ];

  return (
    <TabStack>
      <StatPanel
        title="Rendimiento por técnico"
        caption="“Vs. el área”: cuántos días más (+) o menos (−) que el promedio del área tardó en cada tarea, comparando siempre la misma tarea general. Así no se castiga a quien hace los trabajos largos."
      >
        {performance.length === 0 ? (
          <EmptyChart text="Ningún técnico terminó tareas en el período." />
        ) : (
          <StatTable
            columns={columns}
            rows={performance}
            rowKey={(r) => r.technicianId}
            minWidth={520}
            resetKey={`${period.from}|${period.to}|${type}`}
          />
        )}
      </StatPanel>

      <TwoColumns isWide={isWide}>
        <Column>
          <StatPanel title="Tareas finalizadas por técnico" caption="Terminadas en el período.">
            {counts.length === 0 ? (
              <EmptyChart text="Ningún técnico terminó tareas en el período." />
            ) : (
              <BarList
                series={series}
                rows={counts.map((c) => ({
                  key: c.technicianId,
                  label: personName(profileById, c.technicianId),
                  values: { correctivo: c.correctivo, preventivo: c.preventivo },
                }))}
              />
            )}
          </StatPanel>
        </Column>

        <Column>
          <StatPanel
            title="Tareas, de la más compleja a la más simple"
            caption="Días promedio que lleva cada tarea general, de inicio a fin."
          >
            {complexity.length === 0 ? (
              <EmptyChart text="No hay tareas terminadas en el período." />
            ) : (
              <BarList
                series={[{ key: "days", label: "Días promedio", color: colors.accent }]}
                rows={complexity.map((t) => ({
                  key: t.taskId,
                  label: t.name,
                  sublabel: `${t.count} ${t.count === 1 ? "realizada" : "realizadas"}`,
                  values: { days: t.avgDays },
                  valueText: formatDays(t.avgDays),
                }))}
                labelWidth={170}
              />
            )}
          </StatPanel>
        </Column>
      </TwoColumns>

      <StatPanel
        title="Tareas suspendidas por motivo"
        caption="Tareas frenadas en el período y cuántos días estuvieron paradas en promedio. Solo se guarda la última suspensión de cada tarea: una tarea suspendida dos veces cuenta una vez."
      >
        {suspensions.length === 0 ? (
          <EmptyChart text="No se suspendieron tareas en el período." />
        ) : (
          <BarList
            series={[{ key: "count", label: "Tareas", color: colors.eqWaiting.dot }]}
            rows={suspensions.map((s) => ({
              key: s.reason,
              label: s.reason,
              sublabel: `Prom. frenada: ${formatDays(s.avgDaysStopped)}`,
              detail: `${s.count} ${s.count === 1 ? "tarea" : "tareas"}, frenadas ${formatDays(s.avgDaysStopped)} en promedio${s.ongoing ? ` · ${s.ongoing} ${s.ongoing === 1 ? "sigue suspendida" : "siguen suspendidas"}` : ""}`,
              values: { count: s.count },
            }))}
            labelWidth={190}
          />
        )}
      </StatPanel>
    </TabStack>
  );
}
