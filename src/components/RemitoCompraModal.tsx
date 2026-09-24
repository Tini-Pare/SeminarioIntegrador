import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import {
  CustomDatePicker,
  getTodayDateString,
  isValidDateString,
  toDbDate,
} from "./CustomDatePicker";
import {
  editarRemitoCompra,
  registrarRemitoCompra,
  type PurchaseWithDetail,
  type RemitoWithLines,
} from "../lib/queries/purchases";
import { lineRemaining, receivedQuantities } from "../lib/purchaseReceipt";
import type { ThemeColors } from "../lib/theme";
import { useTheme } from "../lib/ThemeContext";

type RowDraft = {
  repId: number;
  repNombre: string;
  max: number;
  cantidad: string;
};

// Shared by "cargar remito" and "editar remito": the form is the same
// checklist-with-quantity-caps either way, only the RPC called on save (and
// which of the purchase's own remitos count toward "ya recibido") differs.
export function RemitoCompraModal({
  visible,
  onClose,
  onSaved,
  purchase,
  editing,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  purchase: PurchaseWithDetail | null;
  editing?: RemitoWithLines | null;
}) {
  const [fecha, setFecha] = useState(getTodayDateString());
  const [dateOpen, setDateOpen] = useState(false);
  const [rows, setRows] = useState<RowDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const today = useMemo(() => new Date(), []);
  const isEditing = editing != null;

  useEffect(() => {
    if (!visible || !purchase) return;
    setError(null);
    setFecha(editing?.rc_fecha ?? getTodayDateString());

    // "Ya recibido" excludes the remito being edited — its own lines are
    // about to be replaced, not added on top of themselves (see
    // editarRemitoCompra / migration 0013's editar_remito_compra).
    const otherRemitos = editing
      ? { ...purchase, remitos: purchase.remitos.filter((r) => r.rc_id !== editing.rc_id) }
      : purchase;
    const received = receivedQuantities(otherRemitos);
    const editingQty = new Map((editing?.lineas ?? []).map((l) => [l.rep_id, l.rcl_cantidad]));

    setRows(
      purchase.linea_compra
        .map((l) => {
          const facturado = l.lc_cantidad ?? 0;
          const max = lineRemaining(facturado, received.get(l.rep_id) ?? 0);
          return {
            repId: l.rep_id,
            repNombre: l.repuesto?.rep_nombre ?? `Repuesto ${l.rep_id}`,
            max,
            cantidad: editingQty.has(l.rep_id) ? String(editingQty.get(l.rep_id)) : "",
          };
        })
        .filter((r) => r.max > 0),
    );
  }, [visible, purchase, editing]);

  function updateCantidad(repId: number, raw: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.repId !== repId) return r;
        const digits = raw.replace(/[^0-9]/g, "");
        const capped = digits === "" ? "" : String(Math.min(Number(digits), r.max));
        return { ...r, cantidad: capped };
      }),
    );
  }

  async function handleSave() {
    if (!purchase) return;
    if (!fecha.trim() || !isValidDateString(fecha)) {
      setError("La fecha del remito no es válida.");
      return;
    }

    const lineas = rows
      .filter((r) => r.cantidad.trim() !== "" && Number(r.cantidad) > 0)
      .map((r) => ({ repId: r.repId, cantidad: Number(r.cantidad) }));
    if (lineas.length === 0) {
      setError("Marcá la cantidad de al menos un ítem que haya llegado.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await editarRemitoCompra(editing.rc_id, toDbDate(fecha), lineas);
      } else {
        await registrarRemitoCompra(purchase.co_id_compra, toDbDate(fecha), lineas);
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
          <Text style={styles.title}>{isEditing ? "Editar remito" : "Cargar remito"}</Text>

          <Text style={styles.subtitle}>
            Marcá qué ítems de la factura llegaron y cuánto de cada uno.
          </Text>

          <Text style={styles.label}>Fecha del remito</Text>
          <CustomDatePicker
            value={fecha}
            onChange={setFecha}
            maxDate={today}
            open={dateOpen}
            onOpenChange={setDateOpen}
          />

          <Text style={[styles.label, { marginTop: 18 }]}>Ítems pendientes de recibir</Text>

          {rows.length === 0 ? (
            <Text style={styles.empty}>No queda nada pendiente de recibir en esta compra.</Text>
          ) : (
            <ScrollView style={styles.rows} keyboardShouldPersistTaps="handled">
              {rows.map((r) => (
                <View key={r.repId} style={styles.row}>
                  <View style={styles.rowInfo}>
                    <Text style={styles.rowName} numberOfLines={2}>
                      {r.repNombre}
                    </Text>

                    <Text style={styles.rowMax}>Pendiente: {r.max}</Text>
                  </View>

                  <TextInput
                    style={styles.rowInput}
                    value={r.cantidad}
                    onChangeText={(v) => updateCantidad(r.repId, v)}
                    placeholder="0"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numeric"
                  />
                </View>
              ))}
            </ScrollView>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.actions}>
            <Pressable style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </Pressable>

            <Pressable
              style={styles.saveButton}
              onPress={handleSave}
              disabled={saving || rows.length === 0}
            >
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
      maxWidth: 460,
      maxHeight: "85%",
      alignSelf: "center",
    },
    title: { fontSize: 18, fontWeight: "600", color: c.text },
    subtitle: { marginTop: 2, fontSize: 13, color: c.textMuted },
    label: {
      fontSize: 12.5,
      fontWeight: "600",
      color: c.textLabel,
      marginBottom: 8,
      marginTop: 18,
    },
    empty: { fontSize: 13, color: c.textMuted, marginTop: 4 },
    rows: { maxHeight: 260 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: c.borderRow,
    },
    rowInfo: { flex: 1, minWidth: 0 },
    rowName: { fontSize: 13.5, fontWeight: "600", color: c.text },
    rowMax: { marginTop: 2, fontSize: 12, color: c.textMuted },
    rowInput: {
      width: 72,
      height: 40,
      paddingHorizontal: 10,
      borderWidth: 1,
      borderColor: c.borderInput,
      borderRadius: 10,
      backgroundColor: c.bgInput,
      fontSize: 14,
      color: c.text,
      textAlign: "center",
      fontVariant: ["tabular-nums"],
    },
    error: { color: c.destructive, marginTop: 14, fontSize: 13 },
    actions: { flexDirection: "row", gap: 10, marginTop: 22 },
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
