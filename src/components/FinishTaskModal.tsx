import { useEffect, useState } from "react";
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
import type { ConsumedPart } from "../lib/queries/faults";
import { listSpareParts } from "../lib/queries/spareParts";
import type { ThemeColors } from "../lib/theme";
import { useTheme } from "../lib/ThemeContext";
import type { Repuesto } from "../types/database";
import { FormFooter } from "./FormFooter";
import { SearchIcon } from "./icons";
import { RowActions } from "./RowActions";

type UsedRow = { repId: number; qty: string };

// Case- and accent-insensitive, so "camara" finds "Cámara".
function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// True when `query` (already normalized) appears in `name` starting at the
// beginning of a word: "ca" finds "Cable" and "Cámara" but not "Placa", and
// "pan" finds "(panel)". Multi-word queries work too ("cable de").
function matchesWordStart(name: string, query: string): boolean {
  const text = normalize(name);
  let i = text.indexOf(query);
  while (i !== -1) {
    if (i === 0 || !/[a-z0-9]/.test(text[i - 1])) return true;
    i = text.indexOf(query, i + 1);
  }
  return false;
}

// Asked right before finishTask (queue/index.tsx): qué repuestos usó el
// técnico para esta tarea, si usó alguno — 0 líneas es una respuesta
// válida (una tarea de solo inspección no consume nada). First an optional
// diagnóstico (HU of Sprint 5: dejar constancia del estado del equipo),
// saved on the tarea (migración 0023). Below it, same layout as the tareas
// grid of an OT: a "Repuestos utilizados" grid that starts empty and a
// "+ Repuesto" button (top right) that opens a search box to add them one
// at a time. Matches only show up once something is typed, so the whole
// catalog is never listed. The quantity is typed right in the grid row and
// validated against stock on Confirmar. Each line is subtracted from
// current stock (finalizar_tarea, migración 0021).
export function FinishTaskModal({
  visible,
  onClose,
  onConfirm,
  taskName,
  equipmentLabel,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (repuestos: ConsumedPart[], diagnostico: string) => void | Promise<void>;
  taskName: string;
  equipmentLabel: string;
}) {
  const [spareParts, setSpareParts] = useState<Repuesto[]>([]);
  const [rows, setRows] = useState<UsedRow[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  // The row just added gets the focus, so its quantity can be typed at once.
  const [focusRepId, setFocusRepId] = useState<number | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});
  const [diagnosis, setDiagnosis] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  useEffect(() => {
    if (!visible) return;
    setRows([]);
    setSearchOpen(false);
    setSearch("");
    setFocusRepId(null);
    setRowErrors({});
    setDiagnosis("");
    setConfirming(false);
    setError(null);
    listSpareParts()
      .then((all) =>
        setSpareParts(
          all
            .filter((p) => p.rep_estado === "activo")
            .sort((a, b) => a.rep_nombre.localeCompare(b.rep_nombre, "es")),
        ),
      )
      .catch(() => setSpareParts([]));
  }, [visible]);

  const partById = new Map(spareParts.map((p) => [p.rep_id, p]));
  const addedIds = new Set(rows.map((r) => r.repId));
  const query = normalize(search.trim());
  // Nothing is listed until at least one letter is typed.
  const results = query
    ? spareParts.filter((p) => !addedIds.has(p.rep_id) && matchesWordStart(p.rep_nombre, query))
    : [];

  function clearRowError(repId: number) {
    setRowErrors((prev) => {
      if (!prev[repId]) return prev;
      const next = { ...prev };
      delete next[repId];
      return next;
    });
  }

  function addPart(part: Repuesto) {
    // New rows go at the end, like every other grid.
    setRows((prev) => [...prev, { repId: part.rep_id, qty: "" }]);
    setFocusRepId(part.rep_id);
    setSearchOpen(false);
    setSearch("");
    setError(null);
  }

  function removeRow(repId: number) {
    setRows((prev) => prev.filter((r) => r.repId !== repId));
    clearRowError(repId);
  }

  function rowError(row: UsedRow): string | null {
    const qty = Number(row.qty);
    if (!row.qty.trim() || !Number.isInteger(qty) || qty <= 0) {
      return "Ingresá una cantidad válida.";
    }
    const stock = partById.get(row.repId)?.rep_cantidad_actual ?? 0;
    if (qty > stock) return `No hay stock suficiente (disponible: ${stock}).`;
    return null;
  }

  async function handleConfirm() {
    const errors: Record<number, string> = {};
    for (const row of rows) {
      const message = rowError(row);
      if (message) errors[row.repId] = message;
    }
    setRowErrors(errors);
    if (Object.keys(errors).length > 0) {
      setError("Revisá las cantidades de los repuestos marcados.");
      return;
    }

    setConfirming(true);
    setError(null);
    try {
      await onConfirm(
        rows.map((r) => ({ repId: r.repId, cantidad: Number(r.qty) })),
        diagnosis.trim(),
      );
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

            <Text style={styles.hint}>
              Si es la última tarea pendiente de la orden, la orden queda resuelta.
            </Text>

            <Text style={styles.diagnosisLabel}>Diagnóstico / observaciones (opcional)</Text>

            <TextInput
              style={styles.diagnosisInput}
              value={diagnosis}
              onChangeText={setDiagnosis}
              placeholder="Ej: se cambió el burlete; el equipo queda funcionando, revisar el compresor en el próximo service."
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={3}
              maxLength={500}
              accessibilityLabel="Diagnóstico / observaciones"
            />

            <Text style={styles.diagnosisCount}>{diagnosis.length}/500</Text>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Repuestos utilizados (opcional)</Text>

              <Pressable
                style={styles.addButton}
                onPress={() => {
                  setSearchOpen((o) => !o);
                  setSearch("");
                }}
              >
                <Text style={styles.addButtonText}>+ Repuesto</Text>
              </Pressable>
            </View>

            {searchOpen && (
              <View style={styles.searchPanel}>
                <View style={styles.searchBox}>
                  <SearchIcon size={15} color={colors.textMuted} />

                  <TextInput
                    style={styles.searchInput}
                    placeholder="Buscar repuesto…"
                    placeholderTextColor={colors.textMuted}
                    value={search}
                    onChangeText={setSearch}
                    autoCorrect={false}
                    autoFocus
                  />

                  {search.length > 0 && (
                    <Pressable onPress={() => setSearch("")} hitSlop={8}>
                      <Text style={styles.clearSearchText}>✕</Text>
                    </Pressable>
                  )}
                </View>

                {query.length > 0 && (
                  <ScrollView style={styles.results} nestedScrollEnabled>
                    {results.length === 0 ? (
                      <Text style={styles.resultsEmpty}>
                        Ningún repuesto coincide con la búsqueda.
                      </Text>
                    ) : (
                      results.map((p) => {
                        const outOfStock = p.rep_cantidad_actual <= 0;
                        return (
                          <Pressable
                            key={p.rep_id}
                            style={[styles.resultRow, outOfStock && styles.resultRowDisabled]}
                            onPress={() => addPart(p)}
                            disabled={outOfStock}
                          >
                            <Text style={styles.resultName} numberOfLines={1}>
                              {p.rep_nombre}
                            </Text>

                            <Text style={styles.resultStock}>
                              {outOfStock ? "Sin stock" : `Existencias: ${p.rep_cantidad_actual}`}
                            </Text>
                          </Pressable>
                        );
                      })
                    )}
                  </ScrollView>
                )}
              </View>
            )}

            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.headerCell, styles.colRepuesto]}>REPUESTO</Text>
                <Text style={[styles.headerCell, styles.colStock]}>EXISTENCIAS ACTUALES</Text>
                <Text style={[styles.headerCell, styles.colUsada]}>CANTIDAD USADA</Text>
                <Text style={[styles.headerCell, styles.colActions]}>ACCIONES</Text>
              </View>

              {rows.length === 0 ? (
                <Text style={styles.empty}>
                  No se agregó ningún repuesto. Usá “+ Repuesto” si la tarea consumió alguno.
                </Text>
              ) : (
                rows.map((row, i) => {
                  const part = partById.get(row.repId);
                  const rowErr = rowErrors[row.repId];
                  return (
                    <View key={row.repId} style={[styles.rowWrap, i % 2 === 1 && styles.rowAlt]}>
                      <View style={styles.row}>
                        <Text
                          style={[styles.cellText, styles.cellStrong, styles.colRepuesto]}
                          numberOfLines={2}
                        >
                          {part?.rep_nombre ?? `Repuesto ${row.repId}`}
                        </Text>

                        <Text style={[styles.cellText, styles.colStock]}>
                          {part?.rep_cantidad_actual ?? "—"}
                        </Text>

                        <View style={styles.colUsada}>
                          <TextInput
                            style={[styles.qtyInput, rowErr && styles.qtyInputError]}
                            value={row.qty}
                            onChangeText={(t) => {
                              const qty = t.replace(/[^0-9]/g, "");
                              setRows((prev) =>
                                prev.map((r) => (r.repId === row.repId ? { ...r, qty } : r)),
                              );
                              clearRowError(row.repId);
                            }}
                            placeholder="0"
                            placeholderTextColor={colors.textMuted}
                            keyboardType="number-pad"
                            maxLength={5}
                            autoFocus={focusRepId === row.repId}
                            accessibilityLabel={`Cantidad usada de ${part?.rep_nombre ?? "repuesto"}`}
                          />
                        </View>

                        <View style={styles.colActions}>
                          <RowActions
                            onDelete={() => removeRow(row.repId)}
                            deleteTooltip="Quitar repuesto"
                          />
                        </View>
                      </View>

                      {rowErr && <Text style={styles.rowError}>{rowErr}</Text>}
                    </View>
                  );
                })
              )}
            </View>

            {error && <Text style={styles.error}>{error}</Text>}

            <FormFooter onCancel={onClose} onConfirm={handleConfirm} busy={confirming} />
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
    hint: { marginTop: 8, fontSize: 12.5, color: c.textMuted, lineHeight: 17 },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: 10,
      marginTop: 20,
      marginBottom: 10,
    },
    sectionTitle: { fontSize: 13.5, fontWeight: "600", color: c.text },
    addButton: {
      paddingHorizontal: 14,
      height: 36,
      borderRadius: 8,
      backgroundColor: c.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    addButtonText: { color: "#fff", fontWeight: "600", fontSize: 13 },
    searchPanel: {
      marginBottom: 12,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      backgroundColor: c.bgCard,
      padding: 10,
      gap: 8,
    },
    searchBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      height: 38,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: c.borderInput,
      borderRadius: 9,
      backgroundColor: c.bgInput,
    },
    searchInput: {
      flex: 1,
      height: "100%",
      fontSize: 13.5,
      color: c.text,
      padding: 0,
      ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : {}),
    },
    clearSearchText: { fontSize: 13, color: c.textMuted, fontWeight: "600" },
    results: { maxHeight: 220 },
    resultsEmpty: { padding: 12, fontSize: 13, color: c.textMuted, textAlign: "center" },
    resultRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 9,
      paddingHorizontal: 10,
      borderRadius: 8,
      ...(Platform.OS === "web" ? ({ cursor: "pointer" } as object) : {}),
    },
    resultRowDisabled: {
      opacity: 0.5,
      ...(Platform.OS === "web" ? ({ cursor: "not-allowed" } as object) : {}),
    },
    resultName: { flex: 1, minWidth: 0, fontSize: 13.5, color: c.text },
    resultStock: { fontSize: 12.5, color: c.textMuted },
    table: {
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 14,
      overflow: "hidden",
    },
    tableHeader: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: c.accent,
      gap: 10,
    },
    headerCell: {
      fontSize: 11.5,
      fontWeight: "700",
      letterSpacing: 0.5,
      textTransform: "uppercase",
      color: "#fff",
      fontFamily: "monospace",
    },
    empty: { color: c.textMuted, fontSize: 13.5, padding: 18 },
    rowWrap: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: c.borderRow,
    },
    rowAlt: { backgroundColor: c.bgRowAlt },
    row: { flexDirection: "row", alignItems: "center", gap: 10 },
    cellText: { fontSize: 13.5, color: c.textLabel },
    cellStrong: { fontWeight: "600", color: c.text },
    colRepuesto: { flex: 1, minWidth: 120 },
    colStock: { width: 110, textAlign: "center" },
    colUsada: { width: 110 },
    colActions: { width: 80, alignItems: "center" },
    qtyInput: {
      height: 38,
      paddingHorizontal: 10,
      borderWidth: 1,
      borderColor: c.borderInput,
      borderRadius: 8,
      backgroundColor: c.bgInput,
      fontSize: 14,
      color: c.text,
    },
    qtyInputError: { borderColor: c.destructive, borderWidth: 1.5 },
    rowError: { marginTop: 6, fontSize: 12, color: c.destructive },
    diagnosisLabel: {
      fontSize: 13.5,
      fontWeight: "600",
      color: c.text,
      marginTop: 20,
      marginBottom: 8,
    },
    diagnosisInput: {
      minHeight: 84,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: c.borderInput,
      borderRadius: 10,
      backgroundColor: c.bgInput,
      fontSize: 14,
      color: c.text,
      textAlignVertical: "top",
    },
    diagnosisCount: { marginTop: 4, fontSize: 11.5, color: c.textMuted, textAlign: "right" },
    error: { color: c.destructive, marginTop: 16, fontSize: 13 },
  });
}
