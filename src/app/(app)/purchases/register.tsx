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
import { BackIcon, TrashIcon } from "../../../components/icons";
import {
  CustomDatePicker,
  getTodayDateString,
  isValidDateString,
  toDbDate,
} from "../../../components/CustomDatePicker";
import { FormFooter } from "../../../components/FormFooter";
import { Select } from "../../../components/Select";
import { StepIndicator } from "../../../components/StepIndicator";
import { registrarCompra } from "../../../lib/queries/purchases";
import { listSpareParts } from "../../../lib/queries/spareParts";
import { listSuppliers, type SupplierWithRubro } from "../../../lib/queries/suppliers";
import { makePurchaseDocumentStyles } from "../../../lib/purchaseDocumentStyles";
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
  // Factura only: whether its remito arrived with it. Defaults to "No" so
  // stock never enters by accident; "Sí" loads the remito on save.
  const [conRemito, setConRemito] = useState(false);
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
  // The comprobante's own look is shared with the compra detail screen, so
  // what's loaded here is what that screen shows afterwards.
  const styles = { ...makePurchaseDocumentStyles(colors), ...makeStyles(colors) };

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
    setConRemito(false);
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
        conRemito,
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

        <Text style={[styles.tableHeadText, styles.colCosto, styles.textRight]}>Precio unit.</Text>

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
              style={[styles.cellInput, styles.textRight, costoError(l) && styles.cellInputError]}
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

        <StepIndicator
          style={styles.steps}
          steps={[
            {
              label: "Tipo de comprobante",
              state: tipoComprobante ? "done" : "current",
              onPress: backToStep1,
            },
            { label: "Datos y detalle", state: tipoComprobante ? "current" : "upcoming" },
          ]}
        />

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
                    {conRemito
                      ? "Cada línea define lo facturado; llegó con el remito, así que se suma al stock al guardar"
                      : "Cada línea define lo facturado; el stock se suma al cargar los remitos de recepción"}
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

                <View style={styles.receptionRow}>
                  <View style={{ flex: 1, minWidth: 220 }}>
                    <Text style={styles.label}>¿Llegó con remito?</Text>

                    <Text style={styles.linesSub}>
                      {conRemito
                        ? "Se registra el remito junto con la factura: todo lo facturado entra al stock y la compra queda Recibida."
                        : "La compra queda pendiente de recepción: los remitos se cargan después desde su detalle."}
                    </Text>
                  </View>

                  <View style={[styles.letraPicker, { marginTop: 0 }]}>
                    {[
                      { value: false, label: "No" },
                      { value: true, label: "Sí" },
                    ].map((opt) => {
                      const active = conRemito === opt.value;
                      return (
                        <Pressable
                          key={opt.label}
                          style={[
                            styles.letraOption,
                            styles.receptionOption,
                            active &&
                              (opt.value ? styles.letraOptionActive : styles.receptionNoActive),
                          ]}
                          onPress={() => setConRemito(opt.value)}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: active }}
                          accessibilityLabel={`Llegó con remito: ${opt.label}`}
                        >
                          <Text
                            style={[
                              styles.letraOptionText,
                              styles.receptionOptionText,
                              active && styles.letraOptionTextActive,
                            ]}
                          >
                            {opt.label}
                          </Text>
                        </Pressable>
                      );
                    })}
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
    steps: { marginTop: 24 },
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
    // the smaller shared `docBadge`, inline next to the title/subtitle.
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
    docTitle: { fontSize: 16.5, fontWeight: "700", color: c.text, marginTop: 14 },
    docDesc: { fontSize: 12.5, lineHeight: 18, color: c.textMuted, marginTop: 6 },
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
    error: { color: c.destructive, marginTop: 14, fontSize: 16, fontWeight: "700" },
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
    // "¿Llegó con remito?" row closing the factura, under the total.
    receptionRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 12,
      padding: 16,
      paddingHorizontal: 20,
      borderTopWidth: 1,
      borderTopColor: c.borderRow,
    },
    // Same look as the letra boxes, just wide enough for "No"/"Sí".
    receptionOption: { width: 52, height: 36 },
    receptionOptionText: { fontSize: 15 },
    // "No" reads as a decline, so it takes the destructive red instead of
    // the accent green "Sí" uses.
    receptionNoActive: { backgroundColor: c.destructive, borderColor: c.destructive },
  });
}
