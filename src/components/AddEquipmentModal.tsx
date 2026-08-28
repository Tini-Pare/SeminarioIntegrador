import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { createEquipment } from "../lib/queries/equipment";
import { listEquipmentTypes } from "../lib/queries/equipmentTypes";
import { listLocations } from "../lib/queries/locations";
import { Select } from "./Select";
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
  const [typeId, setTypeId] = useState<number | null>(null);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [purchaseDate, setPurchaseDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [types, setTypes] = useState<{ value: number; label: string }[]>([]);
  const [locations, setLocations] = useState<{ value: number; label: string }[]>([]);
  const [openField, setOpenField] = useState<"type" | "location" | "date" | null>(null);
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  useEffect(() => {
    if (!visible) return;
    setCode("");
    setName("");
    setTypeId(null);
    setLocationId(null);
    setPurchaseDate("");
    setOpenField(null);
    setError(null);

    listEquipmentTypes()
      .then((rows) => setTypes(rows.map((t) => ({ value: t.te_id, label: t.te_nombre }))))
      .catch(() => {});
    listLocations()
      .then((rows) =>
        setLocations(rows.map((l) => ({ value: l.lu_codigo, label: l.lu_nombre_sector }))),
      )
      .catch(() => {});
  }, [visible]);

  const noTypes = types.length === 0;
  const noLocations = locations.length === 0;
  const blocked = noTypes || noLocations;

  async function handleSubmit() {
    if (!code.trim() || !name.trim() || !purchaseDate.trim()) {
      setError("Completá el código, el nombre y la fecha de compra.");
      return;
    }
    if (typeId == null || locationId == null) {
      setError("Elegí un tipo y una ubicación.");
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
        typeId,
        locationId,
        purchaseDate: toDbDate(purchaseDate.trim()),
      });

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
          <Select
            value={typeId}
            onChange={setTypeId}
            options={types}
            placeholder="Elegí un tipo de equipo"
            disabled={noTypes}
            open={openField === "type"}
            onOpenChange={(o) => setOpenField(o ? "type" : null)}
          />

          <Text style={styles.label}>Ubicación</Text>
          <Select
            value={locationId}
            onChange={setLocationId}
            options={locations}
            placeholder="Elegí una ubicación"
            disabled={noLocations}
            open={openField === "location"}
            onOpenChange={(o) => setOpenField(o ? "location" : null)}
          />

          <Text style={styles.label}>Fecha de compra</Text>

          <CustomDatePicker
            value={purchaseDate}
            onChange={setPurchaseDate}
            open={openField === "date"}
            onOpenChange={(o) => setOpenField(o ? "date" : null)}
          />

          {blocked && (
            <Text style={styles.blockedNote}>
              {noTypes && noLocations
                ? "No hay tipos de equipo ni ubicaciones cargados. Creá al menos uno de cada uno en sus secciones antes de agregar equipos."
                : noTypes
                  ? "No hay tipos de equipo cargados. Creá uno en la sección “Tipos de equipo” antes de agregar equipos."
                  : "No hay ubicaciones cargadas. Creá una en la sección “Ubicaciones” antes de agregar equipos."}
            </Text>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.actions}>
            <Pressable style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </Pressable>

            <Pressable
              style={[styles.saveButton, blocked && styles.disabled]}
              onPress={handleSubmit}
              disabled={saving || blocked}
            >
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
    blockedNote: { color: c.textLabel, marginTop: 14, fontSize: 12.5, lineHeight: 17 },
    error: { color: c.destructive, marginTop: 14, fontSize: 13 },
    actions: { flexDirection: "row", gap: 10, marginTop: 22 },
    disabled: { opacity: 0.45 },
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
