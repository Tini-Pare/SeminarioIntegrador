import { View, Text, Image, StyleSheet } from "react-native";
import type { Fault, Equipment } from "../types/database";
import { WarningIcon } from "./icons";

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
// Deliberately distinct from equipment.status's palette (green/orange/red
// = equipment health): "Nueva" (red) and "En curso" (orange) used to get
// confused with the equipment's "En reparación"/"En espera". Violet/blue/teal
// here so a fault's color never reads as the equipment's status.
const STATUS_COLORS: Record<Fault["status"], { bg: string; fg: string }> = {
  new: { bg: "#e2dcf3", fg: "#5b3eb8" },
  assigned: { bg: "#dde3f8", fg: "#2f53e0" },
  in_progress: { bg: "#d7f0ec", fg: "#0f766e" },
  resolved: { bg: "#d2ecdb", fg: "#1e7f47" },
};
const URGENCY_COLORS: Record<Fault["urgency"], { bg: string; fg: string }> = {
  low: { bg: "#ecEae4", fg: "#4b5563" },
  medium: { bg: "#f7ecd6", fg: "#9a6512" },
  high: { bg: "#f8e3e3", fg: "#b23636" },
};

export function RequestList({ items }: { items: Item[] }) {
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
        const st = STATUS_COLORS[item.status];
        const urg = URGENCY_COLORS[item.urgency];
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

const styles = StyleSheet.create({
  list: { gap: 12 },
  empty: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#d8d3c9",
    borderRadius: 14,
    padding: 40,
    alignItems: "center",
  },
  emptyText: { color: "#8a8d95", fontSize: 14, textAlign: "center" },
  card: {
    flexDirection: "row",
    gap: 16,
    backgroundColor: "#f8f6f1",
    borderWidth: 1,
    borderColor: "#e2ddd3",
    borderRadius: 14,
    padding: 18,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  photo: { width: 42, height: 42, borderRadius: 10, backgroundColor: "#efebe3" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  equipmentName: { fontWeight: "600", fontSize: 15, color: "#17191f" },
  equipmentCode: { fontFamily: "monospace", fontSize: 12, color: "#9a9da6" },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 11.5, fontWeight: "600" },
  desc: { marginTop: 6, fontSize: 13.5, color: "#4b4e56", lineHeight: 19 },
  metaRow: { marginTop: 8, flexDirection: "row", gap: 16, flexWrap: "wrap" },
  meta: { fontSize: 12.5, color: "#8a8d95" },
});
