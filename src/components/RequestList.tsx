import { View, Text, Image, Pressable, StyleSheet } from "react-native";
import type { Solicitud, Equipo } from "../types/database";
import { WarningIcon } from "./icons";
import { useTheme } from "../lib/ThemeContext";
import type { ThemeColors } from "../lib/theme";
import {
  REQUEST_STATUS_LABELS,
  REQUEST_STATUS_SUMMARIES,
  REQUEST_URGENCY_LABELS,
  requestStatusColor,
  requestUrgencyColor,
} from "../lib/requestPresentation";

export type RequestListItem = Solicitud & {
  equipment: Pick<Equipo, "code" | "name"> &
    Partial<Pick<Equipo, "location" | "type" | "model" | "installDate" | "warrantyDate">>;
  reporterName: string;
  technicianName: string | null;
};

export function RequestList({
  items,
  emptyMessage = "No hay solicitudes todavía. Reportá una falla con el botón de arriba.",
  onOpen,
}: {
  items: RequestListItem[];
  emptyMessage?: string;
  onOpen?: (item: RequestListItem) => void;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  if (items.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>{emptyMessage}</Text>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {items.map((item) => {
        const statusColor = requestStatusColor(colors, item.status);
        const urgencyColor = requestUrgencyColor(colors, item.urgency);

        return (
          <Pressable
            key={item.id}
            style={({ pressed }) => [styles.card, pressed && onOpen && styles.cardPressed]}
            onPress={() => onOpen?.(item)}
            disabled={!onOpen}
            accessibilityRole={onOpen ? "button" : undefined}
            accessibilityLabel={onOpen ? `Ver detalle de la solicitud ${item.id}` : undefined}
          >
            {item.photo_url ? (
              <Image source={{ uri: item.photo_url }} style={styles.photo} />
            ) : (
              <View style={[styles.iconWrap, { backgroundColor: urgencyColor.bg }]}>
                <WarningIcon size={20} color={urgencyColor.fg} />
              </View>
            )}

            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={styles.row}>
                <Text style={styles.requestId}>Solicitud #{item.id}</Text>

                <Text style={styles.equipmentName}>{item.equipment.name}</Text>

                <Text style={styles.equipmentCode}>{item.equipment.code}</Text>

                <View style={[styles.badge, { backgroundColor: statusColor.bg }]}>
                  <Text style={[styles.badgeText, { color: statusColor.fg }]}>
                    {REQUEST_STATUS_LABELS[item.status] ?? "Pendiente"}
                  </Text>
                </View>
              </View>

              <Text style={styles.desc} numberOfLines={2}>
                {item.description}
              </Text>

              <View style={styles.metaRow}>
                <Text style={styles.meta}>
                  Urgencia · {REQUEST_URGENCY_LABELS[item.urgency] ?? "Media"}
                </Text>

                {item.equipment.location ? (
                  <Text style={styles.meta}>Ubicación · {item.equipment.location}</Text>
                ) : null}

                <Text style={styles.meta}>
                  {new Date(item.created_at).toLocaleDateString("es-AR")}
                </Text>
              </View>

              <View style={styles.footer}>
                <Text style={[styles.statusSummary, { color: statusColor.fg }]}>
                  {REQUEST_STATUS_SUMMARIES[item.status] ?? "Pendiente de atención"}
                </Text>

                {onOpen && <Text style={styles.detailLink}>Ver detalle</Text>}
              </View>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    list: { gap: 12 },
    empty: {
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: c.borderInput,
      borderRadius: 14,
      padding: 40,
      alignItems: "center",
    },
    emptyText: { color: c.textMuted, fontSize: 14, textAlign: "center" },
    card: {
      flexDirection: "row",
      gap: 16,
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 14,
      padding: 18,
    },
    cardPressed: { opacity: 0.82 },
    iconWrap: {
      width: 42,
      height: 42,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    photo: { width: 42, height: 42, borderRadius: 10, backgroundColor: c.bgNested },
    row: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
    requestId: { width: "100%", fontSize: 11.5, fontWeight: "600", color: c.textMuted },
    equipmentName: { fontWeight: "600", fontSize: 15, color: c.text },
    equipmentCode: { fontFamily: "monospace", fontSize: 12, color: c.textMuted },
    badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
    badgeText: { fontSize: 11.5, fontWeight: "600" },
    desc: { marginTop: 6, fontSize: 13.5, color: c.textLabel, lineHeight: 19 },
    metaRow: { marginTop: 8, flexDirection: "row", gap: 16, flexWrap: "wrap" },
    meta: { fontSize: 12.5, color: c.textMuted },
    footer: {
      marginTop: 10,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
      flexWrap: "wrap",
    },
    statusSummary: { fontSize: 12.5, fontWeight: "600" },
    detailLink: { fontSize: 12.5, fontWeight: "700", color: c.accent },
  });
}
