import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { getProfile } from "../lib/auth";
import { createPurchaseOrder } from "../lib/queries/purchaseOrders";
import type { ThemeColors } from "../lib/theme";
import { useTheme } from "../lib/ThemeContext";
import type { Repuesto } from "../types/database";
import { getTodayDateString } from "./CustomDatePicker";
import { TrashIcon } from "./icons";
import { Select } from "./Select";

type LineDraft = { key: string; repId: number | null; cantidad: string };

let lineSeq = 0;
const newLine = (): LineDraft => ({ key: `pl${lineSeq++}`, repId: null, cantidad: "" });

export function PurchaseOrderModal({
  visible,
  onClose,
  onSaved,
  spareParts,
  techName: techNameProp,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  spareParts: Repuesto[];
  techName?: string | null;
}) {
  const [observacion, setObservacion] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([newLine()]);
  const [openField, setOpenField] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [techName, setTechName] = useState<string>(techNameProp ?? "");
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const todayDate = useMemo(() => getTodayDateString(), [visible]);

  const totalItems = useMemo(() => {
    return lines.reduce((acc, l) => {
      const qty = parseInt(l.cantidad, 10);
      return acc + (Number.isInteger(qty) && qty > 0 ? qty : 0);
    }, 0);
  }, [lines]);

  function getPartOptionsForLine(currentRepId: number | null) {
    const selectedOtherIds = new Set(
      lines
        .map((l) => l.repId)
        .filter((id): id is number => id !== null && id !== currentRepId),
    );
    return spareParts
      .filter((p) => p.rep_estado === "activo" && !selectedOtherIds.has(p.rep_id))
      .map((p) => ({ value: p.rep_id, label: p.rep_nombre }));
  }

  useEffect(() => {
    if (!visible) return;
    setObservacion("");
    setLines([newLine()]);
    setOpenField(null);
    setError(null);
    if (techNameProp) {
      setTechName(techNameProp);
    } else {
      getProfile().then((p) => {
        if (p?.name) setTechName(p.name);
      });
    }
  }, [visible, techNameProp]);

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
            <View style={styles.ticketHeader}>
              <View style={styles.ticketColLeft}>
                <Text style={styles.ticketLabel}>FECHA</Text>

                <Text style={styles.ticketValue}>{todayDate}</Text>
              </View>

              <View style={styles.ticketColRight}>
                <Text style={[styles.ticketLabel, styles.textRight]}>TÉCNICO</Text>

                <Text style={[styles.ticketValue, styles.textRight]} numberOfLines={1}>
                  {techName || "Técnico"}
                </Text>
              </View>
            </View>

            <View style={styles.linesHeader}>
              <Text style={styles.sectionTitle}>Repuestos</Text>

              <Pressable
                onPress={() => {
                  setLines((prev) => [newLine(), ...prev]);
                  if (error) setError(null);
                }}
              >
                <Text style={styles.addLine}>+ Agregar línea</Text>
              </Pressable>
            </View>

            <View style={styles.tableCard}>
              <View style={styles.tableHeadRow}>
                <Text style={[styles.tableHeadText, styles.colNum]}>#</Text>

                <Text style={[styles.tableHeadText, styles.colRepFlex]}>REPUESTO</Text>

                <Text style={[styles.tableHeadText, styles.colCant, styles.textCenter]}>
                  CANTIDAD
                </Text>

                <View style={styles.colRemove} />
              </View>

              {lines.map((l, idx) => (
                <View
                  key={l.key}
                  style={[
                    styles.tableRow,
                    openField === `rep-${l.key}` && styles.tableRowRaised,
                    { zIndex: lines.length - idx + (openField === `rep-${l.key}` ? 50 : 0) },
                  ]}
                >
                  <Text style={[styles.cellNum, styles.colNum]}>{idx + 1}</Text>

                  <View style={styles.colRepFlex}>
                    <Select
                      value={l.repId}
                      onChange={(v) => {
                        updateLine(l.key, { repId: v });
                        if (error) setError(null);
                      }}
                      options={getPartOptionsForLine(l.repId)}
                      placeholder="Elegí un repuesto"
                      open={openField === `rep-${l.key}`}
                      onOpenChange={(o) => setOpenField(o ? `rep-${l.key}` : null)}
                    />
                  </View>

                  <View style={styles.colCant}>
                    <TextInput
                      style={styles.qtyInput}
                      value={l.cantidad}
                      onChangeText={(v) => {
                        updateLine(l.key, { cantidad: v.replace(/[^0-9]/g, "") });
                        if (error) setError(null);
                      }}
                      placeholder="1"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="numeric"
                    />
                  </View>

                  <View style={styles.colRemove}>
                    <Pressable
                      style={[styles.removeBtn, lines.length === 1 && styles.removeBtnDisabled]}
                      onPress={() => removeLine(l.key)}
                      disabled={lines.length === 1}
                      accessibilityLabel="Quitar línea"
                    >
                      <TrashIcon
                        size={16}
                        color={lines.length === 1 ? colors.textMuted : "#c53030"}
                      />
                    </Pressable>
                  </View>
                </View>
              ))}

              <View style={styles.tableFooter}>
                <Text style={styles.summaryLinesText}>Líneas cargadas: {lines.length}</Text>

                <Text style={styles.summaryTotalText}>Total de artículos: {totalItems}</Text>
              </View>
            </View>

            <Text style={styles.obsLabel}>Observación</Text>

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
              <Text style={styles.saveText}>{saving ? "Enviando…" : "Hacer pedido"}</Text>
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
      maxWidth: 560,
      maxHeight: "90%",
      alignSelf: "center",
    },
    title: { fontSize: 20, fontWeight: "700", color: c.text },
    subtitle: { marginTop: 4, fontSize: 13, color: c.textMuted },
    body: { marginTop: 4 },
    ticketHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      backgroundColor: c.bgNested,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      marginTop: 14,
      marginBottom: 16,
    },
    ticketColLeft: { flex: 1 },
    ticketColRight: { flex: 1, alignItems: "flex-end" },
    ticketLabel: {
      fontSize: 11,
      fontWeight: "700",
      color: c.textMuted,
      letterSpacing: 0.6,
      textTransform: "uppercase",
      marginBottom: 3,
    },
    ticketValue: {
      fontSize: 14.5,
      fontWeight: "700",
      color: c.text,
    },
    textRight: { textAlign: "right" },
    textCenter: { textAlign: "center" },
    linesHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 10,
    },
    sectionTitle: { fontSize: 15, fontWeight: "700", color: c.text },
    addLine: { color: c.accent, fontWeight: "700", fontSize: 13 },
    tableCard: {
      borderRadius: 12,
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
      position: "relative",
      zIndex: 40,
    },
    tableHeadRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: c.accent,
      borderTopLeftRadius: 11,
      borderTopRightRadius: 11,
    },
    tableHeadText: {
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 0.5,
      textTransform: "uppercase",
      color: "#fff",
      fontFamily: "monospace",
    },
    tableRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: c.borderRow,
      position: "relative",
      zIndex: 40,
    },
    tableRowRaised: {
      zIndex: 60,
    },
    colNum: {
      width: 24,
      fontSize: 13.5,
      fontWeight: "700",
      color: c.text,
      fontVariant: ["tabular-nums"],
    },
    colRepFlex: { flex: 1 },
    colCant: { width: 76 },
    colRemove: {
      width: 32,
      alignItems: "center",
      justifyContent: "center",
    },
    cellNum: { color: c.text },
    qtyInput: {
      height: 44,
      paddingHorizontal: 8,
      borderWidth: 1,
      borderColor: c.borderInput,
      borderRadius: 10,
      backgroundColor: c.bgInput,
      fontSize: 14,
      fontWeight: "600",
      color: c.text,
      textAlign: "center",
      fontVariant: ["tabular-nums"],
    },
    removeBtn: {
      width: 32,
      height: 32,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      ...(Platform.OS === "web" ? ({ cursor: "pointer" } as object) : {}),
    },
    removeBtnDisabled: {
      opacity: 0.3,
      ...(Platform.OS === "web" ? ({ cursor: "not-allowed" } as object) : {}),
    },
    tableFooter: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      backgroundColor: c.eqOperational.bg,
      borderTopWidth: 1,
      borderTopColor: c.borderRow,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderBottomLeftRadius: 11,
      borderBottomRightRadius: 11,
    },
    summaryLinesText: {
      fontSize: 13.5,
      fontWeight: "700",
      color: "#2c5339",
    },
    summaryTotalText: {
      fontSize: 14,
      fontWeight: "700",
      color: "#2c5339",
    },
    obsLabel: {
      fontSize: 13,
      fontWeight: "700",
      color: c.textLabel,
      marginTop: 16,
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
      fontSize: 13.5,
      color: c.text,
    },
    inputMultiline: { minHeight: 72, textAlignVertical: "top" },
    error: { color: c.destructive, marginTop: 12, fontSize: 13, fontWeight: "600" },
    actions: { flexDirection: "row", gap: 10, marginTop: 20 },
    cancelButton: {
      flex: 1,
      height: 44,
      borderRadius: 10,
      backgroundColor: "#dc2626",
      alignItems: "center",
      justifyContent: "center",
    },
    cancelText: { color: "#fff", fontWeight: "700", fontSize: 14 },
    saveButton: {
      flex: 1,
      height: 44,
      borderRadius: 10,
      backgroundColor: c.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    saveText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  });
}
