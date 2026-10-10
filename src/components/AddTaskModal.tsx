import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { listActiveTaskCountsByTechnician } from "../lib/queries/faults";
import { createGeneralTask, listGeneralTasks } from "../lib/queries/generalTasks";
import { listProfiles } from "../lib/queries/profiles";
import type { ThemeColors } from "../lib/theme";
import { useTheme } from "../lib/ThemeContext";
import type { Profile, TareaGeneral } from "../types/database";
import { Select } from "./Select";
import { TaskCombobox } from "./TaskCombobox";

// Agrega una tarea (genérica del catálogo o escrita a mano, con su propio técnico)
// a una OT que ya existe.
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
  const [taskName, setTaskName] = useState<string>("");
  const [technicianId, setTechnicianId] = useState<string | null>(null);
  const [openField, setOpenField] = useState<"task" | "technician" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  useEffect(() => {
    if (!visible) return;
    setTaskId(null);
    setTaskName("");
    setTechnicianId(null);
    setOpenField(null);
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
  const technicianOptions = technicians.map((t) => {
    const count = workload[t.id] ?? 0;
    // listActiveTaskCountsByTechnician counts open tareas, not OTs.
    const countLabel = count === 1 ? "1 tarea activa" : `${count} tareas activas`;
    return {
      value: t.id,
      label: `${t.name} · ${countLabel}`,
    };
  });

  async function handleConfirm() {
    const trimmed = taskName.trim();
    if (!trimmed || !technicianId) {
      setError("Elegí o escribí una tarea y seleccioná un técnico.");
      return;
    }

    setConfirming(true);
    setError(null);

    try {
      let finalTaskId: number;
      const matched = generalTasks.find(
        (t) => t.tag_nombre_tarea.trim().toLowerCase() === trimmed.toLowerCase(),
      );

      if (matched) {
        finalTaskId = matched.tag_id_tarea;
      } else {
        const created = await createGeneralTask({
          name: trimmed,
          description: null,
          estado: "activo",
        });
        finalTaskId = created.tag_id_tarea;
      }

      await onConfirm({ taskId: finalTaskId, technicianId });
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

          <View style={[styles.fieldWrap, openField === "task" && styles.fieldWrapRaised]}>
            <TaskCombobox
              value={taskName}
              onChangeText={(text) => {
                setTaskName(text);
                setTaskId(null);
              }}
              options={taskOptions}
              onSelectOption={(opt) => {
                setTaskName(opt.label);
                setTaskId(opt.value);
              }}
              placeholder="Escribí o elegí una tarea"
              open={openField === "task"}
              onOpenChange={(o) => setOpenField(o ? "task" : null)}
            />
          </View>

          <Text style={styles.label}>Técnico</Text>

          <View style={[styles.fieldWrap, openField === "technician" && styles.fieldWrapRaised]}>
            <Select
              value={technicianId}
              onChange={setTechnicianId}
              options={technicianOptions}
              placeholder={technicianOptions.length > 0 ? "Elegí un técnico" : "No hay técnicos"}
              disabled={technicianOptions.length === 0}
              open={openField === "technician"}
              onOpenChange={(o) => setOpenField(o ? "technician" : null)}
            />
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.actions}>
            <Pressable style={styles.cancelButton} onPress={onClose} disabled={confirming}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </Pressable>

            <Pressable style={styles.confirmButton} onPress={handleConfirm} disabled={confirming}>
              <Text style={styles.confirmText}>{confirming ? "Agregando…" : "Confirmar"}</Text>
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
      position: "relative",
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
    fieldWrap: {
      position: "relative",
      zIndex: 1,
    },
    fieldWrapRaised: {
      zIndex: 50,
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
