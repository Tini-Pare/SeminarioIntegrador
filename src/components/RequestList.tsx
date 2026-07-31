import { View, Text, Image, StyleSheet } from "react-native";
import type { Fault, Equipment } from "../types/database";
import { WarningIcon } from "./icons";
import { useTheme } from "../lib/ThemeContext";
import type { ThemeColors } from "../lib/theme";

type Item = Fault & {
  equipment: Pick<Equipment, "code" | "name">;
  reporterName: string;
  technicianName: string | null;
};

const STATUS_LABELS: Record<Fault["status"], string> = {
  new: "Nueva",
  assigned: "Asignada",
  in_progress: "En curso",
  resolved: "Resuelta",
};

export function RequestList({ items }: { items: Item[] }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const faultStatus = {
    new: colors.faultNew,
    assigned: colors.faultAssigned,
    in_progress: colors.faultInProgress,
    resolved: colors.faultResolved,
  };

  const urgency = {
    low: colors.urgencyLow,
    medium: colors.urgencyMedium,
    high: colors.urgencyHigh,
  };

  if (items.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>
          No hay solicitudes todavía. Reportá una falla desde la lista de equipos.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {items.map((item) => {
        const st = faultStatus[item.status];
        const urg = urgency[item.urgency];
        return (
          <View key={item.id} style={styles.card}>
            {item.photo_url ? (
              <Image source={{ uri: item.photo_url }} style={styles.photo} />
            ) : (
              <View style={[styles.iconWrap, { backgroundColor: urg.bg }]}>
                <WarningIcon size={20} color={urg.fg} />
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
              </View>

              <Text style={styles.desc}>{item.description}</Text>

              <View style={styles.metaRow}>
                <Text style={styles.meta}>Reportó · {item.reporterName}</Text>
                <Text style={styles.meta}>
                  {new Date(item.created_at).toLocaleDateString("es-AR")}
                </Text>
                <Text style={styles.meta}>Técnico · {item.technicianName ?? "Sin asignar"}</Text>
              </View>
            </View>
          </View>
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
    iconWrap: { width: 42, height: 42, borderRadius: 10, alignItems: "center", justifyContent: "center" },
    photo: { width: 42, height: 42, borderRadius: 10, backgroundColor: c.bgNested },
    row: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
    equipmentName: { fontWeight: "600", fontSize: 15, color: c.text },
    equipmentCode: { fontFamily: "monospace", fontSize: 12, color: c.textMuted },
    badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
    badgeText: { fontSize: 11.5, fontWeight: "600" },
    desc: { marginTop: 6, fontSize: 13.5, color: c.textLabel, lineHeight: 19 },
    metaRow: { marginTop: 8, flexDirection: "row", gap: 16, flexWrap: "wrap" },
    meta: { fontSize: 12.5, color: c.textMuted },
  });
}
