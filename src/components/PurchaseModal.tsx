import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import {
  CustomDatePicker,
  getTodayDateString,
  isValidDateString,
  toDbDate,
} from "../components/CustomDatePicker";
import { registrarCompra } from "../lib/queries/purchases";
import type { ThemeColors } from "../lib/theme";
import { useTheme } from "../lib/ThemeContext";
import type { Proveedor, Repuesto } from "../types/database";
import { Select } from "./Select";

type LineDraft = { key: string; repId: number | null; cantidad: string; costo: string };

let lineSeq = 0;
const newLine = (repId: number | null = null, cantidad = ""): LineDraft => ({
  key: `l${lineSeq++}`,
  repId,
  cantidad,
  costo: "",
});

export const RUBROS_CATALOG: string[] = [
  "Aberturas y vidriería",
  "Ascensores y montacargas",
  "Autoelevadores y zorras",
  "Balanzas y pesaje",
  "Carros y cestas de compras",
  "Climatización / HVAC",
  "Electricidad",
  "Equipamiento gastronómico",
  "Estanterías y góndolas",
  "Ferretería industrial",
  "Grupos electrógenos",
  "Herrería y cerrajería",
  "Lubricantes y químicos",
  "Pintura y construcción en seco",
  "Plomería y sanitarios",
  "Puntos de venta/cajas",
  "Refrigeración",
  "Seguridad electrónica",
  "Sistemas contra incendios",
];

export function getSupplierRubro(s: { rubro?: string | null }): string {
  const r = s.rubro?.trim();
  return r && r.length > 0 ? r : "Sin clasificar";
}

export type PurchasePrefill = {
  pedidoId: number;
  lines: { repId: number; cantidad: number }[];
  proveedorId?: number | null;
};

export function PurchaseModal({
  visible,
  onClose,
  onSaved,
  suppliers,
  spareParts,
  prefill,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  suppliers: (Proveedor & { rubro?: string | null })[];
  spareParts: Repuesto[];
  prefill?: PurchasePrefill | null;
}) {
  const [rubro, setRubro] = useState<string | null>(null);
  const [proveedorId, setProveedorId] = useState<number | null>(null);
  const [nombre, setNombre] = useState("");
  const [fecha, setFecha] = useState("");
  const [garantia, setGarantia] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([newLine()]);
  const [openField, setOpenField] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const today = useMemo(() => new Date(), []);

  const rubroOptions = useMemo(() => {
    const set = new Set<string>(RUBROS_CATALOG);
    for (const s of suppliers) {
      set.add(getSupplierRubro(s));
    }
    return Array.from(set).map((r) => ({ value: r, label: r }));
  }, [suppliers]);

  const filteredSuppliers = useMemo(() => {
    if (!rubro) return [];
    return suppliers.filter((s) => getSupplierRubro(s) === rubro);
  }, [suppliers, rubro]);

  const partOptions = useMemo(
    () =>
      spareParts
        .filter((p) => p.rep_estado === "activo")
        .map((p) => ({ value: p.rep_id, label: p.rep_nombre })),
    [spareParts],
  );
  const supplierOptions = useMemo(
    () => filteredSuppliers.map((s) => ({ value: s.prov_id_proveedor, label: s.prov_nombre })),
    [filteredSuppliers],
  );

  function handleRubroChange(newRubro: string) {
    setRubro(newRubro);
    if (proveedorId != null) {
      const currentSupplier = suppliers.find((s) => s.prov_id_proveedor === proveedorId);
      if (!currentSupplier || getSupplierRubro(currentSupplier) !== newRubro) {
        setProveedorId(null);
      }
    }
  }

  useEffect(() => {
    if (!visible) return;
    const initialProvId = prefill?.proveedorId ?? null;
    if (initialProvId != null) {
      const found = suppliers.find((sp) => sp.prov_id_proveedor === initialProvId);
      setRubro(found ? getSupplierRubro(found) : null);
      setProveedorId(initialProvId);
    } else {
      setRubro(null);
      setProveedorId(null);
    }
    setNombre("");
    setFecha(getTodayDateString());
    setGarantia("");
    setLines(
      prefill && prefill.lines.length > 0
        ? prefill.lines.map((l) => newLine(l.repId, String(l.cantidad)))
        : [newLine()],
    );
    setOpenField(null);
    setError(null);
  }, [visible, prefill, suppliers]);

  function updateLine(key: string, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((l) => l.key !== key)));
  }

  const total = useMemo(
    () =>
      lines.reduce((acc, l) => {
        const qty = Number(l.cantidad);
        const cost = Number(l.costo);
        if (!Number.isFinite(qty) || !Number.isFinite(cost)) return acc;
        return acc + qty * cost;
      }, 0),
    [lines],
  );

  async function handleSave() {
    if (!rubro) {
      setError("Elegí un rubro de proveedor.");
      return;
    }
    if (!proveedorId) {
      setError("Elegí un proveedor.");
      return;
    }
    if (!fecha.trim() || !isValidDateString(fecha)) {
      setError("La fecha de compra no es válida.");
      return;
    }

    const parsed: { repId: number; cantidad: number; costoUnitario: number | null }[] = [];
    const seen = new Set<number>();
    for (const l of lines) {
      if (!l.repId) {
        setError("Cada línea tiene que tener un repuesto elegido.");
        return;
      }
      if (seen.has(l.repId)) {
        setError("Hay un repuesto repetido en dos líneas. Sumá las cantidades en una sola.");
        return;
      }
      seen.add(l.repId);

      const qty = Number(l.cantidad);
      if (!Number.isInteger(qty) || qty <= 0) {
        setError("La cantidad de cada línea tiene que ser un entero mayor a cero.");
        return;
      }

      let costo: number | null = null;
      if (l.costo.trim()) {
        const c = Number(l.costo);
        if (!Number.isFinite(c) || c < 0) {
          setError("El costo unitario tiene que ser un número ≥ 0.");
          return;
        }
        costo = c;
      }

      parsed.push({ repId: l.repId, cantidad: qty, costoUnitario: costo });
    }

    setSaving(true);
    setError(null);
    try {
      await registrarCompra({
        proveedorId,
        nombre: nombre.trim() || null,
        fecha: toDbDate(fecha),
        garantia: garantia.trim() || null,
        lineas: parsed,
        pedidoId: prefill?.pedidoId ?? null,
      });
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
          <Text style={styles.title}>Registrar compra</Text>

          <Text style={styles.subtitle}>
            {prefill
              ? "Al guardar se ingresa el stock y el pedido queda como recibido."
              : "Al guardar se suma la cantidad de cada línea al stock del repuesto."}
          </Text>

          <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Rubro del proveedor</Text>

            <Select
              value={rubro}
              onChange={handleRubroChange}
              options={rubroOptions}
              placeholder="Elegí un rubro"
              open={openField === "rubro"}
              onOpenChange={(o) => setOpenField(o ? "rubro" : null)}
            />

            <Text style={styles.label}>Proveedor</Text>

            <Select
              value={proveedorId}
              onChange={setProveedorId}
              options={supplierOptions}
              placeholder={
                !rubro
                  ? "Primero elegí un rubro"
                  : supplierOptions.length === 0
                    ? "Sin proveedores en este rubro"
                    : "Elegí un proveedor"
              }
              disabled={!rubro}
              open={openField === "proveedor"}
              onOpenChange={(o) => setOpenField(o ? "proveedor" : null)}
            />

            <View style={[styles.row, openField === "fecha" && styles.rowRaised]}>
              <View style={[styles.rowItem, styles.dateCol]}>
                <Text style={styles.label}>Fecha de compra</Text>
                <CustomDatePicker
                  value={fecha}
                  onChange={setFecha}
                  maxDate={today}
                  open={openField === "fecha"}
                  onOpenChange={(o) => setOpenField(o ? "fecha" : null)}
                />
              </View>

              <View style={styles.rowItem}>
                <Text style={styles.label}>Garantía</Text>
                <TextInput
                  style={styles.input}
                  value={garantia}
                  onChangeText={setGarantia}
                  placeholder="Opcional"
                  placeholderTextColor={colors.textMuted}
                  maxLength={100}
                />
              </View>
            </View>

            <Text style={styles.label}>Referencia / remito</Text>
            <TextInput
              style={styles.input}
              value={nombre}
              onChangeText={setNombre}
              placeholder="Opcional"
              placeholderTextColor={colors.textMuted}
              maxLength={100}
            />

            <View style={styles.linesHeader}>
              <Text style={styles.label}>Repuestos</Text>

              <Pressable onPress={() => setLines((prev) => [...prev, newLine()])}>
                <Text style={styles.addLine}>+ Agregar línea</Text>
              </Pressable>
            </View>

            {lines.map((l, idx) => (
              <View
                key={l.key}
                style={[
                  styles.lineCard,
                  openField === `rep-${l.key}` && styles.lineCardRaised,
                ]}
              >
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

                <View style={styles.row}>
                  <View style={styles.rowItem}>
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

                  <View style={styles.rowItem}>
                    <Text style={styles.smallLabel}>Costo unitario</Text>
                    <TextInput
                      style={styles.input}
                      value={l.costo}
                      onChangeText={(v) => updateLine(l.key, { costo: v })}
                      placeholder="Opcional"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="numeric"
                    />
                  </View>
                </View>
              </View>
            ))}

            {total > 0 && (
              <Text style={styles.total}>
                Total estimado: ${total.toLocaleString("es-AR", { maximumFractionDigits: 2 })}
              </Text>
            )}

            {error && <Text style={styles.error}>{error}</Text>}
          </ScrollView>

          <View style={styles.actions}>
            <Pressable style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </Pressable>

            <Pressable style={styles.saveButton} onPress={handleSave} disabled={saving}>
              <Text style={styles.saveText}>{saving ? "Guardando…" : "Registrar"}</Text>
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
    row: { flexDirection: "row", gap: 12, position: "relative", zIndex: 40 },
    rowRaised: { zIndex: 60 },
    rowItem: { flex: 1, position: "relative" },
    dateCol: { zIndex: 60 },
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
      position: "relative",
      zIndex: 40,
    },
    lineCardRaised: {
      zIndex: 50,
    },
    lineTop: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 8,
    },
    lineNum: { fontSize: 12, fontWeight: "700", color: c.textMuted },
    removeLine: { fontSize: 12, fontWeight: "600", color: c.destructive },
    total: { marginTop: 14, fontSize: 13.5, fontWeight: "700", color: c.text },
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
