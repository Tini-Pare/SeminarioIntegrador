import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { formatOrderNumber } from "../../lib/orderNumber";
import { GRAVEDAD_LABELS } from "../../lib/queries/faultTypes";
import {
  RECURRENCE_WINDOW_DAYS,
  equipmentReport,
  faultTypeRanking,
  formatDays,
  formatMoney,
  formatNumber,
  lastUnitCosts,
  reliabilityByEquipmentType,
  topFailingEquipment,
  type EquipmentTypeReliability,
} from "../../lib/statistics";
import type { ThemeColors } from "../../lib/theme";
import { useTheme } from "../../lib/ThemeContext";
import { BarList } from "../charts/BarList";
import { NEUTRAL_BAR } from "../charts/palette";
import { MiniStat, MiniStatGrid } from "../charts/MiniStat";
import { EmptyChart, StatPanel } from "../charts/StatPanel";
import { StatTable, type StatColumn } from "../charts/StatTable";
import { fromDbDate } from "../CustomDatePicker";
import { Select } from "../Select";
import { Column, Pill, TabStack, TwoColumns, type StatsTabProps } from "./shared";

const HISTORY_PREVIEW = 6;

function formatAge(days: number | null): string {
  if (days == null) return "—";
  if (days < 60) return formatDays(days);
  const months = Math.floor(days / 30.44);
  if (months < 24) return `${months} meses`;
  const years = Math.floor(days / 365.25);
  return `${years} años`;
}

// HU-071: which equipos break the most, and a ficha with what's needed to
// decide whether to keep repairing one or replace it.
// The selected equipo lives in the screen so the PDF export (HU-077) prints
// the same ficha the admin is looking at.
export function EquipmentTab({
  data,
  period,
  today,
  equipmentById,
  isWide,
  selectedId,
  onSelect,
}: StatsTabProps & { selectedId: number | null; onSelect: (id: number) => void }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [selectOpen, setSelectOpen] = useState(false);

  const top = useMemo(() => topFailingEquipment(data.orders, period), [data, period]);
  const faults = useMemo(
    () => faultTypeRanking(data.orders, period, data.gravedadByFault),
    [data, period],
  );
  const unitCosts = useMemo(() => lastUnitCosts(data.purchases), [data]);
  const byType = useMemo(() => reliabilityByEquipmentType(data.orders, data.equipment), [data]);

  // The ficha follows the ranking's leader until the admin picks another.
  useEffect(() => {
    if (selectedId == null && top.length > 0) onSelect(top[0].equipmentId);
  }, [top, selectedId, onSelect]);

  const selected = selectedId != null ? equipmentById.get(selectedId) : undefined;
  const report = useMemo(
    () => (selected ? equipmentReport(data.orders, selected, unitCosts, today) : null),
    [data, selected, unitCosts, today],
  );

  const gravedadColor = {
    low: colors.urgencyLow.accent,
    medium: colors.urgencyMedium.accent,
    high: colors.urgencyHigh.accent,
  };

  const equipmentOptions = useMemo(
    () => data.equipment.map((e) => ({ value: e.id, label: `${e.code} · ${e.name}` })),
    [data],
  );

  const typeColumns: StatColumn<EquipmentTypeReliability>[] = [
    { key: "tipo", label: "Tipo de equipo", flex: 1.8, render: (r) => r.name },
    {
      key: "equipos",
      label: "Equipos",
      flex: 0.8,
      align: "right",
      render: (r) => String(r.equipmentCount),
    },
    {
      key: "roturas",
      label: "Roturas",
      flex: 0.8,
      align: "right",
      render: (r) => String(r.failures),
    },
    {
      key: "porequipo",
      label: "Por equipo",
      flex: 0.9,
      align: "right",
      render: (r) => formatNumber(r.failuresPerEquipment),
    },
    {
      key: "mtbf",
      label: "Entre fallas",
      flex: 1.1,
      align: "right",
      render: (r) => formatDays(r.mtbfDays),
    },
    {
      key: "mttr",
      label: "Reparación",
      flex: 1.1,
      align: "right",
      render: (r) => formatDays(r.mttrDays),
    },
  ];

  return (
    <TabStack>
      <TwoColumns isWide={isWide}>
        <Column>
          <StatPanel
            title="Equipos con más fallas"
            caption="Roturas (OT correctivas) reportadas en el período. Tocá uno para ver su ficha."
          >
            {top.length === 0 ? (
              <EmptyChart text="No se reportaron fallas en el período." />
            ) : (
              <BarList
                series={[{ key: "count", label: "Fallas", color: colors.eqRepair.dot }]}
                rows={top.map((t) => {
                  const e = equipmentById.get(t.equipmentId);
                  return {
                    key: t.equipmentId,
                    label: e?.name ?? "Equipo desconocido",
                    sublabel: e ? `${e.code} · ${e.location || "Sin ubicación"}` : undefined,
                    values: { count: t.count },
                  };
                })}
                selectedKey={selectedId}
                onSelect={(key) => onSelect(Number(key))}
                labelWidth={170}
              />
            )}
          </StatPanel>

          <StatPanel
            title="Fallas más frecuentes"
            caption="Tipos de falla diagnosticados en las OT correctivas del período, coloreados por gravedad."
          >
            {faults.length === 0 ? (
              <EmptyChart text="No se reportaron fallas en el período." />
            ) : (
              <BarList
                series={[{ key: "count", label: "Fallas", color: NEUTRAL_BAR }]}
                legend={[
                  { key: "high", label: GRAVEDAD_LABELS.high, color: gravedadColor.high },
                  { key: "medium", label: GRAVEDAD_LABELS.medium, color: gravedadColor.medium },
                  { key: "low", label: GRAVEDAD_LABELS.low, color: gravedadColor.low },
                  { key: "none", label: "Sin tipo de falla", color: NEUTRAL_BAR },
                ]}
                rows={faults.map((f) => ({
                  key: f.name,
                  label: f.name,
                  sublabel: f.gravedad
                    ? `Gravedad ${GRAVEDAD_LABELS[f.gravedad].toLowerCase()}`
                    : undefined,
                  values: { count: f.count },
                  color: f.gravedad ? gravedadColor[f.gravedad] : NEUTRAL_BAR,
                }))}
                labelWidth={170}
              />
            )}
          </StatPanel>
        </Column>

        <Column>
          <StatPanel
            title="Ficha del equipo"
            caption="Historial completo del equipo (no usa el filtro de período): lo que hace falta para decidir si conviene seguir reparándolo o reemplazarlo."
          >
            <View style={[styles.selectWrap, selectOpen && { zIndex: 20 }]}>
              <Select
                value={selectedId}
                onChange={(v) => onSelect(v)}
                options={equipmentOptions}
                placeholder="Elegí un equipo"
                open={selectOpen}
                onOpenChange={setSelectOpen}
              />
            </View>

            {!selected || !report ? (
              <EmptyChart text="Elegí un equipo para ver su ficha." />
            ) : (
              <View>
                <MiniStatGrid>
                  <MiniStat label="Roturas" value={String(report.failures.length)} />

                  <MiniStat
                    label="Tiempo entre fallas"
                    value={formatDays(report.mtbfDays)}
                    hint={report.mtbfDays == null ? "Hacen falta 2 roturas" : "Promedio (MTBF)"}
                  />

                  <MiniStat
                    label="Tiempo de reparación"
                    value={formatDays(report.mttrDays)}
                    hint="Promedio (MTTR)"
                  />

                  <MiniStat
                    label="Reincidencias"
                    value={String(report.recurrences)}
                    hint={`Misma falla en ≤ ${RECURRENCE_WINDOW_DAYS} días`}
                    alert={report.recurrences > 0}
                  />

                  <MiniStat
                    label="Gasto en repuestos"
                    value={formatMoney(report.partsCost)}
                    hint={
                      report.partsCostIncomplete
                        ? "Hay repuestos sin precio de compra"
                        : "A último precio de compra"
                    }
                  />

                  <MiniStat
                    label="Antigüedad"
                    value={formatAge(report.ageDays)}
                    hint={
                      selected.installDate
                        ? `Instalado el ${fromDbDate(selected.installDate)}`
                        : "Sin fecha de instalación"
                    }
                  />
                </MiniStatGrid>

                <Text style={styles.historyTitle}>Historial de roturas</Text>

                {report.failures.length === 0 ? (
                  <EmptyChart text="Este equipo no tiene roturas registradas." />
                ) : (
                  <View>
                    {report.failures.slice(0, HISTORY_PREVIEW).map((f) => (
                      <View key={f.orderId} style={styles.historyRow}>
                        <Text style={styles.historyDate}>{fromDbDate(f.date)}</Text>

                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.historyFault} numberOfLines={1}>
                            {f.faultType ?? "Sin tipo de falla"}
                          </Text>

                          <Text style={styles.historyMeta}>
                            {formatOrderNumber(f.orderId)} ·{" "}
                            {f.repairDays == null
                              ? "En reparación"
                              : `Reparada en ${formatDays(f.repairDays)}`}
                          </Text>
                        </View>

                        {f.recurrence && (
                          <Pill
                            text="Reincidencia"
                            bg={colors.urgencyHigh.bg}
                            fg={colors.urgencyHigh.fg}
                          />
                        )}
                      </View>
                    ))}

                    {report.failures.length > HISTORY_PREVIEW && (
                      <Text style={styles.more}>
                        y {report.failures.length - HISTORY_PREVIEW} más
                      </Text>
                    )}
                  </View>
                )}
              </View>
            )}
          </StatPanel>
        </Column>
      </TwoColumns>

      <StatPanel
        title="Confiabilidad por tipo de equipo"
        caption="Historial completo (no usa el filtro de período). “Entre fallas” (MTBF): días promedio entre dos roturas del mismo equipo. “Reparación” (MTTR): días promedio de inicio a cierre de la OT correctiva. Primero los tipos que se rompen más seguido."
      >
        {byType.length === 0 ? (
          <EmptyChart text="No hay equipos registrados." />
        ) : (
          <StatTable columns={typeColumns} rows={byType} rowKey={(r) => r.typeId} minWidth={620} />
        )}
      </StatPanel>
    </TabStack>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    selectWrap: { marginBottom: 14, zIndex: 1 },
    historyTitle: {
      marginTop: 18,
      marginBottom: 4,
      fontSize: 14,
      fontWeight: "600",
      color: c.text,
    },
    historyRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: c.borderRow,
    },
    historyDate: {
      width: 84,
      fontFamily: "monospace",
      fontSize: 12.5,
      color: c.textSecondary,
    },
    historyFault: { fontSize: 14, fontWeight: "600", color: c.text },
    historyMeta: { fontSize: 12.5, color: c.textMuted, marginTop: 2 },
    more: { fontSize: 12.5, color: c.textMuted, paddingTop: 8 },
  });
}
