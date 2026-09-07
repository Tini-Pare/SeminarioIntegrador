import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { GeneralTaskModal } from "../../../components/GeneralTaskModal";
import { Pagination } from "../../../components/Pagination";
import { RowActions } from "../../../components/RowActions";
import { useConfirm } from "../../../lib/useConfirm";
import { deleteGeneralTask, listGeneralTasks } from "../../../lib/queries/generalTasks";
import type { ThemeColors } from "../../../lib/theme";
import { useTheme } from "../../../lib/ThemeContext";
import { usePagination } from "../../../lib/usePagination";
import type { TareaGeneral } from "../../../types/database";

export default function TasksScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tasks, setTasks] = useState<TareaGeneral[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [editingTask, setEditingTask] = useState<TareaGeneral | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);

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

  const tasksPage = usePagination(tasks, "", 8);

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
      contentContainerStyle={{ padding: 20 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.pageHeader}>
        <View style={styles.sectionHeadingText}>
          <Text style={styles.title}>Tareas generales</Text>
          <Text style={styles.subtitle}>Catálogo de acciones técnicas para planes y órdenes</Text>
        </View>

        <Pressable style={styles.addButton} onPress={() => setCreatingTask(true)}>
          <Text style={styles.addButtonText}>+ Nueva tarea</Text>
        </Pressable>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      {tasks.length === 0 ? (
        <Text style={styles.empty}>Todavía no hay tareas generales cargadas.</Text>
      ) : (
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.headerCell, { flex: 1 }]}>TAREA</Text>
            <Text style={[styles.headerCell, styles.actionsCol]}>ACCIONES</Text>
          </View>

          {tasksPage.pageItems.map((t) => (
            <View key={t.tag_id_tarea} style={styles.row}>
              <View style={styles.rowMain}>
                <View style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {t.tag_nombre_tarea}
                  </Text>

                  {!!t.tag_descripcion_tarea && (
                    <Text style={styles.desc} numberOfLines={2}>
                      {t.tag_descripcion_tarea}
                    </Text>
                  )}
                </View>
              </View>

              <View style={styles.actionsCol}>
                <RowActions
                  onEdit={() => setEditingTask(t)}
                  onDelete={() => deleteTask(t)}
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

      {dialog}
    </ScrollView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { backgroundColor: c.bg },
    center: { flex: 1 },
    pageHeader: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 12,
      marginBottom: 20,
    },
    sectionHeadingText: { flexShrink: 1, minWidth: 0 },
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
    actionsCol: { width: 76, flexShrink: 0, alignItems: "flex-start" },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.borderRow,
    },
    rowMain: { flex: 1, flexDirection: "row", alignItems: "center", minWidth: 0 },
    name: { fontWeight: "600", fontSize: 14, color: c.text },
    desc: { fontSize: 12.5, color: c.textMuted, marginTop: 3 },
  });
}
