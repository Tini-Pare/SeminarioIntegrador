import { useCallback, useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { createEquipment, listEquipment } from "../lib/queries/equipment";
import { listLocations, type LocationWithCount } from "../lib/queries/locations";
import { supabase } from "../lib/supabase";
import type { Equipo } from "../types/database";
import { AutocompleteInput } from "./AutocompleteInput";
import { LocationDropdown } from "./LocationDropdown";
import { useTheme } from "../lib/ThemeContext";
import type { ThemeColors } from "../lib/theme";
import { CustomDatePicker, isValidDateString, toDbDate } from "./CustomDatePicker";

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
  const [purchaseDate, setPurchaseDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<Equipo[]>([]);
  const [locations, setLocations] = useState<LocationWithCount[]>([]);
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const loadOptions = useCallback(async () => {
    try {
      const [equipment, locationRows] = await Promise.all([listEquipment(), listLocations()]);
      setExisting(equipment);
      setLocations(locationRows);
    } catch {
      // The save action reports the error if the options could not be loaded.
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    void loadOptions();

    const channel = supabase
      .channel(`add-equipment-locations-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "lugares" }, loadOptions)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [visible, loadOptions]);

  async function handleSubmit() {
    if (!code.trim() || !name.trim() || !type.trim() || !location.trim() || !purchaseDate.trim()) {
      setError("Completá todos los campos, incluyendo la fecha de compra.");
      return;
    }
    if (!isValidDateString(purchaseDate.trim())) {
      setError("Ingresá una fecha válida en formato dd/mm/aaaa.");
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
        purchaseDate: toDbDate(purchaseDate.trim()),
      });

      setCode("");
      setName("");
      setType("");
      setLocation("");
      setPurchaseDate("");
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
            placeholderTextColor={colors.textMuted}
            value={code}
            onChangeText={setCode}
          />

          <Text style={styles.label}>Nombre</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej: Aire Acondicionado"
            placeholderTextColor={colors.textMuted}
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

          <LocationDropdown value={location} locations={locations} onChange={setLocation} />

          <Text style={styles.label}>Fecha de compra</Text>

          <CustomDatePicker value={purchaseDate} onChange={setPurchaseDate} />

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
      maxWidth: 480,
      alignSelf: "center",
    },
    title: { fontSize: 19, fontWeight: "600", color: c.text, marginBottom: 4 },
    subtitle: { fontSize: 12.5, color: c.textMuted, marginBottom: 8 },
    label: {
      fontSize: 12.5,
      fontWeight: "600",
      color: c.textLabel,
      marginTop: 14,
      marginBottom: 6,
    },
    input: {
      height: 44,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: c.borderInput,
      borderRadius: 10,
      fontSize: 14,
      backgroundColor: c.bgInput,
      color: c.text,
    },
    error: { color: c.destructive, marginTop: 14, fontSize: 13 },
    actions: { flexDirection: "row", gap: 10, marginTop: 22 },
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
  });
}
