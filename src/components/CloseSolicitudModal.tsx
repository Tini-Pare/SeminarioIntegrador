import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { closeSolicitud } from "../lib/queries/faults";
import type { ThemeColors } from "../lib/theme";
import { useTheme } from "../lib/ThemeContext";

// SCRUM-27: cierra una solicitud pendiente sin generar una orden de
// trabajo (duplicada, falsa alarma, se resolvió sin intervención técnica).
export function CloseSolicitudModal({
  visible,
  solicitudId,
  onClose,
  onClosed,
}: {
  visible: boolean;
  solicitudId: number | null;
  onClose: () => void;
  onClosed: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  useEffect(() => {
    if (!visible) return;
    setMotivo("");
    setError(null);
  }, [visible]);

  async function handleClose() {
    if (solicitudId == null) return;
    if (!motivo.trim()) {
      setError("Indicá el motivo del cierre.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await closeSolicitud(solicitudId, motivo);
      onClosed();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Cerrar solicitud sin OT</Text>

          <Text style={styles.subtitle}>
            La solicitud queda como resuelta sin generar una orden de trabajo.
          </Text>

          <Text style={styles.label}>Motivo</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            value={motivo}
            onChangeText={setMotivo}
            placeholder="Ej: duplicada, falsa alarma, se resolvió sin intervención"
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={3}
            maxLength={255}
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.actions}>
            <Pressable style={styles.cancelButton} onPress={onClose} disabled={saving}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </Pressable>

            <Pressable style={styles.closeButton} onPress={handleClose} disabled={saving}>
              <Text style={styles.closeText}>{saving ? "Cerrando…" : "Cerrar solicitud"}</Text>
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
      backgroundColor: c.bgModal,
      borderRadius: 16,
      padding: 24,
      width: "100%",
      maxWidth: 440,
      alignSelf: "center",
    },
    title: { fontSize: 18, fontWeight: "600", color: c.text },
    subtitle: { marginTop: 2, fontSize: 13, color: c.textMuted },
    label: {
      fontSize: 12.5,
      fontWeight: "600",
      color: c.textLabel,
      marginTop: 18,
      marginBottom: 8,
    },
    input: {
      minHeight: 42,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: c.borderInput,
      borderRadius: 10,
      backgroundColor: c.bgInput,
      fontSize: 14,
      color: c.text,
    },
    inputMultiline: { minHeight: 76, textAlignVertical: "top" },
    error: { color: c.destructive, marginTop: 12, fontSize: 13 },
    actions: { flexDirection: "row", gap: 10, marginTop: 24 },
    cancelButton: {
      flex: 1,
      height: 44,
      borderRadius: 10,
      backgroundColor: c.bgNested,
      alignItems: "center",
      justifyContent: "center",
    },
    cancelText: { color: c.text, fontWeight: "600" },
    closeButton: {
      flex: 1,
      height: 44,
      borderRadius: 10,
      backgroundColor: "#dc2626",
      alignItems: "center",
      justifyContent: "center",
    },
    closeText: { color: "#fff", fontWeight: "600" },
  });
}
