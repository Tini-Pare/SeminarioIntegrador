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
import { SupplierModal } from "../../../components/SupplierModal";
import { TableFilterBar } from "../../../components/TableFilterBar";
import {
  deleteSupplier,
  listSuppliers,
  listTiposProveedores,
  type SupplierWithRubro,
} from "../../../lib/queries/suppliers";
import type { ThemeColors } from "../../../lib/theme";
import { useTheme } from "../../../lib/ThemeContext";
import { useConfirm } from "../../../lib/useConfirm";
import { usePagination } from "../../../lib/usePagination";
import { useTableSort } from "../../../lib/useTableSort";
import type { TipoProveedor } from "../../../types/database";

export default function SuppliersScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [suppliers, setSuppliers] = useState<SupplierWithRubro[]>([]);
  const [tipos, setTipos] = useState<TipoProveedor[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [rubroFilter, setRubroFilter] = useState("");

  const [editing, setEditing] = useState<SupplierWithRubro | null>(null);
  const [creating, setCreating] = useState(false);

  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { confirm, dialog } = useConfirm();

  const load = useCallback(async () => {
    setError(null);
    try {
      const [list, tipoList] = await Promise.all([listSuppliers(), listTiposProveedores()]);
      setSuppliers(list);
      setTipos(tipoList);
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

  function handleDelete(s: SupplierWithRubro) {
    confirm({
      title: "Eliminar proveedor",
      message: `¿Eliminar "${s.prov_nombre}"? Esta acción no se puede deshacer.`,
      onConfirm: async () => {
        try {
          await deleteSupplier(s.prov_id_proveedor);
          await load();
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      },
    });
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return suppliers.filter((s) => {
      const matchSearch =
        !q ||
        s.prov_nombre.toLowerCase().includes(q) ||
        (s.prov_correo ?? "").toLowerCase().includes(q);
      const matchRubro = !rubroFilter || s.rubro === rubroFilter;
      return matchSearch && matchRubro;
    });
  }, [suppliers, search, rubroFilter]);

  const { sorted, field, dir, toggle } = useTableSort<SupplierWithRubro>(
    filtered,
    { nombre: (s) => s.prov_nombre, rubro: (s) => s.rubro },
    "nombre",
  );

  const { pageItems, page, pageCount, setPage } = usePagination(
    sorted,
    `${search}|${rubroFilter}|${field}|${dir}`,
    8,
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
          <Text style={styles.title}>Proveedores</Text>

          <Text style={styles.subtitle}>Proveedores de repuestos para asociar a las compras</Text>
        </View>

        <Pressable style={styles.addButton} onPress={() => setCreating(true)}>
          <Text style={styles.addButtonText}>+ Nuevo</Text>
        </Pressable>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <TableFilterBar
        searchValue={search}
        onSearch={setSearch}
        searchPlaceholder="Buscar por nombre o correo…"
        filters={[
          {
            key: "rubro",
            label: "Rubro",
            value: rubroFilter,
            onChange: setRubroFilter,
            options: [
              { value: "", label: "Todos" },
              ...tipos.map((t) => ({ value: t.tp_nombre_rubro, label: t.tp_nombre_rubro })),
            ],
          },
        ]}
        right={
          <Text style={styles.count}>
            {sorted.length} {sorted.length === 1 ? "proveedor" : "proveedores"}
          </Text>
        }
      />

      {sorted.length === 0 ? (
        <Text style={styles.empty}>
          {suppliers.length === 0
            ? "Todavía no hay proveedores cargados."
            : "Nada coincide con la búsqueda."}
        </Text>
      ) : (
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <SortHeaderCell
              label="Proveedor"
              field="nombre"
              activeField={field}
              dir={dir}
              onSort={toggle}
              style={{ flex: 2 }}
            />

            <SortHeaderCell
              label="Rubro"
              field="rubro"
              activeField={field}
              dir={dir}
              onSort={toggle}
              style={{ flex: 1.4 }}
            />

            <Text style={[styles.headerCell, styles.actionsCol]}>ACCIONES</Text>
          </View>

          {pageItems.map((s, i) => (
            <View key={s.prov_id_proveedor} style={[styles.row, i % 2 === 1 && styles.rowAlt]}>
              <View style={styles.rowMain}>
                <View style={{ flex: 2, justifyContent: "center", paddingRight: 12 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {s.prov_nombre}
                  </Text>

                  {(s.prov_telefono || s.prov_correo) && (
                    <Text style={styles.sub} numberOfLines={1}>
                      {[s.prov_telefono, s.prov_correo].filter(Boolean).join(" · ")}
                    </Text>
                  )}
                </View>

                <View style={{ flex: 1.4, justifyContent: "center" }}>
                  <Text style={styles.rubro} numberOfLines={1}>
                    {s.rubro ?? "—"}
                  </Text>
                </View>
              </View>

              <View style={styles.actionsCol}>
                <RowActions
                  onEdit={() => setEditing(s)}
                  onDelete={() => handleDelete(s)}
                  editTooltip="Editar proveedor"
                  deleteTooltip="Eliminar proveedor"
                />
              </View>
            </View>
          ))}
        </View>
      )}

      <Pagination page={page} pageCount={pageCount} onPage={setPage} />

      {editing && (
        <SupplierModal
          visible={!!editing}
          onClose={() => setEditing(null)}
          onSaved={load}
          supplier={editing}
          tipos={tipos}
          existingSuppliers={suppliers}
        />
      )}

      <SupplierModal
        visible={creating}
        onClose={() => setCreating(false)}
        onSaved={load}
        tipos={tipos}
        existingSuppliers={suppliers}
      />

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
    rubro: { fontSize: 13, color: c.textLabel },
  });
}
