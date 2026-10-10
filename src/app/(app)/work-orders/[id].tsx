import { Stack, router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AddTaskModal } from "../../../components/AddTaskModal";
import { BackIcon } from "../../../components/icons";
import {
  CustomDatePicker,
  fromDbDate,
  isValidDateString,
  toDbDate,
} from "../../../components/CustomDatePicker";
import { PhotoCarousel } from "../../../components/PhotoCarousel";
import { ReassignTechnicianModal } from "../../../components/ReassignTechnicianModal";
import { RowActions } from "../../../components/RowActions";
import { Select } from "../../../components/Select";
import { getEquipmentById } from "../../../lib/queries/equipment";
import {
  addTaskToOrder,
  getSolicitudById,
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
import type { Equipo, Fallo, Profile, Solicitud, SolicitudTask } from "../../../types/database";

type Priority = Exclude<Solicitud["priority"], null>;
type EditingField = "start" | "planned" | "priority" | "fault" | null;

const STATUS_LABELS: Record<Solicitud["status"], string> = {
  new: "Nueva",
  assigned: "En proceso",
  in_progress: "En proceso",
  resolved: "Resuelta",
  rejected: "Rechazada",
};
const PRIORITIES: Priority[] = ["low", "medium", "high"];
const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
};

function taskStatusLabel(task: SolicitudTask): string {
  if (task.endDate) return "Finalizada";
  if (task.startDate) return "En curso";
  return "Pendiente";
}

// The one place where an OT is managed after it's generated (Solicitudes
// only creates it, empty — see generateOrder): agregar/reasignar tareas,
// prioridad, falla genérica, fecha de inicio y fecha estimada. Its estado
// is still automatic (sync_orden_estado in 0017). Falla genérica comes
// before the tareas grid on purpose: one diagnosis, then the work for it.
// Late = the admin's target date passed and the OT still isn't resolved.
// Derived on the fly, so it needs no column and no manual state change.
function isOverdue(s: { status: string; order_planned_end_date: string | null }): boolean {
  if (s.status === "resolved" || !s.order_planned_end_date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(`${s.order_planned_end_date}T00:00:00`) < today;
}

export default function WorkOrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const solicitudId = id ? Number(id) : NaN;
  const [solicitud, setSolicitud] = useState<Solicitud | null>(null);
  const [equipment, setEquipment] = useState<Equipo | null>(null);
  const [profileById, setProfileById] = useState<Map<string, Profile>>(new Map());
  const [loading, setLoading] = useState(true);
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

  const statusColors: Record<Solicitud["status"], { bg: string; fg: string }> = {
    new: colors.faultNew,
    assigned: colors.faultAssigned,
    in_progress: colors.faultInProgress,
    resolved: colors.faultResolved,
    rejected: colors.faultRejected,
  };
  const priorityColors: Record<Exclude<Solicitud["priority"], null>, { bg: string; fg: string }> = {
    low: colors.urgencyLow,
    medium: colors.urgencyMedium,
    high: colors.urgencyHigh,
  };

  const load = useCallback(async () => {
    if (!id || Number.isNaN(solicitudId)) return;
    setError(null);
    try {
      const [sol, profiles] = await Promise.all([getSolicitudById(solicitudId), listProfiles()]);
      setSolicitud(sol);
      setProfileById(new Map(profiles.map((p) => [p.id, p])));
      if (sol) setEquipment(await getEquipmentById(sol.equipment_id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [id, solicitudId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    listFaultTypes()
      .then(setFaultTypes)
      .catch(() => setFaultTypes([]));
  }, []);

  useEffect(() => {
    if (!id || Number.isNaN(solicitudId)) return;
    const channel = supabase
      .channel(`work-order-detail-${id}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "solicitudes",
          filter: `sol_id_solicitud=eq.${solicitudId}`,
        },
        load,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orden_de_trabajo",
          filter: `sol_id_solicitud=eq.${solicitudId}`,
        },
        load,
      )
      // tareas_realizadas_orden has no sol_id_solicitud column to filter by
      // directly (it hangs off ot_id_orden) — just reload on any change.
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tareas_realizadas_orden" },
        load,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, solicitudId, load]);

  useEffect(() => {
    setAddTaskOpen(false);
    setReassigningTask(null);
    setEditing(null);
    setError(null);
    setDateDraft(solicitud ? fromDbDate(solicitud.order_start_date) : "");
    setPlannedDraft(solicitud ? fromDbDate(solicitud.order_planned_end_date) : "");
  }, [solicitud]);

  // fallo_por_orden only reaches the screen as the fallo's name; names are
  // unique (0006), so the current one can be preselected by name.
  const currentFaultTypeId =
    faultTypes.find((f) => f.fa_nombre === solicitud?.fault_type_name)?.fa_id_fallo ?? null;
  // Inactive fallos can't be picked for a new diagnosis, but the one already
  // on the OT stays in the list so the editor can show it.
  const faultTypeOptions = faultTypes
    .filter((f) => f.fa_estado === "activo" || f.fa_id_fallo === currentFaultTypeId)
    .map((f) => ({ value: f.fa_id_fallo, label: f.fa_nombre }));

  function startEditing(field: EditingField) {
    setError(null);
    setFaultSelectOpen(false);
    if (field === "priority") setPriorityDraft(solicitud?.priority ?? null);
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
    if (!solicitud || !priorityDraft) return;
    await save(() => updateOrderPriority(solicitud.id, priorityDraft));
  }

  async function handleSaveFault(clear = false) {
    if (!solicitud) return;
    if (!clear && faultDraft == null) {
      setError("Elegí una falla genérica.");
      return;
    }
    await save(() => updateOrderFaultType(solicitud.id, clear ? null : faultDraft));
  }

  async function handleAddTask(input: { taskId: number; technicianId: string }) {
    if (!solicitud) return;
    await addTaskToOrder(solicitud.id, input);
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
    if (!solicitud) return;
    if (!isValidDateString(dateDraft)) {
      setError("Ingresá una fecha válida (dd/mm/aaaa).");
      return;
    }
    await save(() => updateOrderStartDate(solicitud.id, toDbDate(dateDraft)));
  }

  async function handleSavePlannedDate(clear = false) {
    if (!solicitud) return;
    if (!clear && !isValidDateString(plannedDraft)) {
      setError("Ingresá una fecha válida (dd/mm/aaaa).");
      return;
    }
    if (
      !clear &&
      solicitud.order_start_date &&
      toDbDate(plannedDraft) < solicitud.order_start_date
    ) {
      setError("La fecha estimada no puede ser anterior a la fecha de inicio de la orden.");
      return;
    }
    await save(() =>
      updateOrderPlannedEndDate(solicitud.id, clear ? null : toDbDate(plannedDraft)),
    );
  }

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator style={styles.center} />
      </>
    );
  }
  if (!solicitud || solicitud.order_id == null) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={styles.error}>Orden de trabajo no encontrada</Text>
      </>
    );
  }

  const s = solicitud;
  const isResolved = s.status === "resolved";
  // A just-generated OT has no tareas yet; its DB estado is 'assigned',
  // which would read as if someone were already on it.
  const statusLabel =
    s.tasks.length === 0 && s.status === "assigned" ? "Sin tareas" : STATUS_LABELS[s.status];

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.topBar}>
          <Pressable style={styles.backLink} onPress={() => router.back()}>
            <BackIcon />

            <Text style={styles.backText}>Volver a órdenes de trabajo</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <View style={styles.badgeRow}>
            <Text style={styles.code}>{equipment?.code ?? "—"}</Text>

            <View style={[styles.badge, { backgroundColor: statusColors[s.status].bg }]}>
              <Text style={[styles.badgeText, { color: statusColors[s.status].fg }]}>
                {statusLabel}
              </Text>
            </View>

            {s.priority && (
              <View style={[styles.badge, { backgroundColor: priorityColors[s.priority].bg }]}>
                <Text style={[styles.badgeText, { color: priorityColors[s.priority].fg }]}>
                  Prioridad {PRIORITY_LABELS[s.priority]}
                </Text>
              </View>
            )}
          </View>

          <Text style={styles.title}>{equipment?.name ?? "Equipo desconocido"}</Text>
          <Text style={styles.subtitle}>{equipment?.location}</Text>

          <View style={styles.metaGrid}>
            <MetaCell
              label="Reportó"
              value={profileById.get(s.reported_by)?.name ?? "Desconocido"}
              colors={colors}
            />

            <MetaCell
              label="Fecha de solicitud"
              value={new Date(s.created_at).toLocaleDateString("es-AR")}
              colors={colors}
            />

            {s.status === "resolved" && s.order_end_date && (
              <MetaCell
                label="Fecha de finalización"
                value={fromDbDate(s.order_end_date)}
                colors={colors}
              />
            )}
          </View>
        </View>

        <Text style={styles.sectionTitle}>Descripción</Text>
        <Text style={styles.value}>{s.description}</Text>

        <PhotoCarousel photoUrls={s.photo_urls} height={320} />

        <Text style={styles.sectionTitle}>Fecha de inicio de la orden</Text>
        {editing === "start" ? (
          <View style={styles.dateEditRow}>
            <CustomDatePicker value={dateDraft} onChange={setDateDraft} compact maxWidth={200} />

            <Pressable style={styles.dateCancelButton} onPress={() => setEditing(null)}>
              <Text style={styles.dateCancelText}>Cancelar</Text>
            </Pressable>

            <Pressable style={styles.dateSaveButton} onPress={handleSaveDate} disabled={busy}>
              <Text style={styles.dateSaveText}>{busy ? "Guardando…" : "Confirmar"}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.row}>
            <Text style={styles.value}>{fromDbDate(s.order_start_date) || "—"}</Text>

            {!isResolved && (
              <Pressable onPress={() => startEditing("start")}>
                <Text style={styles.linkButtonText}>Reprogramar</Text>
              </Pressable>
            )}
          </View>
        )}

        <Text style={styles.sectionTitle}>Fecha estimada de resolución</Text>
        {editing === "planned" ? (
          <View style={styles.dateEditRow}>
            <CustomDatePicker
              value={plannedDraft}
              onChange={setPlannedDraft}
              compact
              maxWidth={200}
            />

            <Pressable style={styles.dateCancelButton} onPress={() => setEditing(null)}>
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
          <View style={styles.row}>
            <Text style={styles.value}>
              {fromDbDate(s.order_planned_end_date) || "Sin definir"}
            </Text>

            {isOverdue(s) && (
              <Text style={{ color: colors.destructive, fontWeight: "600", fontSize: 13 }}>
                Atrasada
              </Text>
            )}

            {!isResolved && (
              <Pressable onPress={() => startEditing("planned")}>
                <Text style={styles.linkButtonText}>
                  {s.order_planned_end_date ? "Reprogramar" : "Definir"}
                </Text>
              </Pressable>
            )}

            {!isResolved && s.order_planned_end_date && (
              <Pressable onPress={() => handleSavePlannedDate(true)} disabled={busy}>
                <Text style={styles.linkButtonText}>Quitar</Text>
              </Pressable>
            )}
          </View>
        )}

        <Text style={styles.sectionTitle}>Prioridad</Text>
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

            <Pressable style={styles.dateSaveButton} onPress={handleSavePriority} disabled={busy}>
              <Text style={styles.dateSaveText}>{busy ? "Guardando…" : "Confirmar"}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.row}>
            <Text style={styles.value}>{s.priority ? PRIORITY_LABELS[s.priority] : "—"}</Text>

            {!isResolved && (
              <Pressable onPress={() => startEditing("priority")}>
                <Text style={styles.linkButtonText}>Cambiar</Text>
              </Pressable>
            )}
          </View>
        )}

        <Text style={styles.sectionTitle}>Falla genérica</Text>
        {editing === "fault" ? (
          <View style={styles.dateEditRow}>
            <View style={styles.faultSelectWrap}>
              <Select
                value={faultDraft}
                onChange={setFaultDraft}
                options={faultTypeOptions}
                placeholder={
                  faultTypeOptions.length > 0 ? "Elegí un tipo de falla" : "No hay fallas cargadas"
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
          <View style={styles.row}>
            <Text style={styles.value}>{s.fault_type_name ?? "Sin diagnosticar"}</Text>

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

                {task.consumedParts.length > 0 && (
                  <View style={styles.consumedRow}>
                    <Text style={styles.consumedText}>
                      <Text style={styles.consumedLabel}>Repuestos usados: </Text>
                      {task.consumedParts.map((p) => `${p.nombre} ×${p.cantidad}`).join(" · ")}
                    </Text>
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
      </ScrollView>

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
    code: { fontFamily: "monospace", fontSize: 13, color: c.textMuted },
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
    row: { flexDirection: "row", alignItems: "center", gap: 16 },
    linkButtonText: { fontSize: 13, fontWeight: "600", color: c.accent },
    dateEditRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      flexWrap: "wrap",
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
      backgroundColor: c.bgNested,
      alignItems: "center",
      justifyContent: "center",
    },
    dateCancelText: { color: c.text, fontWeight: "600", fontSize: 13 },
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
    },
    consumedText: { fontSize: 12.5, color: c.textMuted, lineHeight: 17 },
    consumedLabel: { fontWeight: "600", color: c.textLabel },
    autoNote: { marginTop: 16, fontSize: 12, color: c.textMuted, lineHeight: 17 },
  });
}
