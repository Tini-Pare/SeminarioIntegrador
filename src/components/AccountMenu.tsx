import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../lib/ThemeContext";
import type { ThemeColors } from "../lib/theme";

export function AccountMenu({
  onSettings,
  onLogout,
}: {
  onSettings: () => void;
  onLogout: () => void;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  return (
    <View style={styles.menu}>
      <Pressable style={styles.item} onPress={onSettings}>
        <Text style={styles.itemText}>Configuración</Text>
      </Pressable>

      <View style={styles.divider} />

      <Pressable style={styles.item} onPress={onLogout}>
        <Text style={[styles.itemText, styles.logoutText]}>Cerrar sesión</Text>
      </Pressable>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    menu: {
      minWidth: 180,
      backgroundColor: c.bgModal,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      overflow: "hidden",
    },
    item: { paddingHorizontal: 14, paddingVertical: 12 },
    itemText: { fontSize: 13.5, fontWeight: "600", color: c.text },
    divider: { height: 1, backgroundColor: c.borderRow },
    logoutText: { color: c.destructive },
  });
}
