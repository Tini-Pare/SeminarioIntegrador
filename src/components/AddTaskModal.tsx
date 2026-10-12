import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { listActiveTaskCountsByTechnician } from "../lib/queries/faults";
import { createGeneralTask, listGeneralTasks } from "../lib/queries/generalTasks";
import { listProfiles } from "../lib/queries/profiles";
import type { ThemeColors } from "../lib/theme";
import { useTheme } from "../lib/ThemeContext";
import type { Profile, TareaGeneral } from "../types/database";
import { FormFooter } from "./FormFooter";
import { Select } from "./Select";
import { TaskCombobox, type TaskOption } from "./TaskCombobox";

type SelectedTask = { id: number | null; name: string };

// The form groups input while the order still stores one row per task.
export function AddTaskModal({
  visible,
  onClose,
  onConfirm,
  equipmentLabel,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (input: { taskIds: number[]; technicianId: string }) => void | Promise<void>;
  equipmentLabel: string;
}) {
  const [generalTasks, setGeneralTasks] = useState<TareaGeneral[]>([]);
  const [technicians, setTechnicians] = useState<Profile[]>([]);
  const [workload, setWorkload] = useState<Record<string, number>>({});
  const [selectedTasks, setSelectedTasks] = useState<SelectedTask[]>([]);
  const [taskQuery, setTaskQuery] = useState("");
  const [technicianId, setTechnicianId] = useState<string | null>(null);
  const [openField, setOpenField] = useState<"task" | "technician" | null>(null);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [loadingTechnicians, setLoadingTechnicians] = useState(false);
  const [taskLoadFailed, setTaskLoadFailed] = useState(false);
  const [technicianLoadFailed, setTechnicianLoadFailed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    setGeneralTasks([]);
    setTechnicians([]);
    setWorkload({});
    setSelectedTasks([]);
    setTaskQuery("");
    setTechnicianId(null);
    setOpenField(null);
    setConfirming(false);
    setError(null);
    setLoadingTasks(true);
    setLoadingTechnicians(true);
    setTaskLoadFailed(false);
    setTechnicianLoadFailed(false);

    Promise.all([listProfiles(), listActiveTaskCountsByTechnician()])
      .then(([profiles, counts]) => {
        if (!active) return;
        setTechnicians(profiles.filter((p) => p.role === "technician" && p.active));
        setWorkload(counts);
      })
      .catch(() => {
        if (active) {
          setTechnicianLoadFailed(true);
          setError("No se pudieron cargar los técnicos. Cerrá y volvé a abrir.");
        }
      })
      .finally(() => active && setLoadingTechnicians(false));

    listGeneralTasks()
      .then((all) => {
        if (active) setGeneralTasks(all.filter((task) => task.tag_estado === "activo"));
      })
      .catch(() => {
        if (active) {
          setTaskLoadFailed(true);
          setError("No se pudieron cargar las tareas. Cerrá y volvé a abrir.");
        }
      })
      .finally(() => active && setLoadingTasks(false));

    return () => {
      active = false;
    };
  }, [visible]);

  const taskOptions: TaskOption[] = generalTasks.map((task) => ({
    value: task.tag_id_tarea,
    label: task.tag_nombre_tarea,
  }));
  const technicianOptions = technicians.map((tech) => {
    const count = workload[tech.id] ?? 0;
    const countLabel = count === 1 ? "1 tarea activa" : `${count} tareas activas`;
    return { value: tech.id, label: `${tech.name} · ${countLabel}` };
  });

  function toggleTask(option: TaskOption) {
    setSelectedTasks((previous) =>
      previous.some((task) => task.id === option.value)
        ? previous.filter((task) => task.id !== option.value)
        : [...previous, { id: option.value, name: option.label }],
    );
    setError(null);
  }

  function addManualTask(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const matched = generalTasks.find(
      (task) => task.tag_nombre_tarea.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (matched) {
      toggleTask({ value: matched.tag_id_tarea, label: matched.tag_nombre_tarea });
    } else {
      setSelectedTasks((previous) =>
        previous.some((task) => task.name.trim().toLowerCase() === trimmed.toLowerCase())
          ? previous
          : [...previous, { id: null, name: trimmed }],
      );
    }
    setTaskQuery("");
    setError(null);
  }

  async function handleConfirm() {
    if (!technicianId || !technicians.some((tech) => tech.id === technicianId && tech.active)) {
      setError("Elegí un técnico activo.");
      return;
    }
    if (selectedTasks.length === 0) {
      setError("Seleccioná al menos una tarea.");
      return;
    }

    setConfirming(true);
    setOpenField(null);
    setError(null);
    try {
      const taskIds: number[] = [];
      for (const selected of selectedTasks) {
        if (selected.id !== null) {
          taskIds.push(selected.id);
          continue;
        }
        const matched = generalTasks.find(
          (task) => task.tag_nombre_tarea.trim().toLowerCase() === selected.name.toLowerCase(),
        );
        const created =
          matched ??
          (await createGeneralTask({
            name: selected.name,
            description: null,
            estado: "activo",
          }));
        taskIds.push(created.tag_id_tarea);
        setGeneralTasks((previous) => [...previous, created]);
        setSelectedTasks((previous) =>
          previous.map((task) =>
            task === selected ? { id: created.tag_id_tarea, name: created.tag_nombre_tarea } : task,
          ),
        );
      }
      await onConfirm({ taskIds, technicianId });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setConfirming(false);
    }
  }

  const canConfirm =
    !loadingTasks &&
    !loadingTechnicians &&
    !taskLoadFailed &&
    !technicianLoadFailed &&
    technicians.some((tech) => tech.id === technicianId && tech.active) &&
    selectedTasks.length > 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => !confirming && onClose()}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Agregar tareas a la orden</Text>

          <Text style={styles.subtitle}>{equipmentLabel}</Text>

          <ScrollView
            style={styles.body}
            keyboardShouldPersistTaps="always"
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.label}>Técnico *</Text>

            <View style={[styles.fieldWrap, openField === "technician" && styles.fieldWrapRaised]}>
              <Select
                value={technicianId}
                onChange={(id) => {
                  setTechnicianId(id);
                  if (!taskLoadFailed && !technicianLoadFailed) setError(null);
                }}
                options={technicianOptions}
                placeholder={loadingTechnicians ? "Cargando técnicos…" : "Elegí un técnico"}
                accessibilityLabel="Técnico responsable"
                disabled={
                  loadingTechnicians ||
                  technicianLoadFailed ||
                  technicianOptions.length === 0 ||
                  confirming
                }
                inline
                open={openField === "technician"}
                onOpenChange={(open) => setOpenField(open ? "technician" : null)}
              />
            </View>

            <Text style={styles.label}>Tareas *</Text>

            <View style={[styles.fieldWrap, openField === "task" && styles.fieldWrapRaised]}>
              <TaskCombobox
                value={taskQuery}
                onChangeText={setTaskQuery}
                options={taskOptions}
                selectedValues={selectedTasks.flatMap((task) =>
                  task.id === null ? [] : [task.id],
                )}
                onToggleOption={toggleTask}
                onAddManual={addManualTask}
                placeholder={loadingTasks ? "Cargando tareas…" : "Buscar tarea…"}
                accessibilityLabel="Buscar tareas para asignar"
                disabled={loadingTasks || taskLoadFailed || confirming || !technicianId}
                inline
                open={openField === "task"}
                onOpenChange={(open) => setOpenField(open ? "task" : null)}
              />
            </View>

            <Text style={styles.count}>
              {selectedTasks.length}{" "}
              {selectedTasks.length === 1 ? "tarea seleccionada" : "tareas seleccionadas"}
            </Text>

            {selectedTasks.map((task) => (
              <Pressable
                key={task.id ?? task.name.toLowerCase()}
                style={styles.selectedTask}
                onPress={() =>
                  setSelectedTasks((previous) => previous.filter((item) => item !== task))
                }
                accessibilityRole="button"
                accessibilityLabel={`Quitar ${task.name}`}
              >
                <Text style={styles.selectedTaskText}>{task.name}</Text>

                <Text style={styles.removeText}>×</Text>
              </Pressable>
            ))}

            {error && <Text style={styles.error}>{error}</Text>}
          </ScrollView>

          <FormFooter
            onCancel={onClose}
            onConfirm={handleConfirm}
            busy={confirming}
            busyLabel="Agregando…"
            disabled={!canConfirm}
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
      height: 560,
      maxHeight: "90%",
      alignSelf: "center",
    },
    title: { fontSize: 18, fontWeight: "600", color: c.text },
    subtitle: { marginTop: 2, fontSize: 13, color: c.textMuted },
    body: { flex: 1 },
    label: {
      fontSize: 12.5,
      fontWeight: "600",
      color: c.textLabel,
      marginTop: 18,
      marginBottom: 8,
    },
    fieldWrap: { position: "relative", zIndex: 1 },
    fieldWrapRaised: { zIndex: 50 },
    count: { marginTop: 14, marginBottom: 8, fontSize: 13, color: c.textMuted },
    selectedTask: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 12,
      paddingVertical: 8,
      marginBottom: 5,
      borderRadius: 8,
      backgroundColor: c.bgNested,
    },
    selectedTaskText: { flex: 1, color: c.text, fontSize: 13 },
    removeText: { color: c.destructive, fontSize: 18, marginLeft: 10 },
    error: { color: c.destructive, marginTop: 12, fontSize: 13 },
  });
}
