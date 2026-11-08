import { Stack, router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { FormFooter } from "../../../components/FormFooter";
import { BackIcon } from "../../../components/icons";
import { RadioGroup, type RadioOption } from "../../../components/RadioGroup";
import { Select } from "../../../components/Select";
import { makePurchaseDocumentStyles } from "../../../lib/purchaseDocumentStyles";
import { listSpareParts } from "../../../lib/queries/spareParts";
import { registrarMovimientoStock } from "../../../lib/queries/stockMovements";
import type { ThemeColors } from "../../../lib/theme";
import { useTheme } from "../../../lib/ThemeContext";
import type { MovimientoStockTipo, Repuesto } from "../../../types/database";

// Same flow as SuspendTaskModal: pick a reason, "Otro" requires writing it.
// Each tipo has its own list, so picking the tipo first narrows them down.
export const STOCK_MOVEMENT_REASONS: Record<MovimientoStockTipo, RadioOption<string>[]> = {
  ingreso: [
    { value: "Compra por fuera del sistema", label: "Compra por fuera del sistema" },
    { value: "Devolución de repuesto", label: "Devolución de repuesto" },
    { value: "Ajuste de inventario (sobrante)", label: "Ajuste de inventario (sobrante)" },
    { value: "Otro", label: "Otro" },
  ],
  egreso: [
    { value: "Pérdida", label: "Pérdida" },
    { value: "Rotura o daño", label: "Rotura o daño" },
    { value: "Ajuste de inventario (faltante)", label: "Ajuste de inventario (faltante)" },
    { value: "Otro", label: "Otro" },
  ],
};

export type StockMovementFormInput = {
  tipo: MovimientoStockTipo | null;
  repId: number | null;
  cantidad: string;
  motivo: string | null;
  comentario: string;
  // The chosen repuesto's stock on hand (null until one is picked).
  stockActual: number | null;
};

export type StockMovementValidationResult =
  | {
      valid: true;
      parsed: {
        tipo: MovimientoStockTipo;
        repId: number;
        cantidad: number;
        motivo: string;
        comentario: string | null;
      };
    }
  | { valid: false; error: string };

export function isValidQuantity(cantidad: string): boolean {
  const qty = Number(cantidad);
  return cantidad.trim() !== "" && Number.isInteger(qty) && qty > 0;
}

// Same messages as validatePurchaseRegistration, so every stock form
// reads alike.
export function validateStockMovement(form: StockMovementFormInput): StockMovementValidationResult {
  const isOtro = form.motivo === "Otro";
  const missing = [
    !form.tipo,
    !form.repId,
    !isValidQuantity(form.cantidad),
    !form.motivo,
    isOtro && !form.comentario.trim(),
  ].filter(Boolean).length;

  if (missing > 1) return { valid: false, error: "Completá los campos obligatorios." };
  if (missing === 1) return { valid: false, error: "Completá el campo obligatorio." };

  const cantidad = Number(form.cantidad);
  // The RPC checks this again under a row lock; this is just the early,
  // friendlier warning.
  if (form.tipo === "egreso" && form.stockActual !== null && cantidad > form.stockActual) {
    return {
      valid: false,
      error: `No hay stock suficiente: hay ${form.stockActual} y se quieren sacar ${cantidad}.`,
    };
  }

  return {
    valid: true,
    parsed: {
      tipo: form.tipo!,
      repId: form.repId!,
      cantidad,
      motivo: form.motivo!,
      comentario: isOtro ? form.comentario.trim() : null,
    },
  };
}

// The list reloads on focus, so the new movement shows up on return.
function goBackToMovements() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace("/stock-movements");
  }
}

export default function StockMovementScreen() {
  const [loading, setLoading] = useState(true);
  const [spareParts, setSpareParts] = useState<Repuesto[]>([]);

  const [tipo, setTipo] = useState<MovimientoStockTipo | null>(null);
  const [repId, setRepId] = useState<number | null>(null);
  const [cantidad, setCantidad] = useState("");
  const [motivo, setMotivo] = useState<string | null>(null);
  const [comentario, setComentario] = useState("");
  const [openField, setOpenField] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const { colors } = useTheme();
  const styles = { ...makePurchaseDocumentStyles(colors), ...makeStyles(colors) };

  useEffect(() => {
    listSpareParts()
      .then(setSpareParts)
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
  const selectedPart = useMemo(
    () => spareParts.find((p) => p.rep_id === repId) ?? null,
    [spareParts, repId],
  );

  const typeOptions: RadioOption<MovimientoStockTipo>[] = [
    {
      value: "ingreso",
      label: "Ingreso",
      badge: {
        bg: colors.eqOperational.bg,
        fg: colors.eqOperational.fg,
        accent: colors.eqOperational.dot,
      },
    },
    {
      value: "egreso",
      label: "Egreso",
      badge: { bg: colors.eqRepair.bg, fg: colors.eqRepair.fg, accent: colors.eqRepair.dot },
    },
  ];

  const stockActual = selectedPart?.rep_cantidad_actual ?? null;
  const qty = isValidQuantity(cantidad) ? Number(cantidad) : null;
  // Preview of the stock once saved; only shown when it can be computed.
  const stockDespues =
    stockActual !== null && qty !== null && tipo
      ? stockActual + (tipo === "ingreso" ? qty : -qty)
      : null;

  const isOtro = motivo === "Otro";
  const tipoError = submitted && !tipo;
  const repError = submitted && !repId;
  const cantError = (submitted && qty === null) || (stockDespues !== null && stockDespues < 0);
  const motivoError = submitted && !motivo;
  const comentarioError = submitted && isOtro && !comentario.trim();

  function clearError() {
    if (error) setError(null);
  }

  async function handleSave() {
    setSubmitted(true);
    setError(null);

    const validation = validateStockMovement({
      tipo,
      repId,
      cantidad,
      motivo,
      comentario,
      stockActual,
    });
    if (!validation.valid) {
      setError(validation.error);
      return;
    }

    setSaving(true);
    try {
      await registrarMovimientoStock(validation.parsed);
      goBackToMovements();
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
          <Pressable style={styles.backLink} onPress={goBackToMovements}>
            <BackIcon />

            <Text style={styles.backText}>Volver a movimientos</Text>
          </Pressable>
        </View>

        <Text style={styles.pageTitle}>Registrar movimiento de stock</Text>

        <Text style={styles.pageSubtitle}>
          {tipo === "egreso"
            ? "Al guardar se resta la cantidad del stock del repuesto."
            : tipo === "ingreso"
              ? "Al guardar se suma la cantidad al stock del repuesto."
              : "Sumá o restá stock por fuera de las compras y de las tareas, indicando el motivo."}
        </Text>

        <View style={styles.body}>
          <View style={[styles.section, openField === "repuesto" && styles.raised]}>
            <Text nativeID="tipo-movimiento-label" style={styles.smallLabel}>
              Tipo de movimiento *
            </Text>

            <RadioGroup
              name="tipo-movimiento"
              ariaLabelledBy="tipo-movimiento-label"
              value={tipo}
              onChange={(t) => {
                setTipo(t);
                // The reasons differ per tipo, so the picked one no longer applies.
                if (t !== tipo) {
                  setMotivo(null);
                  setComentario("");
                }
                clearError();
              }}
              options={typeOptions}
            />

            {tipoError && <Text style={styles.fieldError}>Elegí ingreso o egreso</Text>}

            <View style={[styles.provRow, openField === "repuesto" && styles.docRowRaised]}>
              <View style={styles.provCol}>
                <Text style={styles.smallLabel}>Repuesto *</Text>

                <Select
                  value={repId}
                  onChange={(v) => {
                    setRepId(v);
                    clearError();
                  }}
                  options={partOptions}
                  placeholder={
                    partOptions.length === 0 ? "No hay repuestos activos" : "Elegí un repuesto"
                  }
                  disabled={partOptions.length === 0}
                  searchable
                  open={openField === "repuesto"}
                  onOpenChange={(o) => setOpenField(o ? "repuesto" : null)}
                  hasError={repError}
                />
              </View>

              <View style={styles.cuitCol}>
                <Text style={styles.smallLabel}>Stock actual</Text>

                <View style={styles.readonlyBox}>
                  <Text
                    style={stockActual === null ? styles.readonlyPlaceholder : styles.readonlyText}
                  >
                    {stockActual === null ? "Se completa al elegir el repuesto" : stockActual}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.provRow}>
              <View style={styles.docItem}>
                <Text style={styles.smallLabel}>Cantidad *</Text>

                <TextInput
                  style={[styles.input, styles.textRight, cantError && styles.inputError]}
                  value={cantidad}
                  onChangeText={(t) => {
                    setCantidad(t.replace(/[^0-9]/g, ""));
                    clearError();
                  }}
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="number-pad"
                  accessibilityLabel="Cantidad"
                />
              </View>

              <View style={styles.docItem}>
                <Text style={styles.smallLabel}>Stock después del movimiento</Text>

                <View
                  style={[
                    styles.readonlyBox,
                    stockDespues !== null && stockDespues < 0 && styles.inputError,
                  ]}
                >
                  <Text
                    style={
                      stockDespues === null
                        ? styles.readonlyPlaceholder
                        : stockDespues < 0
                          ? styles.readonlyNegative
                          : styles.readonlyText
                    }
                  >
                    {stockDespues === null
                      ? "—"
                      : stockDespues < 0
                        ? "No alcanza el stock"
                        : stockDespues}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <View style={[styles.section, styles.sectionBelow]}>
            <Text nativeID="motivo-movimiento-label" style={styles.label}>
              Motivo *
            </Text>

            <Text style={styles.linesSub}>
              {tipo
                ? "Queda registrado junto con el movimiento."
                : "Elegí primero si es un ingreso o un egreso."}
            </Text>

            {tipo && (
              <RadioGroup
                name="motivo-movimiento"
                variant="cards"
                ariaLabelledBy="motivo-movimiento-label"
                style={styles.reasons}
                value={motivo}
                onChange={(m) => {
                  setMotivo(m);
                  if (m !== "Otro") setComentario("");
                  clearError();
                }}
                options={STOCK_MOVEMENT_REASONS[tipo]}
              />
            )}

            {motivoError && tipo && <Text style={styles.fieldError}>Elegí un motivo</Text>}

            {isOtro && (
              <View style={styles.commentSection}>
                <Text style={styles.smallLabel}>Detalle del motivo *</Text>

                <TextInput
                  style={[styles.input, styles.commentInput, comentarioError && styles.inputError]}
                  value={comentario}
                  onChangeText={(t) => {
                    setComentario(t);
                    clearError();
                  }}
                  placeholder="Explicá brevemente el motivo del movimiento"
                  placeholderTextColor={colors.textMuted}
                  multiline
                  numberOfLines={3}
                  maxLength={255}
                  autoFocus
                />
              </View>
            )}
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          <FormFooter
            onCancel={goBackToMovements}
            onConfirm={handleSave}
            busy={saving}
            align="end"
          />
        </View>
      </ScrollView>
    </>
  );
}

// Page chrome and inputs match purchases/register.tsx; the card parts
// (section, rows) come from makePurchaseDocumentStyles, the same plain
// layout the tique form uses.
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
    // The first section brings its own marginTop (16), so the gap under the
    // subtitle ends up 24, same as Registrar compra.
    body: { marginTop: 8 },
    // Under the first section, so its repuesto dropdown opens over this one.
    sectionBelow: { zIndex: 10 },
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
    inputError: { borderColor: c.destructive, borderWidth: 1.5 },
    fieldError: { color: c.destructive, fontSize: 12, marginTop: 4 },
    // Read-only figures, same box as the compra's CUIT field.
    readonlyBox: {
      minHeight: 44,
      paddingHorizontal: 14,
      justifyContent: "center",
      borderWidth: 1,
      borderColor: c.borderInput,
      borderRadius: 12,
      backgroundColor: c.bgInput,
    },
    readonlyText: {
      fontSize: 14.5,
      color: c.textSecondary,
      fontVariant: ["tabular-nums"],
      textAlign: "right",
    },
    readonlyPlaceholder: { fontSize: 14, color: c.textMuted },
    readonlyNegative: { fontSize: 13.5, fontWeight: "600", color: c.destructive },
    reasons: { marginTop: 12 },
    commentSection: { marginTop: 14 },
    commentInput: { minHeight: 78, textAlignVertical: "top" },
    error: { color: c.destructive, marginTop: 14, fontSize: 16, fontWeight: "700" },
  });
}
