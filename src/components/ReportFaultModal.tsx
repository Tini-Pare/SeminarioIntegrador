import { useState } from "react";
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
import {
  pickFaultPhoto,
  takeFaultPhoto,
  compressToWebp,
  uploadFaultPhoto,
} from "../lib/faultPhoto";
import type { Equipment, Fault } from "../types/database";
import { useTheme } from "../lib/ThemeContext";
import type { ThemeColors } from "../lib/theme";

type EquipmentOption = Pick<Equipment, "id" | "code" | "name">;

const URGENCIES: Fault["urgency"][] = ["low", "medium", "high"];
const URGENCY_LABELS: Record<Fault["urgency"], string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
};

export function ReportFaultModal({
  visible,
  onClose,
  onSubmitted,
  equipment,
  equipmentOptions,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmitted: () => void;
  equipment?: EquipmentOption;
  equipmentOptions?: EquipmentOption[];
}) {
  const [selectedId, setSelectedId] = useState<string | undefined>(equipment?.id);
  const [description, setDescription] = useState("");
  const [urgency, setUrgency] = useState<Fault["urgency"]>("medium");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const effectiveEquipmentId = equipment?.id ?? selectedId;

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
    if (!effectiveEquipmentId || !description.trim()) {
      setError("Elegí un equipo y describí la falla.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const photoUrl = photoUri ? await uploadFaultPhoto(photoUri) : undefined;
      await createFault({
        equipmentId: effectiveEquipmentId,
        description: description.trim(),
        urgency,
        photoUrl,
      });
      setDescription("");
      setUrgency("medium");
      setSelectedId(equipment?.id);
      setPhotoUri(null);
      onSubmitted();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <ScrollView contentContainerStyle={{ padding: 20 }}>
            <Text style={styles.title}>Reportar falla</Text>

            {!equipment && equipmentOptions && (
              <View style={styles.pickerWrap}>
                <Text style={styles.label}>Equipo</Text>
                {equipmentOptions.map((e) => (
                  <Pressable
                    key={e.id}
                    style={[
                      styles.pickerRow,
                      selectedId === e.id && { borderColor: colors.accent, backgroundColor: colors.bgNested },
                    ]}
                    onPress={() => setSelectedId(e.id)}
                  >
                    <Text style={styles.pickerText}>
                      {e.code} · {e.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            {equipment && (
              <Text style={styles.fixedEquipment}>
                {equipment.code} · {equipment.name}
              </Text>
            )}

            <Text style={styles.label}>Descripción</Text>
            <TextInput
              style={styles.textarea}
              multiline
              numberOfLines={4}
              value={description}
              onChangeText={setDescription}
              placeholder="¿Qué está pasando?"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={styles.label}>Urgencia</Text>
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
                  <Text style={styles.photoButtonText}>Elegir de galería</Text>
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

            {error && <Text style={styles.error}>{error}</Text>}

            <View style={styles.actions}>
              <Pressable style={styles.cancelButton} onPress={onClose}>
                <Text style={styles.cancelText}>Cancelar</Text>
              </Pressable>

              <Pressable style={styles.submitButton} onPress={handleSubmit} disabled={submitting}>
                <Text style={styles.submitText}>{submitting ? "Enviando…" : "Reportar"}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", padding: 20 },
    sheet: {
      backgroundColor: c.bgModal,
      borderRadius: 16,
      maxHeight: "80%",
      width: "100%",
      maxWidth: 480,
      alignSelf: "center",
    },
    title: { fontSize: 20, fontWeight: "600", color: c.text, marginBottom: 16 },
    label: { fontSize: 12.5, fontWeight: "600", color: c.textLabel, marginBottom: 6, marginTop: 12 },
    fixedEquipment: { fontSize: 14, color: c.text, fontWeight: "600" },
    pickerWrap: { marginBottom: 4 },
    pickerRow: {
      padding: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 6,
      backgroundColor: c.bgInput,
    },
    pickerText: { fontSize: 13.5, color: c.text },
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
    photoPreviewWrap: { flexDirection: "row", alignItems: "center", gap: 12 },
    photoPreview: { width: 72, height: 72, borderRadius: 10, backgroundColor: c.bgNested },
    photoRemoveButton: { paddingVertical: 6 },
    photoRemoveText: { color: c.destructive, fontSize: 13, fontWeight: "600" },
    actions: { flexDirection: "row", gap: 10, marginTop: 20 },
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
