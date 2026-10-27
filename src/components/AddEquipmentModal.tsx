import { useEffect, useState } from "react";
import { Modal, StyleSheet, Text, TextInput, View } from "react-native";
import { createEquipment } from "../lib/queries/equipment";
import { listEquipmentTypes } from "../lib/queries/equipmentTypes";
import { listLocations } from "../lib/queries/locations";
import { listProfiles } from "../lib/queries/profiles";
import { DropdownBackdrop } from "./DropdownBackdrop";
import { FieldLabel } from "./FieldLabel";
import { FormFooter } from "./FormFooter";
import { RadioGroup, type RadioOption } from "./RadioGroup";
import { Select } from "./Select";
import { useTheme } from "../lib/ThemeContext";
import type { ThemeColors } from "../lib/theme";
import { CustomDatePicker, isDateWithinMax, isValidDateString, toDbDate } from "./CustomDatePicker";

type OpenField = "type" | "location" | "install" | "technician" | null;
type Installed = "si" | "no";
type Priority = "low" | "medium" | "high";

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
  const [model, setModel] = useState("");
  const [typeId, setTypeId] = useState<number | null>(null);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [installDate, setInstallDate] = useState("");
  // Asked every time, no default: an equipo already working and a new one
  // still to be installed take different paths (see createEquipment).
  const [installed, setInstalled] = useState<Installed | null>(null);
  const [technicianId, setTechnicianId] = useState<string | null>(null);
  const [priority, setPriority] = useState<Priority | null>(null);
  const [technicians, setTechnicians] = useState<{ value: string; label: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set by a failed submit: from then on the empty required fields are
  // outlined in red.
  const [showMissing, setShowMissing] = useState(false);
  const [types, setTypes] = useState<{ value: number; label: string }[]>([]);
  const [locations, setLocations] = useState<{ value: number; label: string }[]>([]);
  const [openField, setOpenField] = useState<OpenField>(null);
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  useEffect(() => {
    if (!visible) return;
    setCode("");
    setName("");
    setModel("");
    setTypeId(null);
    setLocationId(null);
    setInstallDate("");
    setInstalled(null);
    setTechnicianId(null);
    setPriority(null);
    setOpenField(null);
    setError(null);
    setShowMissing(false);

    listEquipmentTypes()
      .then((rows) => setTypes(rows.map((t) => ({ value: t.te_id, label: t.te_nombre }))))
      .catch(() => {});
    listLocations()
      .then((rows) =>
        setLocations(rows.map((l) => ({ value: l.lu_codigo, label: l.lu_nombre_sector }))),
      )
      .catch(() => {});
    listProfiles()
      .then((rows) =>
        setTechnicians(
          rows
            .filter((p) => p.role === "technician" && p.active)
            .map((p) => ({ value: p.id, label: p.name })),
        ),
      )
      .catch(() => {});
  }, [visible]);

  const installedOptions: RadioOption<Installed>[] = [
    { value: "si", label: "Sí, ya está funcionando" },
    { value: "no", label: "No, hay que instalarlo" },
  ];
  const priorityOptions: RadioOption<Priority>[] = [
    { value: "low", label: "Baja", badge: colors.urgencyLow },
    { value: "medium", label: "Media", badge: colors.urgencyMedium },
    { value: "high", label: "Alta", badge: colors.urgencyHigh },
  ];

  const noTypes = types.length === 0;
  const noLocations = locations.length === 0;
  const blocked = noTypes || noLocations;

  const missing = {
    code: !code.trim(),
    model: !model.trim(),
    name: !name.trim(),
    type: typeId == null,
    location: locationId == null,
    installed: installed == null,
    installDate: installed === "si" && !installDate.trim(),
    technician: installed === "no" && !technicianId,
    priority: installed === "no" && !priority,
  };
  const isMissing = (field: keyof typeof missing) => showMissing && missing[field];

  async function handleSubmit() {
    if (Object.values(missing).some(Boolean)) {
      setShowMissing(true);
      setError("Completá los campos marcados.");
      return;
    }
    if (installed === "si") {
      if (!isValidDateString(installDate.trim())) {
        setError("Ingresá una fecha de instalación válida (dd/mm/aaaa).");
        return;
      }
      if (!isDateWithinMax(installDate.trim(), new Date())) {
        setError("La fecha de instalación no puede ser posterior a hoy.");
        return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      const base = {
        code: code.trim(),
        name: name.trim(),
        // Checked by `missing` above.
        typeId: typeId!,
        locationId: locationId!,
        model: model.trim(),
      };
      await createEquipment(
        installed === "si"
          ? { ...base, pending: false, installDate: toDbDate(installDate.trim()) }
          : { ...base, pending: true, technicianId: technicianId!, priority: priority! },
      );

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
          <DropdownBackdrop open={openField !== null} onPress={() => setOpenField(null)} />

          <Text style={styles.title}>Crear equipo</Text>

          <Text style={styles.subtitle}>
            {installed === "no"
              ? 'Queda "Pendiente de instalación" con su orden de instalación. Al finalizarla se registra la fecha y entra en los planes de mantenimiento de su tipo.'
              : 'Nace "Funcionando" y entra en los planes de mantenimiento de su tipo — el estado se recalcula solo según las fallas activas.'}
          </Text>

          <View style={styles.fieldRow}>
            <View style={styles.field}>
              <FieldLabel text="Código" required style={styles.label} />
              <TextInput
                style={[styles.input, isMissing("code") && styles.inputError]}
                placeholder="Ej: AC-015"
                placeholderTextColor={colors.textMuted}
                value={code}
                onChangeText={setCode}
                autoCapitalize="characters"
              />
            </View>

            <View style={styles.field}>
              <FieldLabel text="Modelo" required style={styles.label} />
              <TextInput
                style={[styles.input, isMissing("model") && styles.inputError]}
                placeholder="Ej: Split 3000F"
                placeholderTextColor={colors.textMuted}
                value={model}
                onChangeText={setModel}
              />
            </View>
          </View>

          <FieldLabel text="Nombre" required style={styles.label} />
          <TextInput
            style={[styles.input, isMissing("name") && styles.inputError]}
            placeholder="Ej: Aire Acondicionado"
            placeholderTextColor={colors.textMuted}
            value={name}
            onChangeText={setName}
          />

          <FieldLabel text="Tipo" required style={styles.label} />
          <Select
            value={typeId}
            onChange={setTypeId}
            options={types}
            placeholder="Elegí un tipo de equipo"
            disabled={noTypes}
            hasError={isMissing("type")}
            open={openField === "type"}
            onOpenChange={(o) => setOpenField(o ? "type" : null)}
          />

          <FieldLabel text="Ubicación" required style={styles.label} />
          <Select
            value={locationId}
            onChange={setLocationId}
            options={locations}
            placeholder="Elegí una ubicación"
            disabled={noLocations}
            hasError={isMissing("location")}
            open={openField === "location"}
            onOpenChange={(o) => setOpenField(o ? "location" : null)}
          />

          <FieldLabel text="¿El equipo ya está instalado?" required style={styles.label} />
          <RadioGroup
            name="equipment-installed"
            value={installed}
            onChange={(v) => {
              setInstalled(v);
              setOpenField(null);
              setError(null);
            }}
            options={installedOptions}
          />

          {installed === "si" && (
            <View style={[styles.fieldRow, openField === "install" && styles.dateRowRaised]}>
              <View style={styles.field}>
                <FieldLabel text="Fecha de instalación" required style={styles.label} />
                <CustomDatePicker
                  value={installDate}
                  onChange={setInstallDate}
                  open={openField === "install"}
                  onOpenChange={(o) => setOpenField(o ? "install" : null)}
                  maxDate={new Date()}
                  hasError={isMissing("installDate")}
                />
              </View>
            </View>
          )}

          {installed === "no" && (
            <>
              <FieldLabel text="Técnico que lo instala" required style={styles.label} />
              <Select
                value={technicianId}
                onChange={setTechnicianId}
                options={technicians}
                placeholder={
                  technicians.length > 0 ? "Elegí un técnico" : "No hay técnicos activos"
                }
                disabled={technicians.length === 0}
                hasError={isMissing("technician")}
                open={openField === "technician"}
                onOpenChange={(o) => setOpenField(o ? "technician" : null)}
              />

              <FieldLabel text="Prioridad de la instalación" required style={styles.label} />
              <RadioGroup
                name="installation-priority"
                value={priority}
                onChange={setPriority}
                options={priorityOptions}
              />
            </>
          )}

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

          <FormFooter
            onCancel={onClose}
            onConfirm={handleSubmit}
            busy={saving}
            disabled={blocked}
          />
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
    title: { fontSize: 19, fontWeight: "600", color: c.text, marginBottom: 4 },
    subtitle: { fontSize: 12.5, color: c.textMuted, marginBottom: 8 },
    fieldRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
    field: { flex: 1, minWidth: 140 },
    // Lifts the date row (and its calendar popup) above the fields and the
    // action buttons below it while a calendar is open.
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
    inputError: { borderColor: c.destructive, borderWidth: 1.5 },
    blockedNote: { color: c.textLabel, marginTop: 14, fontSize: 12.5, lineHeight: 17 },
    error: { color: c.destructive, marginTop: 14, fontSize: 13 },
  });
}
