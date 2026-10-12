import { Stack, router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { BackIcon, CheckIcon, TrashIcon } from "../../../components/icons";
import {
  CustomDatePicker,
  getTodayDateString,
  isValidDateString,
  toDbDate,
} from "../../../components/CustomDatePicker";
import { FormFooter } from "../../../components/FormFooter";
import { Select } from "../../../components/Select";
import { registrarCompra } from "../../../lib/queries/purchases";
import { listSpareParts } from "../../../lib/queries/spareParts";
import { listSuppliers, type SupplierWithRubro } from "../../../lib/queries/suppliers";
import type { ThemeColors } from "../../../lib/theme";
import { useTheme } from "../../../lib/ThemeContext";
import { FACTURA_LETRAS } from "../../../lib/comprobante";
import type { ComprobanteTipo, FacturaLetra, Repuesto } from "../../../types/database";

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
  // Only checked for a factura; tique/remito have no letra.
  letra: FacturaLetra | null;
  puntoVenta: string;
  numero: string;
  fecha: string;
  proveedorId: number | null;
  // The chosen supplier's CUIT (null if it has none loaded).
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

  if (!form.puntoVenta.trim()) {
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

  // The CUIT isn't typed here, it comes from the supplier: one without it
  // (loaded before it was required) has to be fixed in Proveedores first.
  if (!form.proveedorCuit?.trim()) {
    return {
      valid: false,
      error:
        "El proveedor elegido no tiene CUIT. Cargalo en Proveedores antes de registrar la compra.",
    };
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

type DocOption = {
  id: ComprobanteTipo;
  code: string;
  note: string;
  title: string;
  desc: string;
};

// Order matches the wizard's step 1: pick the document the supplier handed
// over before touching any field.
const DOC_OPTIONS: DocOption[] = [
  {
    id: "factura",
    code: "F",
    note: "A · B · C",
    title: "Factura",
    desc: "Trae precios. Se elige la letra (A, B o C), se carga cantidad y costo unitario por línea, y queda el total de la compra.",
  },
  {
    id: "tique",
    code: "T",
    note: "Tique",
    title: "Tique",
    desc: "Compra de mostrador a consumidor final. Punto de venta, número de tique y total.",
  },
];

function docOption(tipo: ComprobanteTipo): DocOption {
  return DOC_OPTIONS.find((d) => d.id === tipo)!;
}

function docNumberLabel(tipo: ComprobanteTipo): string {
  // Same wording as the printed comprobante, so the admin finds it at once.
  return tipo === "tique" ? "Nro. de tique" : "Comp. Nro";
}

function docDateLabel(tipo: ComprobanteTipo): string {
  return tipo === "tique" ? "Fecha del tique" : "Fecha de emisión";
}

function goBackToPurchases() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace("/purchases");
  }
}

// Small lift-and-scale on hover/press so a card reacts before the tap
// actually picks it — own Animated.Value per card (via its own component
// instance) since three cards animate independently.
function DocTypeCard({
  opt,
  onPress,
  styles,
}: {
  opt: DocOption;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  function animateTo(value: number) {
    Animated.spring(scale, {
      toValue: value,
      useNativeDriver: true,
      speed: 24,
      bounciness: 6,
    }).start();
  }

  return (
    <Pressable
      style={styles.docCardWrap}
      onPress={onPress}
      onHoverIn={() => animateTo(1.03)}
      onHoverOut={() => animateTo(1)}
      onPressIn={() => animateTo(0.97)}
      onPressOut={() => animateTo(1)}
    >
      <Animated.View style={[styles.docCard, { transform: [{ scale }] }]}>
        <View style={styles.docCardBadge}>
          <Text style={styles.docCardBadgeCode}>{opt.code}</Text>
          <Text style={styles.docCardBadgeNote}>{opt.note}</Text>
        </View>

        <Text style={styles.docCardTitle}>{opt.title}</Text>
        <Text style={styles.docCardDesc}>{opt.desc}</Text>
      </Animated.View>
    </Pressable>
  );
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
  // No default on purpose: the admin copies it from the paper factura, a
  // preselected letter would get saved wrong without anyone noticing.
  const [letra, setLetra] = useState<FacturaLetra | null>(null);
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

  const letraError = submitted && tipoComprobante === "factura" && !letra;
  const puntoVentaError = submitted && !puntoVenta.trim();
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

  function updateLine(key: string, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((l) => l.key !== key)));
  }

  function backToStep1() {
    setTipoComprobante(null);
    setLetra(null);
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
        letra,
        puntoVenta: puntoVenta.trim(),
        proveedorId: proveedorId!,
        nombre: numero.trim() || null,
        fecha: toDbDate(fecha),
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

  // Each field is built once and placed by the layout below: the factura
  // layout mirrors a printed factura, the tique one keeps the plain form.
  const puntoVentaField = (
    <TextInput
      style={[styles.input, puntoVentaError && styles.inputError]}
      value={puntoVenta}
      onChangeText={(t) => {
        setPuntoVenta(t.replace(/[^0-9]/g, "").slice(0, 5));
        if (error) setError(null);
      }}
      placeholder="Ej: 00006"
      placeholderTextColor={colors.textMuted}
      keyboardType="number-pad"
      maxLength={5}
      accessibilityLabel="Punto de venta"
    />
  );

  const numeroField = (
    <TextInput
      style={[styles.input, numeroError && styles.inputError]}
      value={numero}
      onChangeText={(t) => {
        setNumero(t.replace(/[^0-9]/g, "").slice(0, 8));
        if (error) setError(null);
      }}
      placeholder="Ej: 00001359"
      placeholderTextColor={colors.textMuted}
      keyboardType="number-pad"
      maxLength={8}
      accessibilityLabel={tipoComprobante ? docNumberLabel(tipoComprobante) : "Número"}
    />
  );

  const fechaField = (
    <CustomDatePicker
      value={fecha}
      onChange={(f) => {
        setFecha(f);
        if (error) setError(null);
      }}
      maxDate={today}
      open={openField === "fecha"}
      onOpenChange={(o) => setOpenField(o ? "fecha" : null)}
      hasError={fechaError}
    />
  );

  const proveedorField = (
    <Select
      value={proveedorId}
      onChange={(p) => {
        setProveedorId(p);
        if (error) setError(null);
      }}
      options={supplierOptions}
      placeholder={
        supplierOptions.length === 0 ? "No hay proveedores cargados" : "Elegí un proveedor"
      }
      disabled={supplierOptions.length === 0}
      open={openField === "proveedor"}
      onOpenChange={(o) => setOpenField(o ? "proveedor" : null)}
      hasError={proveedorError}
    />
  );

  // Read-only, filled from the chosen supplier. Required: a supplier with
  // no CUIT is flagged right here, before trying to confirm.
  const supplierMissingCuit = !!selectedSupplier && !selectedSupplier.prov_cuit?.trim();
  const cuitField = (
    <View style={[styles.cuitBox, supplierMissingCuit && styles.inputError]}>
      <Text
        style={
          selectedSupplier?.prov_cuit
            ? styles.cuitText
            : supplierMissingCuit
              ? styles.cuitMissing
              : styles.cuitPlaceholder
        }
      >
        {selectedSupplier
          ? selectedSupplier.prov_cuit || "Sin CUIT: cargalo en Proveedores"
          : "Se completa al elegir el proveedor"}
      </Text>
    </View>
  );

  // Header + one row per line; shared by both layouts.
  const lineRows = (
    <>
      <View style={styles.tableHeadRow}>
        <Text style={[styles.tableHeadText, styles.colNum, { color: "#fff" }]}>#</Text>

        <Text style={[styles.tableHeadText, styles.colRepFlex]}>Repuesto</Text>

        <Text style={[styles.tableHeadText, styles.colCant]}>Cantidad</Text>

        <Text style={[styles.tableHeadText, styles.colCosto]}>Precio unit.</Text>

        <Text style={[styles.tableHeadText, styles.colTotal, styles.textRight]}>Subtotal</Text>

        <View style={styles.colRemove} />
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

          <Text style={[styles.cellTotal, styles.colTotal, styles.textRight]}>
            {Number(l.cantidad) > 0 && l.costo.trim() !== ""
              ? `$${(Number(l.cantidad) * Number(l.costo)).toLocaleString("es-AR", { maximumFractionDigits: 2 })}`
              : "—"}
          </Text>

          <LineDeleteButton
            onPress={() => removeLine(l.key)}
            disabled={lines.length === 1}
            colors={colors}
            styles={styles}
          />
        </View>
      ))}
    </>
  );

  const addLineButton = (
    <Pressable style={styles.addLineBtn} onPress={() => setLines((prev) => [...prev, newLine()])}>
      <Text style={styles.addLineText}>+ Agregar línea</Text>
    </Pressable>
  );

  const totalText = `$${total.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;

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

        <Text style={styles.pageSubtitle}>
          {tipoComprobante == null
            ? "Elegí el tipo de comprobante del proveedor."
            : tipoComprobante === "tique"
              ? pedidoId
                ? "Al guardar se ingresa el stock y el pedido queda como recibido."
                : "Al guardar se suma la cantidad de cada línea al stock del repuesto."
              : "Al guardar queda pendiente de recepción. El stock se suma después, cargando remitos desde el detalle de la compra."}
        </Text>

        <View style={styles.steps}>
          <Pressable
            style={styles.stepItem}
            onPress={backToStep1}
            disabled={tipoComprobante == null}
          >
            <View
              style={[
                styles.stepDot,
                (tipoComprobante == null || tipoComprobante != null) && styles.stepDotActive,
              ]}
            >
              {tipoComprobante != null ? (
                <CheckIcon size={13} color="#fff" />
              ) : (
                <Text style={styles.stepDotTextActive}>1</Text>
              )}
            </View>

            <Text
              style={[
                styles.stepLabel,
                (tipoComprobante == null || tipoComprobante != null) && styles.stepLabelActive,
              ]}
            >
              Tipo de comprobante
            </Text>
          </Pressable>

          <View style={[styles.stepLine, tipoComprobante != null && styles.stepLineActive]} />

          <View style={styles.stepItem}>
            <View style={[styles.stepDot, tipoComprobante != null && styles.stepDotActive]}>
              <Text
                style={[styles.stepDotText, tipoComprobante != null && styles.stepDotTextActive]}
              >
                2
              </Text>
            </View>

            <Text style={[styles.stepLabel, tipoComprobante != null && styles.stepLabelActive]}>
              Datos y detalle
            </Text>
          </View>
        </View>

        {tipoComprobante == null ? (
          <View style={styles.docCards}>
            {DOC_OPTIONS.map((opt) => (
              <DocTypeCard
                key={opt.id}
                opt={opt}
                onPress={() => setTipoComprobante(opt.id)}
                styles={styles}
              />
            ))}
          </View>
        ) : (
          <View style={styles.body}>
            {tipoComprobante === "factura" ? (
              // Laid out like a printed factura (emisor top left, boxed letra
              // hanging from the top edge in the middle, comprobante data top
              // right, items, then the total bottom right), so the admin finds
              // each field where it sits on the paper in their hand.
              <View style={styles.invoice}>
                <View style={styles.invoiceTopBar}>
                  <Text style={styles.invoiceTopBarText}>Comprobante del proveedor</Text>

                  <Pressable style={styles.changeTypeBtn} onPress={backToStep1}>
                    <Text style={styles.changeTypeText}>Cambiar tipo</Text>
                  </Pressable>
                </View>

                <View
                  style={[
                    styles.invoiceHeader,
                    (openField === "proveedor" || openField === "fecha") && styles.raised,
                  ]}
                >
                  <View style={[styles.issuerCol, openField === "proveedor" && styles.raised]}>
                    <Text style={styles.smallLabel}>Razón social del proveedor</Text>

                    {proveedorField}

                    <Text style={styles.fieldHint}>
                      Es quien emite la factura: figura arriba a la izquierda.
                    </Text>
                  </View>

                  <View style={styles.letraCol}>
                    <View style={[styles.letraBox, letraError && styles.inputError]}>
                      <Text style={[styles.letraBoxText, !letra && styles.letraBoxEmpty]}>
                        {letra ?? "?"}
                      </Text>

                      <Text style={styles.letraBoxCode}>
                        {FACTURA_LETRAS.find((o) => o.letra === letra)?.code.toUpperCase() ??
                          "COD. —"}
                      </Text>
                    </View>

                    <View style={styles.letraPicker}>
                      {FACTURA_LETRAS.map((opt) => {
                        const active = letra === opt.letra;
                        return (
                          <Pressable
                            key={opt.letra}
                            style={[styles.letraOption, active && styles.letraOptionActive]}
                            onPress={() => {
                              setLetra(opt.letra);
                              if (error) setError(null);
                            }}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: active }}
                            accessibilityLabel={`Factura ${opt.letra}`}
                          >
                            <Text
                              style={[
                                styles.letraOptionText,
                                active && styles.letraOptionTextActive,
                              ]}
                            >
                              {opt.letra}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    {letraError && <Text style={styles.fieldError}>Elegí la letra</Text>}
                  </View>

                  <View style={[styles.docDataCol, openField === "fecha" && styles.raised]}>
                    <Text style={styles.invoiceTitle}>FACTURA</Text>

                    <View style={styles.docDataRow}>
                      <View style={styles.docDataItem}>
                        <Text style={styles.smallLabel}>Punto de venta</Text>
                        {puntoVentaField}
                      </View>

                      <View style={styles.docDataItem}>
                        <Text style={styles.smallLabel}>{docNumberLabel(tipoComprobante)}</Text>
                        {numeroField}
                      </View>
                    </View>

                    <View style={[styles.docDataRow, styles.docDataRowRaised]}>
                      <View style={styles.docDataItem}>
                        <Text style={styles.smallLabel}>{docDateLabel(tipoComprobante)}</Text>
                        {fechaField}
                      </View>
                    </View>

                    <View style={styles.docDataRow}>
                      <View style={styles.docDataItem}>
                        <Text style={styles.smallLabel}>CUIT</Text>
                        {cuitField}
                      </View>
                    </View>
                  </View>
                </View>

                <View style={styles.invoiceLinesHeader}>
                  <Text style={[styles.linesSub, { flex: 1, minWidth: 200 }]}>
                    Cada línea define lo facturado; el stock se suma al cargar los remitos de
                    recepción
                  </Text>

                  {addLineButton}
                </View>

                {lineRows}

                <View style={styles.invoiceTotals}>
                  <View style={styles.invoiceTotalsBox}>
                    <Text style={styles.invoiceTotalLabel}>Importe total:</Text>

                    <Text style={styles.summaryTotalAmount}>{totalText}</Text>
                  </View>
                </View>
              </View>
            ) : (
              <>
                <View style={styles.docHeader}>
                  <View style={styles.docBadge}>
                    <Text style={styles.docBadgeCode}>{docOption(tipoComprobante).code}</Text>
                    <Text style={styles.docBadgeNote}>{docOption(tipoComprobante).note}</Text>
                  </View>

                  <View style={{ flex: 1, minWidth: 140 }}>
                    <Text style={styles.docHeaderTitle}>{docOption(tipoComprobante).title}</Text>
                    <Text style={styles.docHeaderSub}>Datos del comprobante del proveedor</Text>
                  </View>

                  <Pressable style={styles.changeTypeBtn} onPress={backToStep1}>
                    <Text style={styles.changeTypeText}>Cambiar tipo</Text>
                  </Pressable>
                </View>

                <View style={styles.section}>
                  <View style={[styles.docRow, openField === "fecha" && styles.docRowRaised]}>
                    <View style={styles.docItem}>
                      <Text style={styles.smallLabel}>Punto de venta</Text>
                      {puntoVentaField}
                    </View>

                    <View style={styles.docItem}>
                      <Text style={styles.smallLabel}>{docNumberLabel(tipoComprobante)}</Text>
                      {numeroField}
                    </View>

                    <View style={[styles.docItem, styles.dateCol]}>
                      <Text style={styles.smallLabel}>{docDateLabel(tipoComprobante)}</Text>
                      {fechaField}
                    </View>
                  </View>

                  <View style={[styles.provRow, openField === "proveedor" && styles.docRowRaised]}>
                    <View style={styles.provCol}>
                      <Text style={styles.smallLabel}>Proveedor</Text>
                      {proveedorField}
                    </View>

                    <View style={styles.cuitCol}>
                      <Text style={styles.smallLabel}>CUIT</Text>
                      {cuitField}
                    </View>
                  </View>
                </View>

                <View style={styles.tableCard}>
                  <View style={styles.linesHeader}>
                    <View>
                      <Text style={styles.label}>Detalle del comprobante</Text>
                      <Text style={styles.linesSub}>Cada línea suma al stock del repuesto</Text>
                    </View>

                    {addLineButton}
                  </View>

                  {lineRows}

                  {/* Only the money total: summing units of different
                      repuestos gives a meaningless number. */}
                  <View style={styles.tableFooter}>
                    <Text style={styles.summaryTotal}>
                      Total del comprobante:{" "}
                      <Text style={styles.summaryTotalAmount}>{totalText}</Text>
                    </Text>
                  </View>
                </View>
              </>
            )}

            {error && <Text style={styles.error}>{error}</Text>}

            <FormFooter
              onCancel={goBackToPurchases}
              onConfirm={handleSave}
              busy={saving}
              align="end"
            />
          </View>
        )}
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
    steps: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 24 },
    stepItem: { flexDirection: "row", alignItems: "center", gap: 8 },
    stepDot: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: c.bgNested,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: c.borderInput,
    },
    stepDotActive: { backgroundColor: c.accent, borderColor: c.accent },
    stepDotText: { fontSize: 12, fontWeight: "700", color: c.textMuted },
    stepDotTextActive: { color: "#fff", fontSize: 12, fontWeight: "700" },
    stepLabel: { fontSize: 13.5, fontWeight: "500", color: c.textMuted },
    stepLabelActive: { color: c.text, fontWeight: "700" },
    stepLine: { width: 32, height: 2, backgroundColor: c.border },
    stepLineActive: { backgroundColor: c.accent },
    body: { marginTop: 24 },
    // No flexWrap: the 3 cards must always stay in a single row (they'd
    // wrap to 2+1 — and grow unevenly, since the lone wrapped card fills
    // its whole row — the moment the window got narrower than ~3*280px).
    docCards: { flexDirection: "row", gap: 20, marginTop: 24 },
    // Flex sizing lives on the Pressable (the actual flex item inside
    // docCards); docCard itself is the Animated.View that only handles the
    // visual box + the hover/press transform, so it can't carry its own
    // flex without breaking the row's sizing. Equal flex:1 (no
    // flexBasis/minWidth) so all three always match in width, shrinking
    // together instead of wrapping on a narrow window.
    docCardWrap: {
      flex: 1,
      // Pressable is focusable on web, so a mouse click leaves it focused
      // and the browser's default focus ring (a heavy black outline) sits
      // on top of the card until something else is clicked — kill it, the
      // hover border already gives the same feedback.
      ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : {}),
    },
    // flex:1 so this fills its Pressable's full height — docCards (the row)
    // stretches every Pressable to match the tallest card by default, but a
    // plain child only inherits that stretch on width; without flex:1 here
    // Factura's 3-line description made ITS box taller while Remito/Tique's
    // boxes stayed short, floating inside now-taller-but-invisible Pressables.
    docCard: {
      flex: 1,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 20,
      backgroundColor: c.bgCard,
      padding: 30,
    },
    // Bigger badge for the step-1 cards only — the step-2 doc header reuses
    // the smaller `docBadge` below, inline next to the title/subtitle.
    docCardBadge: {
      width: 60,
      height: 60,
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: c.text,
      alignItems: "center",
      justifyContent: "center",
    },
    docCardBadgeCode: { fontSize: 24, fontWeight: "700", color: c.text, lineHeight: 28 },
    docCardBadgeNote: { fontSize: 10.5, color: c.textMuted, marginTop: 2 },
    docCardTitle: { fontSize: 20, fontWeight: "700", color: c.text, marginTop: 18 },
    docCardDesc: { fontSize: 14, lineHeight: 21, color: c.textMuted, marginTop: 8 },
    docBadge: {
      width: 44,
      height: 44,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: c.text,
      alignItems: "center",
      justifyContent: "center",
    },
    docBadgeCode: { fontSize: 18, fontWeight: "700", color: c.text, lineHeight: 21 },
    docBadgeNote: { fontSize: 8.5, color: c.textMuted, marginTop: 1 },
    docTitle: { fontSize: 16.5, fontWeight: "700", color: c.text, marginTop: 14 },
    docDesc: { fontSize: 12.5, lineHeight: 18, color: c.textMuted, marginTop: 6 },
    docHeader: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 12,
      padding: 16,
      borderRadius: 16,
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
    },
    docHeaderTitle: { fontSize: 16, fontWeight: "700", color: c.text },
    docHeaderSub: { fontSize: 12.5, color: c.textMuted, marginTop: 2 },
    changeTypeBtn: {
      paddingHorizontal: 16,
      height: 38,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.borderInput,
      backgroundColor: c.bgInput,
      alignItems: "center",
      justifyContent: "center",
    },
    changeTypeText: { fontSize: 13, fontWeight: "700", color: c.textLabel },
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
      marginTop: 16,
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
      position: "relative",
      zIndex: 40,
    },
    docRowRaised: { zIndex: 60 },
    docItem: { flexGrow: 1, flexBasis: 150, minWidth: 150, position: "relative" },
    dateCol: { zIndex: 60 },
    provRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 14,
      marginTop: 18,
      position: "relative",
      zIndex: 40,
    },
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
    cuitMissing: { fontSize: 13.5, fontWeight: "600", color: c.destructive },
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
    colTotal: { flex: 1, minWidth: 90 },
    colRemove: { width: 34 },
    textRight: { textAlign: "right" },
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
    cellTotal: { fontSize: 14, fontWeight: "700", color: c.text, fontVariant: ["tabular-nums"] },
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
    tableFooter: {
      flexDirection: "row",
      justifyContent: "flex-end",
      alignItems: "center",
      backgroundColor: c.eqOperational.bg,
      borderTopWidth: 1,
      borderTopColor: c.borderRow,
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderBottomLeftRadius: 15,
      borderBottomRightRadius: 15,
    },
    summaryTotal: {
      fontSize: 15,
      fontWeight: "700",
      color: c.textLabel,
    },
    summaryTotalAmount: {
      fontSize: 20,
      fontWeight: "800",
      color: c.accent,
      fontVariant: ["tabular-nums"],
    },
    error: { color: c.destructive, marginTop: 14, fontSize: 16, fontWeight: "700" },
    // ---- Factura layout (mirrors a printed factura) ----
    raised: { zIndex: 60 },
    invoice: {
      marginTop: 16,
      borderWidth: 1.5,
      borderColor: c.text,
      borderRadius: 14,
      backgroundColor: c.bgCard,
      zIndex: 20,
    },
    invoiceTopBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderBottomWidth: 1.5,
      borderBottomColor: c.text,
    },
    invoiceTopBarText: {
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 0.6,
      textTransform: "uppercase",
      color: c.textLabel,
    },
    invoiceHeader: {
      flexDirection: "row",
      flexWrap: "wrap",
      borderBottomWidth: 1.5,
      borderBottomColor: c.text,
      position: "relative",
      zIndex: 30,
    },
    issuerCol: { flex: 1, minWidth: 240, padding: 20, position: "relative", zIndex: 1 },
    fieldHint: { fontSize: 12, color: c.textMuted, marginTop: 8, lineHeight: 17 },
    // Sits between both halves; its box hangs from the header's top edge
    // (no top border), like the boxed letra on a printed factura.
    letraCol: { width: 116, alignItems: "center", paddingBottom: 16 },
    letraBox: {
      width: 64,
      height: 64,
      borderWidth: 1.5,
      borderTopWidth: 0,
      borderColor: c.text,
      borderBottomLeftRadius: 10,
      borderBottomRightRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.bgInput,
    },
    letraBoxText: { fontSize: 30, fontWeight: "800", color: c.text, lineHeight: 34 },
    letraBoxEmpty: { color: c.textMuted },
    letraBoxCode: { fontSize: 9, fontWeight: "700", color: c.textMuted, marginTop: 1 },
    letraPicker: { flexDirection: "row", gap: 6, marginTop: 10 },
    letraOption: {
      width: 30,
      height: 30,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.borderInput,
      backgroundColor: c.bgInput,
      alignItems: "center",
      justifyContent: "center",
      ...(Platform.OS === "web" ? ({ cursor: "pointer" } as object) : {}),
    },
    letraOptionActive: { backgroundColor: c.accent, borderColor: c.accent },
    letraOptionText: { fontSize: 13.5, fontWeight: "700", color: c.textLabel },
    letraOptionTextActive: { color: "#fff" },
    docDataCol: { flex: 1, minWidth: 260, padding: 20, position: "relative", zIndex: 1 },
    invoiceTitle: {
      fontSize: 22,
      fontWeight: "800",
      letterSpacing: 0.5,
      color: c.text,
      marginBottom: 14,
    },
    docDataRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12,
      marginBottom: 12,
      position: "relative",
      zIndex: 1,
    },
    // The fecha row's date picker opens over the CUIT row below it.
    docDataRowRaised: { zIndex: 2 },
    docDataItem: { flex: 1, minWidth: 120, position: "relative" },
    invoiceLinesHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: 12,
      paddingHorizontal: 20,
      paddingVertical: 14,
    },
    invoiceTotals: {
      alignItems: "flex-end",
      padding: 16,
      borderTopWidth: 1,
      borderTopColor: c.borderRow,
    },
    invoiceTotalsBox: {
      flexDirection: "row",
      alignItems: "baseline",
      gap: 14,
      paddingHorizontal: 18,
      paddingVertical: 12,
      borderWidth: 1.5,
      borderColor: c.text,
      borderRadius: 10,
      backgroundColor: c.eqOperational.bg,
    },
    invoiceTotalLabel: { fontSize: 15, fontWeight: "700", color: c.textLabel },
  });
}
