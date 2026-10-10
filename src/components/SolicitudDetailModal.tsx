import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { fromDbDate } from "./CustomDatePicker";
import { GenerateOrderModal } from "./GenerateOrderModal";
import { PhotoCarousel } from "./PhotoCarousel";
import { RadioGroup, type RadioOption } from "./RadioGroup";
import { Sigla, withSiglas } from "./Sigla";
import { closeSolicitud, generateOrder } from "../lib/queries/faults";
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
  // The stored value keeps "OT" (existing rows already use it); only the
  // radio label spells it out, since RadioGroup labels can't host a <Sigla>.
  // Where the saved motivo is shown, withSiglas() adds the tooltip instead.
  {
    value: "Se resolvió sin OT (ajuste menor)",
    label: "Se resolvió sin orden de trabajo (ajuste menor)",
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
//       - "Generar OT" asks for confirmation + prioridad, creates the OT
//         empty and navigates to its screen (work-orders/[id]) so the
//         admin loads tareas/técnicos/falla there.
//   - con OT: read-only summary (falla, tareas, fecha de inicio) plus a
//     button to the OT screen. Everything about managing an existing OT
//     lives on that screen only, not here.
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
    setError(null);
    setMotivo("");
    setComentario("");
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

  async function handleGenerate(input: { priority: "low" | "medium" | "high" }) {
    await generateOrder(s.id, input);
    setGenerateOpen(false);
    closeEverything();
    goToOrder();
  }

  function goToOrder() {
    router.push({ pathname: "/work-orders/[id]", params: { id: String(s.id) } });
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
                    {s.motivo_rechazo ? withSiglas(s.motivo_rechazo) : "Sin motivo especificado"}
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
                  <Text style={styles.reasonTitle}>
                    ¿Por qué se marca como atendida sin <Sigla>OT</Sigla>?
                  </Text>

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

                  {s.tasks.length === 0 ? (
                    <Text style={styles.taskMeta}>Todavía no se cargó ninguna tarea.</Text>
                  ) : (
                    s.tasks.map((task) => (
                      <View key={task.id} style={styles.taskRow}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.taskName}>{task.taskName}</Text>

                          <Text style={styles.taskMeta}>
                            {profileById.get(task.technicianId)?.name ?? "Técnico desconocido"} ·{" "}
                            {taskStatusLabel(task)}
                          </Text>

                          {task.consumedParts.length > 0 && (
                            <Text style={styles.taskConsumed}>
                              Repuestos:{" "}
                              {task.consumedParts
                                .map((p) => `${p.nombre} ×${p.cantidad}`)
                                .join(" · ")}
                            </Text>
                          )}
                        </View>
                      </View>
                    ))
                  )}

                  <Text style={styles.label}>Fecha de inicio</Text>

                  <Text style={styles.value}>{fromDbDate(s.order_start_date) || "—"}</Text>

                  {s.status === "resolved" && s.order_end_date && (
                    <>
                      <Text style={styles.label}>Fecha de finalización</Text>

                      <Text style={styles.value}>{fromDbDate(s.order_end_date)}</Text>
                    </>
                  )}

                  <Pressable
                    style={[styles.primaryButton, styles.goToOrderButton]}
                    onPress={() => {
                      onClose();
                      goToOrder();
                    }}
                  >
                    <Text style={styles.primaryButtonText}>Ver orden de trabajo</Text>
                  </Pressable>
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
                    <Text style={styles.secondaryButtonText}>
                      Cerrar sin <Sigla>OT</Sigla>
                    </Text>
                  </Pressable>

                  <Pressable
                    style={styles.primaryButton}
                    onPress={() => setGenerateOpen(true)}
                    disabled={busy}
                  >
                    <Text style={styles.primaryButtonText}>
                      Generar <Sigla>OT</Sigla>
                    </Text>
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
    taskConsumed: { fontSize: 12, color: c.textMuted, marginTop: 3, lineHeight: 16 },
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
    goToOrderButton: { flex: 0, marginTop: 22 },
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
