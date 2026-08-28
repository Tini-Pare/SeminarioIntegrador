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
import { GeneralTaskModal } from "../../../components/GeneralTaskModal";
import { BREAKPOINT } from "../../../constants";
import { listGeneralTasks } from "../../../lib/queries/generalTasks";
import type { ThemeColors } from "../../../lib/theme";
import { useTheme } from "../../../lib/ThemeContext";
import type { TareaGeneral } from "../../../types/database";

export default function GeneralTasksScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tasks, setTasks] = useState<TareaGeneral[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<TareaGeneral | null>(null);
  const [creating, setCreating] = useState(false);
  const { width } = useWindowDimensions();
  const isMobile = width >= BREAKPOINT.mobile;
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

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (loading) return <ActivityIndicator style={styles.center} />;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 20 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Tareas generales</Text>
          <Text style={styles.subtitle}>
            Catálogo de acciones técnicas para planes y órdenes de mantenimiento
          </Text>
        </View>

        <Pressable style={styles.addButton} onPress={() => setCreating(true)}>
          <Text style={styles.addButtonText}>+ Nueva tarea</Text>
        </Pressable>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      {tasks.length === 0 ? (
        <Text style={styles.empty}>Todavía no hay tareas generales cargadas.</Text>
      ) : isMobile ? (
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.headerCell}>TAREA</Text>
          </View>

          {tasks.map((t) => (
            <Pressable key={t.tag_id_tarea} style={styles.row} onPress={() => setEditing(t)}>
              <Text style={styles.name} numberOfLines={1}>
                {t.tag_nombre_tarea}
              </Text>

              {!!t.tag_descripcion_tarea && (
                <Text style={styles.desc} numberOfLines={2}>
                  {t.tag_descripcion_tarea}
                </Text>
              )}
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={styles.cardList}>
          {tasks.map((t) => (
            <Pressable key={t.tag_id_tarea} style={styles.taskCard} onPress={() => setEditing(t)}>
              <Text style={styles.name} numberOfLines={1}>
                {t.tag_nombre_tarea}
              </Text>

              {!!t.tag_descripcion_tarea && (
                <Text style={styles.desc} numberOfLines={2}>
                  {t.tag_descripcion_tarea}
                </Text>
              )}
            </Pressable>
          ))}
        </View>
      )}

      {editing && (
        <GeneralTaskModal
          visible={!!editing}
          onClose={() => setEditing(null)}
          onSaved={load}
          task={editing}
        />
      )}

      <GeneralTaskModal visible={creating} onClose={() => setCreating(false)} onSaved={load} />
    </ScrollView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { backgroundColor: c.bg },
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
    empty: { color: c.textMuted, fontSize: 13.5, marginTop: 8 },
    table: {
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 14,
      overflow: "hidden",
      maxWidth: 760,
    },
    tableHeader: {
      padding: 14,
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
      padding: 14,
      borderBottomWidth: 1,
      borderBottomColor: c.borderRow,
    },
    name: { fontWeight: "600", fontSize: 14, color: c.text },
    desc: { fontSize: 12.5, color: c.textMuted, marginTop: 3 },
    cardList: { gap: 10 },
    taskCard: {
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 14,
      padding: 16,
    },
  });
}
