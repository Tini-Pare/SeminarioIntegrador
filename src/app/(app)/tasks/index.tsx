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
import { DetailModal } from "../../../components/DetailModal";
import { GeneralTaskModal } from "../../../components/GeneralTaskModal";
import { Pagination } from "../../../components/Pagination";
import { RowActions } from "../../../components/RowActions";
import { SortHeaderCell } from "../../../components/SortHeaderCell";
import { TableFilterBar } from "../../../components/TableFilterBar";
import { useConfirm } from "../../../lib/useConfirm";
import { deleteGeneralTask, listGeneralTasks } from "../../../lib/queries/generalTasks";
import type { ThemeColors } from "../../../lib/theme";
import { useTheme } from "../../../lib/ThemeContext";
import { usePagination } from "../../../lib/usePagination";
import { useTableSort } from "../../../lib/useTableSort";
import type { TareaGeneral } from "../../../types/database";

export default function TasksScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tasks, setTasks] = useState<TareaGeneral[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [descFilter, setDescFilter] = useState("");

  const [editingTask, setEditingTask] = useState<TareaGeneral | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);
  const [viewingTask, setViewingTask] = useState<TareaGeneral | null>(null);

  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { confirm, dialog } = useConfirm();

  const load = useCallback(async () => {
    setError(null);
    try {
      setTasks(await listGeneralTasks());
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      const hasDesc = !!t.tag_descripcion_tarea?.trim();
      const matchSearch =
        !q ||
        t.tag_nombre_tarea.toLowerCase().includes(q) ||
        (t.tag_descripcion_tarea ?? "").toLowerCase().includes(q);
      const matchDesc = !descFilter || (descFilter === "with" ? hasDesc : !hasDesc);
      return matchSearch && matchDesc;
    });
  }, [tasks, search, descFilter]);

  const { sorted, field, dir, toggle } = useTableSort<TareaGeneral>(
    filtered,
    { nombre: (t) => t.tag_nombre_tarea },
    "nombre",
  );

  const tasksPage = usePagination(sorted, `${search}|${descFilter}|${field}|${dir}`, 8);

  function deleteTask(t: TareaGeneral) {
    confirm({
      title: "Eliminar tarea",
      message: `¿Eliminar "${t.tag_nombre_tarea}"? Esta acción no se puede deshacer.`,
      onConfirm: async () => {
        try {
          await deleteGeneralTask(t.tag_id_tarea);
          await load();
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      },
    });
  }

  if (loading) return <ActivityIndicator style={styles.center} />;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.pageHeader}>
        <View style={styles.sectionHeadingText}>
          <Text style={styles.title}>Tareas generales</Text>
          <Text style={styles.subtitle}>Catálogo de acciones técnicas para planes y órdenes</Text>
        </View>

        <Pressable style={styles.addButton} onPress={() => setCreatingTask(true)}>
          <Text style={styles.addButtonText}>+ Nuevo</Text>
        </Pressable>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <TableFilterBar
        searchValue={search}
        onSearch={setSearch}
        searchPlaceholder="Buscar por nombre o descripción…"
        filters={[
          {
            key: "desc",
            label: "Descripción",
            value: descFilter,
            onChange: setDescFilter,
            options: [
              { value: "", label: "Todas" },
              { value: "with", label: "Con descripción" },
              { value: "without", label: "Sin descripción" },
            ],
          },
        ]}
        right={
          <Text style={styles.count}>
            {sorted.length} {sorted.length === 1 ? "tarea" : "tareas"}
          </Text>
        }
      />

      {sorted.length === 0 ? (
        <Text style={styles.empty}>
          {tasks.length === 0
            ? "Todavía no hay tareas generales cargadas."
            : "Nada coincide con la búsqueda."}
        </Text>
      ) : (
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <SortHeaderCell
              label="Tarea"
              field="nombre"
              activeField={field}
              dir={dir}
              onSort={toggle}
              style={{ flex: 1 }}
            />

            <Text style={[styles.headerCell, styles.actionsCol]}>ACCIONES</Text>
          </View>

          {tasksPage.pageItems.map((t, i) => (
            <View key={t.tag_id_tarea} style={[styles.row, i % 2 === 1 && styles.rowAlt]}>
              <View style={styles.rowMain}>
                <View style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {t.tag_nombre_tarea}
                  </Text>
                </View>
              </View>

              <View style={styles.actionsCol}>
                <RowActions
                  onView={() => setViewingTask(t)}
                  onEdit={() => setEditingTask(t)}
                  onDelete={() => deleteTask(t)}
                  viewTooltip="Ver tarea"
                  editTooltip="Editar tarea"
                  deleteTooltip="Eliminar tarea"
                />
              </View>
            </View>
          ))}
        </View>
      )}

      <Pagination
        page={tasksPage.page}
        pageCount={tasksPage.pageCount}
        onPage={tasksPage.setPage}
      />

      {editingTask && (
        <GeneralTaskModal
          visible={!!editingTask}
          onClose={() => setEditingTask(null)}
          onSaved={load}
          task={editingTask}
          existingTasks={tasks}
        />
      )}

      <GeneralTaskModal
        visible={creatingTask}
        onClose={() => setCreatingTask(false)}
        onSaved={load}
        existingTasks={tasks}
      />

      <DetailModal
        visible={!!viewingTask}
        onClose={() => setViewingTask(null)}
        title={viewingTask?.tag_nombre_tarea ?? ""}
        description={viewingTask?.tag_descripcion_tarea}
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
    pageHeader: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 12,
      marginBottom: 16,
    },
    sectionHeadingText: { flexShrink: 1, minWidth: 0 },
    title: { fontSize: 22, fontWeight: "600", color: c.text },
    subtitle: { marginTop: 3, fontSize: 13.5, color: c.textSecondary },
    count: { fontSize: 13, fontWeight: "500", color: c.textSecondary },
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
      fontSize: 11.5,
      fontWeight: "600",
      letterSpacing: 0.7,
      textTransform: "uppercase",
      color: "#fff",
      fontFamily: "monospace",
    },
    actionsCol: { width: 114, flexShrink: 0, alignItems: "flex-start" },
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
  });
}
