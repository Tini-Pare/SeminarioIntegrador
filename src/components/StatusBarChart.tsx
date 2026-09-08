import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "../lib/ThemeContext";
import type { ThemeColors } from "../lib/theme";

export type StatusBar = { label: string; value: number; color: string };

// Horizontal bar chart for a status breakdown (equipment by state, and later
// requests / work orders). One measure — a count — across a few named
// categories, so bars share a scale and each is direct-labeled; category
// colors come from the theme's status palette, text stays on ink tokens.
export function StatusBarChart({
  title,
  data,
  totalLabel,
}: {
  title: string;
  data: StatusBar[];
  totalLabel?: string;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const total = data.reduce((sum, d) => sum + d.value, 0);
  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>

        {totalLabel != null && (
          <Text style={styles.total}>
            {total} {totalLabel}
          </Text>
        )}
      </View>

      <View style={styles.rows}>
        {data.map((d) => (
          <View key={d.label} style={styles.row}>
            <Text style={styles.rowLabel} numberOfLines={1}>
              {d.label}
            </Text>

            <View style={styles.track}>
              <View
                style={[
                  styles.fill,
                  {
                    backgroundColor: d.color,
                    width: `${(d.value / max) * 100}%`,
                    minWidth: d.value > 0 ? 4 : 0,
                  },
                ]}
              />
            </View>

            <Text style={styles.value}>{d.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    panel: {
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 14,
      padding: 16,
      marginBottom: 20,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      marginBottom: 16,
    },
    title: { fontSize: 15.5, fontWeight: "600", color: c.text },
    total: { fontSize: 13, fontWeight: "500", color: c.textMuted },
    rows: { gap: 14 },
    row: { flexDirection: "row", alignItems: "center", gap: 12 },
    rowLabel: { width: 104, fontSize: 13, color: c.textSecondary, fontWeight: "500" },
    track: {
      flex: 1,
      height: 24,
      borderRadius: 7,
      backgroundColor: c.bgNested,
      overflow: "hidden",
    },
    fill: { height: "100%", borderRadius: 7 },
    value: { width: 28, textAlign: "right", fontSize: 14, fontWeight: "700", color: c.text },
  });
}
