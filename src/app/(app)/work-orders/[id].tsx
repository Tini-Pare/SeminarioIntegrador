import { Stack, router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AddTaskModal } from "../../../components/AddTaskModal";
import { BackIcon } from "../../../components/icons";
import {
  CustomDatePicker,
  fromDbDate,
  isValidDateString,
  parseDateString,
  toDbDate,
} from "../../../components/CustomDatePicker";
import { OrderFlowSteps } from "../../../components/OrderFlowSteps";
import { PhotoCarousel } from "../../../components/PhotoCarousel";
import { ReassignTechnicianModal } from "../../../components/ReassignTechnicianModal";
import { RowActions } from "../../../components/RowActions";
import { Select } from "../../../components/Select";
import { formatOrderNumber } from "../../../lib/orderNumber";
import { getEquipmentById } from "../../../lib/queries/equipment";
import {
  addTaskToOrder,
  getWorkOrderById,
  reassignTaskTechnician,
  updateOrderFaultType,
  updateOrderPlannedEndDate,
  updateOrderPriority,
  updateOrderStartDate,
} from "../../../lib/queries/faults";
import { listFaultTypes } from "../../../lib/queries/faultTypes";
import { listProfiles } from "../../../lib/queries/profiles";
import { supabase } from "../../../lib/supabase";
import type { ThemeColors } from "../../../lib/theme";
import { useTheme } from "../../../lib/ThemeContext";
import type { Equipo, Fallo, Profile, SolicitudTask, WorkOrder } from "../../../types/database";

type Priority = WorkOrder["priority"];
type EditingField = "start" | "planned" | "priority" | "fault" | null;

const STATUS_LABELS: Record<WorkOrder["status"], string> = {
  assigned: "En proceso",
  in_progress: "En proceso",
  resolved: "Resuelta",
};
// ot_tipo_orden is free text in the DB; anything not listed here shows as is.
const TYPE_LABELS: Record<string, string> = {
  correctivo: "Correctivo",
  preventivo: "Preventivo",
  instalacion: "Instalación",
};
const PRIORITIES: Priority[] = ["low", "medium", "high"];
const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
};

function taskStatusLabel(task: SolicitudTask): string {
  if (task.endDate) return "Finalizada";
  if (task.suspension) return "Suspendida";
  if (task.startDate) return "En curso";
  return "Pendiente";
}

// The one place where an OT is managed after it's generated (Solicitudes
// only creates it, empty — see generateOrder): agregar/reasignar tareas,
// prioridad, falla genérica, fecha de inicio y fecha estimada. Its estado
// is still automatic (sync_orden_estado in 0017). Falla genérica comes
// before the tareas grid on purpose: one diagnosis, then the work for it.
// The four editable fields share one compact card, side by side, so the
// tareas grid starts high on the page.
// Late = the admin's target date passed and the OT still isn't resolved.
// Derived on the fly, so it needs no column and no manual state change.
function isOverdue(s: { status: string; planned_end_date: string | null }): boolean {
  if (s.status === "resolved" || !s.planned_end_date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(`${s.planned_end_date}T00:00:00`) < today;
}

export default function WorkOrderDetail() {
  // `created` is set by SolicitudDetailModal right after generating the OT,
  // so this screen can confirm it with its number ("Se generó la OT-0027").
  const { id, created } = useLocalSearchParams<{ id: string; created?: string }>();
  const orderId = id ? Number(id) : NaN;
  const [order, setOrder] = useState<WorkOrder | null>(null);
  const [equipment, setEquipment] = useState<Equipo | null>(null);
  const [profileById, setProfileById] = useState<Map<string, Profile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [showCreated, setShowCreated] = useState(created === "1");
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [reassigningTask, setReassigningTask] = useState<SolicitudTask | null>(null);
  // Only one inline editor open at a time (dates, prioridad, falla).
  const [editing, setEditing] = useState<EditingField>(null);
  const [dateDraft, setDateDraft] = useState("");
  const [plannedDraft, setPlannedDraft] = useState("");
  const [priorityDraft, setPriorityDraft] = useState<Priority | null>(null);
  const [faultDraft, setFaultDraft] = useState<number | null>(null);
  const [faultSelectOpen, setFaultSelectOpen] = useState(false);
  const [faultTypes, setFaultTypes] = useState<Fallo[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  // 0 → 1 once the OT has loaded: the page fades in and slides up a little
  // instead of popping in right after the spinner.
  const appear = useRef(new Animated.Value(0)).current;

  const statusColors: Record<WorkOrder["status"], { bg: string; fg: string }> = {
    assigned: colors.faultAssigned,
    in_progress: colors.faultInProgress,
    resolved: colors.faultResolved,
  };
  const priorityColors: Record<Priority, { bg: string; fg: string }> = {
    low: colors.urgencyLow,
    medium: colors.urgencyMedium,
    high: colors.urgencyHigh,
  };

  const load = useCallback(async () => {
    if (!id || Number.isNaN(orderId)) return;
    setError(null);
    try {
      const [ot, profiles] = await Promise.all([getWorkOrderById(orderId), listProfiles()]);
      setOrder(ot);
      setProfileById(new Map(profiles.map((p) => [p.id, p])));
      if (ot) setEquipment(await getEquipmentById(ot.equipment_id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [id, orderId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    if (loading) return;
    Animated.timing(appear, {
      toValue: 1,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      // The native driver isn't available on web.
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, [loading, appear]);

  useEffect(() => {
    listFaultTypes()
      .then(setFaultTypes)
      .catch(() => setFaultTypes([]));
  }, []);

  useEffect(() => {
    if (!id || Number.isNaN(orderId)) return;
    const channel = supabase
      .channel(`work-order-detail-${id}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orden_de_trabajo",
          filter: `ot_id_orden=eq.${orderId}`,
        },
        load,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tareas_realizadas_orden",
          filter: `ot_id_orden=eq.${orderId}`,
        },
        load,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, orderId, load]);

  useEffect(() => {
    setAddTaskOpen(false);
    setReassigningTask(null);
    setEditing(null);
    setError(null);
    setDateDraft(order ? fromDbDate(order.start_date) : "");
    setPlannedDraft(order ? fromDbDate(order.planned_end_date) : "");
  }, [order]);

  // fallo_por_orden only reaches the screen as the fallo's name; names are
  // unique (0006), so the current one can be preselected by name.
  const currentFaultTypeId =
    faultTypes.find((f) => f.fa_nombre === order?.fault_type_name)?.fa_id_fallo ?? null;
  // Inactive fallos can't be picked for a new diagnosis, but the one already
  // on the OT stays in the list so the editor can show it.
  const faultTypeOptions = faultTypes
    .filter((f) => f.fa_estado === "activo" || f.fa_id_fallo === currentFaultTypeId)
    .map((f) => ({ value: f.fa_id_fallo, label: f.fa_nombre }));

  const orderStartDate = useMemo(
    () =>
      order?.start_date ? (parseDateString(fromDbDate(order.start_date)) ?? undefined) : undefined,
    [order?.start_date],
  );

  const orderPlannedEndDate = useMemo(
    () =>
      order?.planned_end_date
        ? (parseDateString(fromDbDate(order.planned_end_date)) ?? undefined)
        : undefined,
    [order?.planned_end_date],
  );

  function startEditing(field: EditingField) {
    setError(null);
    setFaultSelectOpen(false);
    if (field === "start") setDateDraft(order ? fromDbDate(order.start_date) : "");
    if (field === "planned") setPlannedDraft(order ? fromDbDate(order.planned_end_date) : "");
    if (field === "priority") setPriorityDraft(order?.priority ?? null);
    if (field === "fault") setFaultDraft(currentFaultTypeId);
    setEditing(field);
  }

  // Shared save wrapper for the inline editors: busy flag, error, reload.
  async function save(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleSavePriority() {
    if (!order || !priorityDraft) return;
    await save(() => updateOrderPriority(order.id, priorityDraft));
  }

  async function handleSaveFault(clear = false) {
    if (!order) return;
    if (!clear && faultDraft == null) {
      setError("Elegí una falla genérica.");
      return;
    }
    await save(() => updateOrderFaultType(order.id, clear ? null : faultDraft));
  }

  async function handleAddTask(input: { taskId: number; technicianId: string }) {
    if (!order) return;
    await addTaskToOrder(order.id, input);
    await load();
    setAddTaskOpen(false);
  }

  async function handleReassign(technicianId: string) {
    if (!reassigningTask) return;
    await reassignTaskTechnician(reassigningTask.id, technicianId);
    await load();
    setReassigningTask(null);
  }

  async function handleSaveDate() {
    if (!order) return;
    if (!isValidDateString(dateDraft)) {
      setError("Ingresá una fecha válida (dd/mm/aaaa).");
      return;
    }
    if (order.planned_end_date && toDbDate(dateDraft) > order.planned_end_date) {
      setError("La fecha de inicio no puede ser posterior a la fecha estimada de resolución.");
      return;
    }
    await save(() => updateOrderStartDate(order.id, toDbDate(dateDraft)));
  }

  async function handleSavePlannedDate(clear = false) {
    if (!order) return;
    if (!clear && !isValidDateString(plannedDraft)) {
      setError("Ingresá una fecha válida (dd/mm/aaaa).");
      return;
    }
    if (!clear && order.start_date && toDbDate(plannedDraft) < order.start_date) {
      setError("La fecha estimada no puede ser anterior a la fecha de inicio de la orden.");
      return;
    }
    await save(() => updateOrderPlannedEndDate(order.id, clear ? null : toDbDate(plannedDraft)));
  }

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator style={styles.center} />
      </>
    );
  }
  if (!order) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={styles.error}>Orden de trabajo no encontrada</Text>
      </>
    );
  }

  const s = order;
  const orderNumber = formatOrderNumber(order.id);
  const isResolved = s.status === "resolved";
  // A just-generated OT has no tareas yet; its DB estado is 'assigned',
  // which would read as if someone were already on it.
  const statusLabel =
    s.tasks.length === 0 && s.status === "assigned" ? "Sin tareas" : STATUS_LABELS[s.status];
  // What the solicitud reported, or the OT's own observación when it didn't
  // come from one.
  const description = s.solicitud?.description ?? s.observation;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <Animated.ScrollView
        style={[
          styles.container,
          {
            opacity: appear,
            transform: [
              { translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
            ],
          },
        ]}
        contentContainerStyle={styles.content}
      >
        <View style={styles.topBar}>
          <Pressable style={styles.backLink} onPress={() => router.back()}>
            <BackIcon />

            <Text style={styles.backText}>Volver a órdenes de trabajo</Text>
          </Pressable>
        </View>

        {/* Last step of Solicitud → OT → Tareas: shown until the OT gets
            its first tarea, then the flow is done and it goes away. An OT
            that didn't come from a solicitud isn't part of that flow. */}
        {s.solicitud && s.tasks.length === 0 && (
          <OrderFlowSteps stage="tareas" style={styles.flowSteps} />
        )}

        {showCreated && (
          <View style={styles.createdBanner}>
            <Text style={styles.createdText}>
              Se generó la {orderNumber}. Agregá sus tareas para asignarla a los técnicos.
            </Text>

            <Pressable onPress={() => setShowCreated(false)} hitSlop={8}>
              <Text style={styles.createdClose}>✕</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.card}>
          <View style={styles.badgeRow}>
            <Text style={styles.orderNumber}>{orderNumber}</Text>

            <Text style={styles.code}>{equipment?.code ?? "—"}</Text>

            <View style={[styles.badge, { backgroundColor: statusColors[s.status].bg }]}>
              <Text style={[styles.badgeText, { color: statusColors[s.status].fg }]}>
                {statusLabel}
              </Text>
            </View>

            <View style={[styles.badge, { backgroundColor: priorityColors[s.priority].bg }]}>
              <Text style={[styles.badgeText, { color: priorityColors[s.priority].fg }]}>
                Prioridad {PRIORITY_LABELS[s.priority]}
              </Text>
            </View>
          </View>

          <Text style={styles.title}>{equipment?.name ?? "Equipo desconocido"}</Text>
          <Text style={styles.subtitle}>{equipment?.location}</Text>

          <View style={styles.metaGrid}>
            <MetaCell label="Tipo de orden" value={TYPE_LABELS[s.type] ?? s.type} colors={colors} />

            {/* Only an OT generated from a solicitud has someone who
                reported it; preventivo / instalación ones don't. */}
            {s.solicitud && (
              <MetaCell
                label="Reportó"
                value={profileById.get(s.solicitud.reported_by)?.name ?? "Desconocido"}
                colors={colors}
              />
            )}

            {s.solicitud && (
              <MetaCell
                label="Fecha de solicitud"
                value={new Date(s.solicitud.created_at).toLocaleDateString("es-AR")}
                colors={colors}
              />
            )}

            {s.status === "resolved" && s.end_date && (
              <MetaCell
                label="Fecha de finalización"
                value={fromDbDate(s.end_date)}
                colors={colors}
              />
            )}
          </View>

          {!!description && (
            <View style={styles.descBlock}>
              <Text style={styles.metaLabel}>Descripción</Text>

              <Text style={[styles.value, { marginTop: 4 }]}>{description}</Text>
            </View>
          )}

          {s.solicitud && <PhotoCarousel photoUrls={s.solicitud.photo_urls} height={260} />}
        </View>

        {/* Inicio, fecha estimada, prioridad y falla side by side — stacked
            one section each, they pushed the tareas grid far down. The field
            being edited takes the whole row, so its date picker / chips /
            select get room without squeezing the other three. */}
        <View style={[styles.card, styles.planCard]}>
          <View style={styles.planGrid}>
            <View style={[styles.planCell, editing === "start" && styles.planCellEditing]}>
              <Text style={styles.metaLabel}>Fecha de inicio de la orden</Text>

              {editing === "start" ? (
                <View style={styles.dateEditRow}>
                  <CustomDatePicker
                    value={dateDraft}
                    onChange={setDateDraft}
                    compact
                    maxWidth={200}
                    maxDate={orderPlannedEndDate}
                  />

                  <Pressable
                    style={styles.dateCancelButton}
                    onPress={() => {
                      setDateDraft(order ? fromDbDate(order.start_date) : "");
                      setEditing(null);
                    }}
                  >
                    <Text style={styles.dateCancelText}>Cancelar</Text>
                  </Pressable>

                  <Pressable style={styles.dateSaveButton} onPress={handleSaveDate} disabled={busy}>
                    <Text style={styles.dateSaveText}>{busy ? "Guardando…" : "Confirmar"}</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.planValueRow}>
                  <Text style={styles.planValue}>{fromDbDate(s.start_date) || "—"}</Text>

                  {!isResolved && (
                    <Pressable onPress={() => startEditing("start")}>
                      <Text style={styles.linkButtonText}>Reprogramar</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>

            <View style={[styles.planCell, editing === "planned" && styles.planCellEditing]}>
              <Text style={styles.metaLabel}>Fecha estimada de resolución</Text>

              {editing === "planned" ? (
                <View style={styles.dateEditRow}>
                  <CustomDatePicker
                    value={plannedDraft}
                    onChange={setPlannedDraft}
                    compact
                    maxWidth={200}
                    minDate={orderStartDate}
                  />

                  <Pressable
                    style={styles.dateCancelButton}
                    onPress={() => {
                      setPlannedDraft(order ? fromDbDate(order.planned_end_date) : "");
                      setEditing(null);
                    }}
                  >
                    <Text style={styles.dateCancelText}>Cancelar</Text>
                  </Pressable>

                  <Pressable
                    style={styles.dateSaveButton}
                    onPress={() => handleSavePlannedDate()}
                    disabled={busy}
                  >
                    <Text style={styles.dateSaveText}>{busy ? "Guardando…" : "Confirmar"}</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.planValueRow}>
                  <Text style={styles.planValue}>
                    {fromDbDate(s.planned_end_date) || "Sin definir"}
                  </Text>

                  {isOverdue(s) && (
                    <Text style={{ color: colors.destructive, fontWeight: "600", fontSize: 13 }}>
                      Atrasada
                    </Text>
                  )}

                  {!isResolved && (
                    <Pressable onPress={() => startEditing("planned")}>
                      <Text style={styles.linkButtonText}>
                        {s.planned_end_date ? "Reprogramar" : "Definir"}
                      </Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>

            <View style={[styles.planCell, editing === "priority" && styles.planCellEditing]}>
              <Text style={styles.metaLabel}>Prioridad</Text>

              {editing === "priority" ? (
                <View style={styles.dateEditRow}>
                  {PRIORITIES.map((p) => {
                    const selected = priorityDraft === p;
                    return (
                      <Pressable
                        key={p}
                        style={[
                          styles.chip,
                          selected && {
                            backgroundColor: priorityColors[p].bg,
                            borderColor: priorityColors[p].fg,
                          },
                        ]}
                        onPress={() => setPriorityDraft(p)}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            selected && { color: priorityColors[p].fg, fontWeight: "600" },
                          ]}
                        >
                          {PRIORITY_LABELS[p]}
                        </Text>
                      </Pressable>
                    );
                  })}

                  <Pressable style={styles.dateCancelButton} onPress={() => setEditing(null)}>
                    <Text style={styles.dateCancelText}>Cancelar</Text>
                  </Pressable>

                  <Pressable
                    style={styles.dateSaveButton}
                    onPress={handleSavePriority}
                    disabled={busy}
                  >
                    <Text style={styles.dateSaveText}>{busy ? "Guardando…" : "Confirmar"}</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.planValueRow}>
                  <Text style={styles.planValue}>{PRIORITY_LABELS[s.priority]}</Text>

                  {!isResolved && (
                    <Pressable onPress={() => startEditing("priority")}>
                      <Text style={styles.linkButtonText}>Cambiar</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>

            <View style={[styles.planCell, editing === "fault" && styles.planCellEditing]}>
              <Text style={styles.metaLabel}>Falla genérica</Text>

              {editing === "fault" ? (
                <View style={styles.dateEditRow}>
                  <View style={styles.faultSelectWrap}>
                    <Select
                      value={faultDraft}
                      onChange={setFaultDraft}
                      options={faultTypeOptions}
                      placeholder={
                        faultTypeOptions.length > 0
                          ? "Elegí un tipo de falla"
                          : "No hay fallas cargadas"
                      }
                      disabled={faultTypeOptions.length === 0}
                      open={faultSelectOpen}
                      onOpenChange={setFaultSelectOpen}
                    />
                  </View>

                  <Pressable style={styles.dateCancelButton} onPress={() => setEditing(null)}>
                    <Text style={styles.dateCancelText}>Cancelar</Text>
                  </Pressable>

                  <Pressable
                    style={styles.dateSaveButton}
                    onPress={() => handleSaveFault()}
                    disabled={busy}
                  >
                    <Text style={styles.dateSaveText}>{busy ? "Guardando…" : "Confirmar"}</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.planValueRow}>
                  <Text style={styles.planValue}>{s.fault_type_name ?? "Sin diagnosticar"}</Text>

                  {!isResolved && (
                    <Pressable onPress={() => startEditing("fault")}>
                      <Text style={styles.linkButtonText}>
                        {s.fault_type_name ? "Cambiar" : "Definir"}
                      </Text>
                    </Pressable>
                  )}

                  {!isResolved && s.fault_type_name && (
                    <Pressable onPress={() => handleSaveFault(true)} disabled={busy}>
                      <Text style={styles.linkButtonText}>Quitar</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>
          </View>
        </View>

        {error && <Text style={styles.formError}>{error}</Text>}

        <View style={styles.tasksHeader}>
          <Text style={styles.sectionTitle}>Tareas</Text>

          {!isResolved && (
            <Pressable style={styles.addTaskButton} onPress={() => setAddTaskOpen(true)}>
              <Text style={styles.addTaskButtonText}>+ Agregar tarea</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.headerCell, { flex: 1.6 }]}>TAREA</Text>
            <Text style={[styles.headerCell, { flex: 1.3 }]}>TÉCNICO</Text>
            <Text style={[styles.headerCell, { flex: 1 }]}>ESTADO</Text>
            <Text style={[styles.headerCell, { flex: 0.9 }]}>INICIO</Text>
            <Text style={[styles.headerCell, { flex: 0.9 }]}>FIN</Text>
            <Text style={[styles.headerCell, styles.actionsCol]}>ACCIONES</Text>
          </View>

          {s.tasks.length === 0 ? (
            <Text style={styles.empty}>
              Todavía no se agregó ninguna tarea. Usá “+ Agregar tarea” para cargar la primera con
              su técnico.
            </Text>
          ) : (
            s.tasks.map((task, i) => (
              <View key={task.id} style={[styles.rowWrap, i % 2 === 1 && styles.rowAlt]}>
                <View style={styles.row2}>
                  <Text
                    style={[styles.cellText, styles.cellStrong, { flex: 1.6 }]}
                    numberOfLines={2}
                  >
                    {task.taskName}
                  </Text>

                  <Text style={[styles.cellText, { flex: 1.3 }]} numberOfLines={1}>
                    {profileById.get(task.technicianId)?.name ?? "Técnico desconocido"}
                  </Text>

                  <Text style={[styles.cellText, { flex: 1 }]}>{taskStatusLabel(task)}</Text>

                  <Text style={[styles.cellText, { flex: 0.9 }]}>
                    {fromDbDate(task.startDate) || "—"}
                  </Text>

                  <Text style={[styles.cellText, { flex: 0.9 }]}>
                    {fromDbDate(task.endDate) || "—"}
                  </Text>

                  <View style={styles.actionsCol}>
                    {!task.endDate && (
                      <RowActions
                        onEdit={() => setReassigningTask(task)}
                        editTooltip="Reasignar técnico"
                      />
                    )}
                  </View>
                </View>

                {(task.consumedParts.length > 0 ||
                  task.diagnosis ||
                  task.suspension ||
                  task.lastSuspension) && (
                  <View style={styles.consumedRow}>
                    {task.suspension && (
                      <Text style={styles.consumedText}>
                        <Text style={styles.consumedLabel}>
                          Suspendida desde el {fromDbDate(task.suspension.since)} · Motivo:{" "}
                        </Text>
                        {task.suspension.reason}
                        {task.suspension.comment ? ` - ${task.suspension.comment}` : ""}
                      </Text>
                    )}

                    {/* While suspended again, the current one above is the
                        latest; the previous one would only add noise. */}
                    {!task.suspension && task.lastSuspension && (
                      <Text style={styles.consumedText}>
                        <Text style={styles.consumedLabel}>
                          Última suspensión: del {fromDbDate(task.lastSuspension.since)} al{" "}
                          {fromDbDate(task.lastSuspension.until)} · Motivo:{" "}
                        </Text>
                        {task.lastSuspension.reason}
                        {task.lastSuspension.comment ? ` - ${task.lastSuspension.comment}` : ""}
                      </Text>
                    )}

                    {task.diagnosis && (
                      <Text style={styles.consumedText}>
                        <Text style={styles.consumedLabel}>Diagnóstico: </Text>
                        {task.diagnosis}
                      </Text>
                    )}

                    {task.consumedParts.length > 0 && (
                      <Text style={styles.consumedText}>
                        <Text style={styles.consumedLabel}>Repuestos usados: </Text>
                        {task.consumedParts.map((p) => `${p.nombre} ×${p.cantidad}`).join(" · ")}
                      </Text>
                    )}
                  </View>
                )}
              </View>
            ))
          )}
        </View>

        <Text style={styles.autoNote}>
          El estado de la orden se calcula solo a partir de las tareas: pasa a “En curso” apenas
          algún técnico inicia la suya, y a “Resuelta” cuando todas están finalizadas.
        </Text>
      </Animated.ScrollView>

      <AddTaskModal
        visible={addTaskOpen}
        onClose={() => setAddTaskOpen(false)}
        onConfirm={handleAddTask}
        equipmentLabel={equipment ? `${equipment.code} · ${equipment.name}` : ""}
      />

      <ReassignTechnicianModal
        visible={!!reassigningTask}
        onClose={() => setReassigningTask(null)}
        onConfirm={handleReassign}
        equipmentLabel={equipment ? `${equipment.code} · ${equipment.name}` : ""}
        taskLabel={reassigningTask?.taskName ?? ""}
        currentTechnicianId={reassigningTask?.technicianId ?? null}
      />
    </>
  );
}

function MetaCell({ label, value, colors }: { label: string; value: string; colors: ThemeColors }) {
  return (
    <View style={{ minWidth: 160 }}>
      <Text style={{ fontSize: 11.5, fontWeight: "600", color: colors.textMuted }}>{label}</Text>
      <Text style={{ fontSize: 14.5, fontWeight: "600", color: colors.text, marginTop: 3 }}>
        {value}
      </Text>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { backgroundColor: c.bg },
    content: { padding: 20, maxWidth: 980 },
    center: { flex: 1 },
    error: { padding: 16, color: c.destructive },
    topBar: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 18,
      flexWrap: "wrap",
      gap: 12,
    },
    backLink: { flexDirection: "row", alignItems: "center", gap: 7 },
    backText: { color: c.textLabel, fontSize: 13.5 },
    card: {
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 16,
      padding: 24,
    },
    badgeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      flexWrap: "wrap",
      marginBottom: 8,
    },
    orderNumber: { fontFamily: "monospace", fontSize: 15, fontWeight: "700", color: c.accent },
    code: { fontFamily: "monospace", fontSize: 13, color: c.textMuted },
    flowSteps: { marginBottom: 16 },
    createdBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginBottom: 16,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.success,
      backgroundColor: c.bgCard,
    },
    createdText: { flex: 1, color: c.success, fontWeight: "600", fontSize: 14 },
    createdClose: { color: c.textMuted, fontSize: 15, fontWeight: "600" },
    badge: { paddingHorizontal: 11, paddingVertical: 3.5, borderRadius: 999 },
    badgeText: { fontSize: 12.5, fontWeight: "600" },
    title: { fontSize: 24, fontWeight: "600", color: c.text },
    subtitle: { fontSize: 14, color: c.textSecondary, marginTop: 4 },
    metaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 18, marginTop: 20 },
    sectionTitle: {
      fontSize: 16,
      fontWeight: "600",
      color: c.text,
      marginTop: 22,
      marginBottom: 10,
    },
    value: { fontSize: 14.5, color: c.textLabel, lineHeight: 21 },
    // Same label look as MetaCell, for the description and the plan fields.
    metaLabel: { fontSize: 11.5, fontWeight: "600", color: c.textMuted },
    descBlock: {
      marginTop: 18,
      paddingTop: 16,
      borderTopWidth: 1,
      borderTopColor: c.borderRow,
    },
    // Above the tareas table (later sibling), so an open date picker or
    // falla select hanging out of it isn't covered.
    planCard: { marginTop: 16, paddingVertical: 18, zIndex: 10 },
    planGrid: { flexDirection: "row", flexWrap: "wrap", columnGap: 28, rowGap: 18 },
    // 4 per row on desktop; they wrap two by two on a narrower window.
    planCell: { flexGrow: 1, flexBasis: 190, minWidth: 190 },
    planCellEditing: { flexBasis: "100%", zIndex: 60 },
    planValueRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      columnGap: 14,
      rowGap: 4,
      marginTop: 5,
    },
    planValue: { fontSize: 14.5, fontWeight: "600", color: c.text },
    linkButtonText: { fontSize: 13, fontWeight: "600", color: c.accent },
    dateEditRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      flexWrap: "wrap",
      marginTop: 8,
      // The open calendar hangs out of this row; without its own stacking
      // context the tareas table below (later sibling) covers it.
      position: "relative",
      zIndex: 60,
    },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: c.borderInput,
      backgroundColor: c.bgInput,
    },
    chipText: { fontSize: 13, color: c.textLabel },
    faultSelectWrap: { width: 280, maxWidth: "100%" },
    dateCancelButton: {
      paddingHorizontal: 14,
      height: 38,
      borderRadius: 8,
      // Same red as FormFooter's "Cancelar", so every cancel looks alike.
      backgroundColor: "#dc2626",
      alignItems: "center",
      justifyContent: "center",
    },
    dateCancelText: { color: "#fff", fontWeight: "600", fontSize: 13 },
    dateSaveButton: {
      paddingHorizontal: 14,
      height: 38,
      borderRadius: 8,
      backgroundColor: c.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    dateSaveText: { color: "#fff", fontWeight: "600", fontSize: 13 },
    formError: { color: c.destructive, marginTop: 10, fontSize: 13 },
    tasksHeader: {
      zIndex: 0,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: 10,
    },
    addTaskButton: {
      paddingHorizontal: 14,
      height: 36,
      borderRadius: 8,
      backgroundColor: c.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    addTaskButtonText: { color: "#fff", fontWeight: "600", fontSize: 13 },
    table: {
      zIndex: 0,
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
    },
    headerCell: {
      fontSize: 11.5,
      fontWeight: "700",
      letterSpacing: 0.5,
      textTransform: "uppercase",
      color: "#fff",
      fontFamily: "monospace",
    },
    actionsCol: { width: 90, flexShrink: 0 },
    empty: { color: c.textMuted, fontSize: 13.5, padding: 18 },
    rowWrap: {
      paddingHorizontal: 18,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: c.borderRow,
    },
    row2: { flexDirection: "row", alignItems: "center" },
    rowAlt: { backgroundColor: c.bgRowAlt },
    cellText: { fontSize: 13.5, color: c.textLabel, paddingRight: 8 },
    cellStrong: { fontWeight: "600", color: c.text },
    consumedRow: {
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: c.borderRow,
      gap: 4,
    },
    consumedText: { fontSize: 12.5, color: c.textMuted, lineHeight: 17 },
    consumedLabel: { fontWeight: "600", color: c.textLabel },
    autoNote: { marginTop: 16, fontSize: 12, color: c.textMuted, lineHeight: 17 },
  });
}
