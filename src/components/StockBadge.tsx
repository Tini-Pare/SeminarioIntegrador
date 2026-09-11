import { StyleSheet, Text, View } from "react-native";
import type { StockStatus } from "../lib/queries/spareParts";
import { useTheme } from "../lib/ThemeContext";

const LABELS: Record<StockStatus, string> = {
  ok: "Stock OK",
  bajo: "Stock bajo",
  agotado: "Agotado",
};

// Reuses the equipment-status palette: green for healthy, amber for low,
// red for empty — same visual language as the rest of the app.
export function StockBadge({ status }: { status: StockStatus }) {
  const { colors } = useTheme();
  const c =
    status === "ok" ? colors.eqOperational : status === "bajo" ? colors.eqWaiting : colors.eqRepair;

  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <View style={[styles.dot, { backgroundColor: c.dot }]} />

      <Text style={[styles.text, { color: c.fg }]}>{LABELS[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 999,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  text: { fontSize: 12, fontWeight: "600" },
});
