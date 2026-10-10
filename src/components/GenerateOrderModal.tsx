import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import type { ThemeColors } from "../lib/theme";
import { useTheme } from "../lib/ThemeContext";
import type { Solicitud } from "../types/database";

type Priority = Exclude<Solicitud["priority"], null>;

const PRIORITIES: Priority[] = ["low", "medium", "high"];
const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
};

// SCRUM-24: confirmation step before generating una orden_de_trabajo from a
// solicitud pendiente. The OT is created empty (just the solicitud's data
// and the prioridad); tareas, técnicos and falla genérica are loaded
// afterwards on the OT screen, where the caller navigates on confirm.
// Prioridad is the only thing asked here because ot_prioridad is required
// and the admin must always pick it explicitly (no default).
export function GenerateOrderModal({
  visible,
  onClose,
  onConfirm,
  equipmentLabel,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (input: { priority: Priority }) => void | Promise<void>;
  equipmentLabel: string;
}) {
  const [priority, setPriority] = useState<Priority | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  // Same palette as the priority badges on the solicitudes/OT lists.
  const priorityColors: Record<Priority, { bg: string; fg: string }> = {
    low: colors.urgencyLow,
    medium: colors.urgencyMedium,
    high: colors.urgencyHigh,
  };

  useEffect(() => {
    if (!visible) return;
    setPriority(null);
    setConfirming(false);
    setError(null);
  }, [visible]);

  async function handleConfirm() {
    if (!priority) {
      setError("Elegí una prioridad.");
      return;
    }
    setConfirming(true);
    setError(null);
    try {
      await onConfirm({ priority });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setConfirming(false);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => !confirming && onClose()}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Generar orden de trabajo</Text>

          <Text style={styles.subtitle}>{equipmentLabel}</Text>

          <Text style={styles.message}>
            ¿Generar la orden de trabajo para esta solicitud? Después vas a ir a la pantalla de la
            orden para cargarle las tareas, los técnicos y la falla genérica.
          </Text>

          <Text style={styles.label}>Prioridad</Text>

          <View style={styles.chipsRow}>
            {PRIORITIES.map((p) => {
              const selected = priority === p;
              return (
                <Pressable
                  key={p}
                  style={[
                    styles.chip,
                    selected && {
                      backgroundColor: priorityColors[p].bg,
                      borderColor: priorityColors[p].fg,
                    },
                  ]}
                  onPress={() => {
                    setPriority(p);
                    if (error) setError(null);
                  }}
                >
                  <Text
                    style={[
                      styles.chipText,
                      selected && [styles.chipTextSelected, { color: priorityColors[p].fg }],
                    ]}
                  >
                    {PRIORITY_LABELS[p]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.actions}>
            <Pressable style={styles.cancelButton} onPress={onClose} disabled={confirming}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </Pressable>

            <Pressable style={styles.confirmButton} onPress={handleConfirm} disabled={confirming}>
              <Text style={styles.confirmText}>{confirming ? "Generando…" : "Confirmar"}</Text>
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
    message: { marginTop: 16, fontSize: 14, color: c.textLabel, lineHeight: 20 },
    label: {
      fontSize: 12.5,
      fontWeight: "600",
      color: c.textLabel,
      marginTop: 18,
      marginBottom: 8,
    },
    chipsRow: { flexDirection: "row", gap: 8 },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: c.borderInput,
      backgroundColor: c.bgInput,
    },
    chipText: { fontSize: 13, color: c.textLabel },
    chipTextSelected: { fontWeight: "600" },
    error: { color: c.destructive, marginTop: 12, fontSize: 13 },
    actions: { flexDirection: "row", gap: 10, marginTop: 24 },
    cancelButton: {
      flex: 1,
      height: 44,
      borderRadius: 10,
      backgroundColor: "#dc2626",
      alignItems: "center",
      justifyContent: "center",
    },
    cancelText: { color: "#fff", fontWeight: "600" },
    confirmButton: {
      flex: 1,
      height: 44,
      borderRadius: 10,
      backgroundColor: c.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    confirmText: { color: "#fff", fontWeight: "600" },
  });
}
