import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { createSparePart, updateSparePart, type SparePartInput } from "../lib/queries/spareParts";
import type { ThemeColors } from "../lib/theme";
import { useTheme } from "../lib/ThemeContext";
import type { Repuesto } from "../types/database";
import { RadioGroup, type RadioOption } from "./RadioGroup";

const ESTADO_OPTIONS: RadioOption<Repuesto["rep_estado"]>[] = [
  { value: "activo", label: "Activo" },
  { value: "inactivo", label: "Inactivo" },
];

// Empty string -> null; anything else -> a non-negative integer (or null when
// it doesn't parse, so the caller's validation catches it).
function parseIntOrNull(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

export function SparePartModal({
  visible,
  onClose,
  onSaved,
  sparePart,
  existingParts = [],
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  sparePart?: Repuesto | null;
  existingParts?: Repuesto[];
}) {
  const isEditing = !!sparePart;
  const [name, setName] = useState("");
  const [stockMin, setStockMin] = useState("");
  const [stockMax, setStockMax] = useState("");
  const [initialQty, setInitialQty] = useState("");
  const [estado, setEstado] = useState<Repuesto["rep_estado"]>("activo");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  useEffect(() => {
    if (!visible) return;
    setName(sparePart?.rep_nombre ?? "");
    setStockMin(sparePart ? String(sparePart.rep_stock_minimo) : "");
    setStockMax(sparePart?.rep_stock_maximo != null ? String(sparePart.rep_stock_maximo) : "");
    setInitialQty("");
    setEstado(sparePart?.rep_estado ?? "activo");
    setError(null);
  }, [visible, sparePart]);

  async function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("El nombre del repuesto no puede estar vacío.");
      return;
    }

    const normalized = trimmedName.toLocaleLowerCase();
    const isDuplicate = existingParts.some(
      (p) =>
        p.rep_id !== sparePart?.rep_id && p.rep_nombre.trim().toLocaleLowerCase() === normalized,
    );
    if (isDuplicate) {
      setError("Ya existe un repuesto con ese nombre");
      return;
    }

    const min = parseIntOrNull(stockMin) ?? 0;
    const max = stockMax.trim() ? parseIntOrNull(stockMax) : null;
    if (stockMax.trim() && max === null) {
      setError("El stock máximo tiene que ser un número entero ≥ 0.");
      return;
    }
    if (max !== null && max < min) {
      setError("El stock máximo no puede ser menor que el mínimo.");
      return;
    }

    const payload: SparePartInput = { name: trimmedName, stockMin: min, stockMax: max, estado };

    setSaving(true);
    setError(null);
    try {
      if (sparePart) {
        await updateSparePart(sparePart.rep_id, payload);
      } else {
        const qty = parseIntOrNull(initialQty) ?? 0;
        await createSparePart({ ...payload, initialQty: qty });
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
          <Text style={styles.title}>{isEditing ? sparePart!.rep_nombre : "Nuevo repuesto"}</Text>

          <Text style={styles.subtitle}>
            {isEditing
              ? "Editá los datos del repuesto. El stock actual se ajusta con las compras."
              : "Agregá un repuesto al inventario."}
          </Text>

          <Text style={styles.label}>Nombre</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Ej: Filtro de aire 20x25x1"
            placeholderTextColor={colors.textMuted}
            maxLength={100}
          />

          <View style={styles.row}>
            <View style={styles.rowItem}>
              <Text style={styles.label}>Stock mínimo</Text>
              <TextInput
                style={styles.input}
                value={stockMin}
                onChangeText={setStockMin}
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
              />
            </View>

            <View style={styles.rowItem}>
              <Text style={styles.label}>Stock máximo</Text>
              <TextInput
                style={styles.input}
                value={stockMax}
                onChangeText={setStockMax}
                placeholder="Opcional"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
              />
            </View>
          </View>

          {!isEditing && (
            <>
              <Text style={styles.label}>Stock inicial</Text>
              <TextInput
                style={styles.input}
                value={initialQty}
                onChangeText={setInitialQty}
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
              />
            </>
          )}

          <Text style={styles.label}>Estado</Text>
          <RadioGroup
            name="spare-part-estado"
            value={estado}
            onChange={setEstado}
            options={ESTADO_OPTIONS}
          />

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
    row: { flexDirection: "row", gap: 12 },
    rowItem: { flex: 1 },
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
