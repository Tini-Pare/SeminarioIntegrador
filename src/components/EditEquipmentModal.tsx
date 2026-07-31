import { useEffect, useState } from "react";
import { Modal, View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { listEquipment, updateEquipment } from "../lib/queries/equipment";
import { AutocompleteInput } from "./AutocompleteInput";
import type { Equipment } from "../types/database";

const STATUS_META: Record<Equipment["status"], { label: string; bg: string; fg: string }> = {
  operational: { label: "Funcionando", bg: "#e4f3ea", fg: "#1e7f47" },
  waiting: { label: "En espera", bg: "#f7ecd6", fg: "#9a6512" },
  repair: { label: "En reparación", bg: "#f8e3e3", fg: "#b23636" },
};

export function EditEquipmentModal({
  visible,
  onClose,
  onSaved,
  equipment,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  equipment: Equipment;
}) {
  const [code, setCode] = useState(equipment.code);
  const [name, setName] = useState(equipment.name);
  const [type, setType] = useState(equipment.type);
  const [location, setLocation] = useState(equipment.location);
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
      await updateEquipment(equipment.id, {
        code: code.trim(),
        name: name.trim(),
        type: type.trim(),
        location: location.trim(),
      });
      onSaved();
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
          <Text style={styles.title}>Editar equipo</Text>

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

          <Text style={styles.label}>Estado</Text>
          <View style={styles.statusRow}>
            <View
              style={[styles.statusBadge, { backgroundColor: STATUS_META[equipment.status].bg }]}
            >
              <Text style={[styles.statusBadgeText, { color: STATUS_META[equipment.status].fg }]}>
                {STATUS_META[equipment.status].label}
              </Text>
            </View>

            <Text style={styles.statusNote}>Automático, según fallas activas</Text>
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.actions}>
            <Pressable style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </Pressable>

            <Pressable style={styles.saveButton} onPress={handleSubmit} disabled={saving}>
              <Text style={styles.saveText}>{saving ? "Guardando…" : "Guardar"}</Text>
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
  title: { fontSize: 19, fontWeight: "600", color: "#17191f", marginBottom: 8 },
  label: { fontSize: 12.5, fontWeight: "600", color: "#4b4e56", marginTop: 14, marginBottom: 6 },
  input: {
    height: 44,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#d8d3c9",
    borderRadius: 10,
    fontSize: 14,
  },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
  },
  statusBadgeText: { fontSize: 12.5, fontWeight: "600" },
  statusNote: { fontSize: 12, color: "#9a9da6" },
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
