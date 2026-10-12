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
  View,
} from "react-native";
import { fromDbDate } from "./CustomDatePicker";
import { CloseWithoutOrderModal } from "./CloseWithoutOrderModal";
import { GenerateOrderModal } from "./GenerateOrderModal";
import { OrderFlowSteps } from "./OrderFlowSteps";
import { CalendarIcon, UserIcon } from "./icons";
import { Sigla, withSiglas } from "./Sigla";
import { formatOrderNumber } from "../lib/orderNumber";
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

function getTaskBadge(
  task: SolicitudTask,
  c: ThemeColors,
): { label: string; bg: string; fg: string } {
  if (task.endDate) {
    return { label: "Finalizada", bg: c.faultResolved.bg, fg: c.faultResolved.fg };
  }
  if (task.startDate) {
    return { label: "En curso", bg: c.faultInProgress.bg, fg: c.faultInProgress.fg };
  }
  return { label: "Pendiente", bg: c.faultAssigned.bg, fg: c.faultAssigned.fg };
}

// Admin "ver más" panel for a solicitud:
//   - "new" (sin OT):
//       - Shows "Cerrar sin OT" and "Generar OT".
//       - Clicking "Cerrar sin OT" opens CloseWithoutOrderModal where the admin
//         selects a reason (and enters a required comment if "Otro") and clicks
//         "Confirmar" (or "Cancelar" to return without changes).
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
  const [closeWithoutOtOpen, setCloseWithoutOtOpen] = useState(false);
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
    setCloseWithoutOtOpen(false);
    setLightboxUrl(null);
    setError(null);
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
    s.photo_urls && s.photo_urls.length > 0 ? s.photo_urls : s.photo_url ? [s.photo_url] : [];

  function closeEverything() {
    onChanged();
    onClose();
  }

  async function handleCloseWithoutOt(input: { reason: string; comment?: string }) {
    setBusy(true);
    setError(null);
    try {
      await closeSolicitud(s.id, input.reason, input.comment);
      setCloseWithoutOtOpen(false);
      closeEverything();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerate(input: { priority: "low" | "medium" | "high" }) {
    await generateOrder(s.id, input);
    setGenerateOpen(false);
    closeEverything();
    goToOrder(true);
  }

  // `created` makes the OT screen confirm "Se generó la OT-XXXX".
  function goToOrder(created = false) {
    router.push({
      pathname: "/work-orders/[id]",
      params: created ? { id: String(s.id), created: "1" } : { id: String(s.id) },
    });
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
                        style={[styles.badge, { backgroundColor: priorityColors[s.priority].bg }]}
                      >
                        <Text style={[styles.badgeText, { color: priorityColors[s.priority].fg }]}>
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

              {s.order_id != null && (
                <>
                  <View style={styles.divider} />

                  <Text style={styles.orderSectionLabel}>
                    ORDEN DE TRABAJO · {formatOrderNumber(s.order_id)}
                  </Text>

                  <View style={styles.orderSummaryCard}>
                    <View style={styles.summaryFieldBlock}>
                      <Text style={styles.summaryLabel}>FALLA GENÉRICA</Text>

                      <Text
                        style={s.fault_type_name ? styles.summaryValue : styles.summaryValuePending}
                      >
                        {s.fault_type_name ?? "Sin diagnosticar"}
                      </Text>
                    </View>

                    <View style={styles.summaryDivider} />

                    <View style={styles.summaryDatesRow}>
                      <View style={styles.summaryDateCol}>
                        <Text style={styles.summaryLabel}>FECHA DE INICIO</Text>

                        <View style={styles.dateValueRow}>
                          <CalendarIcon size={14} color={colors.accent} />

                          <Text style={styles.summaryValue}>
                            {fromDbDate(s.order_start_date) || "—"}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.summaryDateCol}>
                        <Text style={styles.summaryLabel}>FECHA DE FINALIZACIÓN</Text>

                        <View style={styles.dateValueRow}>
                          <CalendarIcon
                            size={14}
                            color={s.order_end_date ? colors.accent : colors.textMuted}
                          />

                          <Text
                            style={
                              s.order_end_date ? styles.summaryValue : styles.summaryValuePending
                            }
                          >
                            {s.order_end_date ? fromDbDate(s.order_end_date) : "Pendiente"}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>

                  <View style={styles.tasksHeaderRow}>
                    <Text style={styles.tasksHeaderLabel}>TAREAS</Text>

                    <View style={styles.tasksCountBadge}>
                      <Text style={styles.tasksCountText}>{s.tasks.length}</Text>
                    </View>
                  </View>

                  {s.tasks.length === 0 ? (
                    <View style={styles.emptyTasksCard}>
                      <Text style={styles.emptyTasksText}>Todavía no se cargó ninguna tarea.</Text>
                    </View>
                  ) : (
                    s.tasks.map((task) => {
                      const badge = getTaskBadge(task, colors);
                      const techProfile = task.technicianId
                        ? profileById.get(task.technicianId)
                        : null;
                      const techName = techProfile
                        ? techProfile.name
                        : task.technicianId
                          ? "Técnico desconocido"
                          : "Sin asignar";

                      return (
                        <View key={task.id} style={styles.taskCard}>
                          <View style={styles.taskCardTopRow}>
                            <Text style={styles.taskCardName} numberOfLines={2}>
                              {task.taskName}
                            </Text>

                            <View style={[styles.taskStatusBadge, { backgroundColor: badge.bg }]}>
                              <Text style={[styles.taskStatusBadgeText, { color: badge.fg }]}>
                                {badge.label}
                              </Text>
                            </View>
                          </View>

                          <View style={styles.taskTechRow}>
                            <UserIcon size={14} color={colors.textSecondary} />

                            <Text style={styles.taskTechText}>{techName}</Text>
                          </View>

                          {task.consumedParts.length > 0 && (
                            <>
                              <View style={styles.taskPartsDivider} />

                              <View style={styles.taskPartsRow}>
                                <Text style={styles.taskPartsLabel}>REPUESTOS</Text>

                                {task.consumedParts.map((part, pIdx) => (
                                  <View key={`${part.repId || pIdx}`} style={styles.partTag}>
                                    <Text style={styles.partTagName}>
                                      {part.nombre}
                                      <Text style={styles.partTagQty}>{` ×${part.cantidad}`}</Text>
                                    </Text>
                                  </View>
                                ))}
                              </View>
                            </>
                          )}

                          {task.diagnosis && (
                            <>
                              <View style={styles.taskPartsDivider} />

                              <Text style={styles.taskPartsLabel}>DIAGNÓSTICO</Text>

                              <Text style={styles.taskDiagnosisText}>{task.diagnosis}</Text>
                            </>
                          )}
                        </View>
                      );
                    })
                  )}

                  <Pressable
                    style={styles.goToOrderFullButton}
                    onPress={() => {
                      onClose();
                      goToOrder();
                    }}
                  >
                    <Text style={styles.goToOrderButtonText}>Ver orden de trabajo</Text>
                  </Pressable>
                </>
              )}

              {error && <Text style={styles.error}>{error}</Text>}
            </ScrollView>

            <View style={styles.footer}>
              {s.status === "new" && (
                <>
                  {/* Next step of the flow is right below: Generar OT. */}
                  <OrderFlowSteps stage="solicitud" style={styles.flowSteps} />

                  <View style={styles.actions}>
                    <Pressable
                      style={styles.secondaryButton}
                      onPress={() => setCloseWithoutOtOpen(true)}
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
        <Modal visible transparent animationType="fade" onRequestClose={() => setLightboxUrl(null)}>
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

      <CloseWithoutOrderModal
        visible={closeWithoutOtOpen}
        onClose={() => setCloseWithoutOtOpen(false)}
        onConfirm={handleCloseWithoutOt}
        equipmentLabel={`${s.equipment.code} · ${s.equipment.name}`}
      />
    </>
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
      paddingBottom: 28,
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
    orderSectionLabel: {
      fontSize: 12.5,
      fontWeight: "700",
      letterSpacing: 0.75,
      textTransform: "uppercase",
      color: c.textSecondary,
      marginTop: 18,
      marginBottom: 10,
    },
    orderSummaryCard: {
      backgroundColor: c.bgNested,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      padding: 18,
    },
    summaryFieldBlock: {},
    summaryLabel: {
      fontSize: 11.5,
      fontWeight: "600",
      color: c.textMuted,
      letterSpacing: 0.5,
      textTransform: "uppercase",
      marginBottom: 4,
    },
    summaryValue: {
      fontSize: 15.5,
      fontWeight: "600",
      color: c.text,
      lineHeight: 20,
    },
    summaryValuePending: {
      fontSize: 15.5,
      fontWeight: "500",
      fontStyle: "italic",
      color: c.textMuted,
      lineHeight: 20,
    },
    summaryDivider: {
      height: 1,
      backgroundColor: c.borderRow,
      marginVertical: 14,
    },
    summaryDatesRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 16,
    },
    summaryDateCol: {
      flex: 1,
      minWidth: 0,
    },
    dateValueRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 2,
    },
    tasksHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 18,
      marginBottom: 10,
    },
    tasksHeaderLabel: {
      fontSize: 12.5,
      fontWeight: "700",
      letterSpacing: 0.75,
      textTransform: "uppercase",
      color: c.textSecondary,
    },
    tasksCountBadge: {
      backgroundColor: c.accent,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 999,
      minWidth: 20,
      alignItems: "center",
      justifyContent: "center",
    },
    tasksCountText: {
      color: "#ffffff",
      fontSize: 11.5,
      fontWeight: "700",
    },
    emptyTasksCard: {
      backgroundColor: c.bgNested,
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: "center",
      marginBottom: 10,
    },
    emptyTasksText: {
      fontSize: 13,
      color: c.textMuted,
      fontStyle: "italic",
    },
    taskCard: {
      backgroundColor: c.bgCard,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      padding: 14,
      marginBottom: 10,
    },
    taskCardTopRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 10,
    },
    taskCardName: {
      flex: 1,
      fontSize: 15.5,
      fontWeight: "700",
      color: c.text,
      lineHeight: 20,
    },
    taskStatusBadge: {
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: 999,
      flexShrink: 0,
    },
    taskStatusBadgeText: {
      fontSize: 12.5,
      fontWeight: "600",
    },
    taskTechRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 6,
    },
    taskTechText: {
      fontSize: 13.5,
      fontWeight: "500",
      color: c.textSecondary,
    },
    taskPartsDivider: {
      height: 1,
      backgroundColor: c.borderRow,
      marginVertical: 10,
    },
    taskPartsRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 6,
    },
    taskPartsLabel: {
      fontSize: 12,
      fontWeight: "700",
      color: c.textSecondary,
      letterSpacing: 0.5,
      textTransform: "uppercase",
      marginRight: 2,
    },
    partTag: {
      backgroundColor: c.bgNested,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    partTagName: {
      fontSize: 12.5,
      fontWeight: "500",
      color: c.text,
    },
    taskDiagnosisText: {
      marginTop: 4,
      fontSize: 13.5,
      color: c.text,
      lineHeight: 19,
    },
    partTagQty: {
      color: c.accent,
      fontWeight: "700",
    },
    goToOrderFullButton: {
      width: "100%",
      height: 46,
      borderRadius: 10,
      backgroundColor: c.accent,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 18,
      marginBottom: 8,
      ...(Platform.OS === "web" ? ({ cursor: "pointer" } as object) : {}),
    },
    goToOrderButtonText: {
      color: "#ffffff",
      fontSize: 15.5,
      fontWeight: "700",
    },
    error: { color: c.destructive, marginTop: 12, fontSize: 13, fontWeight: "600" },
    footer: {
      paddingHorizontal: 20,
      paddingBottom: 18,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: c.borderRow,
    },
    flowSteps: { marginBottom: 14 },
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
