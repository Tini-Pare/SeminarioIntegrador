import { useEffect, useState } from "react";
import { Modal, StyleSheet, Text, TextInput, View } from "react-native";
import { resolvePurchaseOrder } from "../lib/queries/purchaseOrders";
import type { ThemeColors } from "../lib/theme";
import { useTheme } from "../lib/ThemeContext";
import { FormFooter } from "./FormFooter";

export function RejectPurchaseOrderModal({
  visible,
  pedidoId,
  onClose,
  onResolved,
}: {
  visible: boolean;
  pedidoId: number | null;
  onClose: () => void;
  onResolved: () => void;
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

  async function handleReject() {
    if (pedidoId == null) return;
    if (!motivo.trim()) {
      setError("Indicá el motivo del rechazo.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await resolvePurchaseOrder(pedidoId, "rechazado", motivo);
      onResolved();
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
          <Text style={styles.title}>Rechazar pedido</Text>

          <Text style={styles.subtitle}>El técnico va a ver el motivo que ingreses acá.</Text>

          <Text style={styles.label}>Motivo</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            value={motivo}
            onChangeText={setMotivo}
            placeholder="Ej: sin presupuesto este mes"
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={3}
            maxLength={255}
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <FormFooter
            onCancel={onClose}
            onConfirm={handleReject}
            busy={saving}
            busyLabel="Rechazando…"
          />
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
  });
}
