import { useEffect, useState } from "react";
import { Modal, View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { createEquipment, listEquipment } from "../lib/queries/equipment";
import { AutocompleteInput } from "./AutocompleteInput";
import type { Equipment } from "../types/database";

export function AddEquipmentModal({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<Equipment[]>([]);

  useEffect(() => {
    if (!visible) return;
    listEquipment()
      .then(setExisting)
      .catch(() => {});
  }, [visible]);

  async function handleSubmit() {
    if (!code.trim() || !name.trim() || !type.trim() || !location.trim()) {
      setError("Completá código, nombre, tipo y ubicación.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createEquipment({
        code: code.trim(),
        name: name.trim(),
        type: type.trim(),
        location: location.trim(),
      });

      setCode("");
      setName("");
      setType("");
      setLocation("");
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Agregar equipo</Text>
          <Text style={styles.subtitle}>
            Nace "Funcionando" — el estado se recalcula solo según las fallas activas.
          </Text>

          <Text style={styles.label}>Código</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej: AC-015"
            placeholderTextColor="#9a9da6"
            value={code}
            onChangeText={setCode}
          />

          <Text style={styles.label}>Nombre</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej: Aire Acondicionado"
            placeholderTextColor="#9a9da6"
            value={name}
            onChangeText={setName}
          />

          <Text style={styles.label}>Tipo</Text>
          <AutocompleteInput
            value={type}
            onChangeText={setType}
            options={existing.map((e) => e.type)}
            placeholder="Ej: Climatización"
          />

          <Text style={styles.label}>Ubicación</Text>
          <AutocompleteInput
            value={location}
            onChangeText={setLocation}
            options={existing.map((e) => e.location)}
            placeholder="Ej: Planta A · Sala de Servidores"
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.actions}>
            <Pressable style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </Pressable>

            <Pressable style={styles.saveButton} onPress={handleSubmit} disabled={saving}>
              <Text style={styles.saveText}>{saving ? "Guardando…" : "Agregar"}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 20 },
  sheet: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
  },
  title: { fontSize: 19, fontWeight: "600", color: "#17191f", marginBottom: 4 },
  subtitle: { fontSize: 12.5, color: "#8a8d95", marginBottom: 8 },
  label: { fontSize: 12.5, fontWeight: "600", color: "#4b4e56", marginTop: 14, marginBottom: 6 },
  input: {
    height: 44,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#d8d3c9",
    borderRadius: 10,
    fontSize: 14,
  },
  error: { color: "#c0392b", marginTop: 14, fontSize: 13 },
  actions: { flexDirection: "row", gap: 10, marginTop: 22 },
  cancelButton: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d8d3c9",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: { color: "#4b4e56", fontWeight: "600" },
  saveButton: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#2f53e0",
    alignItems: "center",
    justifyContent: "center",
  },
  saveText: { color: "#fff", fontWeight: "600" },
});
