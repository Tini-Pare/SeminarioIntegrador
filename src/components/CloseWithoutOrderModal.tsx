import { useEffect, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { ThemeColors } from "../lib/theme";
import { useTheme } from "../lib/ThemeContext";
import { RadioGroup, type RadioOption } from "./RadioGroup";
import { Sigla } from "./Sigla";

const MOTIVO_OPTIONS: RadioOption<string>[] = [
  { value: "Duplicada", label: "Duplicada" },
  { value: "Falsa alarma", label: "Falsa alarma" },
  {
    value: "Se resolvió sin OT (ajuste menor)",
    label: "Se resolvió sin orden de trabajo (ajuste menor)",
  },
  { value: "Otro", label: "Otro" },
];

export function CloseWithoutOrderModal({
  visible,
  onClose,
  onConfirm,
  equipmentLabel,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (input: { reason: string; comment?: string }) => void | Promise<void>;
  equipmentLabel: string;
}) {
  const [reason, setReason] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  useEffect(() => {
    if (!visible) return;
    setReason(null);
    setComment("");
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
    if (reason === "Otro" && !commentTrimmed) {
      setError("Escribí el motivo para continuar.");
      return;
    }

    setConfirming(true);
    setError(null);
    try {
      await onConfirm({
        reason,
        comment: reason === "Otro" ? commentTrimmed : undefined,
      });
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
          <Text style={styles.title}>
            Cerrar solicitud sin <Sigla>OT</Sigla>
          </Text>

          <Text style={styles.subtitle}>{equipmentLabel}</Text>

          <Text nativeID="motivo-cierre-label" style={styles.label}>
            Motivo del cierre *
          </Text>

          <RadioGroup
            name="motivo-cierre"
            variant="cards"
            ariaLabelledBy="motivo-cierre-label"
            value={reason}
            onChange={(val) => {
              setReason(val);
              if (val !== "Otro") setComment("");
              if (error) setError(null);
            }}
            options={MOTIVO_OPTIONS}
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
                placeholder="Explicá brevemente el motivo"
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={3}
                maxLength={255}
                autoFocus
              />

              {!commentTrimmed && (
                <Text style={styles.inlineWarning}>Escribí el motivo para continuar.</Text>
              )}
            </View>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.actions}>
            <Pressable
              style={styles.cancelButton}
              onPress={onClose}
              disabled={confirming}
              accessibilityRole="button"
              accessibilityLabel="Cancelar"
            >
              <Text style={styles.cancelText}>Cancelar</Text>
            </Pressable>

            <Pressable
              style={[styles.confirmButton, !canConfirm && styles.confirmButtonDisabled]}
              onPress={handleConfirm}
              disabled={!canConfirm}
              accessibilityRole="button"
              accessibilityLabel="Confirmar"
              aria-disabled={!canConfirm}
            >
              <Text style={styles.confirmText}>
                {confirming ? "Cerrando…" : "Confirmar"}
              </Text>
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
    title: {
      fontSize: 18,
      fontWeight: "600",
      color: c.text,
    },
    subtitle: {
      marginTop: 2,
      fontSize: 13,
      color: c.textMuted,
    },
    label: {
      fontSize: 12.5,
      fontWeight: "600",
      color: c.textLabel,
      marginTop: 18,
      marginBottom: 10,
    },
    commentSection: {
      marginTop: 14,
    },
    commentLabel: {
      fontSize: 12.5,
      fontWeight: "600",
      color: c.textLabel,
      marginBottom: 6,
    },
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
    inlineWarning: {
      marginTop: 6,
      fontSize: 12.5,
      color: c.destructive,
      fontWeight: "500",
    },
    error: {
      color: c.destructive,
      marginTop: 12,
      fontSize: 13,
      fontWeight: "600",
    },
    actions: {
      flexDirection: "row",
      gap: 10,
      marginTop: 24,
    },
    cancelButton: {
      flex: 1,
      height: 44,
      borderRadius: 10,
      backgroundColor: "#dc2626",
      alignItems: "center",
      justifyContent: "center",
    },
    cancelText: {
      color: "#ffffff",
      fontWeight: "600",
      fontSize: 15,
    },
    confirmButton: {
      flex: 1,
      height: 44,
      borderRadius: 10,
      backgroundColor: c.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    confirmButtonDisabled: {
      opacity: 0.45,
      ...(Platform.OS === "web" ? ({ cursor: "not-allowed" } as any) : {}),
    },
    confirmText: {
      color: "#ffffff",
      fontWeight: "600",
      fontSize: 15,
    },
  });
}
