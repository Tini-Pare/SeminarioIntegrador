import type { ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import type { ThemeColors } from "../../lib/theme";
import { useTheme } from "../../lib/ThemeContext";

// The card every Estadísticas block sits in: a title, an optional one-line
// explanation of how the number is computed, and the chart/table.
export function StatPanel({
  title,
  caption,
  right,
  style,
  children,
}: {
  title: string;
  caption?: string;
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  return (
    <View style={[styles.panel, style]}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>{title}</Text>

          {caption && <Text style={styles.caption}>{caption}</Text>}
        </View>

        {right}
      </View>

      {children}
    </View>
  );
}

export function EmptyChart({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <Text style={{ fontSize: 13.5, color: colors.textMuted, paddingVertical: 8 }}>{text}</Text>
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
      minWidth: 0,
    },
    header: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
      marginBottom: 14,
    },
    headerText: { flexShrink: 1, minWidth: 0 },
    title: { fontSize: 15.5, fontWeight: "600", color: c.text },
    caption: { marginTop: 3, fontSize: 12.5, color: c.textMuted, lineHeight: 17 },
  });
}
