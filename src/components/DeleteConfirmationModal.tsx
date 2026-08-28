import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../lib/ThemeContext";
import type { ThemeColors } from "../lib/theme";

export function DeleteConfirmationModal({
  visible,
  title,
  message,
  deleting,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  message: string;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          <View style={styles.actions}>
            <Pressable style={styles.cancelButton} onPress={onCancel} disabled={deleting}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </Pressable>

            <Pressable style={styles.deleteButton} onPress={onConfirm} disabled={deleting}>
              <Text style={styles.deleteText}>{deleting ? "Eliminando…" : "Eliminar"}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.55)",
      justifyContent: "center",
      padding: 20,
    },
    sheet: {
      width: "100%",
      maxWidth: 420,
      alignSelf: "center",
      padding: 24,
      backgroundColor: c.bgModal,
      borderRadius: 16,
    },
    title: { color: c.text, fontSize: 19, fontWeight: "600" },
    message: { color: c.textSecondary, fontSize: 14, lineHeight: 21, marginTop: 10 },
    actions: { flexDirection: "row", gap: 10, marginTop: 24 },
    cancelButton: {
      flex: 1,
      height: 44,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.borderInput,
      alignItems: "center",
      justifyContent: "center",
    },
    cancelText: { color: c.textLabel, fontWeight: "600" },
    deleteButton: {
      flex: 1,
      height: 44,
      borderRadius: 10,
      backgroundColor: c.destructive,
      alignItems: "center",
      justifyContent: "center",
    },
    deleteText: { color: "#fff", fontWeight: "600" },
  });
}
