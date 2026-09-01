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
import { FaultTypeModal } from "../../../components/FaultTypeModal";
import { GeneralTaskModal } from "../../../components/GeneralTaskModal";
import { Pagination } from "../../../components/Pagination";
import { RowActions } from "../../../components/RowActions";
import { BREAKPOINT } from "../../../constants";
import { useConfirm } from "../../../lib/useConfirm";
import {
  deleteFaultType,
  GRAVEDAD_LABELS,
  listFaultTypes,
  normalizeGravedad,
} from "../../../lib/queries/faultTypes";
import { deleteGeneralTask, listGeneralTasks } from "../../../lib/queries/generalTasks";
import type { ThemeColors } from "../../../lib/theme";
import { useTheme } from "../../../lib/ThemeContext";
import { usePagination } from "../../../lib/usePagination";
import type { Fallo, TareaGeneral } from "../../../types/database";

export default function CatalogsScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tasks, setTasks] = useState<TareaGeneral[]>([]);
  const [faults, setFaults] = useState<Fallo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [editingTask, setEditingTask] = useState<TareaGeneral | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);
  const [editingFault, setEditingFault] = useState<Fallo | null>(null);
  const [creatingFault, setCreatingFault] = useState(false);

  const { width } = useWindowDimensions();
  const isWide = width >= BREAKPOINT.desktop;
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { confirm, dialog } = useConfirm();

  const gravedadColor = {
    low: colors.urgencyLow,
    medium: colors.urgencyMedium,
    high: colors.urgencyHigh,
  };

  const load = useCallback(async () => {
    setError(null);
    try {
      const [t, f] = await Promise.all([listGeneralTasks(), listFaultTypes()]);
      setTasks(t);
      setFaults(f);
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
  const faultsPage = usePagination(faults, "", 8);

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

  function deleteFault(f: Fallo) {
    confirm({
      title: "Eliminar falla genérica",
      message: `¿Eliminar "${f.fa_nombre}"? Esta acción no se puede deshacer.`,
      onConfirm: async () => {
        try {
          await deleteFaultType(f.fa_id_fallo);
          await load();
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      },
    });
  }

  if (loading) return <ActivityIndicator style={styles.center} />;

  function GravedadBadge({ raw }: { raw: string | null }) {
    const g = normalizeGravedad(raw);
    const c = gravedadColor[g];
    return (
      <View style={[styles.badge, { backgroundColor: c.bg }]}>
        <Text style={[styles.badgeText, { color: c.fg }]}>{GRAVEDAD_LABELS[g]}</Text>
      </View>
    );
  }

  const tasksSection = (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeadingText}>
          <Text style={styles.sectionTitle}>Tareas generales</Text>
          <Text style={styles.sectionSubtitle}>
            Catálogo de acciones técnicas para planes y órdenes
          </Text>
        </View>

        <Pressable style={styles.addButton} onPress={() => setCreatingTask(true)}>
          <Text style={styles.addButtonText}>+ Nueva tarea</Text>
        </Pressable>
      </View>

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
              <Pressable
                style={styles.rowMain}
                onPress={() => setEditingTask(t)}
                accessibilityLabel={`Editar ${t.tag_nombre_tarea}`}
              >
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
              </Pressable>

              <View style={styles.actionsCol}>
                <RowActions onEdit={() => setEditingTask(t)} onDelete={() => deleteTask(t)} />
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
    </View>
  );

  const faultsSection = (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeadingText}>
          <Text style={styles.sectionTitle}>Fallas genéricas</Text>
          <Text style={styles.sectionSubtitle}>
            Catálogo de tipos de falla para clasificar las incidencias
          </Text>
        </View>

        <Pressable style={styles.addButton} onPress={() => setCreatingFault(true)}>
          <Text style={styles.addButtonText}>+ Nueva falla</Text>
        </Pressable>
      </View>

      {faults.length === 0 ? (
        <Text style={styles.empty}>Todavía no hay fallas genéricas cargadas.</Text>
      ) : (
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.headerCell, { flex: 2.2 }]}>FALLA</Text>
            <Text style={[styles.headerCell, { flex: 1 }]}>GRAVEDAD</Text>
            <Text style={[styles.headerCell, styles.actionsCol]}>ACCIONES</Text>
          </View>

          {faultsPage.pageItems.map((f) => (
            <View key={f.fa_id_fallo} style={styles.row}>
              <Pressable
                style={styles.rowMain}
                onPress={() => setEditingFault(f)}
                accessibilityLabel={`Editar ${f.fa_nombre}`}
              >
                <View style={{ flex: 2.2, justifyContent: "center", paddingRight: 12 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {f.fa_nombre}
                  </Text>

                  {!!f.fa_desperfecto && (
                    <Text style={styles.desc} numberOfLines={1}>
                      {f.fa_desperfecto}
                    </Text>
                  )}
                </View>

                <View style={{ flex: 1, justifyContent: "center" }}>
                  <GravedadBadge raw={f.fa_gravedad} />
                </View>
              </Pressable>

              <View style={styles.actionsCol}>
                <RowActions onEdit={() => setEditingFault(f)} onDelete={() => deleteFault(f)} />
              </View>
            </View>
          ))}
        </View>
      )}

      <Pagination
        page={faultsPage.page}
        pageCount={faultsPage.pageCount}
        onPage={faultsPage.setPage}
      />
    </View>
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 20 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.pageHeader}>
        <Text style={styles.title}>Catálogos</Text>
        <Text style={styles.subtitle}>Tareas generales y fallas genéricas</Text>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={isWide ? styles.columns : undefined}>
        {tasksSection}

        {faultsSection}
      </View>

      {editingTask && (
        <GeneralTaskModal
          visible={!!editingTask}
          onClose={() => setEditingTask(null)}
          onSaved={load}
          task={editingTask}
        />
      )}

      <GeneralTaskModal
        visible={creatingTask}
        onClose={() => setCreatingTask(false)}
        onSaved={load}
      />

      {editingFault && (
        <FaultTypeModal
          visible={!!editingFault}
          onClose={() => setEditingFault(null)}
          onSaved={load}
          fault={editingFault}
        />
      )}

      <FaultTypeModal
        visible={creatingFault}
        onClose={() => setCreatingFault(false)}
        onSaved={load}
      />

      {dialog}
    </ScrollView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { backgroundColor: c.bg },
    center: { flex: 1 },
    pageHeader: { marginBottom: 20 },
    title: { fontSize: 22, fontWeight: "600", color: c.text },
    subtitle: { marginTop: 3, fontSize: 13.5, color: c.textSecondary },
    error: { color: c.destructive, marginBottom: 12 },
    columns: { flexDirection: "row", gap: 20, alignItems: "flex-start" },
    section: { flex: 1, minWidth: 0, marginBottom: 28 },
    sectionHeader: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 12,
      marginBottom: 14,
    },
    sectionHeadingText: { flexShrink: 1, minWidth: 0 },
    sectionTitle: { fontSize: 17, fontWeight: "600", color: c.text },
    sectionSubtitle: { marginTop: 2, fontSize: 12.5, color: c.textSecondary },
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
    actionsCol: { width: 76, flexShrink: 0, alignItems: "flex-start" },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.borderRow,
    },
    rowMain: { flex: 1, flexDirection: "row", alignItems: "center", minWidth: 0 },
    name: { fontWeight: "600", fontSize: 14, color: c.text },
    desc: { fontSize: 12.5, color: c.textMuted, marginTop: 3 },
    badge: {
      alignSelf: "flex-start",
      paddingHorizontal: 11,
      paddingVertical: 4,
      borderRadius: 999,
    },
    badgeText: { fontSize: 12, fontWeight: "600" },
  });
}
