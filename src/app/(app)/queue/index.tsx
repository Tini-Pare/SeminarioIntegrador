import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ScrollView,
  View,
  Text,
  Image,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
} from "react-native";
import {
  finishTask,
  listMyTasks,
  startTask,
  type ConsumedPart,
  type MyTask,
} from "../../../lib/queries/faults";
import { listEquipment } from "../../../lib/queries/equipment";
import { listProfiles } from "../../../lib/queries/profiles";
import { supabase } from "../../../lib/supabase";
import { buildLocationColorMap } from "../../../lib/locationColor";
import { usePagination } from "../../../lib/usePagination";
import { FinishTaskModal } from "../../../components/FinishTaskModal";
import { LocationIcon, WarningIcon } from "../../../components/icons";
import { Pagination } from "../../../components/Pagination";
import { TableFilterBar } from "../../../components/TableFilterBar";
import type { ThemeColors } from "../../../lib/theme";
import { useTheme } from "../../../lib/ThemeContext";
import { useConfirm } from "../../../lib/useConfirm";
import type { Equipo, Solicitud } from "../../../types/database";

// A técnico's queue is one row per tarea assigned to them — not one row
// per OT. A solicitud/OT isn't work a técnico "has"; a tarea is (see
// generateOrder in faults.ts).
type Item = MyTask & {
  equipment: Pick<Equipo, "code" | "name" | "location">;
  reporterName: string;
};

type Priority = Exclude<Solicitud["priority"], null>;
type PriorityFilter = "all" | Priority;

const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
};
type TaskStatus = "pending" | "in_progress" | "done";
type TaskStatusFilter = "all" | TaskStatus;

const STATUS_FILTER_LABELS: Record<TaskStatus, string> = {
  pending: "Pendiente",
  in_progress: "En curso",
  done: "Finalizada",
};
function taskStatus(task: MyTask): TaskStatus {
  if (task.endDate) return "done";
  if (task.startDate) return "in_progress";
  return "pending";
}

function taskStatusLabel(task: MyTask): string {
  return STATUS_FILTER_LABELS[taskStatus(task)];
}

function taskRank(task: MyTask): number {
  if (task.endDate) return 2;
  if (task.startDate) return 1;
  return 0;
}

export default function QueueScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<number | null>(null);
  const [finishingTask, setFinishingTask] = useState<Item | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [statusFilter, setStatusFilter] = useState<TaskStatusFilter>("all");
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { confirm, dialog } = useConfirm();

  const load = useCallback(async () => {
    setError(null);
    try {
      const [tasks, equipment, profiles] = await Promise.all([
        listMyTasks(),
        listEquipment(),
        listProfiles(),
      ]);
      const equipmentById = new Map(equipment.map((e) => [e.id, e]));
      const profileById = new Map(profiles.map((p) => [p.id, p]));
      setItems(
        tasks
          .map((t) => ({
            ...t,
            equipment: equipmentById.get(t.equipmentId) ?? {
              code: "—",
              name: "Equipo desconocido",
              location: "",
            },
            reporterName: profileById.get(t.reportedBy)?.name ?? "Desconocido",
          }))
          .sort((a, b) => taskRank(a) - taskRank(b)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel(`queue-tasks-changes-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "solicitudes" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "orden_de_trabajo" }, load)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tareas_realizadas_orden" },
        load,
      )
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

  async function handleStart(item: Item) {
    setActingOn(item.taskRowId);
    try {
      await startTask(item.taskRowId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActingOn(null);
    }
  }

  async function handleConfirmFinish(repuestos: ConsumedPart[]) {
    if (!finishingTask) return;
    await finishTask(finishingTask.taskRowId, repuestos);
    await load();
    setFinishingTask(null);
  }

  // Starting or finishing a tarea can't be undone from the app, so both ask
  // first. Starting uses a plain confirm dialog; finishing goes straight to
  // FinishTaskModal, which already is the confirmation step (it asks which
  // repuestos were used, since that quantity comes off stock) — chaining a
  // confirm dialog before it would make the técnico confirm twice.
  function askAction(item: Item) {
    if (item.endDate) return;
    if (item.startDate) {
      setFinishingTask(item);
      return;
    }
    confirm({
      title: "Iniciar tarea",
      message: `¿Iniciar "${item.taskName}" en ${item.equipment.name}?`,
      onConfirm: () => handleStart(item),
    });
  }

  function actionLabel(item: Item): string | null {
    if (!item.startDate) return "Iniciar tarea";
    if (!item.endDate) return "Finalizar tarea";
    return null;
  }

  const locationColors = useMemo(
    () => buildLocationColorMap(items.map((i) => i.equipment.location)),
    [items],
  );

  const visibleItems = useMemo(() => {
    return items.filter(
      (item) =>
        (priorityFilter === "all" || item.priority === priorityFilter) &&
        (statusFilter === "all" || taskStatus(item) === statusFilter),
    );
  }, [items, priorityFilter, statusFilter]);

  const priorityColors: Record<Priority, { bg: string; fg: string }> = {
    low: colors.urgencyLow,
    medium: colors.urgencyMedium,
    high: colors.urgencyHigh,
  };

  const { pageItems, page, pageCount, setPage } = usePagination(
    visibleItems,
    `${priorityFilter}|${statusFilter}`,
  );

  if (loading) return <ActivityIndicator style={styles.center} />;

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Cola de trabajo</Text>
            <Text style={styles.subtitle}>Tus tareas asignadas</Text>
          </View>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <TableFilterBar
          filters={[
            {
              key: "prioridad",
              label: "Prioridad",
              value: priorityFilter,
              onChange: (v) => setPriorityFilter(v as PriorityFilter),
              options: [
                { value: "all", label: "Todas" },
                { value: "high", label: "Alta" },
                { value: "medium", label: "Media" },
                { value: "low", label: "Baja" },
              ],
            },
            {
              key: "estado",
              label: "Estado",
              value: statusFilter,
              onChange: (v) => setStatusFilter(v as TaskStatusFilter),
              options: [
                { value: "all", label: "Todas" },
                { value: "pending", label: "Pendiente" },
                { value: "in_progress", label: "En curso" },
                { value: "done", label: "Finalizada" },
              ],
            },
          ]}
          right={
            <Text style={styles.count}>
              {visibleItems.length} {visibleItems.length === 1 ? "tarea" : "tareas"}
            </Text>
          }
        />

        {visibleItems.length === 0 ? (
          <Text style={styles.empty}>
            {items.length === 0 ? "No tenés tareas asignadas." : "Nada coincide con este filtro."}
          </Text>
        ) : (
          pageItems.map((item) => {
            const label = actionLabel(item);
            const prio = priorityColors[item.priority];
            const locColor = locationColors.get(item.equipment.location) ?? "#6a7b62";
            return (
              <View key={item.taskRowId} style={styles.card}>
                <View style={styles.cardTop}>
                  {item.photoUrl ? (
                    <Image source={{ uri: item.photoUrl }} style={styles.photo} />
                  ) : (
                    <View style={[styles.photoPlaceholder, { backgroundColor: prio.bg }]}>
                      <WarningIcon size={20} color={prio.fg} />
                    </View>
                  )}

                  <View style={styles.cardMain}>
                    <Text style={styles.taskName}>{item.taskName}</Text>

                    <View style={styles.row}>
                      <Text style={styles.equipmentName}>{item.equipment.name}</Text>
                      <Text style={styles.equipmentCode}>{item.equipment.code}</Text>
                    </View>

                    <View style={styles.row}>
                      <View style={[styles.badge, { backgroundColor: colors.bgToggle }]}>
                        <Text style={[styles.badgeText, { color: colors.textLabel }]}>
                          {taskStatusLabel(item)}
                        </Text>
                      </View>

                      <View style={[styles.badge, { backgroundColor: prio.bg }]}>
                        <Text style={[styles.badgeText, { color: prio.fg }]}>
                          Prioridad {PRIORITY_LABELS[item.priority]}
                        </Text>
                      </View>
                    </View>

                    {item.faultTypeName && (
                      <Text style={styles.faultTypeText}>Falla: {item.faultTypeName}</Text>
                    )}
                  </View>
                </View>

                <Text style={styles.desc}>{item.description}</Text>

                {item.photoUrls.length > 1 && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.gallery}
                    contentContainerStyle={styles.galleryContent}
                  >
                    {item.photoUrls.map((url) => (
                      <Image key={url} source={{ uri: url }} style={styles.galleryPhoto} />
                    ))}
                  </ScrollView>
                )}

                <View style={styles.metaRow}>
                  <View style={styles.locationRow}>
                    <View style={[styles.locationDot, { backgroundColor: locColor }]} />
                    <LocationIcon size={13} />
                    <Text style={styles.locationText}>{item.equipment.location}</Text>
                  </View>

                  <Text style={styles.meta}>
                    Reportó {item.reporterName} ·{" "}
                    {item.createdAt ? new Date(item.createdAt).toLocaleDateString("es-AR") : "—"}
                  </Text>
                </View>

                {item.endDate ? (
                  <View style={styles.doneRow}>
                    <Text style={styles.doneText}>✓ Finalizada</Text>

                    {item.consumedParts.length > 0 && (
                      <Text style={styles.consumedText}>
                        Repuestos usados:{" "}
                        {item.consumedParts.map((p) => `${p.nombre} ×${p.cantidad}`).join(" · ")}
                      </Text>
                    )}
                  </View>
                ) : (
                  label && (
                    <Pressable
                      style={styles.actionButton}
                      onPress={() => askAction(item)}
                      disabled={actingOn === item.taskRowId}
                    >
                      <Text style={styles.actionText}>
                        {actingOn === item.taskRowId ? "Procesando…" : label}
                      </Text>
                    </Pressable>
                  )
                )}
              </View>
            );
          })
        )}

        <Pagination page={page} pageCount={pageCount} onPage={setPage} />
      </ScrollView>

      {dialog}

      <FinishTaskModal
        visible={!!finishingTask}
        onClose={() => setFinishingTask(null)}
        onConfirm={handleConfirmFinish}
        taskName={finishingTask?.taskName ?? ""}
        equipmentLabel={
          finishingTask ? `${finishingTask.equipment.code} · ${finishingTask.equipment.name}` : ""
        }
      />
    </>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { backgroundColor: c.bg },
    content: { padding: 20, maxWidth: 920 },
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
    error: { color: c.destructive, marginBottom: 12 },
    empty: { padding: 40, textAlign: "center", color: c.textMuted },
    count: { fontSize: 13, fontWeight: "500", color: c.textSecondary },
    card: {
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
    },
    cardTop: { flexDirection: "row", gap: 12 },
    cardMain: { flex: 1, minWidth: 0, gap: 6 },
    taskName: { fontSize: 13, fontWeight: "700", color: c.accent },
    photo: { width: 48, height: 48, borderRadius: 10, backgroundColor: c.bgNested },
    photoPlaceholder: {
      width: 48,
      height: 48,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.bgNested,
    },
    row: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
    equipmentName: { fontWeight: "600", fontSize: 14.5, color: c.text },
    equipmentCode: { fontFamily: "monospace", fontSize: 12.5, color: c.textMuted },
    badge: { paddingHorizontal: 11, paddingVertical: 3.5, borderRadius: 999 },
    badgeText: { fontSize: 12.5, fontWeight: "600" },
    faultTypeText: { fontSize: 12.5, color: c.textLabel, fontWeight: "500" },
    desc: { marginTop: 12, fontSize: 13.5, color: c.textLabel, lineHeight: 19 },
    // Twitter-style side-scroll: all the solicitud's photos, swipeable.
    gallery: { marginTop: 10 },
    galleryContent: { gap: 8, paddingRight: 4 },
    galleryPhoto: { width: 96, height: 96, borderRadius: 10, backgroundColor: c.bgNested },
    metaRow: {
      marginTop: 10,
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    locationRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    locationDot: { width: 7, height: 7, borderRadius: 4 },
    locationText: { fontSize: 13, color: c.textLabel, fontWeight: "500" },
    meta: { fontSize: 13, color: c.textMuted },
    actionButton: {
      marginTop: 14,
      height: 40,
      borderRadius: 9,
      backgroundColor: c.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    actionText: { color: "#fff", fontSize: 13.5, fontWeight: "600" },
    doneRow: { marginTop: 14, gap: 4 },
    doneText: { color: c.success, fontSize: 13.5, fontWeight: "600" },
    consumedText: { fontSize: 12.5, color: c.textMuted, lineHeight: 17 },
  });
}
