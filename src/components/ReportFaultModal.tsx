import { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  Image,
  Platform,
  ActivityIndicator,
} from "react-native";
import { createFault } from "../lib/queries/faults";
import { listFaultTypes } from "../lib/queries/faultTypes";
import {
  pickFaultPhoto,
  takeFaultPhoto,
  compressToWebp,
  uploadFaultPhoto,
} from "../lib/faultPhoto";
import type { Equipo, Fallo, Solicitud } from "../types/database";
import { StatusBadge } from "./StatusBadge";
import { Select } from "./Select";
import { useTheme } from "../lib/ThemeContext";
import type { ThemeColors } from "../lib/theme";

const URGENCIES: Solicitud["urgency"][] = ["low", "medium", "high"];
const URGENCY_LABELS: Record<Solicitud["urgency"], string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
};

export function ReportFaultModal({
  visible,
  onClose,
  onSubmitted,
  equipmentOptions,
  reporterName,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmitted: () => void | Promise<void>;
  equipmentOptions: Equipo[];
  reporterName: string | null;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [equipmentSelectOpen, setEquipmentSelectOpen] = useState(false);
  const [faultTypes, setFaultTypes] = useState<Fallo[]>([]);
  const [faultTypeId, setFaultTypeId] = useState<number | null>(null);
  const [faultTypeSelectOpen, setFaultTypeSelectOpen] = useState(false);
  const [faultTypesError, setFaultTypesError] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [urgency, setUrgency] = useState<Solicitud["urgency"]>("medium");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportedAt, setReportedAt] = useState(() => new Date());
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  useEffect(() => {
    if (!visible) return;
    setSelectedId(null);
    setEquipmentSelectOpen(false);
    setFaultTypeId(null);
    setFaultTypeSelectOpen(false);
    setDescription("");
    setUrgency("medium");
    setPhotoUri(null);
    setError(null);
    setProcessingPhoto(false);
    setSubmitting(false);
    setReportedAt(new Date());
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    setFaultTypes([]);
    setFaultTypesError(null);
    listFaultTypes()
      .then(setFaultTypes)
      .catch((e) => setFaultTypesError(e instanceof Error ? e.message : String(e)));
  }, [visible]);

  const selectedEquipment = equipmentOptions.find((e) => e.id === selectedId) ?? null;
  const equipmentSelectOptions = equipmentOptions.map((e) => ({
    value: e.id,
    label: `${e.code} — ${e.name}`,
  }));
  const faultTypeOptions = faultTypes.map((faultType) => ({
    value: faultType.fa_id_fallo,
    label: faultType.fa_nombre,
  }));

  async function handlePickPhoto() {
    setError(null);
    setProcessingPhoto(true);
    try {
      const uri = await pickFaultPhoto();
      if (uri) setPhotoUri(await compressToWebp(uri));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProcessingPhoto(false);
    }
  }

  async function handleTakePhoto() {
    setError(null);
    setProcessingPhoto(true);
    try {
      const uri = await takeFaultPhoto();
      if (uri) setPhotoUri(await compressToWebp(uri));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProcessingPhoto(false);
    }
  }

  async function handleSubmit() {
    if (!reporterName) {
      setError("No se pudo obtener el usuario actual. Volvé a iniciar sesión.");
      return;
    }
    if (
      !selectedEquipment ||
      !Number.isInteger(selectedEquipment.id) ||
      selectedEquipment.id <= 0
    ) {
      setError("Elegí un equipo válido.");
      return;
    }
    if (!description.trim()) {
      setError("Describí la falla para poder registrarla.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const photoUrl = photoUri ? await uploadFaultPhoto(photoUri) : undefined;
      await createFault({
        equipmentId: selectedEquipment.id,
        description: description.trim(),
        urgency,
        faultTypeId,
        photoUrl,
      });
      setDescription("");
      setUrgency("medium");
      setSelectedId(null);
      setFaultTypeId(null);
      setPhotoUri(null);
      await onSubmitted();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!submitting && !processingPhoto) onClose();
      }}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <ScrollView contentContainerStyle={{ padding: 20 }}>
            <Text style={styles.title}>Nueva solicitud</Text>

            <Text style={styles.subtitle}>
              Reportá una falla o inconveniente asociado a un equipo.
            </Text>

            <Text style={styles.sectionTitle}>Datos del equipo</Text>

            <View style={styles.pickerWrap}>
              <Text style={styles.label}>Equipo *</Text>

              <Select
                value={selectedId}
                onChange={setSelectedId}
                options={equipmentSelectOptions}
                open={equipmentSelectOpen}
                onOpenChange={setEquipmentSelectOpen}
                placeholder={
                  equipmentOptions.length === 0 ? "No hay equipos disponibles" : "Elegí un equipo"
                }
                disabled={equipmentOptions.length === 0}
              />
            </View>

            {selectedEquipment && (
              <View style={styles.equipmentInfo}>
                <Text style={styles.equipmentInfoTitle}>Información del equipo</Text>

                <EquipmentInfoRow label="Código" value={selectedEquipment.code} />

                <EquipmentInfoRow label="Nombre" value={selectedEquipment.name} />

                <EquipmentInfoRow
                  label="Ubicación"
                  value={selectedEquipment.location || "No registrada"}
                />

                <EquipmentInfoRow label="Tipo" value={selectedEquipment.type || "No registrado"} />

                <View style={styles.equipmentInfoRow}>
                  <Text style={styles.equipmentInfoLabel}>Estado actual</Text>

                  <StatusBadge status={selectedEquipment.status} />
                </View>

                {selectedEquipment.model && (
                  <EquipmentInfoRow label="Modelo" value={selectedEquipment.model} />
                )}

                {selectedEquipment.installDate && (
                  <EquipmentInfoRow
                    label="Instalación"
                    value={formatEquipmentDate(selectedEquipment.installDate)}
                  />
                )}

                {selectedEquipment.warrantyDate && (
                  <EquipmentInfoRow
                    label="Garantía"
                    value={formatEquipmentDate(selectedEquipment.warrantyDate)}
                  />
                )}
              </View>
            )}

            <Text style={styles.sectionTitle}>Detalle de la falla</Text>

            <Text style={styles.label}>Tipo de falla</Text>

            <Select
              value={faultTypeId}
              onChange={setFaultTypeId}
              options={faultTypeOptions}
              open={faultTypeSelectOpen}
              onOpenChange={setFaultTypeSelectOpen}
              placeholder={
                faultTypes.length === 0 ? "No hay tipos de falla disponibles" : "Seleccionar"
              }
              disabled={faultTypes.length === 0}
            />

            {faultTypesError && <Text style={styles.error}>{faultTypesError}</Text>}

            <Text style={styles.label}>Descripción *</Text>

            <TextInput
              style={styles.textarea}
              multiline
              numberOfLines={4}
              value={description}
              onChangeText={setDescription}
              placeholder="¿Qué está pasando?"
              placeholderTextColor={colors.textMuted}
              maxLength={2000}
            />

            <Text style={styles.characterCount}>{description.length} / 2000</Text>

            <Text style={styles.label}>Urgencia *</Text>

            <View style={styles.chipsRow}>
              {URGENCIES.map((u) => (
                <Pressable
                  key={u}
                  style={[
                    styles.chip,
                    urgency === u && { backgroundColor: colors.accent, borderColor: colors.accent },
                  ]}
                  onPress={() => setUrgency(u)}
                >
                  <Text style={[styles.chipText, urgency === u && styles.chipTextSelected]}>
                    {URGENCY_LABELS[u]}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.sectionTitle}>Evidencia</Text>

            <Text style={styles.label}>Foto (opcional)</Text>

            {photoUri ? (
              <View style={styles.photoPreviewWrap}>
                <Image source={{ uri: photoUri }} style={styles.photoPreview} />
                <Pressable style={styles.photoRemoveButton} onPress={() => setPhotoUri(null)}>
                  <Text style={styles.photoRemoveText}>Quitar foto</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.photoButtonsRow}>
                <Pressable
                  style={styles.photoButton}
                  onPress={handlePickPhoto}
                  disabled={processingPhoto}
                >
                  <Text style={styles.photoButtonText}>Adjuntar foto</Text>
                </Pressable>

                {Platform.OS !== "web" && (
                  <Pressable
                    style={styles.photoButton}
                    onPress={handleTakePhoto}
                    disabled={processingPhoto}
                  >
                    <Text style={styles.photoButtonText}>Sacar foto</Text>
                  </Pressable>
                )}

                {processingPhoto && <ActivityIndicator size="small" />}
              </View>
            )}

            {!photoUri && <Text style={styles.photoHelp}>Podés adjuntar una imagen opcional.</Text>}

            <Text style={styles.sectionTitle}>Información del reporte</Text>

            <View style={styles.reportInfo}>
              <EquipmentInfoRow label="Reportado por" value={reporterName ?? "No disponible"} />

              <EquipmentInfoRow label="Fecha" value={reportedAt.toLocaleDateString("es-AR")} />

              <EquipmentInfoRow
                label="Hora"
                value={reportedAt.toLocaleTimeString("es-AR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              />

              <EquipmentInfoRow label="Estado inicial" value="Pendiente" />
            </View>

            {error && <Text style={styles.error}>{error}</Text>}

            <View style={styles.actions}>
              <Pressable
                style={[
                  styles.cancelButton,
                  (submitting || processingPhoto) && styles.disabledButton,
                ]}
                onPress={onClose}
                disabled={submitting || processingPhoto}
              >
                <Text style={styles.cancelText}>Cancelar</Text>
              </Pressable>

              <Pressable style={styles.submitButton} onPress={handleSubmit} disabled={submitting}>
                <Text style={styles.submitText}>
                  {submitting ? "Enviando…" : "Reportar solicitud"}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function formatEquipmentDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString("es-AR");
}

function EquipmentInfoRow({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  return (
    <View style={styles.equipmentInfoRow}>
      <Text style={styles.equipmentInfoLabel}>{label}</Text>

      <Text style={styles.equipmentInfoValue}>{value}</Text>
    </View>
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
      maxHeight: "80%",
      width: "100%",
      maxWidth: 480,
      alignSelf: "center",
    },
    title: { fontSize: 20, fontWeight: "600", color: c.text },
    subtitle: { marginTop: 4, fontSize: 13.5, color: c.textSecondary },
    sectionTitle: {
      marginTop: 24,
      fontSize: 11.5,
      fontWeight: "700",
      letterSpacing: 0.7,
      textTransform: "uppercase",
      color: c.textSecondary,
    },
    label: {
      fontSize: 12.5,
      fontWeight: "600",
      color: c.textLabel,
      marginBottom: 6,
      marginTop: 12,
    },
    pickerWrap: { marginBottom: 4 },
    equipmentInfo: {
      marginTop: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      backgroundColor: c.bgNested,
      gap: 7,
    },
    equipmentInfoTitle: { fontSize: 13.5, fontWeight: "700", color: c.text },
    equipmentInfoRow: { flexDirection: "row", gap: 12 },
    equipmentInfoLabel: { width: 94, fontSize: 13, color: c.textSecondary },
    equipmentInfoValue: { flex: 1, fontSize: 13, color: c.text, fontWeight: "600" },
    textarea: {
      borderWidth: 1,
      borderColor: c.borderInput,
      borderRadius: 10,
      padding: 12,
      fontSize: 14,
      minHeight: 90,
      textAlignVertical: "top",
      backgroundColor: c.bgInput,
      color: c.text,
    },
    characterCount: { alignSelf: "flex-end", marginTop: 4, fontSize: 11.5, color: c.textMuted },
    chipsRow: { flexDirection: "row", gap: 8 },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: c.borderInput,
      backgroundColor: c.bgInput,
    },
    chipText: { fontSize: 13, color: c.textLabel },
    chipTextSelected: { color: "#fff", fontWeight: "600" },
    error: { color: c.destructive, marginTop: 12 },
    photoButtonsRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
    photoButton: {
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 9,
      borderWidth: 1,
      borderColor: c.borderInput,
    },
    photoButtonText: { fontSize: 13, fontWeight: "600", color: c.textLabel },
    photoHelp: { marginTop: 6, fontSize: 12, color: c.textMuted },
    photoPreviewWrap: { flexDirection: "row", alignItems: "center", gap: 12 },
    photoPreview: { width: 72, height: 72, borderRadius: 10, backgroundColor: c.bgNested },
    photoRemoveButton: { paddingVertical: 6 },
    photoRemoveText: { color: c.destructive, fontSize: 13, fontWeight: "600" },
    reportInfo: {
      marginTop: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      backgroundColor: c.bgNested,
      gap: 7,
    },
    actions: { flexDirection: "row", gap: 10, marginTop: 20 },
    cancelButton: {
      flex: 1,
      height: 44,
      borderRadius: 10,
      backgroundColor: "#dc2626",
      alignItems: "center",
      justifyContent: "center",
    },
    disabledButton: { opacity: 0.55 },
    cancelText: { color: "#fff", fontWeight: "600" },
    submitButton: {
      flex: 1,
      height: 44,
      borderRadius: 10,
      backgroundColor: c.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    submitText: { color: "#fff", fontWeight: "600" },
  });
}
