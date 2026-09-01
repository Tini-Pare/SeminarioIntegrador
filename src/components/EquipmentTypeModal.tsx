import { useEffect, useState } from "react";
import { Alert, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import {
  createEquipmentType,
  deleteEquipmentType,
  updateEquipmentType,
} from "../lib/queries/equipmentTypes";
import type { EquipmentTypeWithCount } from "../lib/queries/equipmentTypes";
import type { ThemeColors } from "../lib/theme";
import { useTheme } from "../lib/ThemeContext";

export function EquipmentTypeModal({
  visible,
  onClose,
  onSaved,
  equipmentType,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  equipmentType?: EquipmentTypeWithCount | null;
}) {
  const isEditing = !!equipmentType;
  const [name, setName] = useState(equipmentType?.te_nombre ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  useEffect(() => {
    if (!visible) return;
    setName(equipmentType?.te_nombre ?? "");
    setError(null);
  }, [visible, equipmentType]);

  async function handleSave() {
    if (!name.trim()) {
      setError("El nombre del tipo no puede estar vacío.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (equipmentType) {
        await updateEquipmentType(equipmentType.te_id, { name });
      } else {
        await createEquipmentType({ name });
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
    if (!equipmentType) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteEquipmentType(equipmentType.te_id);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  }

  function handleDelete() {
    if (!equipmentType) return;
    const message = `¿Eliminar "${equipmentType.te_nombre}"? Esta acción no se puede deshacer.`;
    if (Platform.OS === "web") {
      if (window.confirm(message)) doDelete();
      return;
    }
    Alert.alert("Eliminar tipo de equipo", message, [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: doDelete },
    ]);
  }

  const hasEquipment = (equipmentType?.equipmentCount ?? 0) > 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>
            {isEditing ? equipmentType!.te_nombre : "Nuevo tipo de equipo"}
          </Text>
          <Text style={styles.subtitle}>
            {isEditing
              ? "Editá el nombre del tipo."
              : "Agregá una categoría para clasificar los equipos."}
          </Text>

          <Text style={styles.label}>Nombre</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Ej: Heladeras exhibidoras"
            placeholderTextColor={colors.textMuted}
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
            <>
              <Pressable
                style={[styles.deleteButton, hasEquipment && styles.disabled]}
                onPress={handleDelete}
                disabled={deleting || hasEquipment}
              >
                <Text style={styles.deleteText}>{deleting ? "Eliminando…" : "Eliminar tipo"}</Text>
              </Pressable>

              {hasEquipment && (
                <Text style={styles.selfNote}>
                  No se puede eliminar: tiene {equipmentType!.equipmentCount} equipo
                  {equipmentType!.equipmentCount === 1 ? "" : "s"} de este tipo.
                </Text>
              )}
            </>
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
      height: 42,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: c.borderInput,
      borderRadius: 10,
      backgroundColor: c.bgInput,
      fontSize: 14,
      color: c.text,
    },
    disabled: { opacity: 0.45 },
    selfNote: { marginTop: 10, fontSize: 12.5, color: c.textMuted },
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
