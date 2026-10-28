import { router, useLocalSearchParams } from "expo-router";
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
  resumeTask,
  startTask,
  suspendTask,
  type ConsumedPart,
  type MyTask,
} from "../../../lib/queries/faults";
import { isCriticalTask } from "../../../lib/queries/alerts";
import { listEquipment } from "../../../lib/queries/equipment";
import { listProfiles } from "../../../lib/queries/profiles";
import { supabase } from "../../../lib/supabase";
import { buildLocationColorMap } from "../../../lib/locationColor";
import { usePagination } from "../../../lib/usePagination";
import { useTableSort } from "../../../lib/useTableSort";
import { FinishTaskModal } from "../../../components/FinishTaskModal";
import { SortHeaderCell } from "../../../components/SortHeaderCell";
import { SuspendTaskModal } from "../../../components/SuspendTaskModal";
import {
  CalendarIcon,
  EquipmentIcon,
  LocationIcon,
  RefreshCwIcon,
  UserIcon,
  WarningIcon,
  WorkOrderIcon,
} from "../../../components/icons";
import { Pagination } from "../../../components/Pagination";
import { withSiglas } from "../../../components/Sigla";
import { fromDbDate } from "../../../components/CustomDatePicker";
import { formatOrderNumber } from "../../../lib/orderNumber";
import { TableFilterBar } from "../../../components/TableFilterBar";
import type { ThemeColors } from "../../../lib/theme";
import { useTheme } from "../../../lib/ThemeContext";
import { useConfirm } from "../../../lib/useConfirm";
import type { Equipo, PastTaskSuspension, Solicitud } from "../../../types/database";

// ot_tipo_orden of a tarea that didn't come from a solicitud; anything not
// listed here shows as is.
const ORDER_TYPE_LABELS: Record<string, string> = {
  correctivo: "Correctivo",
  preventivo: "Preventivo",
  instalacion: "Instalación",
};

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
type TaskStatus = "pending" | "in_progress" | "suspended" | "done";
type TaskStatusFilter = "all" | TaskStatus;

const STATUS_FILTER_LABELS: Record<TaskStatus, string> = {
  pending: "Pendiente",
  in_progress: "En curso",
  suspended: "Suspendida",
  done: "Finalizada",
};
function taskStatus(task: MyTask): TaskStatus {
  if (task.endDate) return "done";
  if (task.suspension) return "suspended";
  if (task.startDate) return "in_progress";
  return "pending";
}

function taskStatusLabel(task: MyTask): string {
  return STATUS_FILTER_LABELS[taskStatus(task)];
}

function formatDbDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString("es-AR");
}

// "Estuvo suspendida del 12/10/2026 al 14/10/2026 · Motivo: Falta de
// repuestos" (or "Motivo: Otro - <comentario>").
function lastSuspensionText(s: PastTaskSuspension): string {
  const detail = s.comment ? ` - ${s.comment}` : "";
  return `Estuvo suspendida del ${formatDbDate(s.since)} al ${formatDbDate(s.until)} · Motivo: ${s.reason}${detail}`;
}

// "Estado" order: what can be worked on now first, suspended tareas after
// them (waiting on something), finished ones last.
const STATUS_RANK: Record<TaskStatus, number> = {
  pending: 0,
  in_progress: 1,
  suspended: 2,
  done: 3,
};

// Ascending = most urgent first, which is what "Prioridad ▲" should mean.
const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

function taskRank(task: MyTask): number {
  return STATUS_RANK[taskStatus(task)];
}

// Base order before the técnico picks a sort: by estado, oldest solicitud
// first within each. Sorting is stable, so it's also the tie-break for
// "Prioridad" (same priority -> pending before finished, older first).
function compareTasks(a: MyTask, b: MyTask): number {
  return taskRank(a) - taskRank(b) || a.createdAt.localeCompare(b.createdAt);
}

export default function QueueScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<number | null>(null);
  const [finishingTask, setFinishingTask] = useState<Item | null>(null);
  const [suspendingTask, setSuspendingTask] = useState<Item | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [statusFilter, setStatusFilter] = useState<TaskStatusFilter>("all");
  // Opened from a "falla crítica" notification: show only prioridad Alta.
  // An effect, not the initial state, since the queue may already be open.
  const { prioridad } = useLocalSearchParams<{ prioridad?: string }>();
  useEffect(() => {
    if (prioridad === "alta") {
      setPriorityFilter("high");
      setStatusFilter("all");
    }
  }, [prioridad]);
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
          .sort(compareTasks),
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

  // Starting/finishing/suspending/resuming changes the tarea's status, so
  // under a status filter it would just vanish from the list. Going back
  // to "Todas" keeps it in sight with its new status.
  function resetFilters() {
    setPriorityFilter("all");
    setStatusFilter("all");
  }

  async function handleStart(item: Item) {
    setActingOn(item.taskRowId);
    try {
      await startTask(item.taskRowId);
      await load();
      resetFilters();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActingOn(null);
    }
  }

  async function handleConfirmFinish(repuestos: ConsumedPart[], diagnostico: string) {
    if (!finishingTask) return;
    await finishTask(finishingTask.taskRowId, repuestos, diagnostico);
    await load();
    resetFilters();
    setFinishingTask(null);
  }

  async function handleConfirmSuspend(input: { reason: string; comment?: string }) {
    if (!suspendingTask) return;
    await suspendTask(suspendingTask.taskRowId, input.reason, input.comment);
    await load();
    resetFilters();
    setSuspendingTask(null);
  }

  async function handleResume(item: Item) {
    setActingOn(item.taskRowId);
    try {
      await resumeTask(item.taskRowId);
      await load();
      resetFilters();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActingOn(null);
    }
  }

  // Starting or finishing a tarea can't be undone from the app, so both ask
  // first. Starting uses a plain confirm dialog; finishing goes straight to
  // FinishTaskModal, which already is the confirmation step (it asks which
  // repuestos were used, since that quantity comes off stock) — chaining a
  // confirm dialog before it would make the técnico confirm twice. A
  // suspended tarea's main action is resuming it (it can't be finished
  // while on hold).
  function askAction(item: Item) {
    if (item.endDate) return;
    if (item.suspension) {
      confirm({
        title: "Reanudar tarea",
        message: `¿Reanudar "${item.taskName}" en ${item.equipment.name}?`,
        onConfirm: () => handleResume(item),
      });
      return;
    }
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
    if (item.suspension) return "Reanudar tarea";
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

  // What's still left to do (not started, en curso or suspendida) among the
  // listed tareas; finished ones are history, not work the técnico has.
  const pendingCount = visibleItems.filter((t) => !t.endDate).length;

  // SCRUM-59: unfinished tareas on an OT the admin gave prioridad Alta —
  // counted over every tarea, not just the filtered ones, so the warning
  // can't be hidden by a filter.
  const criticalItems = useMemo(() => items.filter(isCriticalTask), [items]);

  const priorityColors: Record<Priority, { bg: string; fg: string }> = {
    low: colors.urgencyLow,
    medium: colors.urgencyMedium,
    high: colors.urgencyHigh,
  };

  // Defaults to Prioridad (most urgent first); Fecha ▲ is chronological,
  // the oldest solicitud first.
  const { sorted, field, dir, toggle } = useTableSort<Item>(
    visibleItems,
    {
      prioridad: (t) => PRIORITY_RANK[t.priority],
      fecha: (t) => t.createdAt,
      estado: (t) => taskRank(t),
    },
    "prioridad",
  );

  const { pageItems, page, pageCount, setPage } = usePagination(
    sorted,
    `${priorityFilter}|${statusFilter}|${field}|${dir}`,
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

        {criticalItems.length > 0 && (
          <View style={styles.criticalBanner}>
            <View style={styles.criticalHeader}>
              <WarningIcon size={18} color={colors.urgencyHigh.fg} />

              <Text style={styles.criticalTitle}>
                {criticalItems.length === 1
                  ? "Tenés 1 falla crítica para atender con prioridad"
                  : `Tenés ${criticalItems.length} fallas críticas para atender con prioridad`}
              </Text>
            </View>

            {criticalItems.slice(0, 5).map((item) => (
              <Text key={item.taskRowId} style={styles.criticalRow}>
                {withSiglas(formatOrderNumber(item.orderId))} · {item.equipment.name} ·{" "}
                {item.taskName} ({taskStatusLabel(item).toLowerCase()})
              </Text>
            ))}

            {criticalItems.length > 5 && (
              <Text style={styles.criticalRow}>y {criticalItems.length - 5} más</Text>
            )}

            {priorityFilter !== "high" && (
              <Pressable
                style={styles.criticalButton}
                onPress={() => {
                  setPriorityFilter("high");
                  setStatusFilter("all");
                }}
              >
                <Text style={styles.criticalButtonText}>Ver solo prioridad alta</Text>
              </Pressable>
            )}
          </View>
        )}

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
                { value: "suspended", label: "Suspendida" },
                { value: "done", label: "Finalizada" },
              ],
            },
          ]}
          right={
            <Text style={styles.count}>
              {pendingCount} {pendingCount === 1 ? "tarea pendiente" : "tareas pendientes"}
            </Text>
          }
        />

        {/* Cards have no table header, so the sortable "columns" live in a
            bar styled like one — same as the equipo detail's fallas tab. */}
        {visibleItems.length > 1 && (
          <View style={styles.sortBar}>
            <Text style={styles.sortBarLabel}>Ordenar por</Text>

            <SortHeaderCell
              label="Prioridad"
              field="prioridad"
              activeField={field}
              dir={dir}
              onSort={toggle}
            />

            <SortHeaderCell
              label="Fecha de solicitud"
              field="fecha"
              activeField={field}
              dir={dir}
              onSort={toggle}
            />

            <SortHeaderCell
              label="Estado"
              field="estado"
              activeField={field}
              dir={dir}
              onSort={toggle}
            />
          </View>
        )}

        {visibleItems.length === 0 ? (
          <Text style={styles.empty}>
            {items.length === 0
              ? "No tenés tareas asignadas."
              : "No hay tareas que coincidan con los filtros."}
          </Text>
        ) : (
          pageItems.map((item) => {
            const label = actionLabel(item);
            const prio = priorityColors[item.priority];
            const locColor = locationColors.get(item.equipment.location) ?? "#6a7b62";
            const critical = isCriticalTask(item);
            return (
              <View
                key={item.taskRowId}
                style={[
                  styles.card,
                  critical && [styles.cardCritical, { borderLeftColor: colors.urgencyHigh.accent }],
                ]}
              >
                <View style={styles.cardTop}>
                  <View style={styles.cardIdentity}>
                    {item.photoUrl ? (
                      <Image source={{ uri: item.photoUrl }} style={styles.photo} />
                    ) : (
                      <View style={[styles.photoPlaceholder, { backgroundColor: prio.bg }]}>
                        {/* A falla's warning only for correctivos */}
                        {item.orderType === "preventivo" ? (
                          <RefreshCwIcon size={20} color={prio.fg} />
                        ) : item.orderType === "instalacion" ? (
                          <EquipmentIcon size={20} color={prio.fg} />
                        ) : (
                          <WarningIcon size={20} color={prio.fg} />
                        )}
                      </View>
                    )}

                    <View style={styles.cardMain}>
                      {/* Which OT this tarea belongs to, so the técnico can refer
                          to it ("estoy con la OT-0027"). */}
                      <View style={styles.row}>
                        <View style={styles.orderPill}>
                          <Text style={styles.orderPillText}>
                            {withSiglas(formatOrderNumber(item.orderId))}
                          </Text>
                        </View>

                        <Text style={styles.taskName}>{item.taskName}</Text>
                      </View>

                      <View style={styles.row}>
                        <Text style={styles.equipmentName}>{item.equipment.name}</Text>
                        <Text style={styles.equipmentCode}>{item.equipment.code}</Text>
                      </View>

                      <View style={styles.row}>
                        <View
                          style={[
                            styles.badge,
                            {
                              backgroundColor: item.suspension
                                ? colors.eqWaiting.bg
                                : colors.bgToggle,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.badgeText,
                              { color: item.suspension ? colors.eqWaiting.fg : colors.textLabel },
                            ]}
                          >
                            {taskStatusLabel(item)}
                          </Text>
                        </View>

                        <View style={[styles.badge, { backgroundColor: prio.bg }]}>
                          <Text style={[styles.badgeText, { color: prio.fg }]}>
                            Prioridad {PRIORITY_LABELS[item.priority]}
                          </Text>
                        </View>

                        {critical && (
                          <View
                            style={[styles.badge, { backgroundColor: colors.urgencyHigh.accent }]}
                          >
                            <Text style={[styles.badgeText, { color: "#fff" }]}>Falla crítica</Text>
                          </View>
                        )}
                      </View>

                      {item.faultTypeName && (
                        <Text style={styles.faultTypeText}>Falla: {item.faultTypeName}</Text>
                      )}
                    </View>
                  </View>

                  {/* Same box as SolicitudDetailModal's: when and who reported it,
                      top right so it reads at a glance. Wraps below on narrow screens. */}
                  <View style={styles.infoCard}>
                    <View style={styles.infoRow}>
                      <View style={styles.infoIconWrap}>
                        <CalendarIcon size={15} color={colors.accent} />
                      </View>

                      <View style={styles.infoContent}>
                        <Text style={styles.infoLabel}>
                          {item.fromSolicitud ? "Fecha de solicitud" : "Fecha de la orden"}
                        </Text>

                        <Text style={styles.infoValue}>
                          {!item.createdAt
                            ? "—"
                            : item.fromSolicitud
                              ? new Date(item.createdAt).toLocaleDateString("es-AR")
                              : // A date-only column: new Date() would read it as
                                // UTC midnight and could show the day before.
                                fromDbDate(item.createdAt)}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.infoDivider} />

                    <View style={styles.infoRow}>
                      <View style={styles.infoIconWrap}>
                        {item.fromSolicitud ? (
                          <UserIcon size={15} color={colors.accent} />
                        ) : (
                          <WorkOrderIcon size={15} color={colors.accent} />
                        )}
                      </View>

                      <View style={styles.infoContent}>
                        <Text style={styles.infoLabel}>
                          {item.fromSolicitud ? "Reportó" : "Tipo de orden"}
                        </Text>

                        <Text style={styles.infoValue} numberOfLines={2}>
                          {item.fromSolicitud
                            ? item.reporterName
                            : (ORDER_TYPE_LABELS[item.orderType] ?? item.orderType)}
                        </Text>
                      </View>
                    </View>
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

                <View style={styles.locationRow}>
                  <View style={[styles.locationDot, { backgroundColor: locColor }]} />
                  <LocationIcon size={13} />
                  <Text style={styles.locationText}>{item.equipment.location}</Text>

                  {/* Straight to the equipo's detail (características + fault
                      history, SCRUM-35) to check its past before starting. */}
                  {item.equipmentId > 0 && (
                    <Pressable
                      style={styles.equipmentLink}
                      onPress={() => router.push(`/equipment/${item.equipmentId}`)}
                      hitSlop={6}
                    >
                      <EquipmentIcon size={14} color={colors.accent} />

                      <Text style={styles.equipmentLinkText}>Ver equipo</Text>
                    </Pressable>
                  )}
                </View>

                {item.endDate ? (
                  <View style={styles.doneRow}>
                    <Text style={styles.doneText}>✓ Finalizada</Text>

                    {item.diagnosis && (
                      <Text style={styles.consumedText}>Diagnóstico: {item.diagnosis}</Text>
                    )}

                    {item.consumedParts.length > 0 && (
                      <Text style={styles.consumedText}>
                        Repuestos usados:{" "}
                        {item.consumedParts.map((p) => `${p.nombre} ×${p.cantidad}`).join(" · ")}
                      </Text>
                    )}

                    {item.lastSuspension && (
                      <Text style={styles.consumedText}>
                        {lastSuspensionText(item.lastSuspension)}
                      </Text>
                    )}
                  </View>
                ) : (
                  <>
                    {/* Resumed: a quiet reminder of why it had been on hold.
                        While suspended again, the yellow box below says it. */}
                    {!item.suspension && item.lastSuspension && (
                      <Text style={styles.lastSuspensionText}>
                        {lastSuspensionText(item.lastSuspension)}
                      </Text>
                    )}

                    {item.suspension && (
                      <View style={styles.suspendedBox}>
                        <Text style={styles.suspendedTitle}>
                          Suspendida desde el{" "}
                          {new Date(`${item.suspension.since}T00:00:00`).toLocaleDateString(
                            "es-AR",
                          )}
                        </Text>

                        <Text style={styles.suspendedText}>
                          Motivo: {item.suspension.reason}
                          {item.suspension.comment ? ` - ${item.suspension.comment}` : ""}
                        </Text>
                      </View>
                    )}

                    {label && (
                      <View style={styles.actionsRow}>
                        <Pressable
                          style={[styles.actionButton, styles.actionButtonMain]}
                          onPress={() => askAction(item)}
                          disabled={actingOn === item.taskRowId}
                        >
                          <Text style={styles.actionText}>
                            {actingOn === item.taskRowId ? "Procesando…" : label}
                          </Text>
                        </Pressable>

                        {/* Only a tarea in progress can be put on hold. */}
                        {taskStatus(item) === "in_progress" && (
                          <Pressable
                            style={[styles.actionButton, styles.secondaryButton]}
                            onPress={() => setSuspendingTask(item)}
                            disabled={actingOn === item.taskRowId}
                          >
                            <Text style={styles.secondaryText}>Suspender</Text>
                          </Pressable>
                        )}
                      </View>
                    )}
                  </>
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

      <SuspendTaskModal
        visible={!!suspendingTask}
        onClose={() => setSuspendingTask(null)}
        onConfirm={handleConfirmSuspend}
        taskName={suspendingTask?.taskName ?? ""}
        equipmentLabel={
          suspendingTask
            ? `${suspendingTask.equipment.code} · ${suspendingTask.equipment.name}`
            : ""
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
    // Same look as the equipo detail's sort bar.
    sortBar: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      columnGap: 22,
      rowGap: 8,
      paddingHorizontal: 18,
      paddingVertical: 11,
      marginBottom: 14,
      backgroundColor: c.accent,
      borderRadius: 11,
    },
    sortBarLabel: {
      fontSize: 11.5,
      fontWeight: "500",
      letterSpacing: 0.5,
      textTransform: "uppercase",
      color: "#fff",
      opacity: 0.75,
    },
    card: {
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
    },
    cardCritical: { borderLeftWidth: 4 },
    criticalBanner: {
      backgroundColor: c.urgencyHigh.bg,
      borderRadius: 12,
      padding: 14,
      marginBottom: 16,
      gap: 4,
    },
    criticalHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
    criticalTitle: { flexShrink: 1, fontSize: 14, fontWeight: "700", color: c.urgencyHigh.fg },
    criticalRow: { fontSize: 13, color: c.text, lineHeight: 19 },
    criticalButton: {
      alignSelf: "flex-start",
      marginTop: 8,
      paddingHorizontal: 14,
      height: 34,
      borderRadius: 8,
      backgroundColor: c.urgencyHigh.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    criticalButtonText: { color: "#fff", fontSize: 13, fontWeight: "600" },
    cardTop: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: 12 },
    cardIdentity: { flex: 1, minWidth: 240, flexDirection: "row", gap: 12 },
    cardMain: { flex: 1, minWidth: 0, gap: 6 },
    infoCard: {
      backgroundColor: c.bgNested,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 10,
      paddingVertical: 8,
      width: 175,
      flexShrink: 0,
    },
    infoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    infoIconWrap: {
      width: 26,
      height: 26,
      borderRadius: 6,
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: "center",
      justifyContent: "center",
    },
    infoContent: { flex: 1, minWidth: 0 },
    infoLabel: {
      fontSize: 11,
      fontWeight: "600",
      color: c.textMuted,
      letterSpacing: 0.4,
      textTransform: "uppercase",
    },
    infoValue: { fontSize: 14, fontWeight: "600", color: c.text, marginTop: 1 },
    infoDivider: { height: 1, backgroundColor: c.borderRow, marginVertical: 6 },
    taskName: { flexShrink: 1, fontSize: 13, fontWeight: "700", color: c.accent },
    orderPill: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: c.accent,
    },
    orderPillText: { fontFamily: "monospace", fontSize: 12, fontWeight: "700", color: c.accent },
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
    locationRow: { marginTop: 10, flexDirection: "row", alignItems: "center", gap: 6 },
    locationDot: { width: 7, height: 7, borderRadius: 4 },
    locationText: { fontSize: 13, color: c.textLabel, fontWeight: "500" },
    equipmentLink: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 5 },
    equipmentLinkText: { fontSize: 13, fontWeight: "600", color: c.accent },
    actionsRow: { flexDirection: "row", gap: 10, marginTop: 14 },
    actionButton: {
      height: 40,
      borderRadius: 9,
      backgroundColor: c.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    actionButtonMain: { flex: 1 },
    actionText: { color: "#fff", fontSize: 13.5, fontWeight: "600" },
    secondaryButton: {
      paddingHorizontal: 18,
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.eqWaiting.fg,
    },
    secondaryText: { color: c.eqWaiting.fg, fontSize: 13.5, fontWeight: "600" },
    suspendedBox: {
      marginTop: 12,
      padding: 10,
      borderRadius: 8,
      backgroundColor: c.eqWaiting.bg,
      gap: 2,
    },
    suspendedTitle: { fontSize: 13, fontWeight: "700", color: c.eqWaiting.fg },
    lastSuspensionText: { marginTop: 12, fontSize: 12.5, color: c.textMuted, lineHeight: 17 },
    suspendedText: { fontSize: 12.5, color: c.text, lineHeight: 17 },
    doneRow: { marginTop: 14, gap: 4 },
    doneText: { color: c.success, fontSize: 13.5, fontWeight: "600" },
    consumedText: { fontSize: 12.5, color: c.textMuted, lineHeight: 17 },
  });
}
