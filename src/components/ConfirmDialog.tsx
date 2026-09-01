import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import type { ThemeColors } from "../lib/theme";
import { useTheme } from "../lib/ThemeContext";

// In-app replacement for window.confirm/Alert.alert, so confirmations look
// like the rest of the UI instead of a browser dialog. Purely presentational:
// the caller owns the visibility and both callbacks.
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = "ACEPTAR",
  cancelLabel = "CANCELAR",
  busy = false,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        // Android back button / Esc: ignore it while the action is running so
        // the dialog can't be dismissed mid-request.
        if (!busy) onCancel();
      }}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>

          <Text style={styles.message}>{message}</Text>

          <View style={styles.actions}>
            <Pressable style={styles.cancelButton} onPress={onCancel} disabled={busy}>
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </Pressable>

            <Pressable style={styles.acceptButton} onPress={onConfirm} disabled={busy}>
              <Text style={styles.acceptText}>{busy ? "Procesando…" : confirmLabel}</Text>
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
      backgroundColor: "rgba(0,0,0,0.45)",
      justifyContent: "center",
      alignItems: "center",
      padding: 20,
    },
    sheet: {
      backgroundColor: c.bgModal,
      borderRadius: 16,
      padding: 24,
      width: "100%",
      maxWidth: 420,
      borderWidth: 1,
      borderColor: c.border,
    },
    title: { fontSize: 18, fontWeight: "600", color: c.text, marginBottom: 10 },
    message: { fontSize: 14.5, lineHeight: 21, color: c.textSecondary, marginBottom: 24 },
    actions: { flexDirection: "row", gap: 12, justifyContent: "flex-end" },
    cancelButton: {
      flex: 1,
      height: 42,
      borderRadius: 10,
      backgroundColor: "#dc2626",
      alignItems: "center",
      justifyContent: "center",
    },
    cancelText: { color: "#fff", fontWeight: "600", fontSize: 13.5 },
    acceptButton: {
      flex: 1,
      height: 42,
      borderRadius: 10,
      backgroundColor: c.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    acceptText: { color: "#fff", fontWeight: "600", fontSize: 13.5 },
  });
}
