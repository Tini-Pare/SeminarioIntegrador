import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";
import type { SortDir } from "../lib/useTableSort";
import { useTheme } from "../lib/ThemeContext";
import type { ThemeColors } from "../lib/theme";

// A table header cell that doubles as the sort control for its column. Lives
// inside the accent-colored header bar, so the text and triangle are white.
// The triangle points the current direction when this column is active, and
// shows a dimmed hollow triangle otherwise.
export function SortHeaderCell({
  label,
  field,
  activeField,
  dir,
  onSort,
  style,
}: {
  label: string;
  field: string;
  activeField: string;
  dir: SortDir;
  onSort: (field: string) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const active = field === activeField;

  return (
    <Pressable
      style={[styles.cell, style]}
      onPress={() => onSort(field)}
      accessibilityLabel={`Ordenar por ${label}`}
    >
      <Text style={styles.text} numberOfLines={1}>
        {label}
      </Text>

      <Text style={[styles.arrow, !active && styles.arrowInactive]}>
        {active ? (dir === "asc" ? "▲" : "▼") : "▽"}
      </Text>
    </Pressable>
  );
}

function makeStyles(_c: ThemeColors) {
  return StyleSheet.create({
    cell: { flexDirection: "row", alignItems: "center", gap: 5 },
    text: {
      fontSize: 13.5,
      fontWeight: "700",
      letterSpacing: 0.6,
      textTransform: "uppercase",
      color: "#fff",
      fontFamily: "monospace",
    },
    // Triangle glyphs render a hair below the text baseline; nudge them up
    // so they line up with the label.
    arrow: {
      fontSize: 13,
      color: "#fff",
      fontWeight: "700",
      lineHeight: 13,
      transform: [{ translateY: -1.5 }],
    },
    arrowInactive: { opacity: 0.55 },
  });
}
