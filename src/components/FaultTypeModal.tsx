import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import {
  createFaultType,
  GRAVEDAD_LABELS,
  GRAVEDAD_OPTIONS,
  normalizeGravedad,
  updateFaultType,
  type Gravedad,
} from "../lib/queries/faultTypes";
import type { ThemeColors } from "../lib/theme";
import { useTheme } from "../lib/ThemeContext";
import type { Fallo } from "../types/database";

export function FaultTypeModal({
  visible,
  onClose,
  onSaved,
  fault,
  existingFaults = [],
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  fault?: Fallo | null;
  existingFaults?: Fallo[];
}) {
  const isEditing = !!fault;
  const [name, setName] = useState(fault?.fa_nombre ?? "");
  const [desperfecto, setDesperfecto] = useState(fault?.fa_desperfecto ?? "");
  const [gravedad, setGravedad] = useState<Gravedad>(normalizeGravedad(fault?.fa_gravedad));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  useEffect(() => {
    if (!visible) return;
    setName(fault?.fa_nombre ?? "");
    setDesperfecto(fault?.fa_desperfecto ?? "");
    setGravedad(normalizeGravedad(fault?.fa_gravedad));
    setError(null);
  }, [visible, fault]);

  async function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("El nombre de la falla no puede estar vacío.");
      return;
    }

    // Block duplicate names (case/trim-insensitive), excluding the fault being
    // edited. The DB has a matching unique index as the backstop.
    const normalized = trimmedName.toLocaleLowerCase();
    const isDuplicate = existingFaults.some(
      (f) =>
        f.fa_id_fallo !== fault?.fa_id_fallo &&
        f.fa_nombre.trim().toLocaleLowerCase() === normalized,
    );
    if (isDuplicate) {
      setError("Ya existe una falla genérica con ese nombre.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (fault) {
        await updateFaultType(fault.fa_id_fallo, {
          name,
          desperfecto: desperfecto || null,
          gravedad,
        });
      } else {
        await createFaultType({ name, desperfecto: desperfecto || null, gravedad });
      }
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
          <Text style={styles.title}>{isEditing ? fault!.fa_nombre : "Nueva falla genérica"}</Text>
          <Text style={styles.subtitle}>
            {isEditing
              ? "Editá el nombre, el desperfecto o la gravedad."
              : "Definí un tipo de falla para clasificar las incidencias."}
          </Text>

          <Text style={styles.label}>Nombre</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Ej: Pérdida de gas refrigerante"
            placeholderTextColor={colors.textMuted}
            maxLength={100}
          />

          <Text style={styles.label}>Desperfecto</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            value={desperfecto}
            onChangeText={setDesperfecto}
            placeholder="Síntomas o consecuencias físicas de la falla (opcional)"
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={3}
            maxLength={255}
          />

          <Text style={styles.label}>Gravedad</Text>
          <View style={styles.chipsRow}>
            {GRAVEDAD_OPTIONS.map((g) => (
              <Pressable
                key={g}
                style={[
                  styles.chip,
                  gravedad === g && { backgroundColor: colors.accent, borderColor: colors.accent },
                ]}
                onPress={() => setGravedad(g)}
              >
                <Text style={[styles.chipText, gravedad === g && styles.chipTextSelected]}>
                  {GRAVEDAD_LABELS[g]}
                </Text>
              </Pressable>
            ))}
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.actions}>
            <Pressable style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </Pressable>

            <Pressable style={styles.saveButton} onPress={handleSave} disabled={saving}>
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
      maxWidth: 440,
      alignSelf: "center",
    },
    title: { fontSize: 18, fontWeight: "600", color: c.text },
    subtitle: { marginTop: 2, fontSize: 13, color: c.textMuted },
    label: {
      fontSize: 12.5,
      fontWeight: "600",
      color: c.textLabel,
      marginTop: 18,
      marginBottom: 8,
    },
    input: {
      minHeight: 42,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: c.borderInput,
      borderRadius: 10,
      backgroundColor: c.bgInput,
      fontSize: 14,
      color: c.text,
    },
    inputMultiline: { minHeight: 76, textAlignVertical: "top" },
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
    error: { color: c.destructive, marginTop: 12, fontSize: 13 },
    actions: { flexDirection: "row", gap: 10, marginTop: 24 },
    cancelButton: {
      flex: 1,
      height: 44,
      borderRadius: 10,
      backgroundColor: "#dc2626",
      alignItems: "center",
      justifyContent: "center",
    },
    cancelText: { color: "#fff", fontWeight: "600" },
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
