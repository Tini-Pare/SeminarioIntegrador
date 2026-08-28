import { useCallback, useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import {
  ensureEquipmentTypes,
  listEquipmentTypes,
  updateEquipment,
} from "../lib/queries/equipment";
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
  const [typeId, setTypeId] = useState<number | null>(equipment.typeId);
  const [location, setLocation] = useState(equipment.location);
  const [locationId, setLocationId] = useState<number | null>(equipment.locationId);
  const [model, setModel] = useState(equipment.model ?? "");
  const [warrantyDate, setWarrantyDate] = useState(fromDbDate(equipment.warrantyDate));
  const [installationDate, setInstallationDate] = useState(fromDbDate(equipment.installationDate));
  const [purchaseDate, setPurchaseDate] = useState(fromDbDate(equipment.purchaseDate));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locations, setLocations] = useState<LocationWithCount[]>([]);
  const [equipmentTypes, setEquipmentTypes] = useState<TipoEquipo[]>([]);
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 600;
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
    setCode(equipment.code);
    setName(equipment.name);
    setType(equipment.type);
    setTypeId(equipment.typeId);
    setLocation(equipment.location);
    setLocationId(equipment.locationId);
    setModel(equipment.model ?? "");
    setWarrantyDate(fromDbDate(equipment.warrantyDate));
    setInstallationDate(fromDbDate(equipment.installationDate));
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
      await updateEquipment(equipment.id, {
        code: code.trim(),
        name: name.trim(),
        typeId,
        locationId,
        model: model.trim() || null,
        warrantyDate: warrantyDate.trim() ? toDbDate(warrantyDate.trim()) : null,
        installationDate: installationDate.trim() ? toDbDate(installationDate.trim()) : null,
        purchaseDate: purchaseDate.trim() ? toDbDate(purchaseDate.trim()) : null,
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

            <View style={[styles.formField, styles.locationField]}>
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
      maxWidth: 680,
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
    locationField: { position: "relative", zIndex: 100 },
    formRow: { flexDirection: "row", gap: 18, position: "relative", zIndex: 2 },
    formColumn: { flexDirection: "column", gap: 0 },
    formField: { flex: 1, minWidth: 0, position: "relative", zIndex: 10 },
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
