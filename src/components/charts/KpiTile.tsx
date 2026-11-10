import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { ThemeColors } from "../../lib/theme";
import { useTheme } from "../../lib/ThemeContext";

// A headline number: one value doesn't need a chart.
export function KpiTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  return (
    <View style={styles.tile}>
      <Text style={styles.label}>{label}</Text>

      <Text style={styles.value} numberOfLines={1}>
        {value}
      </Text>

      {hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

export function KpiRow({ children }: { children: ReactNode }) {
  return <View style={rowStyles.row}>{children}</View>;
}

const rowStyles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
});

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    tile: {
      flexGrow: 1,
      flexBasis: 200,
      backgroundColor: c.bgStatCard,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 14,
      minWidth: 0,
    },
    label: {
      fontSize: 11.5,
      fontWeight: "600",
      letterSpacing: 0.4,
      textTransform: "uppercase",
      color: c.textMuted,
    },
    value: {
      marginTop: 6,
      fontSize: 26,
      fontWeight: "700",
      letterSpacing: -0.5,
      color: c.text,
      fontVariant: ["tabular-nums"],
    },
    hint: { marginTop: 4, fontSize: 12.5, color: c.textSecondary, lineHeight: 17 },
  });
}
