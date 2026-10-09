import { useState } from "react";
import { View, Text, Image, Pressable, ScrollView, StyleSheet } from "react-native";
import type { Solicitud, Equipo } from "../types/database";
import { EyeIcon, WarningIcon } from "./icons";
import { Tooltip } from "./Tooltip";
import { useTheme } from "../lib/ThemeContext";
import type { ThemeColors } from "../lib/theme";

type Item = Solicitud & {
  equipment: Pick<Equipo, "code" | "name">;
  reporterName: string;
  technicianName: string | null;
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

// onSelect is only passed by the admin's "Solicitudes" screen — that's the
// only role that can act on a solicitud (generar OT, cerrar, reasignar
// técnico, etc.), so it's the only one that gets the "Ver detalle" eye button.
export function RequestList({
  items,
  onSelect,
  emptyMessage = "No hay solicitudes todavía. Reportá una falla con el botón de arriba.",
}: {
  items: Item[];
  onSelect?: (item: Item) => void;
  emptyMessage?: string;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const faultStatus = {
    new: colors.faultNew,
    assigned: colors.faultAssigned,
    in_progress: colors.faultInProgress,
    resolved: colors.faultResolved,
    rejected: colors.faultRejected,
  };

  const priorityColors = {
    low: colors.urgencyLow,
    medium: colors.urgencyMedium,
    high: colors.urgencyHigh,
  };

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
        const st = faultStatus[item.status];
        // No priority yet means nobody has evaluated the solicitud, so the
        // icon stays neutral instead of implying an urgency no one set.
        const prio = item.priority ? priorityColors[item.priority] : null;
        const Card = onSelect ? Pressable : View;
        return (
          <Card
            key={item.id}
            style={styles.card}
            {...(onSelect ? { onPress: () => onSelect(item) } : {})}
          >
            {item.photo_url ? (
              <Image source={{ uri: item.photo_url }} style={styles.photo} />
            ) : (
              <View style={[styles.iconWrap, prio && { backgroundColor: prio.bg }]}>
                <WarningIcon size={20} color={prio?.fg ?? colors.textMuted} />
              </View>
            )}

            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={styles.row}>
                <Text style={styles.equipmentName}>{item.equipment.name}</Text>
                <Text style={styles.equipmentCode}>{item.equipment.code}</Text>

                <View style={[styles.badge, { backgroundColor: st.bg }]}>
                  <Text style={[styles.badgeText, { color: st.fg }]}>
                    {STATUS_LABELS[item.status]}
                  </Text>
                </View>

                {item.priority && (
                  <View style={[styles.badge, { backgroundColor: prio!.bg }]}>
                    <Text style={[styles.badgeText, { color: prio!.fg }]}>
                      Prioridad {PRIORITY_LABELS[item.priority]}
                    </Text>
                  </View>
                )}
              </View>

              <Text style={styles.desc}>{item.description}</Text>

              {item.status === "rejected" && item.motivo_rechazo && (
                <View style={styles.rejectedBox}>
                  <Text style={styles.rejectedText}>
                    Motivo del rechazo: {item.motivo_rechazo}
                    {item.comentario_rechazo ? ` — ${item.comentario_rechazo}` : ""}
                  </Text>
                </View>
              )}

              {item.photo_urls.length > 1 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.gallery}
                  contentContainerStyle={styles.galleryContent}
                >
                  {item.photo_urls.map((url) => (
                    <Image key={url} source={{ uri: url }} style={styles.galleryPhoto} />
                  ))}
                </ScrollView>
              )}

              <View style={styles.metaRow}>
                <Text style={styles.meta}>Reportó · {item.reporterName}</Text>
                <Text style={styles.meta}>
                  {new Date(item.created_at).toLocaleDateString("es-AR")}
                </Text>
                <Text style={styles.meta}>Técnicos · {item.technicianName ?? "Sin asignar"}</Text>
              </View>
            </View>

            {onSelect && (
              <ViewButton onPress={() => onSelect(item)} colors={colors} styles={styles} />
            )}
          </Card>
        );
      })}
    </View>
  );
}

// Same eye button as the equipment table's "Ver detalle" action.
function ViewButton({
  onPress,
  colors,
  styles,
}: {
  onPress: () => void;
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
}) {
  const [hover, setHover] = useState(false);

  return (
    <Tooltip text="Ver detalle" align="right">
      <Pressable
        style={[styles.viewButton, hover && styles.viewButtonHover]}
        onPress={onPress}
        onHoverIn={() => setHover(true)}
        onHoverOut={() => setHover(false)}
        hitSlop={6}
        accessibilityLabel="Ver detalle"
      >
        <EyeIcon size={16} color={colors.accent} />
      </Pressable>
    </Tooltip>
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
      padding: 16,
    },
    iconWrap: {
      width: 42,
      height: 42,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.bgNested,
    },
    photo: { width: 42, height: 42, borderRadius: 10, backgroundColor: c.bgNested },
    row: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
    equipmentName: { fontWeight: "600", fontSize: 14.5, color: c.text },
    equipmentCode: { fontFamily: "monospace", fontSize: 12.5, color: c.textMuted },
    badge: { paddingHorizontal: 11, paddingVertical: 3.5, borderRadius: 999 },
    badgeText: { fontSize: 12.5, fontWeight: "600" },
    desc: { marginTop: 6, fontSize: 13.5, color: c.textLabel, lineHeight: 19 },
    rejectedBox: {
      marginTop: 8,
      backgroundColor: c.bgNested,
      borderRadius: 10,
      borderLeftWidth: 3,
      borderLeftColor: c.destructive,
      paddingVertical: 7,
      paddingHorizontal: 10,
    },
    rejectedText: { fontSize: 12.5, color: c.text, lineHeight: 17 },
    // Twitter-style side-scroll: all the solicitud's photos, swipeable.
    gallery: { marginTop: 10 },
    galleryContent: { gap: 8, paddingRight: 4 },
    galleryPhoto: { width: 96, height: 96, borderRadius: 10, backgroundColor: c.bgNested },
    metaRow: { marginTop: 8, flexDirection: "row", gap: 16, flexWrap: "wrap" },
    meta: { fontSize: 13, color: c.textMuted },
    viewButton: {
      width: 36,
      height: 36,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      alignSelf: "center",
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
    },
    viewButtonHover: { backgroundColor: c.eqOperational.bg, borderColor: c.accent },
  });
}
