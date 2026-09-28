import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../lib/ThemeContext";
import type { ThemeColors } from "../lib/theme";
import {
  REQUEST_STATUS_LABELS,
  REQUEST_STATUS_SUMMARIES,
  REQUEST_URGENCY_LABELS,
  requestStatusColor,
  requestUrgencyColor,
} from "../lib/requestPresentation";
import type { RequestListItem } from "./RequestList";

export function RequestDetailModal({
  item,
  onClose,
}: {
  item: RequestListItem | null;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  if (!item) return null;

  const statusColor = requestStatusColor(colors, item.status);
  const urgencyColor = requestUrgencyColor(colors, item.urgency);
  const createdAt = new Date(item.created_at);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>Detalle de solicitud</Text>

              <Text style={styles.subtitle}>Solicitud #{item.id}</Text>
            </View>

            <View style={[styles.badge, { backgroundColor: statusColor.bg }]}>
              <Text style={[styles.badgeText, { color: statusColor.fg }]}>
                {REQUEST_STATUS_LABELS[item.status] ?? "Pendiente"}
              </Text>
            </View>
          </View>

          <ScrollView contentContainerStyle={styles.content}>
            <View style={[styles.statusSummary, { backgroundColor: statusColor.bg }]}>
              <Text style={[styles.statusSummaryTitle, { color: statusColor.fg }]}>
                Estado actual
              </Text>

              <Text style={[styles.statusSummaryText, { color: statusColor.fg }]}>
                {REQUEST_STATUS_SUMMARIES[item.status] ?? "Pendiente de atención"}
              </Text>
            </View>

            {item.photo_url && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Evidencia</Text>

                <Image
                  source={{ uri: item.photo_url }}
                  style={styles.photo}
                  resizeMode="cover"
                  accessibilityLabel="Evidencia adjunta"
                />
              </View>
            )}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Equipo</Text>

              <View style={styles.grid}>
                <DetailField label="Código" value={item.equipment.code} styles={styles} />

                <DetailField label="Nombre" value={item.equipment.name} styles={styles} />

                <DetailField label="Ubicación" value={item.equipment.location} styles={styles} />

                <DetailField label="Tipo" value={item.equipment.type} styles={styles} />

                <DetailField label="Modelo" value={item.equipment.model} styles={styles} />

                <DetailField
                  label="Instalación"
                  value={formatEquipmentDate(item.equipment.installDate)}
                  styles={styles}
                />

                <DetailField
                  label="Garantía"
                  value={formatEquipmentDate(item.equipment.warrantyDate)}
                  styles={styles}
                />
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Falla reportada</Text>

              <Text style={styles.description}>{item.description}</Text>

              <View style={[styles.urgencyBadge, { backgroundColor: urgencyColor.bg }]}>
                <Text style={[styles.urgencyText, { color: urgencyColor.fg }]}>
                  Urgencia {REQUEST_URGENCY_LABELS[item.urgency] ?? "Media"}
                </Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Información del reporte</Text>

              <View style={styles.grid}>
                <DetailField label="Reportado por" value={item.reporterName} styles={styles} />

                <DetailField
                  label="Fecha"
                  value={createdAt.toLocaleDateString("es-AR")}
                  styles={styles}
                />

                <DetailField
                  label="Hora"
                  value={createdAt.toLocaleTimeString("es-AR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  styles={styles}
                />

                <DetailField
                  label="Técnico"
                  value={item.technicianName ?? "Sin asignar"}
                  styles={styles}
                />
              </View>
            </View>
          </ScrollView>

          <View style={styles.actions}>
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeText}>Cerrar</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

type DetailStyles = ReturnType<typeof makeStyles>;

function DetailField({
  label,
  value,
  styles,
}: {
  label: string;
  value?: string | null;
  styles: DetailStyles;
}) {
  if (!value) return null;

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>

      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

function formatEquipmentDate(value?: string | null) {
  if (!value) return null;
  return new Date(`${value}T00:00:00`).toLocaleDateString("es-AR");
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
      width: "100%",
      maxWidth: 560,
      maxHeight: "88%",
      alignSelf: "center",
      overflow: "hidden",
      borderRadius: 16,
      backgroundColor: c.bgModal,
    },
    header: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
      padding: 22,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    headerText: { flex: 1 },
    title: { fontSize: 19, fontWeight: "600", color: c.text },
    subtitle: { marginTop: 3, fontSize: 12.5, color: c.textMuted },
    badge: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 999 },
    badgeText: { fontSize: 12, fontWeight: "700" },
    content: { padding: 22, gap: 20 },
    statusSummary: { padding: 14, borderRadius: 12 },
    statusSummaryTitle: { fontSize: 11.5, fontWeight: "700", textTransform: "uppercase" },
    statusSummaryText: { marginTop: 3, fontSize: 15, fontWeight: "600" },
    section: { gap: 10 },
    sectionTitle: {
      fontSize: 11.5,
      fontWeight: "700",
      letterSpacing: 0.6,
      textTransform: "uppercase",
      color: c.textMuted,
    },
    photo: { width: "100%", height: 230, borderRadius: 12, backgroundColor: c.bgNested },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
    field: {
      flexGrow: 1,
      flexBasis: 150,
      minWidth: 130,
      padding: 12,
      borderRadius: 10,
      backgroundColor: c.bgNested,
    },
    fieldLabel: { fontSize: 11.5, color: c.textMuted },
    fieldValue: { marginTop: 3, fontSize: 13.5, fontWeight: "600", color: c.text },
    description: { fontSize: 14, lineHeight: 21, color: c.textLabel },
    urgencyBadge: {
      alignSelf: "flex-start",
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
    },
    urgencyText: { fontSize: 12, fontWeight: "600" },
    actions: {
      alignItems: "flex-end",
      padding: 18,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    closeButton: {
      minWidth: 110,
      height: 42,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 10,
      backgroundColor: c.accent,
    },
    closeText: { color: "#fff", fontWeight: "600" },
  });
}
