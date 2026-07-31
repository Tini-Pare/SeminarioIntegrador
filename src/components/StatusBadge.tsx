import { View, Text, StyleSheet } from "react-native";
import type { Equipment } from "../types/database";

const LABELS: Record<Equipment["status"], string> = {
  operational: "Funcionando",
  waiting: "En espera",
  repair: "En reparación",
};
const COLORS: Record<Equipment["status"], { bg: string; fg: string; dot: string }> = {
  operational: { bg: "#d2ecdb", fg: "#1e7f47", dot: "#22a45d" },
  waiting: { bg: "#f5e6cf", fg: "#8a5a15", dot: "#d9962a" },
  repair: { bg: "#f5dcdc", fg: "#c0392b", dot: "#d24141" },
};

export function StatusBadge({ status }: { status: Equipment["status"] }) {
  const c = COLORS[status];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <View style={[styles.dot, { backgroundColor: c.dot }]} />
      <Text style={[styles.text, { color: c.fg }]}>{LABELS[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  text: { fontSize: 12, fontWeight: "600" },
});
