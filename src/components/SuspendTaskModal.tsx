import { useEffect, useState } from "react";
import { Modal, StyleSheet, Text, TextInput, View } from "react-native";
import type { ThemeColors } from "../lib/theme";
import { useTheme } from "../lib/ThemeContext";
import { FormFooter } from "./FormFooter";
import { RadioGroup, type RadioOption } from "./RadioGroup";

// SCRUM-37: why a tarea in progress is put on hold. Same flow as
// CloseWithoutOrderModal: pick a reason, "Otro" requires writing it.
export const SUSPENSION_REASONS: RadioOption<string>[] = [
  { value: "Falta de repuestos", label: "Falta de repuestos" },
  { value: "Esperando proveedor externo", label: "Esperando proveedor externo" },
  { value: "Equipo no disponible", label: "Equipo no disponible (en uso o sin acceso)" },
  { value: "Requiere autorización", label: "Requiere autorización" },
  { value: "Otro", label: "Otro" },
];

export function SuspendTaskModal({
  visible,
  onClose,
  onConfirm,
  taskName,
  equipmentLabel,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (input: { reason: string; comment?: string }) => void | Promise<void>;
  taskName: string;
  equipmentLabel: string;
}) {
  const [reason, setReason] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  // The "write the reason" warning waits until the field is left empty,
  // instead of showing as soon as "Otro" is picked.
  const [commentTouched, setCommentTouched] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  useEffect(() => {
    if (!visible) return;
    setReason(null);
    setComment("");
    setCommentTouched(false);
    setConfirming(false);
    setError(null);
  }, [visible]);

  const isOtro = reason === "Otro";
  const commentTrimmed = comment.trim();
  const canConfirm = !confirming && Boolean(reason && (!isOtro || commentTrimmed.length > 0));

  async function handleConfirm() {
    if (!reason) {
      setError("Seleccioná un motivo.");
      return;
    }
    if (isOtro && !commentTrimmed) {
      setError("Escribí el motivo para continuar.");
      return;
    }

    setConfirming(true);
    setError(null);
    try {
      await onConfirm({ reason, comment: isOtro ? commentTrimmed : undefined });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setConfirming(false);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => !confirming && onClose()}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Suspender tarea</Text>

          <Text style={styles.subtitle}>
            {taskName} · {equipmentLabel}
          </Text>

          <Text style={styles.hint}>
            La tarea queda en pausa hasta que la reanudes. No se puede finalizar mientras esté
            suspendida.
          </Text>

          <Text nativeID="motivo-suspension-label" style={styles.label}>
            Motivo de la suspensión *
          </Text>

          <RadioGroup
            name="motivo-suspension"
            variant="cards"
            ariaLabelledBy="motivo-suspension-label"
            value={reason}
            onChange={(val) => {
              setReason(val);
              if (val !== "Otro") setComment("");
              setCommentTouched(false);
              if (error) setError(null);
            }}
            options={SUSPENSION_REASONS}
          />

          {isOtro && (
            <View style={styles.commentSection}>
              <Text style={styles.commentLabel}>Detalle del motivo *</Text>

              <TextInput
                style={styles.commentInput}
                value={comment}
                onChangeText={(t) => {
                  setComment(t);
                  if (error) setError(null);
                }}
                placeholder="Explicá brevemente por qué se suspende"
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={3}
                maxLength={255}
                onBlur={() => setCommentTouched(true)}
                autoFocus
              />

              {commentTouched && !commentTrimmed && (
                <Text style={styles.inlineWarning}>Escribí el motivo para continuar.</Text>
              )}
            </View>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          <FormFooter
            onCancel={onClose}
            onConfirm={handleConfirm}
            busy={confirming}
            busyLabel="Suspendiendo…"
            disabled={!canConfirm}
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
    title: { fontSize: 18, fontWeight: "600", color: c.text },
    subtitle: { marginTop: 2, fontSize: 13, color: c.textMuted },
    hint: { marginTop: 10, fontSize: 13, color: c.textSecondary, lineHeight: 18 },
    label: {
      fontSize: 12.5,
      fontWeight: "600",
      color: c.textLabel,
      marginTop: 18,
      marginBottom: 10,
    },
    commentSection: { marginTop: 14 },
    commentLabel: { fontSize: 12.5, fontWeight: "600", color: c.textLabel, marginBottom: 6 },
    commentInput: {
      backgroundColor: "#ffffff",
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      minHeight: 78,
      borderWidth: 1,
      borderColor: c.borderInput,
      fontSize: 15,
      color: c.text,
      textAlignVertical: "top",
    },
    inlineWarning: { marginTop: 6, fontSize: 12.5, color: c.destructive, fontWeight: "500" },
    error: { color: c.destructive, marginTop: 12, fontSize: 13, fontWeight: "600" },
  });
}
