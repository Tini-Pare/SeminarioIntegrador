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
import { SortHeaderCell } from "../../../components/SortHeaderCell";
import { SparePartModal } from "../../../components/SparePartModal";
import { StockBadge } from "../../../components/StockBadge";
import { TableFilterBar } from "../../../components/TableFilterBar";
import { getProfile } from "../../../lib/auth";
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
import { useTableSort } from "../../../lib/useTableSort";
import type { Repuesto } from "../../../types/database";

const STOCK_RANK: Record<StockStatus, number> = { agotado: 0, bajo: 1, ok: 2 };

export default function SparePartsScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [parts, setParts] = useState<Repuesto[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
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

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

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
    const q = search.trim().toLowerCase();
    return parts.filter((p) => {
      const matchSearch = !q || p.rep_nombre.toLowerCase().includes(q);
      const matchStock = !stockFilter || stockStatus(p) === stockFilter;
      const matchEstado = !estadoFilter || p.rep_estado === estadoFilter;
      return matchSearch && matchStock && matchEstado;
    });
  }, [parts, search, stockFilter, estadoFilter]);

  const { sorted, field, dir, toggle } = useTableSort<Repuesto>(
    filtered,
    {
      nombre: (p) => p.rep_nombre,
      stock: (p) => p.rep_cantidad_actual,
      salud: (p) => STOCK_RANK[stockStatus(p)],
      estado: (p) => p.rep_estado,
    },
    "nombre",
  );

  const { pageItems, page, pageCount, setPage } = usePagination(
    sorted,
    `${search}|${stockFilter}|${estadoFilter}|${field}|${dir}`,
    8,
  );

  const lowCount = useMemo(
    () => parts.filter((p) => p.rep_estado === "activo" && stockStatus(p) !== "ok").length,
    [parts],
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
              ? "1 repuesto activo con stock bajo o agotado."
              : `${lowCount} repuestos activos con stock bajo o agotado.`}
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
              { value: "agotado", label: "Agotado" },
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
            : "Nada coincide con la búsqueda."}
        </Text>
      ) : (
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <SortHeaderCell
              label="Repuesto"
              field="nombre"
              activeField={field}
              dir={dir}
              onSort={toggle}
              style={{ flex: 2.4 }}
            />

            <SortHeaderCell
              label="Stock"
              field="stock"
              activeField={field}
              dir={dir}
              onSort={toggle}
              style={{ flex: 1 }}
            />

            <SortHeaderCell
              label="Estado"
              field="salud"
              activeField={field}
              dir={dir}
              onSort={toggle}
              style={{ flex: 1.2 }}
            />

            {isAdmin && <Text style={[styles.headerCell, styles.actionsCol]}>ACCIONES</Text>}
          </View>

          {pageItems.map((p, i) => (
            <View key={p.rep_id} style={[styles.row, i % 2 === 1 && styles.rowAlt]}>
              <View style={styles.rowMain}>
                <View style={{ flex: 2.4, justifyContent: "center", paddingRight: 12 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {p.rep_nombre}
                  </Text>

                  <Text style={styles.sub}>
                    Mín. {p.rep_stock_minimo}
                    {p.rep_stock_maximo != null ? ` · Máx. ${p.rep_stock_maximo}` : ""}
                    {p.rep_estado === "inactivo" ? " · Inactivo" : ""}
                  </Text>
                </View>

                <View style={{ flex: 1, justifyContent: "center" }}>
                  <Text style={styles.qty}>{p.rep_cantidad_actual}</Text>
                </View>

                <View style={{ flex: 1.2, justifyContent: "center", alignItems: "flex-start" }}>
                  <StockBadge status={stockStatus(p)} />
                </View>
              </View>

              {isAdmin && (
                <View style={styles.actionsCol}>
                  <RowActions
                    onEdit={() => setEditing(p)}
                    onDelete={() => handleDelete(p)}
                    editTooltip="Editar repuesto"
                    deleteTooltip="Eliminar repuesto"
                  />
                </View>
              )}
            </View>
          ))}
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
    actionsCol: { width: 76, flexShrink: 0, alignItems: "flex-start" },
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
    qty: { fontSize: 15, fontWeight: "700", color: c.text, fontFamily: "monospace" },
  });
}
