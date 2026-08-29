import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../lib/ThemeContext";
import type { ThemeColors } from "../lib/theme";

// Prev / next pager shown under a paginated list. Renders nothing while
// everything fits on a single page.
export function Pagination({
  page,
  pageCount,
  onPage,
}: {
  page: number;
  pageCount: number;
  onPage: (p: number) => void;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  if (pageCount <= 1) return null;

  return (
    <View style={styles.wrap}>
      <Pressable
        style={[styles.button, page <= 1 && styles.disabled]}
        onPress={() => onPage(page - 1)}
        disabled={page <= 1}
        accessibilityLabel="Página anterior"
      >
        <Text style={styles.buttonText}>‹ Anterior</Text>
      </Pressable>

      <Text style={styles.status}>
        Página {page} de {pageCount}
      </Text>

      <Pressable
        style={[styles.button, page >= pageCount && styles.disabled]}
        onPress={() => onPage(page + 1)}
        disabled={page >= pageCount}
        accessibilityLabel="Página siguiente"
      >
        <Text style={styles.buttonText}>Siguiente ›</Text>
      </Pressable>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: 10,
      marginTop: 16,
    },
    button: {
      paddingHorizontal: 14,
      height: 38,
      borderRadius: 9,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.bgCard,
      alignItems: "center",
      justifyContent: "center",
    },
    buttonText: { fontSize: 13, fontWeight: "600", color: c.text },
    status: { fontSize: 12.5, color: c.textSecondary, fontWeight: "500" },
    disabled: { opacity: 0.4 },
  });
}
