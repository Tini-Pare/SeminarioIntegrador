import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { ThemeColors } from "../../lib/theme";
import { useTheme } from "../../lib/ThemeContext";

// A small headline number for inside a panel (an equipo's ficha, the
// pedidos de compra summary) — KpiTile is the big one for a tab's top row.
export function MiniStat({
  label,
  value,
  hint,
  alert = false,
}: {
  label: string;
  value: string;
  hint?: string;
  alert?: boolean;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  return (
    <View style={styles.mini}>
      <Text style={styles.label}>{label}</Text>

      <Text style={[styles.value, alert && styles.valueAlert]} numberOfLines={1}>
        {value}
      </Text>

      {hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

export function MiniStatGrid({ children }: { children: ReactNode }) {
  return <View style={gridStyles.grid}>{children}</View>;
}

const gridStyles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    mini: {
      flexGrow: 1,
      flexBasis: 140,
      backgroundColor: c.bgStatCard,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      padding: 12,
      minWidth: 0,
    },
    label: {
      fontSize: 11,
      fontWeight: "600",
      letterSpacing: 0.4,
      textTransform: "uppercase",
      color: c.textMuted,
    },
    value: {
      marginTop: 4,
      fontSize: 19,
      fontWeight: "700",
      color: c.text,
      fontVariant: ["tabular-nums"],
    },
    valueAlert: { color: c.destructive },
    hint: { marginTop: 2, fontSize: 11.5, color: c.textSecondary },
  });
}
