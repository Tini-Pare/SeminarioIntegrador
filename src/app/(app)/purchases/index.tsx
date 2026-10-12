import { Stack, router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  CustomDatePicker,
  isValidDateString,
  parseDateString,
  toDbDate,
  toDay,
} from "../../../components/CustomDatePicker";
import { EyeIcon, SearchIcon } from "../../../components/icons";
import { Pagination } from "../../../components/Pagination";
import { PurchaseDetailModal } from "../../../components/PurchaseDetailModal";
import { SortHeaderCell } from "../../../components/SortHeaderCell";
import { comprobanteRef, comprobanteTipoLabel } from "../../../lib/comprobante";
import { listProfiles } from "../../../lib/queries/profiles";
import { listPurchases, type PurchaseWithDetail } from "../../../lib/queries/purchases";
import {
  RECEIPT_STATE_LABEL,
  purchaseReceiptState,
  receiptStateColors,
  type ReceiptState,
} from "../../../lib/purchaseReceipt";
import { listSpareParts } from "../../../lib/queries/spareParts";
import { listSuppliers, type SupplierWithRubro } from "../../../lib/queries/suppliers";
import type { ThemeColors } from "../../../lib/theme";
import { useTheme } from "../../../lib/ThemeContext";
import { usePagination } from "../../../lib/usePagination";
import { useTableSort } from "../../../lib/useTableSort";
import type { Repuesto } from "../../../types/database";

const ESTADO_RANK: Record<ReceiptState, number> = { pendiente: 0, parcial: 1, completa: 2 };

// One width per column, applied to the header cell and to every row cell
// alike — same flex AND same padding, otherwise the padding adds to some
// cells only and the rows drift right of their headers.
const COL_FLEX = { numero: 1.5, tipo: 1, proveedor: 1.8, emision: 1.1, total: 1.1, estado: 1.4 };
function col(key: keyof typeof COL_FLEX) {
  return { flex: COL_FLEX[key], minWidth: 0, paddingRight: 12 } as const;
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("es-AR");
}

function itemsSummary(p: PurchaseWithDetail): string {
  const names = p.linea_compra.map((l) => l.repuesto?.rep_nombre ?? `Repuesto ${l.rep_id}`);
  if (names.length === 0) return "—";
  if (names.length <= 2) return names.join(" · ");
  return `${names.slice(0, 2).join(" · ")} +${names.length - 2}`;
}

export default function PurchasesScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [purchases, setPurchases] = useState<PurchaseWithDetail[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierWithRubro[]>([]);
  const [spareParts, setSpareParts] = useState<Repuesto[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<PurchaseWithDetail | null>(null);

  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [estadoFilter, setEstadoFilter] = useState<ReceiptState | "">("");

  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [list, supplierList, partList, profiles] = await Promise.all([
        listPurchases(),
        listSuppliers(),
        listSpareParts(),
        listProfiles(),
      ]);
      setPurchases(list);
      setSuppliers(supplierList);
      setSpareParts(partList);
      setNames(new Map(profiles.map((pr) => [pr.id, pr.name])));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // Registering a purchase now lives on its own route (/purchases/register);
  // reload on every focus so coming back from it (or from a fulfilled pedido
  // in purchase-orders) shows the new row, same pattern as equipment/index.tsx.
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

  const estados = useMemo(
    () => new Map(purchases.map((p) => [p.co_id_compra, purchaseReceiptState(p)])),
    [purchases],
  );

  const estadoCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: purchases.length,
      pendiente: 0,
      parcial: 0,
      completa: 0,
    };
    estados.forEach((st) => counts[st]++);
    return counts;
  }, [purchases, estados]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const dbFrom = isValidDateString(dateFrom) ? toDbDate(dateFrom) : null;
    const dbTo = isValidDateString(dateTo) ? toDbDate(dateTo) : null;

    return purchases.filter((p) => {
      const provName = p.proveedores?.prov_nombre?.toLowerCase() ?? "";
      const matchSearch =
        !q || provName.includes(q) || (comprobanteRef(p)?.toLowerCase().includes(q) ?? false);

      let matchDate = true;
      if (dbFrom) {
        if (!p.co_fecha_compra || p.co_fecha_compra < dbFrom) {
          matchDate = false;
        }
      }
      if (dbTo) {
        if (!p.co_fecha_compra || p.co_fecha_compra > dbTo) {
          matchDate = false;
        }
      }

      const matchEstado = !estadoFilter || estados.get(p.co_id_compra) === estadoFilter;

      return matchSearch && matchDate && matchEstado;
    });
  }, [purchases, search, dateFrom, dateTo, estadoFilter, estados]);

  const { sorted, field, dir, toggle } = useTableSort<PurchaseWithDetail>(
    filtered,
    {
      proveedor: (p) => p.proveedores?.prov_nombre ?? "",
      tipo: (p) => comprobanteTipoLabel(p),
      numero: (p) => comprobanteRef(p) ?? "",
      fecha: (p) => p.co_fecha_compra ?? "",
      total: (p) => (p.co_costo_total != null ? Number(p.co_costo_total) : 0),
      estado: (p) => ESTADO_RANK[estados.get(p.co_id_compra) ?? "pendiente"],
    },
    "fecha",
    "desc",
  );

  const { pageItems, page, pageCount, setPage } = usePagination(
    sorted,
    `${search}|${dateFrom}|${dateTo}|${estadoFilter}|${field}|${dir}`,
    8,
  );

  const canRegister = suppliers.length > 0 && spareParts.some((p) => p.rep_estado === "activo");

  const viewingRegistrador = useMemo(
    () => (viewing?.co_p_id_registrador ? (names.get(viewing.co_p_id_registrador) ?? null) : null),
    [viewing, names],
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
            {/* Named after what each row is: a comprobante (factura, tique
                or remito) of a compra. The sidebar keeps the short "Compras". */}
            <Text style={styles.title}>Comprobantes de compra</Text>

            <Text style={styles.subtitle}>
              Registrá las facturas, tiques y remitos de tus compras y seguí qué repuestos ya
              llegaron
            </Text>
          </View>

          <Pressable
            style={[styles.addButton, !canRegister && styles.addButtonDisabled]}
            onPress={() => router.push("/purchases/register")}
            disabled={!canRegister}
          >
            <Text style={styles.addButtonText}>+ Registrar compra</Text>
          </Pressable>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        {!canRegister && (
          <View style={styles.alert}>
            <Text style={styles.alertText}>
              Para registrar una compra necesitás al menos un proveedor y un repuesto activo
              cargados.
            </Text>
          </View>
        )}

        <View style={styles.filterBar}>
          <View style={styles.searchBox}>
            <SearchIcon size={15} color={colors.textMuted} />

            <TextInput
              style={styles.searchInput}
              placeholder="Buscar por proveedor o N° de comprobante…"
              placeholderTextColor={colors.textMuted}
              value={search}
              onChangeText={setSearch}
              autoCorrect={false}
            />

            {search.length > 0 && (
              <Pressable onPress={() => setSearch("")} hitSlop={8}>
                <Text style={styles.clearSearchText}>✕</Text>
              </Pressable>
            )}
          </View>

          <View style={styles.dateRangeWrap}>
            <View style={styles.dateInputWrap}>
              <CustomDatePicker
                value={dateFrom}
                onChange={setDateFrom}
                placeholder="Desde"
                compact
                maxDate={
                  parsedDateTo && parsedDateTo.getTime() < today.getTime() ? parsedDateTo : today
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

          <View style={styles.spacer} />

          <Text style={styles.count}>
            {sorted.length} {sorted.length === 1 ? "compra" : "compras"}
          </Text>
        </View>

        <View style={styles.chipsRow}>
          {/* Says what the chips filter by: whether the goods arrived. */}
          <Text style={styles.chipsLabel}>Estados del envío</Text>

          {(
            [
              { key: "", label: "Todas" },
              { key: "pendiente", label: RECEIPT_STATE_LABEL.pendiente },
              { key: "parcial", label: RECEIPT_STATE_LABEL.parcial },
              { key: "completa", label: RECEIPT_STATE_LABEL.completa },
            ] as const
          ).map((chip) => {
            const active = estadoFilter === chip.key;
            const count = estadoCounts[chip.key || "all"] ?? 0;
            return (
              <Pressable
                key={chip.key}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setEstadoFilter(chip.key)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {chip.label} ({count})
                </Text>
              </Pressable>
            );
          })}
        </View>

        {sorted.length === 0 ? (
          <Text style={styles.empty}>
            {purchases.length === 0
              ? "Todavía no hay compras registradas."
              : "No hay compras que coincidan con la búsqueda o filtros."}
          </Text>
        ) : (
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              {/* The comprobante's número leads, like "N° OT" does in the
                  work-orders grid, with its tipo right after; the supplier
                  follows, since the same number can repeat across suppliers. */}
              <SortHeaderCell
                label="N° de comprobante"
                field="numero"
                activeField={field}
                dir={dir}
                onSort={toggle}
                style={col("numero")}
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
                label="Proveedor"
                field="proveedor"
                activeField={field}
                dir={dir}
                onSort={toggle}
                style={col("proveedor")}
              />

              <SortHeaderCell
                label="Emisión"
                field="fecha"
                activeField={field}
                dir={dir}
                onSort={toggle}
                style={col("emision")}
              />

              <SortHeaderCell
                label="Total"
                field="total"
                activeField={field}
                dir={dir}
                onSort={toggle}
                style={col("total")}
              />

              <SortHeaderCell
                label="Estado del envío"
                field="estado"
                activeField={field}
                dir={dir}
                onSort={toggle}
                style={col("estado")}
              />

              <View style={styles.actionsCol}>
                <Text style={styles.headerCell}>VER</Text>
              </View>
            </View>

            {pageItems.map((p, i) => {
              const estado = estados.get(p.co_id_compra) ?? "completa";
              const estadoStyle = receiptStateColors(colors)[estado];
              return (
                <View key={p.co_id_compra} style={[styles.row, i % 2 === 1 && styles.rowAlt]}>
                  <View style={styles.rowMain}>
                    <View style={col("numero")}>
                      <Text style={styles.numberCell} numberOfLines={1}>
                        {comprobanteRef(p) ?? "—"}
                      </Text>
                    </View>

                    <View style={col("tipo")}>
                      <View style={styles.tipoBadge}>
                        <Text style={styles.tipoBadgeText}>{comprobanteTipoLabel(p)}</Text>
                      </View>
                    </View>

                    <View style={col("proveedor")}>
                      <Text style={styles.name} numberOfLines={1}>
                        {p.proveedores?.prov_nombre ?? "Proveedor —"}
                      </Text>
                    </View>

                    <View style={col("emision")}>
                      <Text style={styles.dateCell}>{formatDate(p.co_fecha_compra)}</Text>
                    </View>

                    <View style={col("total")}>
                      <Text style={styles.total}>
                        {p.co_costo_total != null && Number(p.co_costo_total) > 0
                          ? `$${Number(p.co_costo_total).toLocaleString("es-AR")}`
                          : "—"}
                      </Text>
                    </View>

                    <View style={col("estado")}>
                      <View style={[styles.estadoBadge, { backgroundColor: estadoStyle.bg }]}>
                        <Text style={[styles.estadoBadgeText, { color: estadoStyle.fg }]}>
                          {RECEIPT_STATE_LABEL[estado]}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.actionsCol}>
                    <Pressable
                      style={styles.viewBtn}
                      onPress={() =>
                        router.push({
                          pathname: "/purchases/[id]",
                          params: { id: String(p.co_id_compra) },
                        })
                      }
                      accessibilityLabel="Ver compra"
                    >
                      <EyeIcon size={16} color={colors.accent} />
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <Pagination page={page} pageCount={pageCount} onPage={setPage} />

        <PurchaseDetailModal
          visible={viewing != null}
          onClose={() => setViewing(null)}
          purchase={viewing}
          registradorName={viewingRegistrador}
        />
      </ScrollView>
    </>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { backgroundColor: c.bg },
    content: { padding: 20 },
    center: { flex: 1 },
    header: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 12,
      marginBottom: 16,
    },
    headerText: { flexShrink: 1, minWidth: 0 },
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
    addButtonDisabled: { opacity: 0.45 },
    addButtonText: { color: "#fff", fontWeight: "600", fontSize: 14 },
    alert: {
      backgroundColor: c.eqWaiting.bg,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginBottom: 14,
    },
    alertText: { color: c.eqWaiting.fg, fontSize: 13, fontWeight: "600" },
    filterBar: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 10,
      marginBottom: 14,
      zIndex: 50,
    },
    searchBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      width: 320,
      flexGrow: 1,
      minWidth: 180,
      maxWidth: 340,
      height: 38,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: c.borderInput,
      borderRadius: 9,
      backgroundColor: c.bgCard,
    },
    searchInput: {
      flex: 1,
      height: "100%",
      fontSize: 13.5,
      color: c.text,
      padding: 0,
      ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : {}),
    },
    clearSearchText: {
      fontSize: 13,
      color: c.textMuted,
      fontWeight: "600",
    },
    dateRangeWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      zIndex: 60,
    },
    dateInputWrap: {
      width: 140,
    },
    dateArrow: {
      fontSize: 14,
      fontWeight: "600",
      color: c.textMuted,
    },
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
    clearDateText: {
      fontSize: 12.5,
      fontWeight: "600",
      color: c.accent,
    },
    spacer: {
      flex: 1,
      minWidth: 0,
    },
    count: {
      fontSize: 13,
      fontWeight: "500",
      color: c.textSecondary,
    },
    chipsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: 7,
      marginBottom: 14,
    },
    chipsLabel: {
      marginRight: 4,
      fontSize: 11.5,
      fontWeight: "700",
      letterSpacing: 0.5,
      textTransform: "uppercase",
      color: c.textMuted,
    },
    chip: {
      paddingHorizontal: 13,
      paddingVertical: 7,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: c.borderInput,
      backgroundColor: c.bgStatCard,
    },
    chipActive: {
      backgroundColor: c.accent,
      borderColor: c.accent,
    },
    chipText: {
      fontSize: 12.5,
      fontWeight: "600",
      color: c.textLabel,
    },
    chipTextActive: {
      color: "#fff",
    },
    estadoBadge: {
      alignSelf: "flex-start",
      paddingHorizontal: 11,
      paddingVertical: 3.5,
      borderRadius: 999,
    },
    estadoBadgeText: { fontSize: 12.5, fontWeight: "600" },
    empty: {
      color: c.textMuted,
      fontSize: 14,
      marginTop: 4,
    },
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
    headerCell: {
      fontSize: 11.5,
      fontWeight: "700",
      letterSpacing: 0.5,
      textTransform: "uppercase",
      color: "#fff",
      fontFamily: "monospace",
    },
    actionsCol: { width: 54, flexShrink: 0, alignItems: "center", justifyContent: "center" },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 18,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: c.borderRow,
    },
    rowAlt: { backgroundColor: c.bgRowAlt },
    rowMain: { flex: 1, flexDirection: "row", alignItems: "center", minWidth: 0 },
    tipoBadge: {
      alignSelf: "flex-start",
      paddingHorizontal: 8,
      paddingVertical: 2.5,
      borderRadius: 999,
      backgroundColor: c.bgNested,
      flexShrink: 0,
    },
    tipoBadgeText: { fontSize: 11.5, fontWeight: "700", color: c.textLabel },
    name: { fontWeight: "600", fontSize: 14.5, color: c.text },
    sub: { marginTop: 2, fontSize: 13, color: c.textMuted },
    dateCell: { fontSize: 14.5, color: c.text, fontWeight: "500" },
    numberCell: {
      flexShrink: 1,
      fontSize: 13.5,
      color: c.text,
      fontWeight: "600",
      fontFamily: "monospace",
    },
    total: { fontSize: 14.5, color: c.text, fontWeight: "600", fontFamily: "monospace" },
    viewBtn: {
      width: 36,
      height: 36,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
    },
  });
}
