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
import {
  pickFaultPhoto,
  takeFaultPhoto,
  compressToWebp,
  uploadFaultPhoto,
} from "../lib/faultPhoto";
import type { Equipo } from "../types/database";
import { useTheme } from "../lib/ThemeContext";
import type { ThemeColors } from "../lib/theme";

type EquipmentOption = Pick<Equipo, "id" | "code" | "name">;

// A solicitud can carry several photos; capped so reporting a fault stays
// quick and the upload doesn't take forever on a phone connection.
const MAX_PHOTOS = 6;

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
  const [selectedId, setSelectedId] = useState<number | undefined>(equipment?.id);
  const [search, setSearch] = useState("");
  const [description, setDescription] = useState("");
  const [photoUris, setPhotoUris] = useState<string[]>([]);
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  useEffect(() => {
    if (!visible) return;
    setSelectedId(equipment?.id);
    setSearch("");
    setDescription("");
    setPhotoUris([]);
    setError(null);
    setProcessingPhoto(false);
    setSubmitting(false);
  }, [visible, equipment?.id]);

  const effectiveEquipmentId = equipment?.id ?? selectedId;
  const selectedOption = equipmentOptions?.find((e) => e.id === selectedId);
  const query = search.trim().toLowerCase();
  const filteredOptions =
    query.length === 0
      ? []
      : (equipmentOptions ?? []).filter(
          (e) => e.code.toLowerCase().includes(query) || e.name.toLowerCase().includes(query),
        );

  async function handlePickPhoto() {
    if (photoUris.length >= MAX_PHOTOS) return;
    setError(null);
    setProcessingPhoto(true);
    try {
      const uri = await pickFaultPhoto();
      if (uri) {
        const compressed = await compressToWebp(uri);
        setPhotoUris((prev) => [...prev, compressed]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProcessingPhoto(false);
    }
  }

  async function handleTakePhoto() {
    if (photoUris.length >= MAX_PHOTOS) return;
    setError(null);
    setProcessingPhoto(true);
    try {
      const uri = await takeFaultPhoto();
      if (uri) {
        const compressed = await compressToWebp(uri);
        setPhotoUris((prev) => [...prev, compressed]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProcessingPhoto(false);
    }
  }

  function handleRemovePhoto(index: number) {
    setPhotoUris((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    if (
      typeof effectiveEquipmentId !== "number" ||
      !Number.isInteger(effectiveEquipmentId) ||
      effectiveEquipmentId <= 0
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
      const photoUrls = await Promise.all(photoUris.map((uri) => uploadFaultPhoto(uri)));
      await createFault({
        equipmentId: effectiveEquipmentId,
        description: description.trim(),
        photoUrls,
      });
      setDescription("");
      setSelectedId(equipment?.id);
      setSearch("");
      setPhotoUris([]);
      onSubmitted();
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
            <Text style={styles.title}>Reportar falla</Text>

            {!equipment && equipmentOptions && (
              <View style={styles.pickerWrap}>
                <Text style={styles.label}>Equipo</Text>

                {selectedOption ? (
                  <View style={styles.selectedEquipmentRow}>
                    <Text style={styles.pickerText}>
                      {selectedOption.code} · {selectedOption.name}
                    </Text>

                    <Pressable
                      onPress={() => {
                        setSelectedId(undefined);
                        setSearch("");
                      }}
                    >
                      <Text style={styles.changeEquipmentText}>Cambiar</Text>
                    </Pressable>
                  </View>
                ) : (
                  <>
                    <TextInput
                      style={styles.searchInput}
                      value={search}
                      onChangeText={setSearch}
                      placeholder="Buscar por código o nombre…"
                      placeholderTextColor={colors.textMuted}
                      autoCorrect={false}
                    />

                    {query.length > 0 && (
                      <ScrollView
                        style={styles.resultsList}
                        nestedScrollEnabled
                        keyboardShouldPersistTaps="handled"
                      >
                        {filteredOptions.length === 0 ? (
                          <Text style={styles.noResultsText}>Sin resultados</Text>
                        ) : (
                          filteredOptions.map((e) => (
                            <Pressable
                              key={e.id}
                              style={styles.pickerRow}
                              onPress={() => {
                                setSelectedId(e.id);
                                setSearch("");
                              }}
                            >
                              <Text style={styles.pickerText}>
                                {e.code} · {e.name}
                              </Text>
                            </Pressable>
                          ))
                        )}
                      </ScrollView>
                    )}
                  </>
                )}
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
              maxLength={2000}
            />

            <Text style={styles.label}>Fotos (opcional, hasta {MAX_PHOTOS})</Text>

            {photoUris.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.photoStrip}
                contentContainerStyle={styles.photoStripContent}
              >
                {photoUris.map((uri, i) => (
                  <View key={`${i}-${uri.length}`} style={styles.photoPreviewWrap}>
                    <Image source={{ uri }} style={styles.photoPreview} />

                    <Pressable style={styles.photoRemoveBadge} onPress={() => handleRemovePhoto(i)}>
                      <Text style={styles.photoRemoveBadgeText}>✕</Text>
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            )}

            {photoUris.length < MAX_PHOTOS && (
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
                <Text style={styles.submitText}>{submitting ? "Enviando…" : "Confirmar"}</Text>
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
    title: { fontSize: 20, fontWeight: "600", color: c.text, marginBottom: 16 },
    label: {
      fontSize: 12.5,
      fontWeight: "600",
      color: c.textLabel,
      marginBottom: 6,
      marginTop: 12,
    },
    fixedEquipment: { fontSize: 14, color: c.text, fontWeight: "600" },
    pickerWrap: { marginBottom: 4 },
    searchInput: {
      borderWidth: 1,
      borderColor: c.borderInput,
      borderRadius: 10,
      padding: 10,
      fontSize: 13.5,
      backgroundColor: c.bgInput,
      color: c.text,
    },
    resultsList: { maxHeight: 160, marginTop: 6 },
    noResultsText: { fontSize: 13, color: c.textMuted, padding: 10 },
    selectedEquipmentRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      padding: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.accent,
      backgroundColor: c.bgNested,
    },
    changeEquipmentText: { fontSize: 12.5, fontWeight: "600", color: c.accent },
    pickerRow: {
      padding: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 6,
      backgroundColor: c.bgInput,
    },
    pickerText: { fontSize: 13.5, color: c.text, flexShrink: 1 },
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
    // Horizontal, side-scrolling strip of thumbnails — same "scroll sideways
    // to see every photo" pattern requested for viewing a solicitud's photos.
    photoStrip: { marginBottom: 10 },
    photoStripContent: { gap: 10, paddingRight: 4 },
    photoPreviewWrap: { position: "relative" },
    photoPreview: { width: 72, height: 72, borderRadius: 10, backgroundColor: c.bgNested },
    photoRemoveBadge: {
      position: "absolute",
      top: -6,
      right: -6,
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: c.destructive,
      alignItems: "center",
      justifyContent: "center",
    },
    photoRemoveBadgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
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
