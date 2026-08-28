import { useCallback, useEffect, useState } from "react";
import { Modal, View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { listEquipmentTypes, updateEquipment } from "../lib/queries/equipment";
import { listLocations, type LocationWithCount } from "../lib/queries/locations";
import { supabase } from "../lib/supabase";
import { EquipmentTypeDropdown } from "./EquipmentTypeDropdown";
import { LocationDropdown } from "./LocationDropdown";
import type { Equipo, TipoEquipo } from "../types/database";
import { useTheme } from "../lib/ThemeContext";
import type { ThemeColors } from "../lib/theme";
import { CustomDatePicker, isValidDateString, toDbDate, fromDbDate } from "./CustomDatePicker";

export function EditEquipmentModal({
  visible,
  onClose,
  onSaved,
  equipment,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  equipment: Equipo;
}) {
  const [code, setCode] = useState(equipment.code);
  const [name, setName] = useState(equipment.name);
  const [type, setType] = useState(equipment.type);
  const [location, setLocation] = useState(equipment.location);
  const [purchaseDate, setPurchaseDate] = useState(fromDbDate(equipment.purchaseDate));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locations, setLocations] = useState<LocationWithCount[]>([]);
  const [equipmentTypes, setEquipmentTypes] = useState<TipoEquipo[]>([]);
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const statusMeta =
    equipment.status === "operational"
      ? colors.eqOperational
      : equipment.status === "waiting"
        ? colors.eqWaiting
        : colors.eqRepair;
  const statusLabel =
    equipment.status === "operational"
      ? "Funcionando"
      : equipment.status === "waiting"
        ? "En espera"
        : "En reparación";

  const loadOptions = useCallback(async () => {
    try {
      const [locationRows, typeRows] = await Promise.all([listLocations(), listEquipmentTypes()]);
      setLocations(locationRows);
      setEquipmentTypes(typeRows);
    } catch {
      // The save action reports the error if the options could not be loaded.
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    setCode(equipment.code);
    setName(equipment.name);
    setType(equipment.type);
    setLocation(equipment.location);
    setPurchaseDate(fromDbDate(equipment.purchaseDate));
    void loadOptions();

    const channel = supabase
      .channel(`edit-equipment-locations-${equipment.id}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "lugares" }, loadOptions)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tipos_de_equipos" },
        loadOptions,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [visible, equipment, loadOptions]);

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
      await updateEquipment(equipment.id, {
        code: code.trim(),
        name: name.trim(),
        type: type.trim(),
        location: location.trim(),
        purchaseDate: toDbDate(purchaseDate.trim()),
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
          <EquipmentTypeDropdown value={type} types={equipmentTypes} onChange={setType} />

          <Text style={styles.label}>Ubicación</Text>

          <LocationDropdown value={location} locations={locations} onChange={setLocation} />

          <Text style={styles.label}>Fecha de compra</Text>

          <CustomDatePicker value={purchaseDate} onChange={setPurchaseDate} />

          <Text style={styles.label}>Estado</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusBadge, { backgroundColor: statusMeta.bg }]}>
              <Text style={[styles.statusBadgeText, { color: statusMeta.fg }]}>{statusLabel}</Text>
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
    title: { fontSize: 19, fontWeight: "600", color: c.text, marginBottom: 8 },
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
    statusRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    statusBadge: {
      alignSelf: "flex-start",
      paddingHorizontal: 11,
      paddingVertical: 5,
      borderRadius: 999,
    },
    statusBadgeText: { fontSize: 12.5, fontWeight: "600" },
    statusNote: { fontSize: 12, color: c.textMuted },
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
