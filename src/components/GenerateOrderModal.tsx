import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { listActiveTaskCountsByTechnician } from "../lib/queries/faults";
import { listFaultTypes } from "../lib/queries/faultTypes";
import { listGeneralTasks } from "../lib/queries/generalTasks";
import { listProfiles } from "../lib/queries/profiles";
import type { ThemeColors } from "../lib/theme";
import { useTheme } from "../lib/ThemeContext";
import type { Fallo, Profile, Solicitud, TareaGeneral } from "../types/database";
import { Select } from "./Select";

type Priority = Exclude<Solicitud["priority"], null>;

const PRIORITIES: Priority[] = ["low", "medium", "high"];
const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
};

type TaskRow = { rowId: string; taskId: number | null; technicianId: string | null };

function emptyRow(): TaskRow {
  return { rowId: Math.random().toString(36).slice(2), taskId: null, technicianId: null };
}

// SCRUM-24: shown when the admin generates una orden_de_trabajo from a
// solicitud pendiente. La OT no le queda asignada entera a un técnico —
// el admin le agrega una o más tareas genéricas y a cada una le asigna su
// propio técnico. También es donde se define la prioridad y, si ya se
// sabe, el fallo genérico — nada de esto lo elige quien reportó la falla.
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
  const [faultTypes, setFaultTypes] = useState<Fallo[]>([]);
  const [faultTypeId, setFaultTypeId] = useState<number | null>(null);
  const [priority, setPriority] = useState<Priority>("medium");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  useEffect(() => {
    if (!visible) return;
    setRows([emptyRow()]);
    setFaultTypeId(null);
    setPriority("medium");
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
  const technicianOptions = technicians.map((t) => ({
    value: t.id,
    label: `${t.name} — ${workload[t.id] ?? 0} activa${(workload[t.id] ?? 0) === 1 ? "" : "s"}`,
  }));
  const taskOptions = generalTasks.map((t) => ({
    value: t.tag_id_tarea,
    label: t.tag_nombre_tarea,
  }));
  const faultTypeOptions = faultTypes.map((f) => ({ value: f.fa_id_fallo, label: f.fa_nombre }));

  function updateRow(rowId: string, changes: Partial<TaskRow>) {
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, ...changes } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow()]);
  }

  function removeRow(rowId: string) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.rowId !== rowId) : prev));
  }

  async function handleConfirm() {
    const tasks = rows
      .filter((r) => r.taskId != null && r.technicianId != null)
      .map((r) => ({ taskId: r.taskId as number, technicianId: r.technicianId as string }));
    if (tasks.length === 0 || tasks.length !== rows.length) {
      setError("Completá la tarea y el técnico en cada fila.");
      return;
    }
    setConfirming(true);
    setError(null);
    try {
      await onConfirm({ tasks, faultTypeId, priority });
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
          <ScrollView contentContainerStyle={{ padding: 24 }}>
            <Text style={styles.title}>Generar orden de trabajo</Text>
            <Text style={styles.subtitle}>{equipmentLabel}</Text>

            <Text style={styles.label}>Tareas y técnicos</Text>

            {rows.map((row) => (
              <View key={row.rowId} style={styles.taskRow}>
                <View style={styles.taskRowFields}>
                  <Select
                    value={row.taskId}
                    onChange={(v) => updateRow(row.rowId, { taskId: v })}
                    options={taskOptions}
                    placeholder={taskOptions.length > 0 ? "Tarea" : "No hay tareas cargadas"}
                    disabled={taskOptions.length === 0}
                  />

                  <Select
                    value={row.technicianId}
                    onChange={(v) => updateRow(row.rowId, { technicianId: v })}
                    options={technicianOptions}
                    placeholder={technicianOptions.length > 0 ? "Técnico" : "No hay técnicos"}
                    disabled={technicianOptions.length === 0}
                  />
                </View>

                {rows.length > 1 && (
                  <Pressable style={styles.removeRowButton} onPress={() => removeRow(row.rowId)}>
                    <Text style={styles.removeRowText}>✕</Text>
                  </Pressable>
                )}
              </View>
            ))}

            <Pressable style={styles.addRowButton} onPress={addRow}>
              <Text style={styles.addRowText}>+ Agregar tarea</Text>
            </Pressable>

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
              Elegila si ya evaluaste el equipo y sabés qué falla es. Si todavía no la
              diagnosticaste, podés dejarla sin elegir.
            </Text>

            <Text style={styles.label}>Prioridad</Text>
            <View style={styles.chipsRow}>
              {PRIORITIES.map((p) => (
                <Pressable
                  key={p}
                  style={[
                    styles.chip,
                    priority === p && {
                      backgroundColor: colors.accent,
                      borderColor: colors.accent,
                    },
                  ]}
                  onPress={() => setPriority(p)}
                >
                  <Text style={[styles.chipText, priority === p && styles.chipTextSelected]}>
                    {PRIORITY_LABELS[p]}
                  </Text>
                </Pressable>
              ))}
            </View>

            {error && <Text style={styles.error}>{error}</Text>}

            <View style={styles.actions}>
              <Pressable style={styles.cancelButton} onPress={onClose} disabled={confirming}>
                <Text style={styles.cancelText}>Cancelar</Text>
              </Pressable>

              <Pressable style={styles.confirmButton} onPress={handleConfirm} disabled={confirming}>
                <Text style={styles.confirmText}>{confirming ? "Generando…" : "Generar OT"}</Text>
              </Pressable>
            </View>
          </ScrollView>
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
      width: "100%",
      maxWidth: 460,
      alignSelf: "center",
      maxHeight: "90%",
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
    taskRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 8 },
    taskRowFields: { flex: 1, gap: 8 },
    removeRowButton: {
      width: 32,
      height: 32,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.borderInput,
      backgroundColor: c.bgInput,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 6,
    },
    removeRowText: { color: c.destructive, fontSize: 13, fontWeight: "700" },
    addRowButton: { alignSelf: "flex-start", marginTop: 2 },
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
    chipTextSelected: { color: "#fff", fontWeight: "600" },
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
