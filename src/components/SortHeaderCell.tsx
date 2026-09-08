import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";
import type { SortDir } from "../lib/useTableSort";
import { useTheme } from "../lib/ThemeContext";
import type { ThemeColors } from "../lib/theme";

// A table header cell that doubles as the sort control for its column. Lives
// inside the accent-colored header bar, so the text and arrow are white. The
// arrow shows the current direction when this column is active, and a faint
// up/down hint otherwise.
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
        {active ? (dir === "asc" ? "↑" : "↓") : "↕"}
      </Text>
    </Pressable>
  );
}

function makeStyles(_c: ThemeColors) {
  return StyleSheet.create({
    cell: { flexDirection: "row", alignItems: "center", gap: 4 },
    text: {
      fontSize: 11.5,
      fontWeight: "600",
      letterSpacing: 0.7,
      textTransform: "uppercase",
      color: "#fff",
      fontFamily: "monospace",
    },
    arrow: { fontSize: 11, color: "#fff", fontWeight: "700" },
    arrowInactive: { opacity: 0.45 },
  });
}
