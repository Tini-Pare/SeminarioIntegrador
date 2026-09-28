import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { listActiveTaskCountsByTechnician } from "../lib/queries/faults";
import { listProfiles } from "../lib/queries/profiles";
import type { ThemeColors } from "../lib/theme";
import { useTheme } from "../lib/ThemeContext";
import type { Profile } from "../types/database";
import { Select } from "./Select";

// SCRUM-26: reasigna el técnico de una tarea puntual dentro de una OT ya
// generada — cada tarea tiene su propio técnico, no toda la OT — mostrando
// la carga actual de cada uno para decidir si le conviene tomar más
// trabajo.
export function ReassignTechnicianModal({
  visible,
  onClose,
  onConfirm,
  equipmentLabel,
  taskLabel,
  currentTechnicianId,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (technicianId: string) => void | Promise<void>;
  equipmentLabel: string;
  taskLabel: string;
  currentTechnicianId: string | null;
}) {
  const [technicians, setTechnicians] = useState<Profile[]>([]);
  const [workload, setWorkload] = useState<Record<string, number>>({});
  const [technicianId, setTechnicianId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  useEffect(() => {
    if (!visible) return;
    setTechnicianId(currentTechnicianId);
    setConfirming(false);
    setError(null);
    Promise.all([listProfiles(), listActiveTaskCountsByTechnician()])
      .then(([profiles, counts]) => {
        setTechnicians(profiles.filter((p) => p.role === "technician" && p.active));
        setWorkload(counts);
      })
      .catch(() => {
        setTechnicians([]);
        setWorkload({});
      });
  }, [visible, currentTechnicianId]);

  const technicianOptions = technicians.map((t) => ({
    value: t.id,
    label: `${t.name} — ${workload[t.id] ?? 0} activa${(workload[t.id] ?? 0) === 1 ? "" : "s"}`,
  }));

  async function handleConfirm() {
    if (!technicianId) {
      setError("Elegí un técnico responsable.");
      return;
    }
    setConfirming(true);
    setError(null);
    try {
      await onConfirm(technicianId);
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
          <Text style={styles.title}>Reasignar técnico</Text>
          <Text style={styles.subtitle}>
            {equipmentLabel} · {taskLabel}
          </Text>

          <Text style={styles.label}>Técnico responsable</Text>
          <Select
            value={technicianId}
            onChange={setTechnicianId}
            options={technicianOptions}
            placeholder={
              technicianOptions.length > 0 ? "Elegí un técnico" : "No hay técnicos activos"
            }
            disabled={technicianOptions.length === 0}
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.actions}>
            <Pressable style={styles.cancelButton} onPress={onClose} disabled={confirming}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </Pressable>

            <Pressable style={styles.confirmButton} onPress={handleConfirm} disabled={confirming}>
              <Text style={styles.confirmText}>{confirming ? "Guardando…" : "Reasignar"}</Text>
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
