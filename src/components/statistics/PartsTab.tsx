import { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import {
  IDLE_DAYS,
  REORDER_DAYS,
  formatMoney,
  formatNumber,
  formatPct,
  partConsumption,
  priceComparison,
  purchasedParts,
  purchasesBySupplier,
  stockCoverage,
  topConsumedParts,
  type CoverageRow,
  type CoverageStatus,
  type SupplierPrice,
} from "../../lib/statistics";
import { useTheme } from "../../lib/ThemeContext";
import { BarList } from "../charts/BarList";
import { EmptyChart, StatPanel } from "../charts/StatPanel";
import { StatTable, type StatColumn } from "../charts/StatTable";
import { fromDbDate } from "../CustomDatePicker";
import { Select } from "../Select";
import { Column, Pill, TabStack, TwoColumns, type StatsTabProps } from "./shared";

const COVERAGE_LABELS: Record<CoverageStatus, string> = {
  reponer: "Reponer pronto",
  cubierto: "Cubierto",
  sin_uso: "Sin uso",
};

function formatStockDays(days: number | null): string {
  if (days == null) return "—";
  if (days > 365) return "+1 año";
  return `${formatNumber(Math.floor(days), 0)} días`;
}

// HU-072 (what gets consumed, and when each repuesto runs out) and HU-073
// (what is bought from whom, and at what price).
export function PartsTab({ data, period, today, isWide }: StatsTabProps) {
  const { colors } = useTheme();
  const [selectedPart, setSelectedPart] = useState<number | null>(null);
  const [selectOpen, setSelectOpen] = useState(false);

  const consumed = useMemo(() => {
    const totals = partConsumption(data.orders, data.movements, period);
    return topConsumedParts(totals, data.parts);
  }, [data, period]);
  const coverage = useMemo(
    () => stockCoverage(data.parts, data.orders, data.movements, period, today),
    [data, period, today],
  );
  const suppliers = useMemo(() => purchasesBySupplier(data.purchases, period), [data, period]);
  const bought = useMemo(() => purchasedParts(data.purchases), [data]);

  useEffect(() => {
    if (selectedPart == null && bought.length > 0) setSelectedPart(bought[0].repId);
  }, [bought, selectedPart]);

  const prices = useMemo(
    () => (selectedPart != null ? priceComparison(data.purchases, selectedPart) : []),
    [data, selectedPart],
  );

  const coverageTone: Record<CoverageStatus, { bg: string; fg: string }> = {
    reponer: colors.urgencyHigh,
    cubierto: colors.eqOperational,
    sin_uso: colors.eqWaiting,
  };

  const coverageColumns: StatColumn<CoverageRow>[] = [
    { key: "repuesto", label: "Repuesto", flex: 1.8, render: (r) => r.name },
    {
      key: "stock",
      label: "Stock / mín.",
      flex: 1,
      align: "right",
      render: (r) => `${formatNumber(r.stock)} / ${formatNumber(r.minimum)}`,
    },
    {
      key: "consumo",
      label: "Consumo",
      flex: 0.9,
      align: "right",
      render: (r) => formatNumber(r.consumed),
    },
    {
      key: "dias",
      label: "Alcanza para",
      flex: 1,
      align: "right",
      render: (r) => formatStockDays(r.daysLeft),
    },
    {
      key: "ultimo",
      label: "Último uso",
      flex: 1,
      align: "right",
      render: (r) => (r.lastUse ? fromDbDate(r.lastUse) : "Nunca"),
    },
    {
      key: "estado",
      label: "Estado",
      flex: 1.1,
      render: (r) => (
        <Pill
          text={COVERAGE_LABELS[r.status]}
          bg={coverageTone[r.status].bg}
          fg={coverageTone[r.status].fg}
        />
      ),
    },
  ];

  const priceColumns: StatColumn<SupplierPrice>[] = [
    { key: "proveedor", label: "Proveedor", flex: 1.6, render: (r) => r.supplier },
    {
      key: "ultimo",
      label: "Último precio",
      flex: 1.1,
      align: "right",
      render: (r) => formatMoney(r.lastPrice),
    },
    {
      key: "rango",
      label: "Mín. – máx.",
      flex: 1.4,
      align: "right",
      render: (r) =>
        r.minPrice === r.maxPrice
          ? formatMoney(r.minPrice)
          : `${formatMoney(r.minPrice)} – ${formatMoney(r.maxPrice)}`,
    },
    {
      key: "variacion",
      label: "Variación",
      flex: 0.9,
      align: "right",
      render: (r) => (
        <Text
          style={{
            fontSize: 13.5,
            textAlign: "right",
            color:
              r.changePct != null && r.changePct > 0
                ? colors.destructive
                : r.changePct != null && r.changePct < 0
                  ? colors.success
                  : colors.textLabel,
          }}
        >
          {r.changePct == null ? "—" : `${r.changePct > 0 ? "+" : ""}${formatPct(r.changePct)}`}
        </Text>
      ),
    },
    {
      key: "compras",
      label: "Compras",
      flex: 0.8,
      align: "right",
      render: (r) => String(r.purchases),
    },
    {
      key: "fecha",
      label: "Última compra",
      flex: 1,
      align: "right",
      render: (r) => (r.lastDate ? fromDbDate(r.lastDate) : "—"),
    },
  ];

  return (
    <TabStack>
      <TwoColumns isWide={isWide}>
        <Column>
          <StatPanel
            title="Repuestos más consumidos"
            caption="Unidades usadas en tareas terminadas más egresos externos del período."
          >
            {consumed.length === 0 ? (
              <EmptyChart text="No se consumieron repuestos en el período." />
            ) : (
              <BarList
                series={[{ key: "qty", label: "Unidades", color: colors.accent }]}
                rows={consumed.map((p) => ({
                  key: p.repId,
                  label: p.name,
                  values: { qty: p.qty },
                  valueText: formatNumber(p.qty),
                }))}
                labelWidth={170}
              />
            )}
          </StatPanel>
        </Column>

        <Column>
          <StatPanel
            title="Compras por proveedor"
            caption="Monto comprado a cada proveedor en el período."
          >
            {suppliers.length === 0 ? (
              <EmptyChart text="No hubo compras en el período." />
            ) : (
              <BarList
                series={[{ key: "total", label: "Monto", color: colors.accent }]}
                rows={suppliers.map((s) => ({
                  key: s.supplierId,
                  label: s.name,
                  sublabel: `${s.count} ${s.count === 1 ? "compra" : "compras"}`,
                  values: { total: s.total },
                  valueText: formatMoney(s.total),
                }))}
                labelWidth={150}
              />
            )}
          </StatPanel>
        </Column>
      </TwoColumns>

      <StatPanel
        title="Cobertura de stock"
        caption={`Cuántos días alcanza el stock al ritmo de consumo del período. “Reponer pronto”: ya está en su mínimo o se agota en ${REORDER_DAYS} días o menos. “Sin uso”: tiene stock pero no se usó en más de ${IDLE_DAYS} días (plata inmovilizada).`}
      >
        {coverage.length === 0 ? (
          <EmptyChart text="No hay repuestos activos." />
        ) : (
          <StatTable
            columns={coverageColumns}
            rows={coverage}
            rowKey={(r) => r.repId}
            minWidth={680}
            resetKey={`${period.from}|${period.to}`}
          />
        )}
      </StatPanel>

      <StatPanel
        title="Precio por proveedor"
        caption="Historial completo de compras del repuesto (no usa el filtro de período), del precio actual más barato al más caro. Variación = primera → última compra a ese proveedor."
      >
        {bought.length === 0 ? (
          <EmptyChart text="Todavía no hay compras con precio registrado." />
        ) : (
          <View>
            <View style={{ marginBottom: 14, zIndex: selectOpen ? 20 : 1, maxWidth: 420 }}>
              <Select
                value={selectedPart}
                onChange={(v) => setSelectedPart(v)}
                options={bought.map((p) => ({ value: p.repId, label: p.name }))}
                placeholder="Elegí un repuesto"
                open={selectOpen}
                onOpenChange={setSelectOpen}
              />
            </View>

            <StatTable
              columns={priceColumns}
              rows={prices}
              rowKey={(r) => r.supplierId}
              minWidth={680}
              resetKey={String(selectedPart)}
            />
          </View>
        )}
      </StatPanel>
    </TabStack>
  );
}
