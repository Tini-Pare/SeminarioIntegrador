import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { listFaultTypes } from "../lib/queries/faultTypes";
import type { ThemeColors } from "../lib/theme";
import { useTheme } from "../lib/ThemeContext";
import type { Fallo, Solicitud } from "../types/database";
import { Select } from "./Select";

type Priority = Exclude<Solicitud["priority"], null>;

const PRIORITIES: Priority[] = ["low", "medium", "high"];
const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
};

// Shown when a technician takes ("Asignarme") a solicitud: this is the
// first moment anyone has actually looked at the equipment, so it's also
// where the orden_de_trabajo gets both its diagnosis and its priority —
// the employee who reported it only described symptoms ("no enfría") and
// has every incentive to call it urgent, so neither ever came from them.
export function AssignOrderModal({
  visible,
  onClose,
  onConfirm,
  equipmentLabel,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (input: { faultTypeId: number | null; priority: Priority }) => void | Promise<void>;
  equipmentLabel: string;
}) {
  const [faultTypes, setFaultTypes] = useState<Fallo[]>([]);
  const [faultTypeId, setFaultTypeId] = useState<number | null>(null);
  const [priority, setPriority] = useState<Priority>("medium");
  const [confirming, setConfirming] = useState(false);
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  useEffect(() => {
    if (!visible) return;
    setFaultTypeId(null);
    setPriority("medium");
    setConfirming(false);
    listFaultTypes()
      .then((all) => setFaultTypes(all.filter((f) => f.fa_estado === "activo")))
      .catch(() => setFaultTypes([]));
  }, [visible]);

  const faultTypeOptions = faultTypes.map((f) => ({ value: f.fa_id_fallo, label: f.fa_nombre }));

  async function handleConfirm() {
    setConfirming(true);
    try {
      await onConfirm({ faultTypeId, priority });
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
          <Text style={styles.title}>Asignarme esta solicitud</Text>
          <Text style={styles.subtitle}>{equipmentLabel}</Text>

          <Text style={styles.label}>Falla genérica (opcional)</Text>
          <Select
            value={faultTypeId}
            onChange={setFaultTypeId}
            options={faultTypeOptions}
            placeholder={
              faultTypeOptions.length > 0 ? "Elegí un tipo de falla" : "No hay fallas cargadas"
            }
            disabled={faultTypeOptions.length === 0}
          />

          <Text style={styles.hint}>
            Elegila si ya viste el equipo y sabés qué falla es. Si todavía no la diagnosticaste,
            podés dejarla sin elegir.
          </Text>

          <Text style={styles.label}>Prioridad</Text>
          <View style={styles.chipsRow}>
            {PRIORITIES.map((p) => (
              <Pressable
                key={p}
                style={[
                  styles.chip,
                  priority === p && { backgroundColor: colors.accent, borderColor: colors.accent },
                ]}
                onPress={() => setPriority(p)}
              >
                <Text style={[styles.chipText, priority === p && styles.chipTextSelected]}>
                  {PRIORITY_LABELS[p]}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.hint}>
            La define quien evalúa la solicitud, no quien la reportó — así no queda a criterio de
            alguien con motivos para marcar todo como urgente.
          </Text>

          <View style={styles.actions}>
            <Pressable style={styles.cancelButton} onPress={onClose} disabled={confirming}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </Pressable>

            <Pressable style={styles.confirmButton} onPress={handleConfirm} disabled={confirming}>
              <Text style={styles.confirmText}>{confirming ? "Asignando…" : "Confirmar"}</Text>
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
    hint: { marginTop: 8, fontSize: 12.5, color: c.textMuted, lineHeight: 17 },
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
    chipTextSelected: { color: "#fff", fontWeight: "600" },
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
