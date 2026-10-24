import { useEffect, useState } from "react";
import { Modal, StyleSheet, Text, TextInput, View } from "react-native";
import { updateEquipment } from "../lib/queries/equipment";
import { listEquipmentTypes } from "../lib/queries/equipmentTypes";
import { listLocations } from "../lib/queries/locations";
import { DropdownBackdrop } from "./DropdownBackdrop";
import { FormFooter } from "./FormFooter";
import { RadioGroup, type RadioOption } from "./RadioGroup";
import { Select } from "./Select";
import type { Equipo } from "../types/database";
import { useTheme } from "../lib/ThemeContext";
import type { ThemeColors } from "../lib/theme";

// Registration state, separate from the automatic operational status: an
// equipment with history can't be deleted, it's marked inactive instead.
// RadioGroup only takes string/number values, so the flag travels as the same
// 'activo'/'inactivo' wording the other entities use and is mapped on save.
const ESTADO_OPTIONS: RadioOption<"activo" | "inactivo">[] = [
  { value: "activo", label: "Activo" },
  { value: "inactivo", label: "Inactivo" },
];
import {
  CustomDatePicker,
  fromDbDate,
  isDateWithinMax,
  isValidDateString,
  toDbDate,
} from "./CustomDatePicker";

type OpenField = "type" | "location" | "install" | null;

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
  const [model, setModel] = useState(equipment.model ?? "");
  const [typeId, setTypeId] = useState<number | null>(equipment.typeId);
  const [locationId, setLocationId] = useState<number | null>(equipment.locationId);
  const [installDate, setInstallDate] = useState(fromDbDate(equipment.installDate));
  const [estado, setEstado] = useState<"activo" | "inactivo">(
    equipment.active ? "activo" : "inactivo",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [types, setTypes] = useState<{ value: number; label: string }[]>([]);
  const [locations, setLocations] = useState<{ value: number; label: string }[]>([]);
  const [openField, setOpenField] = useState<OpenField>(null);
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  // Its installation date comes from finishing the installation tarea
  // (0032), so it can't be set by hand until then.
  const pendingInstall = equipment.status === "pending_install";
  const statusMeta =
    equipment.status === "operational"
      ? colors.eqOperational
      : equipment.status === "waiting"
        ? colors.eqWaiting
        : pendingInstall
          ? colors.eqPendingInstall
          : colors.eqRepair;
  const statusLabel =
    equipment.status === "operational"
      ? "Funcionando"
      : equipment.status === "waiting"
        ? "En espera"
        : pendingInstall
          ? "Pendiente de instalación"
          : "En reparación";

  useEffect(() => {
    if (!visible) return;
    setCode(equipment.code);
    setName(equipment.name);
    setModel(equipment.model ?? "");
    setTypeId(equipment.typeId);
    setLocationId(equipment.locationId);
    setInstallDate(fromDbDate(equipment.installDate));
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
  }, [visible, equipment]);

  async function handleSubmit() {
    if (
      !code.trim() ||
      !model.trim() ||
      !name.trim() ||
      typeId == null ||
      locationId == null ||
      (!pendingInstall && !installDate.trim())
    ) {
      setError("Todos los campos son obligatorios.");
      return;
    }
    if (!pendingInstall && !isValidDateString(installDate.trim())) {
      setError("Ingresá una fecha de instalación válida (dd/mm/aaaa).");
      return;
    }
    if (!pendingInstall && !isDateWithinMax(installDate.trim(), new Date())) {
      setError("La fecha de instalación no puede ser posterior a hoy.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateEquipment(equipment.id, {
        code: code.trim(),
        name: name.trim(),
        typeId,
        locationId,
        model: model.trim(),
        installDate: pendingInstall ? null : toDbDate(installDate.trim()),
        active: estado === "activo",
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
          <DropdownBackdrop open={openField !== null} onPress={() => setOpenField(null)} />

          <Text style={styles.title}>Editar equipo</Text>

          <View style={styles.fieldRow}>
            <View style={styles.field}>
              <Text style={styles.label}>Código</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej: AC-015"
                placeholderTextColor={colors.textMuted}
                value={code}
                onChangeText={setCode}
                autoCapitalize="characters"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Modelo</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej: Split 3000F"
                placeholderTextColor={colors.textMuted}
                value={model}
                onChangeText={setModel}
              />
            </View>
          </View>

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
            open={openField === "type"}
            onOpenChange={(o) => setOpenField(o ? "type" : null)}
          />

          <Text style={styles.label}>Ubicación</Text>
          <Select
            value={locationId}
            onChange={setLocationId}
            options={locations}
            placeholder="Elegí una ubicación"
            open={openField === "location"}
            onOpenChange={(o) => setOpenField(o ? "location" : null)}
          />

          <View style={[styles.fieldRow, openField === "install" && styles.dateRowRaised]}>
            <View style={styles.field}>
              <Text style={styles.label}>Fecha de instalación</Text>

              {pendingInstall ? (
                <Text style={styles.statusNote}>
                  Se completa sola cuando el técnico finaliza la tarea de instalación.
                </Text>
              ) : (
                <CustomDatePicker
                  value={installDate}
                  onChange={setInstallDate}
                  open={openField === "install"}
                  onOpenChange={(o) => setOpenField(o ? "install" : null)}
                  maxDate={new Date()}
                />
              )}
            </View>
          </View>

          <Text style={styles.label}>Estado operativo</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusBadge, { backgroundColor: statusMeta.bg }]}>
              <Text style={[styles.statusBadgeText, { color: statusMeta.fg }]}>{statusLabel}</Text>
            </View>

            <Text style={styles.statusNote}>
              {pendingInstall
                ? "Hasta que se finalice su orden de instalación"
                : "Automático, según fallas activas"}
            </Text>
          </View>

          <Text style={styles.label}>Estado del registro</Text>

          <RadioGroup
            name="equipment-estado-registro"
            value={estado}
            onChange={setEstado}
            options={ESTADO_OPTIONS}
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <FormFooter onCancel={onClose} onConfirm={handleSubmit} busy={saving} />
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
      justifyContent: "flex-start",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingVertical: 36,
    },
    sheet: {
      backgroundColor: c.bgModal,
      borderRadius: 16,
      padding: 24,
      width: "100%",
      maxWidth: 480,
    },
    title: { fontSize: 19, fontWeight: "600", color: c.text, marginBottom: 8 },
    fieldRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
    field: { flex: 1, minWidth: 140 },
    dateRowRaised: { zIndex: 60 },
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
  });
}
