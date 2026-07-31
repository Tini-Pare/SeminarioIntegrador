import { View, Text, Pressable, StyleSheet } from "react-native";

export function AccountMenu({
  onSettings,
  onLogout,
}: {
  onSettings: () => void;
  onLogout: () => void;
}) {
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

const styles = StyleSheet.create({
  menu: {
    minWidth: 180,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2ddd3",
    borderRadius: 10,
    overflow: "hidden",
  },
  item: { paddingHorizontal: 14, paddingVertical: 12 },
  itemText: { fontSize: 13.5, fontWeight: "600", color: "#17191f" },
  divider: { height: 1, backgroundColor: "#ebe6dc" },
  logoutText: { color: "#c0392b" },
});
