import { useCallback, useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import {
  createEquipment,
  ensureEquipmentTypes,
  listEquipmentTypes,
} from "../lib/queries/equipment";
import { listLocations, type LocationWithCount } from "../lib/queries/locations";
import { supabase } from "../lib/supabase";
import type { TipoEquipo } from "../types/database";
import { EquipmentTypeDropdown } from "./EquipmentTypeDropdown";
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
  const [typeId, setTypeId] = useState<number | null>(null);
  const [location, setLocation] = useState("");
  const [locationId, setLocationId] = useState<number | null>(null);
  const [model, setModel] = useState("");
  const [warrantyDate, setWarrantyDate] = useState("");
  const [installationDate, setInstallationDate] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locations, setLocations] = useState<LocationWithCount[]>([]);
  const [equipmentTypes, setEquipmentTypes] = useState<TipoEquipo[]>([]);
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 600;
  const styles = makeStyles(colors);

  const loadOptions = useCallback(async () => {
    try {
      await ensureEquipmentTypes();
      const [locationRows, typeRows] = await Promise.all([listLocations(), listEquipmentTypes()]);
      setLocations(locationRows);
      setEquipmentTypes(typeRows);
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
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tipos_de_equipos" },
        loadOptions,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [visible, loadOptions]);

  async function handleSubmit() {
    if (!code.trim() || !name.trim() || typeId === null || locationId === null) {
      setError("Completá nombre, código, tipo y ubicación.");
      return;
    }
    for (const date of [warrantyDate, installationDate, purchaseDate]) {
      if (date.trim() && !isValidDateString(date.trim())) {
        setError("Ingresá las fechas válidas en formato dd/mm/aaaa.");
        return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      await createEquipment({
        code: code.trim(),
        name: name.trim(),
        typeId,
        locationId,
        model: model.trim() || null,
        warrantyDate: warrantyDate.trim() ? toDbDate(warrantyDate.trim()) : null,
        installationDate: installationDate.trim() ? toDbDate(installationDate.trim()) : null,
        purchaseDate: purchaseDate.trim() ? toDbDate(purchaseDate.trim()) : null,
      });

      setCode("");
      setName("");
      setType("");
      setTypeId(null);
      setLocation("");
      setLocationId(null);
      setModel("");
      setWarrantyDate("");
      setInstallationDate("");
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

          <View style={[styles.formRow, !isWide && styles.formColumn]}>
            <View style={styles.formField}>
              <Text style={styles.label}>Nombre</Text>
              <TextInput
                style={[styles.input, styles.nameInput]}
                placeholder="Ej: Aire Acondicionado"
                placeholderTextColor={colors.textMuted}
                value={name}
                onChangeText={setName}
              />
            </View>

            <View style={styles.formField}>
              <Text style={styles.label}>Código</Text>
              <TextInput
                style={[styles.input, styles.codeInput]}
                placeholder="Ej: AC-015"
                placeholderTextColor={colors.textMuted}
                value={code}
                onChangeText={setCode}
              />
            </View>
          </View>

          <View style={[styles.formRow, !isWide && styles.formColumn]}>
            <View style={styles.formField}>
              <Text style={styles.label}>Tipo</Text>
              <EquipmentTypeDropdown
                value={type}
                types={equipmentTypes}
                onChange={(selected) => {
                  setType(selected.te_nombre);
                  setTypeId(selected.te_id);
                }}
              />
            </View>

            <View style={styles.formField}>
              <Text style={styles.label}>Modelo</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej: Samsung XYZ"
                placeholderTextColor={colors.textMuted}
                value={model}
                onChangeText={setModel}
              />
            </View>
          </View>

          <View style={[styles.formRow, !isWide && styles.formColumn]}>
            <View style={styles.formField}>
              <Text style={styles.label}>Fecha de compra</Text>
              <View style={styles.shortField}>
                <CustomDatePicker value={purchaseDate} onChange={setPurchaseDate} />
              </View>
            </View>

            <View style={styles.formField}>
              <Text style={styles.label}>Fecha de instalación</Text>
              <View style={styles.shortField}>
                <CustomDatePicker value={installationDate} onChange={setInstallationDate} />
              </View>
            </View>
          </View>

          <View style={[styles.formRow, !isWide && styles.formColumn]}>
            <View style={styles.formField}>
              <Text style={styles.label}>Fecha de garantía</Text>
              <View style={styles.shortField}>
                <CustomDatePicker value={warrantyDate} onChange={setWarrantyDate} />
              </View>
            </View>

            <View style={styles.formField}>
              <Text style={styles.label}>Ubicación</Text>
              <LocationDropdown
                value={location}
                locations={locations}
                onChange={(selected) => {
                  setLocation(selected.lu_nombre_sector);
                  setLocationId(selected.lu_codigo);
                }}
              />
            </View>
          </View>

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
      maxWidth: 680,
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
      width: "100%",
      maxWidth: 400,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: c.borderInput,
      borderRadius: 10,
      fontSize: 14,
      backgroundColor: c.bgInput,
      color: c.text,
    },
    codeInput: { maxWidth: 220 },
    nameInput: { maxWidth: 320 },
    shortField: { width: "100%", maxWidth: 220 },
    wideField: {
      width: "100%",
      maxWidth: 420,
      alignSelf: "flex-start",
      position: "relative",
      zIndex: 100,
    },
    formRow: { flexDirection: "row", gap: 18 },
    formColumn: { flexDirection: "column", gap: 0 },
    formField: { flex: 1, minWidth: 0 },
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
