import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { CustomDatePicker, fromDbDate, isValidDateString, toDbDate } from "./CustomDatePicker";
import { AddTaskModal } from "./AddTaskModal";
import { GenerateOrderModal } from "./GenerateOrderModal";
import { PhotoCarousel } from "./PhotoCarousel";
import { RadioGroup, type RadioOption } from "./RadioGroup";
import { ReassignTechnicianModal } from "./ReassignTechnicianModal";
import { RowActions } from "./RowActions";
import {
  addTaskToOrder,
  closeSolicitud,
  generateOrder,
  reassignTaskTechnician,
  updateOrderStartDate,
} from "../lib/queries/faults";
import { listProfiles } from "../lib/queries/profiles";
import type { ThemeColors } from "../lib/theme";
import { useTheme } from "../lib/ThemeContext";
import type { Equipo, Profile, Solicitud, SolicitudTask } from "../types/database";

type Item = Solicitud & {
  equipment: Pick<Equipo, "code" | "name">;
  reporterName: string;
};

const STATUS_LABELS: Record<Solicitud["status"], string> = {
  new: "Nueva",
  assigned: "En proceso",
  in_progress: "En proceso",
  resolved: "Resuelta",
  rejected: "Rechazada",
};

const PRIORITY_LABELS: Record<Exclude<Solicitud["priority"], null>, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
};

const MOTIVO_OPTIONS: RadioOption<string>[] = [
  { value: "Duplicada", label: "Duplicada" },
  { value: "Falsa alarma", label: "Falsa alarma" },
  {
    value: "Se resolvió sin OT (ajuste menor)",
    label: "Se resolvió sin OT (ajuste menor)",
  },
  { value: "Otro", label: "Otro" },
];

function taskStatusLabel(task: SolicitudTask): string {
  if (task.endDate) return "Finalizada";
  if (task.startDate) return "En curso";
  return "Pendiente";
}

// Admin "ver más" panel for a solicitud:
//   - "new" (sin OT):
//       - Shows "Cerrar sin OT" and "Generar OT".
//       - Clicking "Cerrar sin OT" reveals an inline reason panel with
//         RadioGroup + comment input and "Cancelar" / "Confirmar" actions.
//       - Confirming rejection saves the reason and sets status="rejected".
//       - Generating an OT sets status="in_progress".
//   - con OT: shows diagnosed fault, tareas with technician reassignment, start date.
//   - rejected: shows rejection info box.
// There's no separate "atendida" concept: a solicitud counts as attended
// whenever its status isn't "new" anymore.
export function SolicitudDetailModal({
  solicitud,
  onClose,
  onChanged,
}: {
  solicitud: Item | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [closingWithoutOt, setClosingWithoutOt] = useState(false);
  const [motivo, setMotivo] = useState<string>("");
  const [comentario, setComentario] = useState<string>("");
  const [generateOpen, setGenerateOpen] = useState(false);
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [reassigningTask, setReassigningTask] = useState<SolicitudTask | null>(null);
  const [editingDate, setEditingDate] = useState(false);
  const [dateDraft, setDateDraft] = useState("");
  const [profileById, setProfileById] = useState<Map<string, Profile>>(new Map());
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

  useEffect(() => {
    setGenerateOpen(false);
    setAddTaskOpen(false);
    setReassigningTask(null);
    setEditingDate(false);
    setError(null);
    setMotivo("");
    setComentario("");
    setDateDraft(solicitud ? fromDbDate(solicitud.order_start_date) : "");
    setClosingWithoutOt(false);
    if (solicitud) {
      listProfiles()
        .then((profiles) => setProfileById(new Map(profiles.map((p) => [p.id, p]))))
        .catch(() => setProfileById(new Map()));
    }
  }, [solicitud]);

  if (!solicitud) return null;
  const s = solicitud;

  function closeEverything() {
    onChanged();
    onClose();
  }

  async function handleConfirmCloseWithoutOt() {
    if (!motivo) {
      setError("Seleccioná un motivo.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await closeSolicitud(s.id, motivo, comentario);
      closeEverything();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function handleCancelCloseWithoutOt() {
    setClosingWithoutOt(false);
    setMotivo("");
    setComentario("");
    setError(null);
  }

  async function handleGenerate(input: {
    tasks: { taskId: number; technicianId: string }[];
    faultTypeId: number | null;
    priority: "low" | "medium" | "high";
  }) {
    await generateOrder(s.id, input);
    closeEverything();
  }

  async function handleAddTask(input: { taskId: number; technicianId: string }) {
    await addTaskToOrder(s.id, input);
    closeEverything();
  }

  async function handleReassign(technicianId: string) {
    if (!reassigningTask) return;
    await reassignTaskTechnician(reassigningTask.id, technicianId);
    closeEverything();
  }

  async function handleSaveDate() {
    if (!isValidDateString(dateDraft)) {
      setError("Ingresá una fecha válida (dd/mm/aaaa).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateOrderStartDate(s.id, toDbDate(dateDraft));
      closeEverything();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Modal visible transparent animationType="fade" onRequestClose={() => !busy && onClose()}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <ScrollView contentContainerStyle={{ padding: 22 }}>
              <View style={styles.topHeaderRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.title}>Detalle de solicitud</Text>

                  <Text style={styles.subtitle}>
                    {s.equipment.code} · {s.equipment.name}
                  </Text>
                </View>
              </View>

              <View style={styles.badgeRow}>
                <View style={[styles.badge, { backgroundColor: statusColors[s.status].bg }]}>
                  <Text style={[styles.badgeText, { color: statusColors[s.status].fg }]}>
                    {STATUS_LABELS[s.status]}
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

              <View style={styles.metaGrid}>
                <MetaCell label="Reportó" value={s.reporterName} colors={colors} />

                <MetaCell
                  label="Fecha de solicitud"
                  value={new Date(s.created_at).toLocaleDateString("es-AR")}
                  colors={colors}
                />
              </View>

              <Text style={styles.label}>Descripción</Text>

              <Text style={styles.value}>{s.description}</Text>

              <PhotoCarousel photoUrls={s.photo_urls} />

              {s.status === "rejected" && (
                <View style={styles.rejectedBox}>
                  <Text style={styles.rejectedTitle}>Solicitud atendida sin orden de trabajo</Text>

                  <Text style={styles.rejectedLabel}>Motivo</Text>

                  <Text style={styles.rejectedValue}>
                    {s.motivo_rechazo || "Sin motivo especificado"}
                  </Text>

                  {s.comentario_rechazo && (
                    <>
                      <Text style={styles.rejectedLabel}>Comentario</Text>

                      <Text style={styles.rejectedValue}>{s.comentario_rechazo}</Text>
                    </>
                  )}
                </View>
              )}

              {s.status === "new" && closingWithoutOt && (
                <View style={styles.reasonBox}>
                  <Text style={styles.reasonTitle}>¿Por qué se marca como atendida sin OT?</Text>

                  <RadioGroup
                    name="motivo-cierre"
                    value={motivo}
                    onChange={(v) => {
                      setMotivo(v);
                      if (error) setError(null);
                    }}
                    options={MOTIVO_OPTIONS}
                    style={styles.radioGroupColumn}
                  />

                  <TextInput
                    style={styles.commentInput}
                    value={comentario}
                    onChangeText={(t) => {
                      setComentario(t);
                      if (error) setError(null);
                    }}
                    placeholder="Comentario (opcional)"
                    placeholderTextColor={colors.textMuted}
                    maxLength={255}
                  />
                </View>
              )}

              {s.order_id != null && (
                <>
                  <View style={styles.divider} />

                  <Text style={styles.sectionTitle}>Orden de trabajo</Text>

                  <MetaCell
                    label="Falla genérica"
                    value={s.fault_type_name ?? "Sin diagnosticar"}
                    colors={colors}
                  />

                  <Text style={styles.label}>Tareas</Text>

                  {s.tasks.map((task) => (
                    <View key={task.id} style={styles.taskRow}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.taskName}>{task.taskName}</Text>

                        <Text style={styles.taskMeta}>
                          {profileById.get(task.technicianId)?.name ?? "Técnico desconocido"} ·{" "}
                          {taskStatusLabel(task)}
                        </Text>
                      </View>

                      {s.status !== "resolved" && (
                        <RowActions
                          onEdit={() => setReassigningTask(task)}
                          editTooltip="Reasignar técnico"
                        />
                      )}
                    </View>
                  ))}

                  {s.status !== "resolved" && (
                    <Pressable style={styles.linkButton} onPress={() => setAddTaskOpen(true)}>
                      <Text style={styles.linkButtonText}>+ Agregar tarea</Text>
                    </Pressable>
                  )}

                  <Text style={styles.label}>Fecha de inicio</Text>

                  {editingDate ? (
                    <>
                      <CustomDatePicker value={dateDraft} onChange={setDateDraft} compact />

                      <View style={styles.dateActions}>
                        <Pressable
                          style={styles.dateCancelButton}
                          onPress={() => setEditingDate(false)}
                          disabled={busy}
                        >
                          <Text style={styles.dateCancelText}>Cancelar</Text>
                        </Pressable>

                        <Pressable
                          style={styles.dateSaveButton}
                          onPress={handleSaveDate}
                          disabled={busy}
                        >
                          <Text style={styles.dateSaveText}>
                            {busy ? "Guardando…" : "Confirmar"}
                          </Text>
                        </Pressable>
                      </View>
                    </>
                  ) : (
                    <View style={styles.row}>
                      <Text style={styles.value}>{fromDbDate(s.order_start_date) || "—"}</Text>

                      {s.status !== "resolved" && (
                        <Pressable onPress={() => setEditingDate(true)}>
                          <Text style={styles.linkButtonText}>Reprogramar</Text>
                        </Pressable>
                      )}
                    </View>
                  )}

                  {s.status === "resolved" && s.order_end_date && (
                    <>
                      <Text style={styles.label}>Fecha de finalización</Text>

                      <Text style={styles.value}>{fromDbDate(s.order_end_date)}</Text>
                    </>
                  )}

                  <Text style={styles.autoNote}>
                    El estado de la orden se calcula solo a partir de las tareas: pasa a “En curso”
                    apenas algún técnico inicia la suya, y a “Resuelta” cuando todas están
                    finalizadas.
                  </Text>
                </>
              )}

              {error && <Text style={styles.error}>{error}</Text>}

              {s.status === "new" && !closingWithoutOt && (
                <View style={styles.actions}>
                  <Pressable
                    style={styles.secondaryButton}
                    onPress={() => setClosingWithoutOt(true)}
                    disabled={busy}
                  >
                    <Text style={styles.secondaryButtonText}>Cerrar sin OT</Text>
                  </Pressable>

                  <Pressable
                    style={styles.primaryButton}
                    onPress={() => setGenerateOpen(true)}
                    disabled={busy}
                  >
                    <Text style={styles.primaryButtonText}>Generar OT</Text>
                  </Pressable>
                </View>
              )}

              {s.status === "new" && closingWithoutOt && (
                <View style={styles.actions}>
                  <Pressable
                    style={styles.secondaryButton}
                    onPress={handleCancelCloseWithoutOt}
                    disabled={busy}
                  >
                    <Text style={styles.secondaryButtonText}>Cancelar</Text>
                  </Pressable>

                  <Pressable
                    style={styles.primaryButton}
                    onPress={handleConfirmCloseWithoutOt}
                    disabled={busy}
                  >
                    <Text style={styles.primaryButtonText}>
                      {busy ? "Confirmando…" : "Confirmar"}
                    </Text>
                  </Pressable>
                </View>
              )}

              {(!closingWithoutOt || s.status !== "new") && (
                <Pressable style={styles.closeButton} onPress={onClose} disabled={busy}>
                  <Text style={styles.closeButtonText}>Cerrar</Text>
                </Pressable>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <GenerateOrderModal
        visible={generateOpen}
        onClose={() => setGenerateOpen(false)}
        onConfirm={handleGenerate}
        equipmentLabel={`${s.equipment.code} · ${s.equipment.name}`}
      />

      <AddTaskModal
        visible={addTaskOpen}
        onClose={() => setAddTaskOpen(false)}
        onConfirm={handleAddTask}
        equipmentLabel={`${s.equipment.code} · ${s.equipment.name}`}
      />

      <ReassignTechnicianModal
        visible={!!reassigningTask}
        onClose={() => setReassigningTask(null)}
        onConfirm={handleReassign}
        equipmentLabel={`${s.equipment.code} · ${s.equipment.name}`}
        taskLabel={reassigningTask?.taskName ?? ""}
        currentTechnicianId={reassigningTask?.technicianId ?? null}
      />
    </>
  );
}

function MetaCell({ label, value, colors }: { label: string; value: string; colors: ThemeColors }) {
  return (
    <View style={{ minWidth: 140 }}>
      <Text style={{ fontSize: 11.5, fontWeight: "600", color: colors.textMuted }}>{label}</Text>

      <Text style={{ fontSize: 14, color: colors.text, marginTop: 2 }}>{value}</Text>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.55)",
      justifyContent: "center",
      padding: 20,
    },
    sheet: {
      backgroundColor: c.bgModal,
      borderRadius: 16,
      maxHeight: "88%",
      width: "100%",
      maxWidth: 520,
      alignSelf: "center",
    },
    topHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 12,
    },
    title: { fontSize: 18, fontWeight: "600", color: c.text },
    subtitle: { marginTop: 2, fontSize: 13, color: c.textMuted },
    badgeRow: { flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" },
    badge: { paddingHorizontal: 11, paddingVertical: 3.5, borderRadius: 999 },
    badgeText: { fontSize: 12.5, fontWeight: "600" },
    label: {
      fontSize: 12.5,
      fontWeight: "600",
      color: c.textLabel,
      marginTop: 18,
      marginBottom: 6,
    },
    value: { fontSize: 14, color: c.text, lineHeight: 20 },
    row: { flexDirection: "row", alignItems: "center", gap: 16 },
    metaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 18, marginTop: 16 },
    reasonBox: {
      backgroundColor: c.bgNested,
      borderRadius: 14,
      padding: 16,
      marginTop: 18,
    },
    reasonTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: c.text,
      marginBottom: 12,
    },
    radioGroupColumn: {
      flexDirection: "column",
      alignItems: "flex-start",
      gap: 10,
    },
    commentInput: {
      marginTop: 14,
      backgroundColor: "#fff",
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 9,
      minHeight: 42,
      borderWidth: 1,
      borderColor: c.borderInput,
      fontSize: 13.5,
      color: c.text,
    },
    rejectedBox: {
      backgroundColor: c.bgNested,
      borderRadius: 14,
      padding: 16,
      marginTop: 18,
      borderLeftWidth: 3,
      borderLeftColor: c.destructive,
    },
    rejectedTitle: {
      fontSize: 13.5,
      fontWeight: "700",
      color: c.text,
      marginBottom: 8,
    },
    rejectedLabel: {
      fontSize: 11.5,
      fontWeight: "600",
      color: c.textMuted,
      marginTop: 6,
    },
    rejectedValue: {
      fontSize: 13.5,
      color: c.text,
      marginTop: 2,
    },
    divider: { height: 1, backgroundColor: c.borderRow, marginTop: 20 },
    sectionTitle: { fontSize: 14, fontWeight: "600", color: c.text, marginTop: 14 },
    taskRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: c.borderRow,
    },
    taskName: { fontSize: 14, fontWeight: "600", color: c.text },
    taskMeta: { fontSize: 12.5, color: c.textMuted, marginTop: 2 },
    linkButton: { marginTop: 10, alignSelf: "flex-start" },
    linkButtonText: { fontSize: 13, fontWeight: "600", color: c.accent },
    autoNote: { marginTop: 16, fontSize: 12, color: c.textMuted, lineHeight: 17 },
    dateActions: { flexDirection: "row", gap: 10, marginTop: 10 },
    dateCancelButton: {
      paddingHorizontal: 14,
      height: 36,
      borderRadius: 8,
      backgroundColor: c.bgNested,
      alignItems: "center",
      justifyContent: "center",
    },
    dateCancelText: { color: c.text, fontWeight: "600", fontSize: 13 },
    dateSaveButton: {
      paddingHorizontal: 14,
      height: 36,
      borderRadius: 8,
      backgroundColor: c.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    dateSaveText: { color: "#fff", fontWeight: "600", fontSize: 13 },
    error: { color: c.destructive, marginTop: 16, fontSize: 13, fontWeight: "600" },
    actions: { flexDirection: "row", gap: 10, marginTop: 22 },
    secondaryButton: {
      flex: 1,
      height: 44,
      borderRadius: 10,
      backgroundColor: "#b91c1c",
      alignItems: "center",
      justifyContent: "center",
    },
    secondaryButtonText: { color: "#fff", fontWeight: "600" },
    primaryButton: {
      flex: 1,
      height: 44,
      borderRadius: 10,
      backgroundColor: c.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    primaryButtonText: { color: "#fff", fontWeight: "600" },
    closeButton: {
      marginTop: 20,
      height: 44,
      borderRadius: 10,
      backgroundColor: c.bgNested,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: "center",
      justifyContent: "center",
    },
    closeButtonText: {
      color: c.text,
      fontSize: 14,
      fontWeight: "600",
    },
  });
}
