import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { fromDbDate } from "./CustomDatePicker";
import { GenerateOrderModal } from "./GenerateOrderModal";
import { CalendarIcon, UserIcon } from "./icons";
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
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
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
    setLightboxUrl(null);
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

  const reporterProfile = profileById.get(s.reported_by);
  const roleLabel =
    reporterProfile?.role === "admin"
      ? "Administrador"
      : reporterProfile?.role === "technician"
        ? "Técnico"
        : reporterProfile?.role === "user"
          ? "Usuario"
          : null;
  const reporterDisplay = reporterProfile
    ? `${reporterProfile.name}${roleLabel ? ` (${roleLabel})` : ""}`
    : s.reporterName;

  const photos =
    s.photo_urls && s.photo_urls.length > 0
      ? s.photo_urls
      : s.photo_url
        ? [s.photo_url]
        : [];

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
            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.headerTwoCols}>
                <View style={styles.headerLeftCol}>
                  <Text style={styles.title} numberOfLines={1}>
                    Detalle de solicitud
                  </Text>

                  <Text style={styles.equipmentTitle} numberOfLines={1}>
                    {s.equipment.name}
                  </Text>

                  <View style={styles.equipmentMetaRow}>
                    <View style={styles.codeTag}>
                      <Text style={styles.codeText}>{s.equipment.code}</Text>
                    </View>

                    <View style={[styles.badge, { backgroundColor: statusColors[s.status].bg }]}>
                      <Text style={[styles.badgeText, { color: statusColors[s.status].fg }]}>
                        {STATUS_LABELS[s.status]}
                      </Text>
                    </View>

                    {s.priority && (
                      <View
                        style={[
                          styles.badge,
                          { backgroundColor: priorityColors[s.priority].bg },
                        ]}
                      >
                        <Text
                          style={[
                            styles.badgeText,
                            { color: priorityColors[s.priority].fg },
                          ]}
                        >
                          Prioridad {PRIORITY_LABELS[s.priority]}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>

                <View style={styles.infoCard}>
                  <View style={styles.infoRow}>
                    <View style={styles.infoIconWrap}>
                      <CalendarIcon size={15} color={colors.accent} />
                    </View>

                    <View style={styles.infoContent}>
                      <Text style={styles.infoLabel}>FECHA DE SOLICITUD</Text>

                      <Text style={styles.infoValue}>
                        {new Date(s.created_at).toLocaleDateString("es-AR")}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.infoDivider} />

                  <View style={styles.infoRow}>
                    <View style={styles.infoIconWrap}>
                      <UserIcon size={15} color={colors.accent} />
                    </View>

                    <View style={styles.infoContent}>
                      <Text style={styles.infoLabel}>REPORTÓ</Text>

                      <Text style={styles.infoValue} numberOfLines={2}>
                        {reporterDisplay}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              <View style={styles.descSection}>
                <Text style={styles.descLabel}>DESCRIPCIÓN</Text>

                <View style={styles.descBox}>
                  <Text style={styles.descText}>{s.description}</Text>
                </View>
              </View>

              {photos.length > 0 && (
                <View style={styles.photoSection}>
                  <Text style={styles.photoSectionLabel}>FOTO ADJUNTA</Text>

                  {photos.map((url, idx) => (
                    <Pressable
                      key={url + idx}
                      onPress={() => setLightboxUrl(url)}
                      style={styles.photoPressable}
                      accessibilityLabel="Ver foto ampliada"
                    >
                      <Image
                        source={{ uri: url }}
                        style={styles.attachedImage}
                        resizeMode="cover"
                      />
                    </Pressable>
                  ))}
                </View>
              )}

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
            </ScrollView>

            <View style={styles.footer}>
              {s.status === "new" && !closingWithoutOt && (
                <>
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

                  <Pressable style={styles.closeButton} onPress={onClose} disabled={busy}>
                    <Text style={styles.closeButtonText}>Cerrar</Text>
                  </Pressable>
                </>
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

              {s.status !== "new" && (
                <Pressable
                  style={[styles.closeButton, { marginTop: 0 }]}
                  onPress={onClose}
                  disabled={busy}
                >
                  <Text style={styles.closeButtonText}>Cerrar</Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {lightboxUrl && (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setLightboxUrl(null)}
        >
          <Pressable style={styles.lightboxOverlay} onPress={() => setLightboxUrl(null)}>
            <View style={styles.lightboxContainer}>
              <Image
                source={{ uri: lightboxUrl }}
                style={styles.lightboxImage}
                resizeMode="contain"
              />

              <Pressable
                style={styles.lightboxCloseBtn}
                onPress={() => setLightboxUrl(null)}
                hitSlop={12}
                accessibilityLabel="Cerrar vista previa"
              >
                <Text style={styles.lightboxCloseText}>✕</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>
      )}

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
      padding: 16,
    },
    sheet: {
      backgroundColor: c.bgModal,
      borderRadius: 16,
      maxHeight: "88%",
      width: "100%",
      maxWidth: 520,
      alignSelf: "center",
      overflow: "hidden",
    },
    body: {
      flex: 1,
    },
    bodyContent: {
      padding: 20,
    },
    headerTwoCols: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 12,
    },
    headerLeftCol: {
      flex: 1,
      minWidth: 0,
    },
    title: {
      fontSize: 22,
      fontWeight: "400",
      color: c.text,
      lineHeight: 26,
    },
    equipmentTitle: {
      fontSize: 17,
      fontWeight: "700",
      color: c.text,
      marginTop: 10,
      lineHeight: 22,
    },
    equipmentMetaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 8,
      flexWrap: "wrap",
    },
    codeTag: {
      backgroundColor: c.bgNested,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: c.border,
    },
    codeText: {
      fontFamily: "monospace",
      fontSize: 12.5,
      fontWeight: "600",
      color: c.textSecondary,
    },
    badge: {
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: 999,
    },
    badgeText: {
      fontSize: 12,
      fontWeight: "600",
    },
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
    infoRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
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
    infoContent: {
      flex: 1,
      minWidth: 0,
    },
    infoLabel: {
      fontSize: 11,
      fontWeight: "600",
      color: c.textMuted,
      letterSpacing: 0.4,
      textTransform: "uppercase",
    },
    infoValue: {
      fontSize: 14,
      fontWeight: "600",
      color: c.text,
      marginTop: 1,
    },
    infoDivider: {
      height: 1,
      backgroundColor: c.borderRow,
      marginVertical: 6,
    },
    descSection: {
      marginTop: 14,
    },
    descLabel: {
      fontSize: 11.5,
      fontWeight: "600",
      color: c.textMuted,
      letterSpacing: 0.5,
      textTransform: "uppercase",
      marginBottom: 4,
    },
    descBox: {
      borderLeftWidth: 4,
      borderLeftColor: c.accent,
      paddingLeft: 10,
      paddingVertical: 2,
    },
    descText: {
      fontSize: 15,
      color: c.text,
      lineHeight: 21,
    },
    photoSection: {
      marginTop: 14,
    },
    photoSectionLabel: {
      fontSize: 11.5,
      fontWeight: "600",
      color: c.textMuted,
      letterSpacing: 0.5,
      textTransform: "uppercase",
      marginBottom: 6,
    },
    photoPressable: {
      width: "100%",
      borderRadius: 13,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 6,
      ...(Platform.OS === "web" ? ({ cursor: "pointer" } as object) : {}),
    },
    attachedImage: {
      width: "100%",
      height: 195,
      borderRadius: 13,
      backgroundColor: c.bgNested,
    },
    lightboxOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.85)",
      justifyContent: "center",
      alignItems: "center",
      padding: 16,
    },
    lightboxContainer: {
      position: "relative",
      maxWidth: "92%",
      maxHeight: "90%",
      width: "100%",
      height: "100%",
      justifyContent: "center",
      alignItems: "center",
    },
    lightboxImage: {
      width: "100%",
      height: "100%",
    },
    lightboxCloseBtn: {
      position: "absolute",
      top: 10,
      right: 10,
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: "rgba(0,0,0,0.65)",
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.3)",
    },
    lightboxCloseText: {
      color: "#fff",
      fontSize: 18,
      fontWeight: "700",
    },
    label: {
      fontSize: 12.5,
      fontWeight: "600",
      color: c.textLabel,
      marginTop: 14,
      marginBottom: 4,
    },
    value: { fontSize: 14, color: c.text, lineHeight: 20 },
    reasonBox: {
      backgroundColor: c.bgNested,
      borderRadius: 12,
      padding: 14,
      marginTop: 14,
    },
    reasonTitle: {
      fontSize: 13.5,
      fontWeight: "700",
      color: c.text,
      marginBottom: 10,
    },
    radioGroupColumn: {
      flexDirection: "column",
      alignItems: "flex-start",
      gap: 8,
    },
    commentInput: {
      marginTop: 12,
      backgroundColor: "#fff",
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      minHeight: 40,
      borderWidth: 1,
      borderColor: c.borderInput,
      fontSize: 13,
      color: c.text,
    },
    rejectedBox: {
      backgroundColor: c.bgNested,
      borderRadius: 12,
      padding: 14,
      marginTop: 14,
      borderLeftWidth: 3,
      borderLeftColor: c.destructive,
    },
    rejectedTitle: {
      fontSize: 13,
      fontWeight: "700",
      color: c.text,
      marginBottom: 6,
    },
    rejectedLabel: {
      fontSize: 11,
      fontWeight: "600",
      color: c.textMuted,
      marginTop: 4,
    },
    rejectedValue: {
      fontSize: 13,
      color: c.text,
      marginTop: 2,
    },
    divider: { height: 1, backgroundColor: c.borderRow, marginTop: 16 },
    sectionTitle: { fontSize: 13.5, fontWeight: "600", color: c.text, marginTop: 12 },
    taskRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: c.borderRow,
    },
    taskName: { fontSize: 13.5, fontWeight: "600", color: c.text },
    taskMeta: { fontSize: 12, color: c.textMuted, marginTop: 2 },
    taskConsumed: { fontSize: 11.5, color: c.textMuted, marginTop: 2, lineHeight: 15 },
    error: { color: c.destructive, marginTop: 12, fontSize: 13, fontWeight: "600" },
    footer: {
      paddingHorizontal: 20,
      paddingBottom: 18,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: c.borderRow,
    },
    actions: { flexDirection: "row", gap: 10 },
    secondaryButton: {
      flex: 1,
      height: 44,
      borderRadius: 10,
      backgroundColor: "#b91c1c",
      alignItems: "center",
      justifyContent: "center",
    },
    secondaryButtonText: { color: "#fff", fontSize: 15, fontWeight: "600" },
    primaryButton: {
      flex: 1,
      height: 44,
      borderRadius: 10,
      backgroundColor: c.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    primaryButtonText: { color: "#fff", fontSize: 15, fontWeight: "600" },
    goToOrderButton: { flex: 0, marginTop: 18 },
    closeButton: {
      marginTop: 10,
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
      fontSize: 15,
      fontWeight: "600",
    },
  });
}
