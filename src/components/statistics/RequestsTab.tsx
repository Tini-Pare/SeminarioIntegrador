import { useMemo } from "react";
import {
  computeRequestKpis,
  formatDays,
  formatHours,
  formatPct,
  requestsByLocation,
} from "../../lib/statistics";
import { BarList } from "../charts/BarList";
import { KpiRow, KpiTile } from "../charts/KpiTile";
import { REQUEST_STATUS_SERIES } from "../charts/palette";
import { EmptyChart, StatPanel } from "../charts/StatPanel";
import { TabStack, type StatsTabProps } from "./shared";

// HU-075 + the cátedra's ticket times: how fast a solicitud gets attended
// (an OT is created) and put in motion (its first tarea starts), how many
// get rejected, and which sectors report the most.
export function RequestsTab({ data, period, equipmentById }: StatsTabProps) {
  const kpis = useMemo(
    () => computeRequestKpis(data.requests, data.orders, period),
    [data, period],
  );
  const byLocation = useMemo(
    () => requestsByLocation(data.requests, equipmentById, period),
    [data, equipmentById, period],
  );

  return (
    <TabStack>
      <KpiRow>
        <KpiTile
          label="Tiempo de atención"
          value={formatHours(kpis.attentionHoursMedian)}
          hint={`Mediana, de la solicitud a la OT · ${kpis.attendedCount} ${kpis.attendedCount === 1 ? "solicitud" : "solicitudes"}`}
        />

        <KpiTile
          label="Tiempo en darle curso"
          value={formatDays(kpis.startDaysMedian)}
          hint={`Mediana, hasta que arranca la primera tarea · ${kpis.startedCount} ${kpis.startedCount === 1 ? "solicitud" : "solicitudes"}`}
        />

        <KpiTile
          label="Tasa de rechazo"
          value={formatPct(kpis.rejectedPct)}
          hint={
            kpis.total === 0
              ? "No hubo solicitudes en el período"
              : `${kpis.rejectedCount} de ${kpis.total}${kpis.topRejectReason ? ` · motivo principal: ${kpis.topRejectReason}` : ""}`
          }
        />
      </KpiRow>

      <StatPanel
        title="Ubicaciones con más solicitudes"
        caption="Solicitudes reportadas en el período por sector, según su estado actual."
      >
        {byLocation.length === 0 ? (
          <EmptyChart text="No hubo solicitudes en el período." />
        ) : (
          <BarList
            series={REQUEST_STATUS_SERIES}
            rows={byLocation.map((l) => ({
              key: l.location,
              label: l.location,
              values: {
                resolved: l.resolved,
                pending: l.pending,
                inProgress: l.inProgress,
                rejected: l.rejected,
              },
            }))}
            labelWidth={170}
          />
        )}
      </StatPanel>
    </TabStack>
  );
}
