import { Stack, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  CustomDatePicker,
  getTodayDbDate,
  isValidDateString,
  parseDateString,
  toDbDate,
  toDay,
} from "../../../components/CustomDatePicker";
import { Pagination } from "../../../components/Pagination";
import { ScrollableTable, tableCol } from "../../../components/ScrollableTable";
import { SortHeaderCell } from "../../../components/SortHeaderCell";
import { TableFilterBar } from "../../../components/TableFilterBar";
import { listProfiles } from "../../../lib/queries/profiles";
import { listStockMovements, type StockMovement } from "../../../lib/queries/stockMovements";
import { includesSearch, normalizeSearch } from "../../../lib/search";
import type { ThemeColors } from "../../../lib/theme";
import { useTheme } from "../../../lib/ThemeContext";
import { formatUnitQty } from "../../../lib/units";
import { useIsPhone } from "../../../lib/useIsPhone";
import { usePagination } from "../../../lib/usePagination";
import { useTableSort } from "../../../lib/useTableSort";
import { NUMERIC_COL_GAP } from "../../../constants";

// One width per column, applied to the header cell and to every row cell
// alike, same as purchases/index.tsx.
const COL_FLEX = {
  fecha: 1.1,
  repuesto: 1.8,
  tipo: 0.9,
  cantidad: 0.9,
  motivo: 2,
  registrador: 1.3,
};
function col(key: keyof typeof COL_FLEX) {
  return tableCol(COL_FLEX[key]);
}

// Signed, so sorting by "Cantidad" lines up every egreso below every ingreso.
function signedQuantity(m: StockMovement): number {
  return m.ms_tipo === "ingreso" ? m.ms_cantidad : -m.ms_cantidad;
}

function reasonText(m: StockMovement): string {
  return m.ms_comentario ? `${m.ms_motivo}: ${m.ms_comentario}` : m.ms_motivo;
}

export default function StockMovementsScreen() {
  // ?buscar= comes from a repuesto's "Ver movimientos" in Repuestos.
  const params = useLocalSearchParams<{ buscar?: string }>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState(params.buscar ?? "");
  const [tipoFilter, setTipoFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // A new ?buscar= while the screen is already open replaces the search.
  const [prevBuscar, setPrevBuscar] = useState(params.buscar);
  if (params.buscar !== prevBuscar) {
    setPrevBuscar(params.buscar);
    if (params.buscar !== undefined) setSearch(params.buscar);
  }

  const { colors } = useTheme();
  // Phones get the short label so the button fits next to the title.
  const isPhone = useIsPhone();
  const styles = makeStyles(colors);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [list, profiles] = await Promise.all([listStockMovements(), listProfiles()]);
      setMovements(list);
      setNames(new Map(profiles.map((pr) => [pr.id, pr.name])));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // Reload on every focus so coming back from the form shows the new row,
  // same as purchases/index.tsx.
  useFocusEffect(
    useCallback(() => {
      load().finally(() => setLoading(false));
    }, [load]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const today = useMemo(() => toDay(new Date()), []);
  const parsedDateFrom = useMemo(() => parseDateString(dateFrom), [dateFrom]);
  const parsedDateTo = useMemo(() => parseDateString(dateTo), [dateTo]);
  const hasDateFilter = dateFrom.length > 0 || dateTo.length > 0;

  const registrador = useCallback(
    (m: StockMovement) => (m.ms_p_id_registrador ? (names.get(m.ms_p_id_registrador) ?? "—") : "—"),
    [names],
  );

  const filtered = useMemo(() => {
    const q = normalizeSearch(search.trim());
    const dbFrom = isValidDateString(dateFrom) ? toDbDate(dateFrom) : null;
    const dbTo = isValidDateString(dateTo) ? toDbDate(dateTo) : null;

    return movements.filter((m) => {
      const matchSearch =
        !q || includesSearch(m.repuesto?.rep_nombre, q) || includesSearch(reasonText(m), q);
      const matchTipo = !tipoFilter || m.ms_tipo === tipoFilter;
      // ms_creado_en is a timestamp; compare its local day, not the UTC one.
      const day = getTodayDbDate(new Date(m.ms_creado_en));
      const matchDate = (!dbFrom || day >= dbFrom) && (!dbTo || day <= dbTo);
      return matchSearch && matchTipo && matchDate;
    });
  }, [movements, search, tipoFilter, dateFrom, dateTo]);

  const { sorted, field, dir, toggle } = useTableSort<StockMovement>(
    filtered,
    {
      fecha: (m) => m.ms_creado_en,
      repuesto: (m) => m.repuesto?.rep_nombre ?? "",
      tipo: (m) => m.ms_tipo,
      cantidad: signedQuantity,
      motivo: (m) => m.ms_motivo,
      registrador,
    },
    "fecha",
    "desc",
  );

  const { pageItems, page, pageCount, setPage } = usePagination(
    sorted,
    `${search}|${tipoFilter}|${dateFrom}|${dateTo}|${field}|${dir}`,
    8,
  );

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />

        <ActivityIndicator style={styles.center} />
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Movimientos de stock</Text>

            <Text style={styles.subtitle}>
              Ingresos y egresos de repuestos por fuera de compras y tareas, con su motivo
            </Text>
          </View>

          <Pressable
            style={styles.addButton}
            onPress={() => router.push("/stock-movements/register")}
            accessibilityLabel="Nuevo movimiento"
          >
            <Text style={styles.addButtonText}>{isPhone ? "+ Nuevo" : "+ Nuevo movimiento"}</Text>
          </Pressable>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        {/* Raised so the date pickers' dropdowns open over the table. */}
        <View style={styles.filterWrap}>
          <TableFilterBar
            searchValue={search}
            onSearch={setSearch}
            searchPlaceholder="Buscar por repuesto o motivo…"
            filters={[
              {
                key: "tipo",
                label: "Tipo",
                value: tipoFilter,
                onChange: setTipoFilter,
                options: [
                  { value: "", label: "Todos" },
                  { value: "ingreso", label: "Ingresos" },
                  { value: "egreso", label: "Egresos" },
                ],
              },
            ]}
            right={
              <View style={styles.rightGroup}>
                <View style={styles.dateRangeWrap}>
                  <View style={styles.dateInputWrap}>
                    <CustomDatePicker
                      value={dateFrom}
                      onChange={setDateFrom}
                      placeholder="Desde"
                      compact
                      maxDate={
                        parsedDateTo && parsedDateTo.getTime() < today.getTime()
                          ? parsedDateTo
                          : today
                      }
                      alignDropdown="left"
                    />
                  </View>

                  <Text style={styles.dateArrow}>→</Text>

                  <View style={styles.dateInputWrap}>
                    <CustomDatePicker
                      value={dateTo}
                      onChange={setDateTo}
                      placeholder="Hasta"
                      compact
                      minDate={parsedDateFrom ?? undefined}
                      maxDate={today}
                      alignDropdown="right"
                    />
                  </View>

                  {hasDateFilter && (
                    <Pressable
                      style={styles.clearDateBtn}
                      onPress={() => {
                        setDateFrom("");
                        setDateTo("");
                      }}
                      accessibilityLabel="Limpiar filtro de fecha"
                    >
                      <Text style={styles.clearDateText}>Limpiar</Text>
                    </Pressable>
                  )}
                </View>

                <Text style={styles.count}>
                  {sorted.length} {sorted.length === 1 ? "movimiento" : "movimientos"}
                </Text>
              </View>
            }
          />
        </View>

        {sorted.length === 0 ? (
          <Text style={styles.empty}>
            {movements.length === 0
              ? "Todavía no hay movimientos de stock registrados."
              : "No hay movimientos que coincidan con la búsqueda o los filtros."}
          </Text>
        ) : (
          <View style={styles.table}>
            <ScrollableTable minWidth={860}>
              <View style={styles.tableHeader}>
                <SortHeaderCell
                  label="Fecha"
                  field="fecha"
                  activeField={field}
                  dir={dir}
                  onSort={toggle}
                  style={col("fecha")}
                />

                <SortHeaderCell
                  label="Repuesto"
                  field="repuesto"
                  activeField={field}
                  dir={dir}
                  onSort={toggle}
                  style={col("repuesto")}
                />

                <SortHeaderCell
                  label="Tipo"
                  field="tipo"
                  activeField={field}
                  dir={dir}
                  onSort={toggle}
                  style={col("tipo")}
                />

                <SortHeaderCell
                  label="Cantidad"
                  field="cantidad"
                  activeField={field}
                  dir={dir}
                  onSort={toggle}
                  style={[col("cantidad"), styles.qtyHeaderCell]}
                />

                <SortHeaderCell
                  label="Motivo"
                  field="motivo"
                  activeField={field}
                  dir={dir}
                  onSort={toggle}
                  style={col("motivo")}
                />

                <SortHeaderCell
                  label="Registrado por"
                  field="registrador"
                  activeField={field}
                  dir={dir}
                  onSort={toggle}
                  style={col("registrador")}
                />
              </View>

              {pageItems.map((m, i) => {
                const isIngreso = m.ms_tipo === "ingreso";
                const tipoColors = isIngreso ? colors.eqOperational : colors.eqRepair;
                const created = new Date(m.ms_creado_en);
                return (
                  <View key={m.ms_id} style={[styles.row, i % 2 === 1 && styles.rowAlt]}>
                    <View style={col("fecha")}>
                      <Text style={styles.dateCell}>{created.toLocaleDateString("es-AR")}</Text>

                      <Text style={styles.sub}>
                        {created.toLocaleTimeString("es-AR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </Text>
                    </View>

                    <View style={col("repuesto")}>
                      <Text style={styles.name} numberOfLines={1}>
                        {m.repuesto?.rep_nombre ?? `Repuesto ${m.rep_id}`}
                      </Text>
                    </View>

                    <View style={col("tipo")}>
                      <View style={[styles.tipoBadge, { backgroundColor: tipoColors.bg }]}>
                        <Text style={[styles.tipoBadgeText, { color: tipoColors.fg }]}>
                          {isIngreso ? "Ingreso" : "Egreso"}
                        </Text>
                      </View>
                    </View>

                    <View style={[col("cantidad"), styles.qtyCol]}>
                      <Text style={[styles.qty, { color: tipoColors.fg }]}>
                        {isIngreso ? "+" : "−"}
                        {formatUnitQty(m.ms_cantidad, m.repuesto?.rep_unidad)}
                      </Text>
                    </View>

                    <View style={col("motivo")}>
                      <Text style={styles.reason} numberOfLines={1}>
                        {m.ms_motivo}
                      </Text>

                      {m.ms_comentario && (
                        <Text style={styles.sub} numberOfLines={2}>
                          {m.ms_comentario}
                        </Text>
                      )}
                    </View>

                    <View style={col("registrador")}>
                      <Text style={styles.reason} numberOfLines={1}>
                        {registrador(m)}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </ScrollableTable>
          </View>
        )}

        <Pagination page={page} pageCount={pageCount} onPage={setPage} />
      </ScrollView>
    </>
  );
}

// Same look as purchases/index.tsx (header, filters, table).
function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { backgroundColor: c.bg },
    content: { padding: 20 },
    center: { flex: 1 },
    // No wrapping: on a phone a long subtitle would push the button onto its
    // own line, on the left. The text wraps instead and the button stays right.
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 12,
      marginBottom: 16,
    },
    headerText: { flex: 1, minWidth: 0 },
    title: { fontSize: 22, fontWeight: "600", color: c.text },
    subtitle: { marginTop: 3, fontSize: 13.5, color: c.textSecondary },
    error: { color: c.destructive, marginBottom: 12 },
    addButton: {
      backgroundColor: c.accent,
      paddingHorizontal: 18,
      height: 42,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    addButtonText: { color: "#fff", fontWeight: "600", fontSize: 14 },
    filterWrap: { zIndex: 50 },
    rightGroup: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 12 },
    dateRangeWrap: { flexDirection: "row", alignItems: "center", gap: 8, zIndex: 60 },
    dateInputWrap: { width: 140 },
    dateArrow: { fontSize: 14, fontWeight: "600", color: c.textMuted },
    clearDateBtn: {
      height: 38,
      paddingHorizontal: 12,
      borderRadius: 9,
      borderWidth: 1,
      borderColor: c.borderInput,
      backgroundColor: c.bgCard,
      alignItems: "center",
      justifyContent: "center",
    },
    clearDateText: { fontSize: 12.5, fontWeight: "600", color: c.accent },
    count: { fontSize: 13, fontWeight: "500", color: c.textSecondary },
    empty: { color: c.textMuted, fontSize: 14, marginTop: 4 },
    table: {
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 14,
      overflow: "hidden",
      width: "100%",
    },
    tableHeader: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 18,
      paddingVertical: 12,
      backgroundColor: c.accent,
      borderTopLeftRadius: 13,
      borderTopRightRadius: 13,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 18,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: c.borderRow,
    },
    rowAlt: { backgroundColor: c.bgRowAlt },
    name: { fontWeight: "600", fontSize: 14.5, color: c.text },
    reason: { fontSize: 14, color: c.text },
    sub: { marginTop: 2, fontSize: 12.5, color: c.textMuted },
    dateCell: { fontSize: 14.5, color: c.text, fontWeight: "500" },
    tipoBadge: {
      alignSelf: "flex-start",
      paddingHorizontal: 11,
      paddingVertical: 3.5,
      borderRadius: 999,
    },
    tipoBadgeText: { fontSize: 12.5, fontWeight: "600" },
    // Quantities are right-aligned so the digits line up by place value; the
    // extra right padding keeps them off the "Motivo" text that follows.
    qtyCol: { paddingRight: NUMERIC_COL_GAP },
    qtyHeaderCell: { justifyContent: "flex-end", paddingRight: NUMERIC_COL_GAP },
    qty: {
      fontSize: 14.5,
      fontWeight: "700",
      fontFamily: "monospace",
      textAlign: "right",
    },
  });
}
