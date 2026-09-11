import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { EyeIcon } from "../../../components/icons";
import { Pagination } from "../../../components/Pagination";
import { PurchaseDetailModal } from "../../../components/PurchaseDetailModal";
import { PurchaseModal } from "../../../components/PurchaseModal";
import { SortHeaderCell } from "../../../components/SortHeaderCell";
import { listProfiles } from "../../../lib/queries/profiles";
import { listPurchases, type PurchaseWithDetail } from "../../../lib/queries/purchases";
import { listSpareParts } from "../../../lib/queries/spareParts";
import { listSuppliers, type SupplierWithRubro } from "../../../lib/queries/suppliers";
import type { ThemeColors } from "../../../lib/theme";
import { useTheme } from "../../../lib/ThemeContext";
import { usePagination } from "../../../lib/usePagination";
import { useTableSort } from "../../../lib/useTableSort";
import type { Repuesto } from "../../../types/database";

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
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<PurchaseWithDetail | null>(null);

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

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const { sorted, field, dir, toggle } = useTableSort<PurchaseWithDetail>(
    purchases,
    {
      proveedor: (p) => p.proveedores?.prov_nombre ?? "",
      fecha: (p) => p.co_fecha_compra,
      total: (p) => (p.co_costo_total != null ? Number(p.co_costo_total) : 0),
    },
    "fecha",
    "desc",
  );

  const { pageItems, page, pageCount, setPage } = usePagination(sorted, `${field}|${dir}`, 8);

  const canRegister = suppliers.length > 0 && spareParts.some((p) => p.rep_estado === "activo");

  const viewingRegistrador = useMemo(
    () => (viewing?.co_p_id_registrador ? (names.get(viewing.co_p_id_registrador) ?? null) : null),
    [viewing, names],
  );

  if (loading) return <ActivityIndicator style={styles.center} />;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Compras</Text>

          <Text style={styles.subtitle}>
            Registrá el ingreso de stock de repuestos a partir de una compra
          </Text>
        </View>

        <Pressable
          style={[styles.addButton, !canRegister && styles.addButtonDisabled]}
          onPress={() => setCreating(true)}
          disabled={!canRegister}
        >
          <Text style={styles.addButtonText}>+ Registrar compra</Text>
        </Pressable>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      {!canRegister && (
        <View style={styles.alert}>
          <Text style={styles.alertText}>
            Para registrar una compra necesitás al menos un proveedor y un repuesto activo cargados.
          </Text>
        </View>
      )}

      {purchases.length === 0 ? (
        <Text style={styles.empty}>Todavía no hay compras registradas.</Text>
      ) : (
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <SortHeaderCell
              label="Proveedor"
              field="proveedor"
              activeField={field}
              dir={dir}
              onSort={toggle}
              style={{ flex: 2 }}
            />

            <SortHeaderCell
              label="Fecha"
              field="fecha"
              activeField={field}
              dir={dir}
              onSort={toggle}
              style={{ flex: 1 }}
            />

            <SortHeaderCell
              label="Total"
              field="total"
              activeField={field}
              dir={dir}
              onSort={toggle}
              style={{ flex: 1 }}
            />

            <Text style={[styles.headerCell, styles.actionsCol]}>VER</Text>
          </View>

          {pageItems.map((p, i) => (
            <View key={p.co_id_compra} style={[styles.row, i % 2 === 1 && styles.rowAlt]}>
              <View style={styles.rowMain}>
                <View style={{ flex: 2, justifyContent: "center", paddingRight: 12 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {p.proveedores?.prov_nombre ?? "Proveedor —"}
                  </Text>

                  <Text style={styles.sub} numberOfLines={1}>
                    {itemsSummary(p)}
                    {p.co_nombre ? ` · Ref: ${p.co_nombre}` : ""}
                  </Text>
                </View>

                <View style={{ flex: 1, justifyContent: "center" }}>
                  <Text style={styles.dateCell}>{formatDate(p.co_fecha_compra)}</Text>
                </View>

                <View style={{ flex: 1, justifyContent: "center" }}>
                  <Text style={styles.total}>
                    {p.co_costo_total != null && Number(p.co_costo_total) > 0
                      ? `$${Number(p.co_costo_total).toLocaleString("es-AR")}`
                      : "—"}
                  </Text>
                </View>
              </View>

              <View style={styles.actionsCol}>
                <Pressable
                  style={styles.viewBtn}
                  onPress={() => setViewing(p)}
                  accessibilityLabel="Ver compra"
                >
                  <EyeIcon size={16} color={colors.accent} />
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}

      <Pagination page={page} pageCount={pageCount} onPage={setPage} />

      <PurchaseModal
        visible={creating}
        onClose={() => setCreating(false)}
        onSaved={load}
        suppliers={suppliers}
        spareParts={spareParts}
      />

      <PurchaseDetailModal
        visible={viewing != null}
        onClose={() => setViewing(null)}
        purchase={viewing}
        registradorName={viewingRegistrador}
      />
    </ScrollView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { backgroundColor: c.bg },
    content: { padding: 20, maxWidth: 900 },
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
    empty: { color: c.textMuted, fontSize: 13.5, marginTop: 4 },
    table: {
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 14,
      overflow: "hidden",
    },
    tableHeader: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 13,
      backgroundColor: c.accent,
      borderTopLeftRadius: 13,
      borderTopRightRadius: 13,
    },
    headerCell: {
      fontSize: 13.5,
      fontWeight: "700",
      letterSpacing: 0.6,
      textTransform: "uppercase",
      color: "#fff",
      fontFamily: "monospace",
    },
    actionsCol: { width: 52, flexShrink: 0, alignItems: "flex-start" },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.borderRow,
    },
    rowAlt: { backgroundColor: c.bgRowAlt },
    rowMain: { flex: 1, flexDirection: "row", alignItems: "center", minWidth: 0 },
    name: { fontWeight: "600", fontSize: 14, color: c.text },
    sub: { marginTop: 2, fontSize: 12, color: c.textMuted },
    dateCell: { fontSize: 13, color: c.textLabel },
    total: { fontSize: 13.5, color: c.text, fontWeight: "600", fontFamily: "monospace" },
    viewBtn: {
      width: 32,
      height: 32,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
    },
  });
}
