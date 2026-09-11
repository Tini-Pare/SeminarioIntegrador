import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { createPurchaseOrder } from "../lib/queries/purchaseOrders";
import type { ThemeColors } from "../lib/theme";
import { useTheme } from "../lib/ThemeContext";
import type { Repuesto } from "../types/database";
import { Select } from "./Select";

type LineDraft = { key: string; repId: number | null; cantidad: string };

let lineSeq = 0;
const newLine = (): LineDraft => ({ key: `pl${lineSeq++}`, repId: null, cantidad: "" });

export function PurchaseOrderModal({
  visible,
  onClose,
  onSaved,
  spareParts,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  spareParts: Repuesto[];
}) {
  const [observacion, setObservacion] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([newLine()]);
  const [openField, setOpenField] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const partOptions = useMemo(
    () =>
      spareParts
        .filter((p) => p.rep_estado === "activo")
        .map((p) => ({ value: p.rep_id, label: p.rep_nombre })),
    [spareParts],
  );

  useEffect(() => {
    if (!visible) return;
    setObservacion("");
    setLines([newLine()]);
    setOpenField(null);
    setError(null);
  }, [visible]);

  function updateLine(key: string, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((l) => l.key !== key)));
  }

  async function handleSave() {
    const parsed: { repId: number; cantidad: number }[] = [];
    const seen = new Set<number>();
    for (const l of lines) {
      if (!l.repId) {
        setError("Cada línea tiene que tener un repuesto elegido.");
        return;
      }
      if (seen.has(l.repId)) {
        setError("Hay un repuesto repetido en dos líneas.");
        return;
      }
      seen.add(l.repId);

      const qty = Number(l.cantidad);
      if (!Number.isInteger(qty) || qty <= 0) {
        setError("La cantidad de cada línea tiene que ser un entero mayor a cero.");
        return;
      }
      parsed.push({ repId: l.repId, cantidad: qty });
    }

    setSaving(true);
    setError(null);
    try {
      await createPurchaseOrder({ observacion: observacion.trim() || null, lineas: parsed });
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
          <Text style={styles.title}>Nuevo pedido de compra</Text>

          <Text style={styles.subtitle}>
            Pedí los repuestos que hacen falta. Un administrador lo aprueba o rechaza.
          </Text>

          <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
            <View style={styles.linesHeader}>
              <Text style={styles.label}>Repuestos</Text>

              <Pressable onPress={() => setLines((prev) => [...prev, newLine()])}>
                <Text style={styles.addLine}>+ Agregar línea</Text>
              </Pressable>
            </View>

            {lines.map((l, idx) => (
              <View key={l.key} style={styles.lineCard}>
                <View style={styles.lineTop}>
                  <Text style={styles.lineNum}>Línea {idx + 1}</Text>

                  {lines.length > 1 && (
                    <Pressable onPress={() => removeLine(l.key)}>
                      <Text style={styles.removeLine}>Quitar</Text>
                    </Pressable>
                  )}
                </View>

                <Select
                  value={l.repId}
                  onChange={(v) => updateLine(l.key, { repId: v })}
                  options={partOptions}
                  placeholder="Elegí un repuesto"
                  open={openField === `rep-${l.key}`}
                  onOpenChange={(o) => setOpenField(o ? `rep-${l.key}` : null)}
                />

                <Text style={styles.smallLabel}>Cantidad</Text>
                <TextInput
                  style={styles.input}
                  value={l.cantidad}
                  onChangeText={(v) => updateLine(l.key, { cantidad: v })}
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                />
              </View>
            ))}

            <Text style={styles.label}>Observación</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              value={observacion}
              onChangeText={setObservacion}
              placeholder="Motivo del pedido, urgencia, etc. (opcional)"
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={3}
              maxLength={255}
            />

            {error && <Text style={styles.error}>{error}</Text>}
          </ScrollView>

          <View style={styles.actions}>
            <Pressable style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </Pressable>

            <Pressable style={styles.saveButton} onPress={handleSave} disabled={saving}>
              <Text style={styles.saveText}>{saving ? "Enviando…" : "Enviar pedido"}</Text>
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
      maxWidth: 460,
      maxHeight: "88%",
      alignSelf: "center",
    },
    title: { fontSize: 18, fontWeight: "600", color: c.text },
    subtitle: { marginTop: 2, fontSize: 13, color: c.textMuted },
    body: { marginTop: 4 },
    label: {
      fontSize: 12.5,
      fontWeight: "600",
      color: c.textLabel,
      marginTop: 18,
      marginBottom: 8,
    },
    smallLabel: {
      fontSize: 11.5,
      fontWeight: "600",
      color: c.textMuted,
      marginTop: 12,
      marginBottom: 6,
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
    linesHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    addLine: { color: c.accent, fontWeight: "600", fontSize: 13, marginTop: 18 },
    lineCard: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      padding: 12,
      marginTop: 10,
      backgroundColor: c.bgCard,
    },
    lineTop: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 8,
    },
    lineNum: { fontSize: 12, fontWeight: "700", color: c.textMuted },
    removeLine: { fontSize: 12, fontWeight: "600", color: c.destructive },
    error: { color: c.destructive, marginTop: 12, fontSize: 13 },
    actions: { flexDirection: "row", gap: 10, marginTop: 20 },
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
