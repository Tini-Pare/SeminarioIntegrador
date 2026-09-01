import { useEffect, useState } from "react";
import { Alert, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import {
  createGeneralTask,
  deleteGeneralTask,
  updateGeneralTask,
} from "../lib/queries/generalTasks";
import type { TareaGeneral } from "../types/database";
import type { ThemeColors } from "../lib/theme";
import { useTheme } from "../lib/ThemeContext";

export function GeneralTaskModal({
  visible,
  onClose,
  onSaved,
  task,
  existingTasks = [],
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  task?: TareaGeneral | null;
  existingTasks?: TareaGeneral[];
}) {
  const isEditing = !!task;
  const [name, setName] = useState(task?.tag_nombre_tarea ?? "");
  const [description, setDescription] = useState(task?.tag_descripcion_tarea ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  useEffect(() => {
    if (!visible) return;
    setName(task?.tag_nombre_tarea ?? "");
    setDescription(task?.tag_descripcion_tarea ?? "");
    setError(null);
  }, [visible, task]);

  async function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("El nombre de la tarea no puede estar vacío.");
      return;
    }

    // Block duplicate names (case/trim-insensitive), excluding the task being
    // edited. The DB has a matching unique index as the backstop.
    const normalized = trimmedName.toLocaleLowerCase();
    const isDuplicate = existingTasks.some(
      (t) =>
        t.tag_id_tarea !== task?.tag_id_tarea &&
        t.tag_nombre_tarea.trim().toLocaleLowerCase() === normalized,
    );
    if (isDuplicate) {
      setError("Ya existe una tarea general con ese nombre");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (task) {
        await updateGeneralTask(task.tag_id_tarea, { name, description: description || null });
      } else {
        await createGeneralTask({ name, description: description || null });
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    if (!task) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteGeneralTask(task.tag_id_tarea);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  }

  function handleDelete() {
    if (!task) return;
    const message = `¿Eliminar "${task.tag_nombre_tarea}"? Esta acción no se puede deshacer.`;
    if (Platform.OS === "web") {
      if (window.confirm(message)) doDelete();
      return;
    }
    Alert.alert("Eliminar tarea general", message, [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: doDelete },
    ]);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>
            {isEditing ? task!.tag_nombre_tarea : "Nueva tarea general"}
          </Text>
          <Text style={styles.subtitle}>
            {isEditing
              ? "Editá el nombre o la descripción."
              : "Agregá una acción técnica estandarizada para usar en planes y órdenes."}
          </Text>

          <Text style={styles.label}>Nombre</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Ej: Limpieza mecánica de filtros de aire"
            placeholderTextColor={colors.textMuted}
            maxLength={100}
          />

          <Text style={styles.label}>Descripción</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            value={description}
            onChangeText={setDescription}
            placeholder="Instructivo paso a paso (opcional)"
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={3}
            maxLength={255}
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.actions}>
            <Pressable style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </Pressable>

            <Pressable style={styles.saveButton} onPress={handleSave} disabled={saving}>
              <Text style={styles.saveText}>{saving ? "Guardando…" : "Guardar"}</Text>
            </Pressable>
          </View>

          {isEditing && (
            <Pressable style={styles.deleteButton} onPress={handleDelete} disabled={deleting}>
              <Text style={styles.deleteText}>{deleting ? "Eliminando…" : "Eliminar tarea"}</Text>
            </Pressable>
          )}
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
    actions: { flexDirection: "row", gap: 10, marginTop: 24 },
    cancelButton: {
      flex: 1,
      height: 44,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.borderInput,
      alignItems: "center",
      justifyContent: "center",
    },
    cancelText: { color: c.textLabel, fontWeight: "600" },
    saveButton: {
      flex: 1,
      height: 44,
      borderRadius: 10,
      backgroundColor: c.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    saveText: { color: "#fff", fontWeight: "600" },
    deleteButton: {
      marginTop: 12,
      height: 44,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.destructive,
      alignItems: "center",
      justifyContent: "center",
    },
    deleteText: { color: c.destructive, fontWeight: "600", fontSize: 14 },
  });
}
