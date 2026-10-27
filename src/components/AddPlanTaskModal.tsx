import { useEffect, useState } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";
import { listGeneralTasks } from "../lib/queries/generalTasks";
import type { ThemeColors } from "../lib/theme";
import { useTheme } from "../lib/ThemeContext";
import type { TareaGeneral } from "../types/database";
import { FormFooter } from "./FormFooter";
import { TaskCombobox } from "./TaskCombobox";

// Adds one tarea prevista to a plan, same format as AddTaskModal (adding a
// tarea to an OT) minus the técnico: a plan's tareas get one only when its
// preventive OTs are generated. Unlike the OT, only tareas already in the
// catálogo can be picked: new ones are created from the Tareas screen.
export function AddPlanTaskModal({
  visible,
  planName = "",
  typeName = "",
  existingTaskIds,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  planName?: string;
  typeName?: string;
  existingTaskIds: number[];
  onClose: () => void;
  onConfirm: (task: TareaGeneral) => void;
}) {
  const [generalTasks, setGeneralTasks] = useState<TareaGeneral[]>([]);
  const [taskName, setTaskName] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const subtitle = [planName.trim(), typeName.trim()].filter(Boolean).join(" · ");

  useEffect(() => {
    if (!visible) return;
    setTaskName("");
    setOpen(false);
    setError(null);
    // System tareas (the installation one) can't go in a plan (0032).
    listGeneralTasks()
      .then((all) =>
        setGeneralTasks(all.filter((t) => t.tag_estado === "activo" && !t.tag_codigo_sistema)),
      )
      .catch(() => setGeneralTasks([]));
  }, [visible]);

  // Tareas already in the plan aren't offered again.
  const taskOptions = generalTasks
    .filter((t) => !existingTaskIds.includes(t.tag_id_tarea))
    .map((t) => ({ value: t.tag_id_tarea, label: t.tag_nombre_tarea }));

  function handleConfirm() {
    const trimmed = taskName.trim();
    if (!trimmed) {
      setError("Elegí una tarea del catálogo.");
      return;
    }

    const matched = generalTasks.find(
      (t) => t.tag_nombre_tarea.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (!matched) {
      setError("Esa tarea no está en el catálogo. Para crear una nueva, usá la sección Tareas.");
      return;
    }
    if (existingTaskIds.includes(matched.tag_id_tarea)) {
      setError("Esa tarea ya está en el plan.");
      return;
    }

    onConfirm(matched);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Agregar tarea al plan</Text>

          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

          <Text style={styles.label}>Tarea</Text>

          <View style={[styles.fieldWrap, open && styles.fieldWrapRaised]}>
            <TaskCombobox
              value={taskName}
              onChangeText={(text) => {
                setTaskName(text);
                setError(null);
              }}
              options={taskOptions}
              onSelectOption={(opt) => {
                setTaskName(opt.label);
                setError(null);
              }}
              placeholder="Buscá o elegí una tarea del catálogo"
              open={open}
              onOpenChange={setOpen}
              allowManual={false}
            />
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          <FormFooter onCancel={onClose} onConfirm={handleConfirm} />
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
  });
}
