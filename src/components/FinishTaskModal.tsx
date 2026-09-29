import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { ConsumedPart } from "../lib/queries/faults";
import { listSpareParts } from "../lib/queries/spareParts";
import type { ThemeColors } from "../lib/theme";
import { useTheme } from "../lib/ThemeContext";
import type { Repuesto } from "../types/database";

// Asked right before finishTask (queue/index.tsx): qué repuestos usó el
// técnico para esta tarea, si usó alguno — 0 líneas es una respuesta
// válida (una tarea de solo inspección no consume nada). "+ Agregar
// repuesto" abre una grilla con todo el catálogo (repuesto / cantidad
// disponible / cantidad usada / Guardar) en vez de un desplegable por
// línea — cada repuesto se confirma con su propio botón "Guardar" y sale
// de la grilla hacia la lista de ya agregados. Cada línea resta del stock
// actual al confirmar (finalizar_tarea, migración 0021).
export function FinishTaskModal({
  visible,
  onClose,
  onConfirm,
  taskName,
  equipmentLabel,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (repuestos: ConsumedPart[]) => void | Promise<void>;
  taskName: string;
  equipmentLabel: string;
}) {
  const [spareParts, setSpareParts] = useState<Repuesto[]>([]);
  const [added, setAdded] = useState<ConsumedPart[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  useEffect(() => {
    if (!visible) return;
    setAdded([]);
    setPickerOpen(false);
    setDrafts({});
    setRowErrors({});
    setConfirming(false);
    setError(null);
    listSpareParts()
      .then((all) => setSpareParts(all.filter((p) => p.rep_estado === "activo")))
      .catch(() => setSpareParts([]));
  }, [visible]);

  const addedIds = new Set(added.map((a) => a.repId));
  const pickable = spareParts.filter((p) => !addedIds.has(p.rep_id));
  const addedRows = added.map((a) => ({
    ...a,
    nombre: spareParts.find((p) => p.rep_id === a.repId)?.rep_nombre ?? `Repuesto ${a.repId}`,
  }));

  function removeAdded(repId: number) {
    setAdded((prev) => prev.filter((a) => a.repId !== repId));
  }

  function saveRow(part: Repuesto) {
    const raw = drafts[part.rep_id] ?? "";
    const qty = Number(raw);
    if (!raw.trim() || !Number.isInteger(qty) || qty <= 0) {
      setRowErrors((prev) => ({ ...prev, [part.rep_id]: "Ingresá una cantidad válida." }));
      return;
    }
    if (qty > part.rep_cantidad_actual) {
      setRowErrors((prev) => ({
        ...prev,
        [part.rep_id]: `No hay stock suficiente (disponible: ${part.rep_cantidad_actual}).`,
      }));
      return;
    }
    setRowErrors((prev) => {
      const next = { ...prev };
      delete next[part.rep_id];
      return next;
    });
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[part.rep_id];
      return next;
    });
    setAdded((prev) => [...prev, { repId: part.rep_id, cantidad: qty }]);
  }

  async function handleConfirm() {
    setConfirming(true);
    setError(null);
    try {
      await onConfirm(added);
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
          <ScrollView contentContainerStyle={styles.sheetContent}>
            <Text style={styles.title}>Finalizar tarea</Text>

            <Text style={styles.subtitle}>
              {taskName} · {equipmentLabel}
            </Text>

            <Text style={styles.label}>Repuestos usados (opcional)</Text>

            {addedRows.length > 0 && (
              <View style={styles.addedList}>
                {addedRows.map((a) => (
                  <View key={a.repId} style={styles.addedRow}>
                    <Text style={styles.addedName} numberOfLines={1}>
                      {a.nombre}
                    </Text>

                    <Text style={styles.addedQty}>×{a.cantidad}</Text>

                    <Pressable style={styles.removeBtn} onPress={() => removeAdded(a.repId)}>
                      <Text style={styles.removeBtnText}>✕</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}

            <Pressable style={styles.toggleBtn} onPress={() => setPickerOpen((o) => !o)}>
              <Text style={styles.toggleBtnText}>
                {pickerOpen ? "Ocultar repuestos" : "+ Agregar repuesto"}
              </Text>
            </Pressable>

            {pickerOpen && (
              <View style={styles.grid}>
                <View style={styles.gridHeadRow}>
                  <Text style={[styles.gridHeadText, styles.colRepuesto]}>Repuesto</Text>
                  <Text style={[styles.gridHeadText, styles.colCantidad]}>Cantidad</Text>
                  <Text style={[styles.gridHeadText, styles.colUsada]}>Cantidad usada</Text>
                  <View style={styles.colGuardar} />
                </View>

                <ScrollView style={styles.gridScroll} nestedScrollEnabled>
                  {pickable.length === 0 ? (
                    <Text style={styles.gridEmpty}>No quedan más repuestos para agregar.</Text>
                  ) : (
                    pickable.map((p) => (
                      <View key={p.rep_id} style={styles.gridRowWrap}>
                        <View style={styles.gridRow}>
                          <Text
                            style={[styles.gridCellText, styles.colRepuesto]}
                            numberOfLines={1}
                          >
                            {p.rep_nombre}
                          </Text>

                          <Text style={[styles.gridCellText, styles.colCantidad]}>
                            {p.rep_cantidad_actual}
                          </Text>

                          <View style={styles.colUsada}>
                            <TextInput
                              style={[
                                styles.gridInput,
                                rowErrors[p.rep_id] && styles.gridInputError,
                              ]}
                              value={drafts[p.rep_id] ?? ""}
                              onChangeText={(t) => {
                                setDrafts((prev) => ({
                                  ...prev,
                                  [p.rep_id]: t.replace(/[^0-9]/g, ""),
                                }));
                                setRowErrors((prev) => {
                                  if (!prev[p.rep_id]) return prev;
                                  const next = { ...prev };
                                  delete next[p.rep_id];
                                  return next;
                                });
                              }}
                              placeholder="0"
                              placeholderTextColor={colors.textMuted}
                              keyboardType="number-pad"
                              maxLength={5}
                            />
                          </View>

                          <View style={styles.colGuardar}>
                            <Pressable style={styles.saveRowBtn} onPress={() => saveRow(p)}>
                              <Text style={styles.saveRowBtnText}>Guardar</Text>
                            </Pressable>
                          </View>
                        </View>

                        {rowErrors[p.rep_id] && (
                          <Text style={styles.gridRowError}>{rowErrors[p.rep_id]}</Text>
                        )}
                      </View>
                    ))
                  )}
                </ScrollView>
              </View>
            )}

            {error && <Text style={styles.error}>{error}</Text>}

            <View style={styles.actions}>
              <Pressable style={styles.cancelButton} onPress={onClose} disabled={confirming}>
                <Text style={styles.cancelText}>Cancelar</Text>
              </Pressable>

              <Pressable style={styles.confirmButton} onPress={handleConfirm} disabled={confirming}>
                <Text style={styles.confirmText}>
                  {confirming ? "Finalizando…" : "Finalizar tarea"}
                </Text>
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
      width: "100%",
      maxWidth: 720,
      maxHeight: "90%",
      alignSelf: "center",
    },
    sheetContent: { padding: 26 },
    title: { fontSize: 20, fontWeight: "600", color: c.text },
    subtitle: { marginTop: 3, fontSize: 13.5, color: c.textMuted },
    label: {
      fontSize: 12.5,
      fontWeight: "600",
      color: c.textLabel,
      marginTop: 20,
      marginBottom: 10,
    },
    addedList: { gap: 8, marginBottom: 12 },
    addedRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 9,
      paddingHorizontal: 12,
      borderRadius: 10,
      backgroundColor: c.bgNested,
    },
    addedName: { flex: 1, minWidth: 0, fontSize: 14, color: c.text, fontWeight: "500" },
    addedQty: { fontSize: 13.5, color: c.textLabel, fontWeight: "600" },
    removeBtn: {
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.bgCard,
    },
    removeBtnText: { color: c.destructive, fontSize: 13, fontWeight: "700" },
    toggleBtn: {
      alignSelf: "flex-start",
      height: 40,
      paddingHorizontal: 16,
      borderRadius: 9,
      borderWidth: 1,
      borderColor: c.borderInput,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.bgCard,
    },
    toggleBtnText: { fontSize: 13.5, fontWeight: "600", color: c.accent },
    grid: {
      marginTop: 14,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      overflow: "hidden",
    },
    gridHeadRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 10,
      paddingHorizontal: 14,
      backgroundColor: c.bgSidebar,
      gap: 10,
    },
    gridHeadText: { fontSize: 11.5, fontWeight: "700", color: c.textNavInactive },
    gridScroll: { maxHeight: 320, backgroundColor: c.bgCard },
    gridRowWrap: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderTopWidth: 1,
      borderTopColor: c.borderRow,
    },
    gridRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    gridCellText: { fontSize: 13.5, color: c.text },
    gridEmpty: {
      paddingVertical: 20,
      paddingHorizontal: 14,
      textAlign: "center",
      fontSize: 13,
      color: c.textMuted,
    },
    colRepuesto: { flexGrow: 2, flexBasis: 200, minWidth: 140 },
    colCantidad: { width: 80, textAlign: "center" },
    colUsada: { width: 130 },
    colGuardar: { width: 96 },
    gridInput: {
      height: 38,
      paddingHorizontal: 10,
      borderWidth: 1,
      borderColor: c.borderInput,
      borderRadius: 8,
      backgroundColor: c.bgInput,
      fontSize: 14,
      color: c.text,
    },
    gridInputError: { borderColor: c.destructive, borderWidth: 1.5 },
    gridRowError: { marginTop: 6, fontSize: 12, color: c.destructive },
    saveRowBtn: {
      height: 38,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.accent,
    },
    saveRowBtnText: { color: "#fff", fontSize: 12.5, fontWeight: "600" },
    error: { color: c.destructive, marginTop: 16, fontSize: 13 },
    actions: { flexDirection: "row", gap: 10, marginTop: 24 },
    cancelButton: {
      flex: 1,
      height: 44,
      borderRadius: 10,
      backgroundColor: c.bgNested,
      alignItems: "center",
      justifyContent: "center",
    },
    cancelText: { color: c.text, fontWeight: "600" },
    confirmButton: {
      flex: 1,
      height: 44,
      borderRadius: 10,
      backgroundColor: c.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    confirmText: { color: "#fff", fontWeight: "600" },
  });
}
