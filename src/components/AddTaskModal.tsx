import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { listActiveTaskCountsByTechnician } from "../lib/queries/faults";
import { listGeneralTasks } from "../lib/queries/generalTasks";
import { listProfiles } from "../lib/queries/profiles";
import type { ThemeColors } from "../lib/theme";
import { useTheme } from "../lib/ThemeContext";
import type { Profile, TareaGeneral } from "../types/database";
import { Select } from "./Select";

// Agrega una tarea genérica (con su propio técnico) a una OT que ya existe
// — para cuando el admin se da cuenta a mitad de la reparación que hace
// falta otra tarea más, sin tener que tocar las que ya están.
export function AddTaskModal({
  visible,
  onClose,
  onConfirm,
  equipmentLabel,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (input: { taskId: number; technicianId: string }) => void | Promise<void>;
  equipmentLabel: string;
}) {
  const [generalTasks, setGeneralTasks] = useState<TareaGeneral[]>([]);
  const [technicians, setTechnicians] = useState<Profile[]>([]);
  const [workload, setWorkload] = useState<Record<string, number>>({});
  const [taskId, setTaskId] = useState<number | null>(null);
  const [technicianId, setTechnicianId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  useEffect(() => {
    if (!visible) return;
    setTaskId(null);
    setTechnicianId(null);
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
    listGeneralTasks()
      .then((all) => setGeneralTasks(all.filter((t) => t.tag_estado === "activo")))
      .catch(() => setGeneralTasks([]));
  }, [visible]);

  const taskOptions = generalTasks.map((t) => ({
    value: t.tag_id_tarea,
    label: t.tag_nombre_tarea,
  }));
  const technicianOptions = technicians.map((t) => ({
    value: t.id,
    label: `${t.name} — ${workload[t.id] ?? 0} activa${(workload[t.id] ?? 0) === 1 ? "" : "s"}`,
  }));

  async function handleConfirm() {
    if (!taskId || !technicianId) {
      setError("Elegí la tarea y el técnico.");
      return;
    }
    setConfirming(true);
    setError(null);
    try {
      await onConfirm({ taskId, technicianId });
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
          <Text style={styles.title}>Agregar tarea a la orden</Text>
          <Text style={styles.subtitle}>{equipmentLabel}</Text>

          <Text style={styles.label}>Tarea</Text>
          <Select
            value={taskId}
            onChange={setTaskId}
            options={taskOptions}
            placeholder={taskOptions.length > 0 ? "Elegí una tarea" : "No hay tareas cargadas"}
            disabled={taskOptions.length === 0}
          />

          <Text style={styles.label}>Técnico</Text>
          <Select
            value={technicianId}
            onChange={setTechnicianId}
            options={technicianOptions}
            placeholder={technicianOptions.length > 0 ? "Elegí un técnico" : "No hay técnicos"}
            disabled={technicianOptions.length === 0}
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.actions}>
            <Pressable style={styles.cancelButton} onPress={onClose} disabled={confirming}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </Pressable>

            <Pressable style={styles.confirmButton} onPress={handleConfirm} disabled={confirming}>
              <Text style={styles.confirmText}>{confirming ? "Agregando…" : "Agregar"}</Text>
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
