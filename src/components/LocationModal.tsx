import { useEffect, useState } from "react";
import { Alert, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { createLocation, deleteLocation, updateLocation } from "../lib/queries/locations";
import type { LocationWithCount } from "../lib/queries/locations";
import type { ThemeColors } from "../lib/theme";
import { useTheme } from "../lib/ThemeContext";

export function LocationModal({
  visible,
  onClose,
  onSaved,
  location,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  location?: LocationWithCount | null;
}) {
  const isEditing = !!location;
  const [name, setName] = useState(location?.lu_nombre_sector ?? "");
  const [floor, setFloor] = useState(location?.lu_piso ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  useEffect(() => {
    if (!visible) return;
    setName(location?.lu_nombre_sector ?? "");
    setFloor(location?.lu_piso ?? "");
    setError(null);
  }, [visible, location]);

  async function handleSave() {
    if (!name.trim()) {
      setError("El nombre del sector no puede estar vacío.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (location) {
        await updateLocation(location.lu_codigo, { name, floor: floor || null });
      } else {
        await createLocation({ name, floor: floor || null });
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
    if (!location) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteLocation(location.lu_codigo);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  }

  function handleDelete() {
    if (!location) return;
    const message = `¿Eliminar "${location.lu_nombre_sector}"? Esta acción no se puede deshacer.`;
    if (Platform.OS === "web") {
      if (window.confirm(message)) doDelete();
      return;
    }
    Alert.alert("Eliminar ubicación", message, [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: doDelete },
    ]);
  }

  const hasEquipment = (location?.equipmentCount ?? 0) > 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>
            {isEditing ? location!.lu_nombre_sector : "Nueva ubicación"}
          </Text>
          <Text style={styles.subtitle}>
            {isEditing ? "Editá el sector y el piso." : "Agregá un sector donde ubicar equipos."}
          </Text>

          <Text style={styles.label}>Sector</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Ej: Planta A"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.label}>Piso</Text>
          <TextInput
            style={styles.input}
            value={floor}
            onChangeText={setFloor}
            placeholder="Ej: 1° piso (opcional)"
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
                <Text style={styles.deleteText}>
                  {deleting ? "Eliminando…" : "Eliminar ubicación"}
                </Text>
              </Pressable>

              {hasEquipment && (
                <Text style={styles.selfNote}>
                  No se puede eliminar: tiene {location!.equipmentCount} equipo
                  {location!.equipmentCount === 1 ? "" : "s"} asignado
                  {location!.equipmentCount === 1 ? "" : "s"}.
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
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", padding: 20 },
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
    label: { fontSize: 12.5, fontWeight: "600", color: c.textLabel, marginTop: 18, marginBottom: 8 },
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
