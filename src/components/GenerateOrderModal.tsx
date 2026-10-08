import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { listActiveTaskCountsByTechnician } from "../lib/queries/faults";
import { listFaultTypes } from "../lib/queries/faultTypes";
import { createGeneralTask, listGeneralTasks } from "../lib/queries/generalTasks";
import { listProfiles } from "../lib/queries/profiles";
import type { ThemeColors } from "../lib/theme";
import { useTheme } from "../lib/ThemeContext";
import type { Fallo, Profile, Solicitud, TareaGeneral } from "../types/database";
import { Select } from "./Select";
import { TaskCombobox } from "./TaskCombobox";

type Priority = Exclude<Solicitud["priority"], null>;

const PRIORITIES: Priority[] = ["low", "medium", "high"];
const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
};

type TaskRow = {
  rowId: string;
  taskId: number | null;
  taskName: string;
  technicianId: string | null;
};

function emptyRow(): TaskRow {
  return {
    rowId: Math.random().toString(36).slice(2),
    taskId: null,
    taskName: "",
    technicianId: null,
  };
}

// SCRUM-24: shown when the admin generates una orden_de_trabajo from a
// solicitud pendiente. La OT no le queda asignada entera a un técnico —
// el admin le agrega una o más tareas (genéricas del catálogo o cargadas a mano)
// y a cada una le asigna su propio técnico. También es donde se define la
// prioridad y, si ya se sabe, el fallo genérico.
export function GenerateOrderModal({
  visible,
  onClose,
  onConfirm,
  equipmentLabel,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (input: {
    tasks: { taskId: number; technicianId: string }[];
    faultTypeId: number | null;
    priority: Priority;
  }) => void | Promise<void>;
  equipmentLabel: string;
}) {
  const [generalTasks, setGeneralTasks] = useState<TareaGeneral[]>([]);
  const [technicians, setTechnicians] = useState<Profile[]>([]);
  const [workload, setWorkload] = useState<Record<string, number>>({});
  const [rows, setRows] = useState<TaskRow[]>([emptyRow()]);
  // Only one task is shown at a time (like adding passengers when booking a
  // flight); the numbered pager below switches between them.
  const [activeIndex, setActiveIndex] = useState(0);
  // Slide/fade for the task panel when switching, adding or removing tasks.
  const panelX = useRef(new Animated.Value(0)).current;
  const panelOpacity = useRef(new Animated.Value(1)).current;
  const removing = useRef(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [faultTypes, setFaultTypes] = useState<Fallo[]>([]);
  const [faultTypeId, setFaultTypeId] = useState<number | null>(null);
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
    setRows([emptyRow()]);
    setActiveIndex(0);
    panelX.setValue(0);
    panelOpacity.setValue(1);
    removing.current = false;
    setOpenDropdown(null);
    setFaultTypeId(null);
    setPriority(null);
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
    listFaultTypes()
      .then((all) => setFaultTypes(all.filter((f) => f.fa_estado === "activo")))
      .catch(() => setFaultTypes([]));
  }, [visible]);

  // Shows current open-task count next to each técnico's name so the
  // admin can see who's overloaded before picking one.
  const technicianOptions = technicians.map((t) => {
    const count = workload[t.id] ?? 0;
    const countLabel = count === 1 ? "1 OT activa" : `${count} OT activas`;
    return {
      value: t.id,
      label: `${t.name} · ${countLabel}`,
    };
  });
  const taskOptions = generalTasks.map((t) => ({
    value: t.tag_id_tarea,
    label: t.tag_nombre_tarea,
  }));
  const faultTypeOptions = faultTypes.map((f) => ({ value: f.fa_id_fallo, label: f.fa_nombre }));

  function updateRow(rowId: string, changes: Partial<TaskRow>) {
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, ...changes } : r)));
  }

  // direction: 1 = new panel comes in from the right, -1 = from the left.
  function animatePanelIn(direction: number) {
    panelX.setValue(direction * 32);
    panelOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(panelX, {
        toValue: 0,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(panelOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }

  function addRow() {
    setActiveIndex(rows.length);
    setRows((prev) => [...prev, emptyRow()]);
    setOpenDropdown(null);
    animatePanelIn(1);
  }

  function removeRow(rowId: string) {
    if (rows.length <= 1 || removing.current) return;
    removing.current = true;
    setOpenDropdown(null);
    const removedIndex = rows.findIndex((r) => r.rowId === rowId);
    const wasLast = removedIndex === rows.length - 1;
    // Fade the removed task out first, then bring in the one that takes its
    // place: the previous task if it was the last one, otherwise the next.
    Animated.parallel([
      Animated.timing(panelOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(panelX, {
        toValue: wasLast ? 32 : -32,
        duration: 150,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setActiveIndex(Math.min(removedIndex, rows.length - 2));
      setRows((prev) => prev.filter((r) => r.rowId !== rowId));
      animatePanelIn(wasLast ? -1 : 1);
      removing.current = false;
    });
  }

  function goToRow(idx: number) {
    if (idx === activeIndex) return;
    setActiveIndex(idx);
    setOpenDropdown(null);
    animatePanelIn(idx > activeIndex ? 1 : -1);
  }

  function isRowComplete(r: TaskRow) {
    return !!r.taskName.trim() && !!r.technicianId;
  }

  async function handleConfirm() {
    const invalidIndex = rows.findIndex((r) => !isRowComplete(r));
    if (invalidIndex !== -1) {
      // Jump to the incomplete task, since the others aren't visible.
      goToRow(invalidIndex);
      setError(
        rows.length > 1
          ? `Completá la tarea y el técnico de la tarea ${invalidIndex + 1}.`
          : "Completá la tarea y el técnico.",
      );
      return;
    }
    // No default priority on purpose: the admin has to pick one explicitly.
    if (!priority) {
      setError("Elegí una prioridad.");
      return;
    }

    setConfirming(true);
    setError(null);

    try {
      // Resolve task IDs: match existing generic task by name or create a new one on the fly.
      const taskCatalog = [...generalTasks];
      const resolvedTasks: { taskId: number; technicianId: string }[] = [];

      for (const row of rows) {
        const trimmed = row.taskName.trim();
        const matched = taskCatalog.find(
          (t) => t.tag_nombre_tarea.trim().toLowerCase() === trimmed.toLowerCase(),
        );

        let finalTaskId: number;
        if (matched) {
          finalTaskId = matched.tag_id_tarea;
        } else {
          const created = await createGeneralTask({
            name: trimmed,
            description: null,
            estado: "activo",
          });
          taskCatalog.push(created);
          finalTaskId = created.tag_id_tarea;
        }

        resolvedTasks.push({
          taskId: finalTaskId,
          technicianId: row.technicianId!,
        });
      }

      await onConfirm({ tasks: resolvedTasks, faultTypeId, priority });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setConfirming(false);
    }
  }

  const activeRow = rows[activeIndex] ?? rows[0];
  const isTaskOpen = openDropdown === `${activeRow.rowId}-task`;
  const isTechOpen = openDropdown === `${activeRow.rowId}-tech`;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => !confirming && onClose()}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <ScrollView contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="always">
            <Text style={styles.title}>Generar orden de trabajo</Text>

            <Text style={styles.subtitle}>{equipmentLabel}</Text>

            <View style={styles.tasksHeader}>
              <Text style={[styles.label, styles.tasksHeaderLabel]}>Tareas y técnicos</Text>

              {rows.length > 1 && (
                <View style={styles.tasksHeaderRight}>
                  <Text style={styles.taskCounter}>
                    Tarea {activeIndex + 1} de {rows.length}
                  </Text>

                  <Pressable onPress={() => removeRow(activeRow.rowId)} hitSlop={6}>
                    <Text style={styles.removeTaskText}>Quitar</Text>
                  </Pressable>
                </View>
              )}
            </View>

            {/* The Animated.View must stay mounted: remounting it mid-animation
                re-attaches the native-driven values at their start (opacity 0)
                and the fields stay invisible. Only the inner View is keyed. */}
            <Animated.View
              style={[
                styles.taskFields,
                { opacity: panelOpacity, transform: [{ translateX: panelX }] },
              ]}
            >
              <View key={activeRow.rowId} style={styles.taskFieldsInner}>
                <View style={[styles.fieldWrap, isTaskOpen && styles.fieldWrapRaised]}>
                  <TaskCombobox
                    value={activeRow.taskName}
                    onChangeText={(text) =>
                      updateRow(activeRow.rowId, { taskName: text, taskId: null })
                    }
                    options={taskOptions}
                    onSelectOption={(opt) =>
                      updateRow(activeRow.rowId, { taskName: opt.label, taskId: opt.value })
                    }
                    placeholder="Escribí o elegí una tarea"
                    open={isTaskOpen}
                    onOpenChange={(o) => setOpenDropdown(o ? `${activeRow.rowId}-task` : null)}
                  />
                </View>

                <View style={[styles.fieldWrap, isTechOpen && styles.fieldWrapRaised]}>
                  <Select
                    value={activeRow.technicianId}
                    onChange={(v) => updateRow(activeRow.rowId, { technicianId: v })}
                    options={technicianOptions}
                    placeholder={
                      technicianOptions.length > 0 ? "Elegí un técnico" : "No hay técnicos activos"
                    }
                    disabled={technicianOptions.length === 0}
                    open={isTechOpen}
                    onOpenChange={(o) => setOpenDropdown(o ? `${activeRow.rowId}-tech` : null)}
                  />
                </View>
              </View>
            </Animated.View>

            <View style={styles.pagerRow}>
              {rows.length > 1 &&
                rows.map((row, idx) => (
                  <PagerDot
                    key={row.rowId}
                    number={idx + 1}
                    active={idx === activeIndex}
                    complete={isRowComplete(row)}
                    onPress={() => goToRow(idx)}
                    styles={styles}
                  />
                ))}

              <Pressable style={styles.addRowButton} onPress={addRow}>
                <Text style={styles.addRowText}>+ Agregar tarea</Text>
              </Pressable>
            </View>

            <Text style={styles.label}>Falla genérica (opcional)</Text>

            <View
              style={[
                styles.faultTypeWrap,
                openDropdown === "faultType" && styles.faultTypeWrapRaised,
              ]}
            >
              <Select
                value={faultTypeId}
                onChange={setFaultTypeId}
                options={faultTypeOptions}
                placeholder={
                  faultTypeOptions.length > 0 ? "Elegí un tipo de falla" : "No hay fallas cargadas"
                }
                disabled={faultTypeOptions.length === 0}
                open={openDropdown === "faultType"}
                onOpenChange={(o) => setOpenDropdown(o ? "faultType" : null)}
              />
            </View>

            <Text style={styles.hint}>
              Elegila si ya evaluaste el equipo y sabés qué falla es. Si todavía no la
              diagnosticaste, podés dejarla sin elegir.
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
                <Text style={styles.confirmText}>{confirming ? "Guardando…" : "Confirmar"}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// Each dot pops in with a small spring when its task is added.
function PagerDot({
  number,
  active,
  complete,
  onPress,
  styles,
}: {
  number: number;
  active: boolean;
  complete: boolean;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  const scale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 18,
      bounciness: 10,
    }).start();
  }, [scale]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        style={[
          styles.pagerDot,
          complete && styles.pagerDotComplete,
          active && styles.pagerDotActive,
        ]}
        onPress={onPress}
        accessibilityLabel={`Ver tarea ${number}`}
      >
        <Text style={[styles.pagerDotText, active && styles.pagerDotTextActive]}>{number}</Text>
      </Pressable>
    </Animated.View>
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
      width: "100%",
      maxWidth: 460,
      alignSelf: "center",
      maxHeight: "90%",
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
    hint: { marginTop: 8, fontSize: 12.5, color: c.textMuted, lineHeight: 17 },
    tasksHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 18,
      marginBottom: 8,
    },
    tasksHeaderLabel: { marginTop: 0, marginBottom: 0 },
    tasksHeaderRight: { flexDirection: "row", alignItems: "center", gap: 12 },
    taskCounter: { fontSize: 12.5, color: c.textMuted },
    removeTaskText: { fontSize: 12.5, fontWeight: "600", color: c.destructive },
    taskFields: { position: "relative", zIndex: 10 },
    taskFieldsInner: { gap: 8 },
    fieldWrap: {
      position: "relative",
      zIndex: 1,
    },
    fieldWrapRaised: {
      zIndex: 50,
    },
    faultTypeWrap: {
      position: "relative",
      zIndex: 1,
    },
    faultTypeWrapRaised: {
      zIndex: 50,
    },
    pagerRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 10,
    },
    pagerDot: {
      width: 30,
      height: 30,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: c.borderInput,
      backgroundColor: c.bgInput,
      alignItems: "center",
      justifyContent: "center",
    },
    pagerDotComplete: { borderColor: c.accent },
    pagerDotActive: { backgroundColor: c.accent, borderColor: c.accent },
    pagerDotText: { fontSize: 13, fontWeight: "600", color: c.textLabel },
    pagerDotTextActive: { color: "#fff" },
    addRowButton: { marginLeft: 4 },
    addRowText: { fontSize: 13, fontWeight: "600", color: c.accent },
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
