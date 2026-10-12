import { Stack, router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { BackIcon, TrashIcon } from "../../../components/icons";
import {
  CustomDatePicker,
  getTodayDateString,
  isValidDateString,
  toDbDate,
} from "../../../components/CustomDatePicker";
import { Select } from "../../../components/Select";
import { registrarCompra } from "../../../lib/queries/purchases";
import { listSpareParts } from "../../../lib/queries/spareParts";
import { listSuppliers, type SupplierWithRubro } from "../../../lib/queries/suppliers";
import type { ThemeColors } from "../../../lib/theme";
import { useTheme } from "../../../lib/ThemeContext";
import type { ComprobanteTipo, Repuesto } from "../../../types/database";

export type LineDraft = { key: string; repId: number | null; cantidad: string; costo: string };

let lineSeq = 0;
export const newLine = (repId: number | null = null, cantidad = ""): LineDraft => ({
  key: `l${lineSeq++}`,
  repId,
  cantidad,
  costo: "",
});

export type PurchaseFormValidationInput = {
  tipoComprobante: ComprobanteTipo | null;
  letra: "A" | "B" | "C" | null;
  puntoVenta: string;
  numero: string;
  fecha: string;
  proveedorId: number | null;
  proveedorCuit: string | null;
  lines: { repId: number | null; cantidad: string; costo: string }[];
};

export type PurchaseValidationResult =
  | {
      valid: true;
      parsedLines: { repId: number; cantidad: number; costoUnitario: number | null }[];
    }
  | { valid: false; error: string };

export function validatePurchaseRegistration(
  form: PurchaseFormValidationInput,
): PurchaseValidationResult {
  if (!form.tipoComprobante) {
    return { valid: false, error: "Elegí un tipo de comprobante." };
  }

  let missingCount = 0;

  if (form.tipoComprobante === "factura" && !form.letra) {
    missingCount++;
  }

  if (form.tipoComprobante !== "remito" && !form.puntoVenta.trim()) {
    missingCount++;
  }

  if (!form.numero.trim()) {
    missingCount++;
  }

  if (!form.fecha.trim() || !isValidDateString(form.fecha)) {
    missingCount++;
  }

  if (!form.proveedorId) {
    missingCount++;
  } else if (!form.proveedorCuit?.trim()) {
    return {
      valid: false,
      error: "El proveedor necesita un CUIT cargado para registrar la compra.",
    };
  }

  if (!form.lines || form.lines.length === 0) {
    missingCount++;
  } else {
    for (const l of form.lines) {
      if (!l.repId) {
        missingCount++;
      }

      const qty = Number(l.cantidad);
      if (!l.cantidad.trim() || !Number.isInteger(qty) || qty <= 0) {
        missingCount++;
      }

      const costo = Number(l.costo);
      if (!l.costo.trim() || !Number.isFinite(costo) || costo < 0) {
        missingCount++;
      }
    }
  }

  if (missingCount > 1) {
    return { valid: false, error: "Completá los campos obligatorios." };
  }

  if (missingCount === 1) {
    return { valid: false, error: "Completá el campo obligatorio." };
  }

  const parsed: { repId: number; cantidad: number; costoUnitario: number | null }[] = [];
  const seen = new Set<number>();
  for (const l of form.lines) {
    if (l.repId !== null) {
      if (seen.has(l.repId)) {
        return {
          valid: false,
          error: "Hay un repuesto repetido en dos líneas. Sumá las cantidades en una sola.",
        };
      }
      seen.add(l.repId);
    }

    const qty = Number(l.cantidad);
    const costo = Number(l.costo);
    parsed.push({
      repId: l.repId!,
      cantidad: qty,
      costoUnitario: costo,
    });
  }

  return { valid: true, parsedLines: parsed };
}

const DOC_OPTIONS: { value: ComprobanteTipo; label: string }[] = [
  { value: "factura", label: "Factura" },
  { value: "tique", label: "Tique" },
  { value: "remito", label: "Remito" },
];

const LETTER_OPTIONS: { value: "A" | "B" | "C"; label: string }[] = [
  { value: "A", label: "A" },
  { value: "B", label: "B" },
  { value: "C", label: "C" },
];

function docNumberLabel(tipo: ComprobanteTipo): string {
  return tipo === "tique" ? "Nro. de tique *" : tipo === "remito" ? "Nro. de remito *" : "Número *";
}

function docDateLabel(tipo: ComprobanteTipo): string {
  return tipo === "tique"
    ? "Fecha del tique *"
    : tipo === "remito"
      ? "Fecha del remito *"
      : "Fecha de emisión *";
}

function goBackToPurchases() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace("/purchases");
  }
}

function LineDeleteButton({
  onPress,
  disabled,
  colors,
  styles,
}: {
  onPress: () => void;
  disabled: boolean;
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <Pressable
      style={[
        styles.removeBtn,
        hovered && !disabled && styles.removeBtnHover,
        disabled && styles.removeBtnDisabled,
      ]}
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      disabled={disabled}
      accessibilityLabel="Quitar línea"
    >
      <TrashIcon size={16} color={disabled ? colors.textMuted : colors.destructive} />
    </Pressable>
  );
}

export default function RegisterPurchaseScreen() {
  // pedidoId + lines arrive from purchase-orders (admin fulfilling a
  // technician's pedido): lines is the pedido's own line items, JSON-encoded
  // since route params are strings. Coming from the Compras list has neither.
  const { pedidoId, lines: linesParam } = useLocalSearchParams<{
    pedidoId?: string;
    lines?: string;
  }>();

  const prefillLines = useMemo(() => {
    if (!linesParam) return null;
    try {
      const parsed = JSON.parse(linesParam) as { repId: number; cantidad: number }[];
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
    } catch {
      return null;
    }
  }, [linesParam]);

  const [loading, setLoading] = useState(true);
  const [suppliers, setSuppliers] = useState<SupplierWithRubro[]>([]);
  const [spareParts, setSpareParts] = useState<Repuesto[]>([]);

  const [tipoComprobante, setTipoComprobante] = useState<ComprobanteTipo | null>(null);
  const [letra, setLetra] = useState<"A" | "B" | "C" | null>(null);
  const [puntoVenta, setPuntoVenta] = useState("");
  const [numero, setNumero] = useState("");
  const [proveedorId, setProveedorId] = useState<number | null>(null);
  const [fecha, setFecha] = useState(getTodayDateString());
  const [lines, setLines] = useState<LineDraft[]>(
    prefillLines ? prefillLines.map((l) => newLine(l.repId, String(l.cantidad))) : [newLine()],
  );
  const [openField, setOpenField] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const today = useMemo(() => new Date(), []);

  const tipoError = submitted && !tipoComprobante;
  const letraError = submitted && tipoComprobante === "factura" && !letra;
  const puntoVentaError = submitted && tipoComprobante !== "remito" && !puntoVenta.trim();
  const numeroError = submitted && !numero.trim();
  const fechaError = submitted && (!fecha.trim() || !isValidDateString(fecha));
  const proveedorError = submitted && !proveedorId;

  const repError = (l: LineDraft) => submitted && !l.repId;
  const cantError = (l: LineDraft) => {
    const qty = Number(l.cantidad);
    return submitted && (!l.cantidad.trim() || !Number.isInteger(qty) || qty <= 0);
  };
  const costoError = (l: LineDraft) => {
    const cost = Number(l.costo);
    return submitted && (!l.costo.trim() || !Number.isFinite(cost) || cost < 0);
  };

  useEffect(() => {
    Promise.all([listSuppliers(), listSpareParts()])
      .then(([supplierList, partList]) => {
        setSuppliers(supplierList);
        setSpareParts(partList);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  const partOptions = useMemo(
    () =>
      spareParts
        .filter((p) => p.rep_estado === "activo")
        .map((p) => ({ value: p.rep_id, label: p.rep_nombre })),
    [spareParts],
  );
  const supplierOptions = useMemo(
    () => suppliers.map((s) => ({ value: s.prov_id_proveedor, label: s.prov_nombre })),
    [suppliers],
  );
  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s.prov_id_proveedor === proveedorId) ?? null,
    [suppliers, proveedorId],
  );
  const cuitError = submitted && !!proveedorId && !selectedSupplier?.prov_cuit?.trim();

  function updateLine(key: string, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((l) => l.key !== key)));
  }

  async function handleSave() {
    setSubmitted(true);
    setError(null);

    const validation = validatePurchaseRegistration({
      tipoComprobante,
      letra,
      puntoVenta,
      numero,
      fecha,
      proveedorId,
      proveedorCuit: selectedSupplier?.prov_cuit ?? null,
      lines,
    });

    if (!validation.valid) {
      setError(validation.error);
      return;
    }

    setSaving(true);
    try {
      await registrarCompra({
        tipoComprobante: tipoComprobante!,
        puntoVenta: tipoComprobante === "remito" ? null : puntoVenta.trim(),
        proveedorId: proveedorId!,
        nombre: tipoComprobante === "factura" ? `${letra}-${numero.trim()}` : numero.trim(),
        fecha: toDbDate(fecha),
        garantia: null,
        lineas: validation.parsedLines,
        pedidoId: pedidoId ? Number(pedidoId) : null,
      });
      goBackToPurchases();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator style={styles.center} />
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.topBar}>
          <Pressable style={styles.backLink} onPress={goBackToPurchases}>
            <BackIcon />

            <Text style={styles.backText}>Volver a compras</Text>
          </Pressable>
        </View>

        <Text style={styles.pageTitle}>Registrar compra</Text>

        <Text style={styles.pageSubtitle}>Cargá los datos del comprobante del proveedor.</Text>

        <View style={styles.body}>
          <View style={styles.section}>
            <Text style={styles.label}>Datos del comprobante</Text>

            <View style={[styles.docRow, openField === "tipo" && styles.docRowRaised]}>
              <View style={styles.docItem}>
                <Text style={styles.smallLabel}>Tipo de comprobante *</Text>

                <Select
                  value={tipoComprobante}
                  onChange={(value) => {
                    if (value !== tipoComprobante) {
                      setLetra(null);
                      setPuntoVenta("");
                      setNumero("");
                    }
                    setTipoComprobante(value);
                    setOpenField(null);
                    setError(null);
                  }}
                  options={DOC_OPTIONS}
                  placeholder="Elegí un tipo"
                  open={openField === "tipo"}
                  onOpenChange={(open) => setOpenField(open ? "tipo" : null)}
                  hasError={tipoError}
                />
              </View>

              <View style={styles.provCol}>
                <Text style={styles.smallLabel}>Proveedor *</Text>

                <Select
                  value={proveedorId}
                  onChange={(value) => {
                    setProveedorId(value);
                    setError(null);
                  }}
                  options={supplierOptions}
                  placeholder={
                    supplierOptions.length === 0
                      ? "No hay proveedores cargados"
                      : "Elegí un proveedor"
                  }
                  disabled={supplierOptions.length === 0}
                  open={openField === "proveedor"}
                  onOpenChange={(open) => setOpenField(open ? "proveedor" : null)}
                  hasError={proveedorError}
                />
              </View>

              <View style={styles.cuitCol}>
                <Text style={styles.smallLabel}>CUIT *</Text>

                <View style={[styles.cuitBox, cuitError && styles.inputError]}>
                  <Text
                    style={selectedSupplier?.prov_cuit ? styles.cuitText : styles.cuitPlaceholder}
                  >
                    {selectedSupplier?.prov_cuit ||
                      (selectedSupplier ? "Sin CUIT cargado" : "Seleccioná un proveedor")}
                  </Text>
                </View>
              </View>
            </View>

            {selectedSupplier && !selectedSupplier.prov_cuit?.trim() && (
              <Text style={styles.fieldError}>
                Este proveedor no tiene CUIT. Cargalo en Proveedores antes de registrar la compra.
              </Text>
            )}

            <View style={[styles.docRow, openField === "fecha" && styles.docRowRaised]}>
              {tipoComprobante === "factura" && (
                <View style={styles.docItem}>
                  <Text style={styles.smallLabel}>Tipo de factura *</Text>

                  <Select
                    value={letra}
                    onChange={setLetra}
                    options={LETTER_OPTIONS}
                    placeholder="Elegí el tipo de factura"
                    open={openField === "letra"}
                    onOpenChange={(open) => setOpenField(open ? "letra" : null)}
                    hasError={letraError}
                  />
                </View>
              )}

              {tipoComprobante !== "remito" && tipoComprobante && (
                <View style={styles.docItem}>
                  <Text style={styles.smallLabel}>Punto de venta *</Text>

                  <TextInput
                    style={[styles.input, puntoVentaError && styles.inputError]}
                    value={puntoVenta}
                    onChangeText={(value) =>
                      setPuntoVenta(value.replace(/[^0-9]/g, "").slice(0, 4))
                    }
                    placeholder="Ej: 0002"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="number-pad"
                    maxLength={4}
                  />
                </View>
              )}

              {tipoComprobante && (
                <View style={styles.docItem}>
                  <Text style={styles.smallLabel}>{docNumberLabel(tipoComprobante)}</Text>

                  <TextInput
                    style={[styles.input, numeroError && styles.inputError]}
                    value={numero}
                    onChangeText={(value) => setNumero(value.replace(/[^0-9]/g, "").slice(0, 8))}
                    placeholder={tipoComprobante === "remito" ? "Ej: 00000452" : "Ej: 00000111"}
                    placeholderTextColor={colors.textMuted}
                    keyboardType="number-pad"
                    maxLength={8}
                  />
                </View>
              )}

              {tipoComprobante && (
                <View style={[styles.docItem, styles.dateCol]}>
                  <Text style={styles.smallLabel}>{docDateLabel(tipoComprobante)}</Text>

                  <CustomDatePicker
                    value={fecha}
                    onChange={setFecha}
                    maxDate={today}
                    open={openField === "fecha"}
                    onOpenChange={(open) => setOpenField(open ? "fecha" : null)}
                    hasError={fechaError}
                  />
                </View>
              )}
            </View>

            {tipoComprobante && (
              <Text style={styles.stockNote}>
                {tipoComprobante === "factura"
                  ? "El stock se suma cuando cargues los remitos de recepción desde el detalle de la compra."
                  : "Al confirmar, las cantidades de las líneas ingresan al stock."}
              </Text>
            )}
          </View>

          <View style={styles.tableCard}>
            <View style={styles.linesHeader}>
              <View>
                <Text style={styles.label}>Detalle del comprobante</Text>

                <Text style={styles.linesSub}>
                  Repuesto, cantidad y costo unitario de cada línea.
                </Text>
              </View>

              <Pressable
                style={styles.addLineBtn}
                onPress={() => setLines((prev) => [...prev, newLine()])}
              >
                <Text style={styles.addLineText}>+ Agregar línea</Text>
              </Pressable>
            </View>

            <View style={styles.tableHeadRow}>
              <Text style={[styles.tableHeadText, styles.colNum, { color: "#fff" }]}>#</Text>

              <Text style={[styles.tableHeadText, styles.colRepFlex]}>Repuesto</Text>

              <Text style={[styles.tableHeadText, styles.colCant]}>Cantidad</Text>

              <Text style={[styles.tableHeadText, styles.colCosto]}>Costo unit.</Text>

              <Text style={[styles.tableHeadText, styles.colRemove, styles.actionsHeading]}>
                Acciones
              </Text>
            </View>

            {lines.map((l, idx) => (
              <View
                key={l.key}
                style={[styles.tableRow, openField === `rep-${l.key}` && styles.tableRowRaised]}
              >
                <Text style={[styles.cellNum, styles.colNum]}>{idx + 1}</Text>

                <View style={styles.colRepFlex}>
                  <Select
                    value={l.repId}
                    onChange={(v) => updateLine(l.key, { repId: v })}
                    options={partOptions}
                    placeholder="Elegí un repuesto"
                    open={openField === `rep-${l.key}`}
                    onOpenChange={(o) => setOpenField(o ? `rep-${l.key}` : null)}
                    hasError={repError(l)}
                  />
                </View>

                <View style={styles.colCant}>
                  <TextInput
                    style={[styles.cellInput, cantError(l) && styles.cellInputError]}
                    value={l.cantidad}
                    onChangeText={(v) => updateLine(l.key, { cantidad: v })}
                    placeholder="0"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numeric"
                  />
                </View>

                <View style={styles.colCosto}>
                  <TextInput
                    style={[styles.cellInput, costoError(l) && styles.cellInputError]}
                    value={l.costo}
                    onChangeText={(v) => updateLine(l.key, { costo: v })}
                    placeholder="Ej: 1500"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numeric"
                  />
                </View>

                <View style={styles.colRemove}>
                  <LineDeleteButton
                    onPress={() => removeLine(l.key)}
                    disabled={lines.length === 1}
                    colors={colors}
                    styles={styles}
                  />
                </View>
              </View>
            ))}
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.actions}>
            <Pressable
              style={styles.cancelButton}
              onPress={goBackToPurchases}
              disabled={saving}
              accessibilityRole="button"
            >
              <Text style={styles.actionText}>Cancelar</Text>
            </Pressable>

            <Pressable
              style={styles.confirmButton}
              onPress={handleSave}
              disabled={saving}
              accessibilityRole="button"
            >
              <Text style={styles.actionText}>{saving ? "Guardando…" : "Confirmar"}</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { backgroundColor: c.bg },
    content: { padding: 20, paddingBottom: 64, maxWidth: 1040 },
    center: { flex: 1 },
    topBar: { flexDirection: "row", marginBottom: 18 },
    backLink: { flexDirection: "row", alignItems: "center", gap: 7 },
    backText: { color: c.textLabel, fontSize: 13.5 },
    pageTitle: { fontSize: 28, fontWeight: "600", letterSpacing: -0.5, color: c.text },
    pageSubtitle: { marginTop: 6, fontSize: 14.5, color: c.textSecondary, maxWidth: 620 },
    body: { marginTop: 24 },
    // zIndex here isn't decorative: react-native-web gives every View its
    // own stacking context (implicit position:relative), so a dropdown's
    // raised zIndex only wins locally — against the sibling tableCard below
    // it needs this card itself ranked higher, or tableCard (later in the
    // DOM, same default zIndex 0) paints over the open dropdown.
    section: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 16,
      backgroundColor: c.bgCard,
      padding: 20,
      zIndex: 20,
    },
    label: {
      fontSize: 15,
      fontWeight: "700",
      color: c.text,
    },
    smallLabel: {
      fontSize: 12.5,
      fontWeight: "600",
      color: c.textLabel,
      marginBottom: 7,
    },
    input: {
      minHeight: 44,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: c.borderInput,
      borderRadius: 12,
      backgroundColor: c.bgInput,
      fontSize: 14.5,
      color: c.text,
    },
    inputError: {
      borderColor: c.destructive,
      borderWidth: 1.5,
    },
    cellInputError: {
      borderColor: c.destructive,
      borderWidth: 1.5,
    },
    fieldError: {
      color: c.destructive,
      fontSize: 12,
      marginTop: 4,
    },
    docRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 14,
      marginTop: 18,
      position: "relative",
      zIndex: 40,
    },
    docRowRaised: { zIndex: 60 },
    docItem: { flexGrow: 1, flexBasis: 150, minWidth: 150, position: "relative" },
    dateCol: { zIndex: 60 },
    provCol: { flexGrow: 2, flexBasis: 260, minWidth: 220, position: "relative" },
    cuitCol: { flexGrow: 1, flexBasis: 160, minWidth: 160 },
    cuitBox: {
      minHeight: 44,
      paddingHorizontal: 14,
      justifyContent: "center",
      borderWidth: 1,
      borderColor: c.borderInput,
      borderRadius: 12,
      backgroundColor: c.bgInput,
    },
    cuitText: { fontSize: 14.5, color: c.textSecondary, fontVariant: ["tabular-nums"] },
    cuitPlaceholder: { fontSize: 14, color: c.textMuted },
    stockNote: { marginTop: 16, color: c.textMuted, fontSize: 12.5, lineHeight: 18 },
    tableCard: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 16,
      backgroundColor: c.bgCard,
      marginTop: 16,
      zIndex: 10,
    },
    linesHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
      padding: 20,
      paddingBottom: 16,
    },
    linesSub: { fontSize: 12, color: c.textMuted, marginTop: 3 },
    addLineBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      height: 38,
      paddingHorizontal: 16,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.borderInput,
      backgroundColor: c.bgInput,
    },
    addLineText: { fontSize: 13, fontWeight: "700", color: c.textLabel },
    tableHeadRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 20,
      paddingVertical: 12,
      backgroundColor: c.accent,
    },
    tableHeadText: {
      fontSize: 12.5,
      fontWeight: "700",
      letterSpacing: 0.6,
      textTransform: "uppercase",
      color: "#fff",
      fontFamily: "monospace",
    },
    tableRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderTopWidth: 1,
      borderTopColor: c.borderRow,
      position: "relative",
      zIndex: 40,
    },
    tableRowRaised: { zIndex: 50 },
    colNum: { width: 22, fontSize: 13, color: c.textMuted, fontVariant: ["tabular-nums"] },
    colRepFlex: { flex: 2.2, minWidth: 150 },
    colCant: { width: 76 },
    colCosto: { flex: 1, minWidth: 100 },
    colRemove: { width: 70, alignItems: "center" },
    actionsHeading: { textAlign: "center" },
    cellInput: {
      height: 40,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: c.borderInput,
      borderRadius: 10,
      backgroundColor: c.bgInput,
      fontSize: 14,
      color: c.text,
      fontVariant: ["tabular-nums"],
    },
    cellNum: { fontVariant: ["tabular-nums"] },
    removeBtn: {
      width: 32,
      height: 32,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.bgInput,
      borderWidth: 1,
      borderColor: c.borderInput,
      ...(Platform.OS === "web" ? ({ cursor: "pointer" } as object) : {}),
    },
    removeBtnHover: {
      backgroundColor: c.eqRepair.bg,
      borderColor: c.destructive,
    },
    removeBtnDisabled: {
      opacity: 0.35,
      ...(Platform.OS === "web" ? ({ cursor: "not-allowed" } as object) : {}),
    },
    actions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 22 },
    cancelButton: {
      minWidth: 150,
      paddingHorizontal: 24,
      height: 44,
      borderRadius: 10,
      backgroundColor: "#dc2626",
      alignItems: "center",
      justifyContent: "center",
    },
    confirmButton: {
      minWidth: 150,
      paddingHorizontal: 24,
      height: 44,
      borderRadius: 10,
      backgroundColor: c.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    actionText: { color: "#fff", fontWeight: "600" },
    error: { color: c.destructive, marginTop: 14, fontSize: 16, fontWeight: "700" },
  });
}
