import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import type { ThemeColors } from "../lib/theme";
import { useTheme } from "../lib/ThemeContext";

// The "Cancelar" / "Confirmar" pair that closes every form, so all of them
// look and behave the same. The labels are fixed on purpose: every form
// confirms with "Confirmar" (only the in-progress label changes, e.g.
// "Guardando…"). While `busy`, both buttons are disabled so the form can't
// be closed or submitted twice mid-save; `disabled` greys out only
// "Confirmar", for a form that isn't valid yet, and `cancelDisabled` only
// "Cancelar", for work that mustn't be abandoned halfway (e.g. a photo
// still being processed).
export function FormFooter({
  onCancel,
  onConfirm,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  busy = false,
  busyLabel = "Guardando…",
  disabled = false,
  cancelDisabled = false,
  align = "stretch",
}: {
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  busyLabel?: string;
  disabled?: boolean;
  cancelDisabled?: boolean;
  // "stretch": each button takes half the width (modals).
  // "end": fixed-width buttons aligned right (full-screen forms).
  align?: "stretch" | "end";
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const confirmDisabled = busy || disabled;
  const cancelBlocked = busy || cancelDisabled;
  const buttonSize = align === "end" ? styles.buttonEnd : styles.buttonStretch;

  return (
    <View style={[styles.actions, align === "end" && styles.actionsEnd]}>
      <Pressable
        style={[styles.button, buttonSize, styles.cancelButton, cancelBlocked && styles.disabled]}
        onPress={onCancel}
        disabled={cancelBlocked}
        accessibilityRole="button"
        aria-disabled={cancelBlocked}
      >
        <Text style={styles.text}>{cancelLabel}</Text>
      </Pressable>

      <Pressable
        style={[styles.button, buttonSize, styles.confirmButton, disabled && styles.disabled]}
        onPress={onConfirm}
        disabled={confirmDisabled}
        accessibilityRole="button"
        aria-disabled={confirmDisabled}
      >
        <Text style={styles.text}>{busy ? busyLabel : confirmLabel}</Text>
      </Pressable>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    actions: { flexDirection: "row", gap: 10, marginTop: 24 },
    actionsEnd: { justifyContent: "flex-end" },
    button: {
      height: 44,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    buttonStretch: { flex: 1 },
    buttonEnd: { minWidth: 150, paddingHorizontal: 24 },
    cancelButton: { backgroundColor: "#dc2626" },
    confirmButton: { backgroundColor: c.accent },
    disabled: {
      opacity: 0.45,
      ...(Platform.OS === "web" ? ({ cursor: "not-allowed" } as object) : {}),
    },
    text: { color: "#fff", fontWeight: "600" },
  });
}
