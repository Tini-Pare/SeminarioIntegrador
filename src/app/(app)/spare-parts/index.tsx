import { router, useLocalSearchParams } from "expo-router";
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
import { Pagination } from "../../../components/Pagination";
import { RowActions } from "../../../components/RowActions";
import { ScrollableTable, tableCol } from "../../../components/ScrollableTable";
import { SortHeaderCell } from "../../../components/SortHeaderCell";
import { SparePartModal } from "../../../components/SparePartModal";
import { StockBadge } from "../../../components/StockBadge";
import { TableFilterBar } from "../../../components/TableFilterBar";
import { getProfile } from "../../../lib/auth";
import { lowStockParts } from "../../../lib/queries/alerts";
import {
  deleteSparePart,
  listSpareParts,
  stockStatus,
  type StockStatus,
} from "../../../lib/queries/spareParts";
import { supabase } from "../../../lib/supabase";
import type { ThemeColors } from "../../../lib/theme";
import { useTheme } from "../../../lib/ThemeContext";
import { useConfirm } from "../../../lib/useConfirm";
import { usePagination } from "../../../lib/usePagination";
import { normalizeSearch, startsWithSearch } from "../../../lib/search";
import { useTableSort } from "../../../lib/useTableSort";
import { formatUnitQty } from "../../../lib/units";
import type { Repuesto } from "../../../types/database";
import { NUMERIC_COL_GAP } from "../../../constants";
import { useInitialLoad } from "../../../lib/useInitialLoad";

const STOCK_RANK: Record<StockStatus, number> = { sin_stock: 0, bajo: 1, ok: 2 };

export default function SparePartsScreen() {
  // ?buscar= comes from a stock notification on the bell, to land on that repuesto.
  const params = useLocalSearchParams<{ buscar?: string }>();
  const [refreshing, setRefreshing] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [parts, setParts] = useState<Repuesto[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState(params.buscar ?? "");

  // A new ?buscar= while the screen is already open replaces the search.
  const [prevBuscar, setPrevBuscar] = useState(params.buscar);
  if (params.buscar !== prevBuscar) {
    setPrevBuscar(params.buscar);
    if (params.buscar !== undefined) setSearch(params.buscar);
  }
  const [stockFilter, setStockFilter] = useState("");
  const [estadoFilter, setEstadoFilter] = useState("");

  const [editing, setEditing] = useState<Repuesto | null>(null);
  const [creating, setCreating] = useState(false);

  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { confirm, dialog } = useConfirm();

  const load = useCallback(async () => {
    setError(null);
    try {
      const [profile, list] = await Promise.all([getProfile(), listSpareParts()]);
      setIsAdmin(profile?.role === "admin");
      setParts(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const loading = useInitialLoad(load);

  useEffect(() => {
    const channel = supabase
      .channel(`spare-parts-changes-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "repuestos" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function handleDelete(p: Repuesto) {
    confirm({
      title: "Eliminar repuesto",
      message: `¿Eliminar "${p.rep_nombre}"? Esta acción no se puede deshacer.`,
      onConfirm: async () => {
        try {
          await deleteSparePart(p.rep_id);
          await load();
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      },
    });
  }

  const filtered = useMemo(() => {
    const q = normalizeSearch(search.trim());
    return parts.filter((p) => {
      const matchSearch = !q || startsWithSearch(p.rep_nombre, q);
      const matchStock = !stockFilter || stockStatus(p) === stockFilter;
      const matchEstado = !estadoFilter || p.rep_estado === estadoFilter;
      return matchSearch && matchStock && matchEstado;
    });
  }, [parts, search, stockFilter, estadoFilter]);

  const { sorted, field, dir, toggle } = useTableSort<Repuesto>(
    filtered,
    {
      nombre: (p) => p.rep_nombre,
      cantidad: (p) => p.rep_cantidad_actual,
      stock: (p) => STOCK_RANK[stockStatus(p)],
      estado: (p) => p.rep_estado,
    },
    "nombre",
  );

  const { pageItems, page, pageCount, setPage } = usePagination(
    sorted,
    `${search}|${stockFilter}|${estadoFilter}|${field}|${dir}`,
    8,
  );

  // Same rule as Inicio's stock alerts and the nav badge (alerts.ts).
  const lowCount = useMemo(() => lowStockParts(parts).length, [parts]);

  if (loading) return <ActivityIndicator style={styles.center} />;

  function ActiveBadge({ active }: { active: boolean }) {
    return (
      <View style={styles.statusChip}>
        <View
          style={[
            styles.statusDot,
            { backgroundColor: active ? colors.success : colors.textMuted },
          ]}
        />

        <Text style={[styles.statusText, { color: active ? colors.success : colors.textMuted }]}>
          {active ? "Activo" : "Inactivo"}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Repuestos</Text>

          <Text style={styles.subtitle}>
            {isAdmin
              ? "Inventario de repuestos y consumibles"
              : "Consultá las existencias de repuestos"}
          </Text>
        </View>

        {isAdmin && (
          <Pressable style={styles.addButton} onPress={() => setCreating(true)}>
            <Text style={styles.addButtonText}>+ Nuevo</Text>
          </Pressable>
        )}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      {lowCount > 0 && (
        <View style={styles.alert}>
          <Text style={styles.alertText}>
            {lowCount === 1
              ? "1 repuesto activo con stock bajo o sin stock."
              : `${lowCount} repuestos activos con stock bajo o sin stock.`}
          </Text>
        </View>
      )}

      <TableFilterBar
        searchValue={search}
        onSearch={setSearch}
        searchPlaceholder="Buscar repuesto…"
        filters={[
          {
            key: "stock",
            label: "Stock",
            value: stockFilter,
            onChange: setStockFilter,
            options: [
              { value: "", label: "Todos" },
              { value: "sin_stock", label: "Sin stock" },
              { value: "bajo", label: "Stock bajo" },
              { value: "ok", label: "Stock OK" },
            ],
          },
          {
            key: "estado",
            label: "Estado",
            value: estadoFilter,
            onChange: setEstadoFilter,
            options: [
              { value: "", label: "Todos" },
              { value: "activo", label: "Activo" },
              { value: "inactivo", label: "Inactivo" },
            ],
          },
        ]}
        right={
          <Text style={styles.count}>
            {sorted.length} {sorted.length === 1 ? "repuesto" : "repuestos"}
          </Text>
        }
      />

      {sorted.length === 0 ? (
        <Text style={styles.empty}>
          {parts.length === 0
            ? "Todavía no hay repuestos cargados."
            : "No hay repuestos que coincidan con la búsqueda o los filtros."}
        </Text>
      ) : (
        <View style={styles.table}>
          <ScrollableTable minWidth={isAdmin ? 700 : 560}>
            <View style={styles.tableHeader}>
              <SortHeaderCell
                label="Repuesto"
                field="nombre"
                activeField={field}
                dir={dir}
                onSort={toggle}
                style={tableCol(2.2)}
              />

              <SortHeaderCell
                label="Cantidad"
                field="cantidad"
                activeField={field}
                dir={dir}
                onSort={toggle}
                style={[tableCol(1.1), styles.qtyHeaderCell]}
              />

              <SortHeaderCell
                label="Stock"
                field="stock"
                activeField={field}
                dir={dir}
                onSort={toggle}
                style={tableCol(1.2)}
              />

              <SortHeaderCell
                label="Estado"
                field="estado"
                activeField={field}
                dir={dir}
                onSort={toggle}
                style={tableCol(1)}
              />

              {isAdmin && <Text style={[styles.headerCell, styles.actionsCol]}>ACCIONES</Text>}
            </View>

            {pageItems.map((p, i) => (
              <View key={p.rep_id} style={[styles.row, i % 2 === 1 && styles.rowAlt]}>
                <View style={styles.rowMain}>
                  <View style={[tableCol(2.2), styles.cell]}>
                    <Text style={styles.name} numberOfLines={1}>
                      {p.rep_nombre}
                    </Text>

                    <Text style={styles.sub}>
                      Mín. {formatUnitQty(p.rep_stock_minimo, p.rep_unidad)}
                      {p.rep_stock_maximo != null
                        ? ` · Máx. ${formatUnitQty(p.rep_stock_maximo, p.rep_unidad)}`
                        : ""}
                    </Text>
                  </View>

                  <View style={[tableCol(1.1), styles.cell, styles.qtyCol]}>
                    <Text style={styles.qty}>
                      {formatUnitQty(p.rep_cantidad_actual, p.rep_unidad)}
                    </Text>
                  </View>

                  <View style={[tableCol(1.2), styles.cell, styles.badgeCell]}>
                    <StockBadge status={stockStatus(p)} />
                  </View>

                  <View style={[tableCol(1), styles.cell, styles.badgeCell]}>
                    <ActiveBadge active={p.rep_estado === "activo"} />
                  </View>
                </View>

                {isAdmin && (
                  <View style={styles.actionsCol}>
                    <RowActions
                      onView={() =>
                        router.push(
                          `/stock-movements?buscar=${encodeURIComponent(p.rep_nombre)}` as never,
                        )
                      }
                      onEdit={() => setEditing(p)}
                      onDelete={() => handleDelete(p)}
                      viewTooltip="Ver movimientos de stock"
                      editTooltip="Editar repuesto"
                      deleteTooltip="Eliminar repuesto"
                    />
                  </View>
                )}
              </View>
            ))}
          </ScrollableTable>
        </View>
      )}

      <Pagination page={page} pageCount={pageCount} onPage={setPage} />

      {isAdmin && editing && (
        <SparePartModal
          visible={!!editing}
          onClose={() => setEditing(null)}
          onSaved={load}
          sparePart={editing}
          existingParts={parts}
        />
      )}

      {isAdmin && (
        <SparePartModal
          visible={creating}
          onClose={() => setCreating(false)}
          onSaved={load}
          existingParts={parts}
        />
      )}

      {dialog}
    </ScrollView>
  );
}

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
      paddingHorizontal: 16,
      height: 40,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    addButtonText: { color: "#fff", fontWeight: "600", fontSize: 13.5 },
    alert: {
      backgroundColor: c.eqWaiting.bg,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginBottom: 14,
    },
    alertText: { color: c.eqWaiting.fg, fontSize: 13, fontWeight: "600" },
    count: { fontSize: 13, fontWeight: "500", color: c.textSecondary },
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
    actionsCol: { width: 128, flexShrink: 0, alignItems: "flex-start" },
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
    cell: { justifyContent: "center" },
    badgeCell: { alignItems: "flex-start" },
    name: { fontWeight: "600", fontSize: 14.5, color: c.text },
    sub: { marginTop: 3, fontSize: 13, color: c.textMuted },
    // Right-aligned so the digits line up by place value. The padding is
    // tighter than Compras' because this table also renders on phones, where
    // the column is narrow.
    qtyCol: { paddingRight: NUMERIC_COL_GAP },
    qtyHeaderCell: { justifyContent: "flex-end", paddingRight: NUMERIC_COL_GAP },
    qty: {
      fontSize: 14.5,
      fontWeight: "700",
      color: c.text,
      fontFamily: "monospace",
      textAlign: "right",
    },
    statusChip: { flexDirection: "row", alignItems: "center", gap: 6 },
    statusDot: { width: 7, height: 7, borderRadius: 4 },
    statusText: { fontSize: 12.5, fontWeight: "500" },
  });
}
