import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { CatalogActions } from "../../../components/CatalogActions";
import { DeleteConfirmationModal } from "../../../components/DeleteConfirmationModal";
import { GeneralTaskModal } from "../../../components/GeneralTaskModal";
import { BREAKPOINT } from "../../../constants";
import { listGeneralTasks, setGeneralTaskActive } from "../../../lib/queries/generalTasks";
import { supabase } from "../../../lib/supabase";
import type { ThemeColors } from "../../../lib/theme";
import { useTheme } from "../../../lib/ThemeContext";
import type { GeneralTask } from "../../../types/database";

export default function GeneralTasksScreen() {
  const [tasks, setTasks] = useState<GeneralTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<GeneralTask | null>(null);
  const [creating, setCreating] = useState(false);
  const [toggleTarget, setToggleTarget] = useState<GeneralTask | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const { width } = useWindowDimensions();
  const isWide = width >= BREAKPOINT.mobile;
  const { colors } = useTheme();
  const styles = makeStyles(colors);

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

  useEffect(() => {
    const channel = supabase
      .channel(`general-tasks-changes-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tareas_generales" }, load)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  async function toggleTask(task: GeneralTask) {
    setTogglingId(task.tag_id_tarea);
    try {
      await setGeneralTaskActive(task.tag_id_tarea, !task.tag_activo);
      setToggleTarget(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTogglingId(null);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (loading) return <ActivityIndicator style={styles.center} />;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Tareas generales</Text>
          <Text style={styles.subtitle}>Gestioná las tareas disponibles para planes y órdenes</Text>
        </View>

        <Pressable style={styles.addButton} onPress={() => setCreating(true)}>
          <Text style={styles.addButtonText}>+ Nueva tarea</Text>
        </Pressable>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      {tasks.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Todavía no hay tareas generales.</Text>
          <Text style={styles.emptyText}>Agregá la primera tarea para comenzar.</Text>
        </View>
      ) : isWide ? (
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.headerCell, styles.nameColumn]}>TAREA</Text>
            <Text style={[styles.headerCell, styles.descriptionColumn]}>DESCRIPCIÓN</Text>
            <Text style={[styles.headerCell, styles.statusColumn]}>ESTADO</Text>
            <Text style={[styles.headerCell, styles.actionsColumn]}>ACCIONES</Text>
          </View>

          {tasks.map((task) => (
            <View key={task.tag_id_tarea} style={styles.row}>
              <Pressable style={[styles.cell, styles.nameColumn]} onPress={() => setEditing(task)}>
                <Text style={styles.name} numberOfLines={1}>
                  {task.tag_nombre_tarea}
                </Text>
              </Pressable>

              <Text style={[styles.cellText, styles.descriptionColumn]} numberOfLines={2}>
                {task.tag_descripcion_tarea || "—"}
              </Text>

              <View style={[styles.cell, styles.statusColumn]}>
                <StatusBadge active={task.tag_activo} colors={colors} />
              </View>

              <View style={[styles.cell, styles.actionsColumn]}>
                <CatalogActions
                  active={task.tag_activo}
                  disabled={togglingId === task.tag_id_tarea}
                  onEdit={() => setEditing(task)}
                  onToggle={() => setToggleTarget(task)}
                />
              </View>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.cardList}>
          {tasks.map((task) => (
            <View key={task.tag_id_tarea} style={styles.card}>
              <Pressable style={styles.cardInfo} onPress={() => setEditing(task)}>
                <View style={styles.cardTitleRow}>
                  <Text style={styles.name} numberOfLines={1}>
                    {task.tag_nombre_tarea}
                  </Text>
                  <StatusBadge active={task.tag_activo} colors={colors} />
                </View>
                <Text style={styles.cellText} numberOfLines={2}>
                  {task.tag_descripcion_tarea || "Sin descripción"}
                </Text>
              </Pressable>

              <CatalogActions
                active={task.tag_activo}
                disabled={togglingId === task.tag_id_tarea}
                onEdit={() => setEditing(task)}
                onToggle={() => setToggleTarget(task)}
              />
            </View>
          ))}
        </View>
      )}

      {editing && (
        <GeneralTaskModal visible task={editing} onClose={() => setEditing(null)} onSaved={load} />
      )}

      <GeneralTaskModal visible={creating} onClose={() => setCreating(false)} onSaved={load} />

      {toggleTarget && (
        <DeleteConfirmationModal
          visible
          title={toggleTarget.tag_activo ? "Inhabilitar tarea" : "Habilitar tarea"}
          message={
            toggleTarget.tag_activo
              ? `¿Querés inhabilitar "${toggleTarget.tag_nombre_tarea}"? Se conservarán sus referencias históricas.`
              : `¿Querés habilitar "${toggleTarget.tag_nombre_tarea}" para nuevas operaciones?`
          }
          confirmLabel={toggleTarget.tag_activo ? "Inhabilitar" : "Habilitar"}
          loadingLabel={toggleTarget.tag_activo ? "Inhabilitando…" : "Habilitando…"}
          deleting={togglingId === toggleTarget.tag_id_tarea}
          onCancel={() => setToggleTarget(null)}
          onConfirm={() => void toggleTask(toggleTarget)}
        />
      )}
    </ScrollView>
  );
}

function StatusBadge({ active, colors }: { active: boolean; colors: ThemeColors }) {
  const palette = active ? colors.eqOperational : { bg: colors.bgToggle, fg: colors.textMuted };
  return (
    <View style={[styles.badge, { backgroundColor: palette.bg }]}>
      <View style={[styles.dot, { backgroundColor: active ? colors.success : colors.textMuted }]} />
      <Text style={[styles.badgeText, { color: palette.fg }]}>
        {active ? "Activa" : "Inactiva"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  badgeText: { fontSize: 12, fontWeight: "600" },
});

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { backgroundColor: c.bg },
    content: { padding: 20, paddingBottom: 48 },
    center: { flex: 1 },
    header: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 12,
      marginBottom: 20,
    },
    title: { fontSize: 22, fontWeight: "600", color: c.text },
    subtitle: { marginTop: 3, fontSize: 13.5, color: c.textSecondary },
    addButton: {
      backgroundColor: c.accent,
      paddingHorizontal: 18,
      height: 42,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    addButtonText: { color: "#fff", fontWeight: "600", fontSize: 14 },
    error: { color: c.destructive, marginBottom: 12 },
    empty: {
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 14,
      padding: 24,
    },
    emptyTitle: { color: c.text, fontWeight: "600", fontSize: 15 },
    emptyText: { color: c.textMuted, fontSize: 13, marginTop: 5 },
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
      paddingHorizontal: 14,
      paddingVertical: 13,
      backgroundColor: c.bgTableHeader,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    headerCell: {
      fontSize: 11,
      letterSpacing: 0.6,
      textTransform: "uppercase",
      color: c.textMuted,
      fontFamily: "monospace",
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      minHeight: 66,
      paddingHorizontal: 14,
      borderBottomWidth: 1,
      borderBottomColor: c.borderRow,
    },
    cell: { justifyContent: "center", paddingVertical: 8 },
    nameColumn: { flex: 1.4, minWidth: 150 },
    descriptionColumn: { flex: 2, minWidth: 180, paddingHorizontal: 8 },
    statusColumn: { flex: 1, minWidth: 100, paddingHorizontal: 8 },
    actionsColumn: { flex: 0.9, minWidth: 76, paddingHorizontal: 4 },
    name: { color: c.text, fontSize: 14, fontWeight: "600" },
    cellText: { color: c.textLabel, fontSize: 13, marginTop: 3 },
    cardList: { gap: 10 },
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 14,
      padding: 14,
    },
    cardInfo: { flex: 1, minWidth: 0 },
    cardTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
  });
}
