import { View, Text, StyleSheet } from "react-native";
import type { Equipment } from "../types/database";
import { useTheme } from "../lib/ThemeContext";

const LABELS: Record<Equipment["status"], string> = {
  operational: "Funcionando",
  waiting: "En espera",
  repair: "En reparación",
};

export function StatusBadge({ status }: { status: Equipment["status"] }) {
  const { colors } = useTheme();
  const c =
    status === "operational"
      ? colors.eqOperational
      : status === "waiting"
        ? colors.eqWaiting
        : colors.eqRepair;

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
