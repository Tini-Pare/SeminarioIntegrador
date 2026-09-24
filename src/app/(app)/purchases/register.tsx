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
import { Select } from "../../../components/Select";
import { registrarCompra } from "../../../lib/queries/purchases";
import { listSpareParts } from "../../../lib/queries/spareParts";
import { listSuppliers, type SupplierWithRubro } from "../../../lib/queries/suppliers";
import type { ThemeColors } from "../../../lib/theme";
import { useTheme } from "../../../lib/ThemeContext";
import type { ComprobanteTipo, Repuesto } from "../../../types/database";

type LineDraft = { key: string; repId: number | null; cantidad: string; costo: string };

let lineSeq = 0;
const newLine = (repId: number | null = null, cantidad = ""): LineDraft => ({
  key: `l${lineSeq++}`,
  repId,
  cantidad,
  costo: "",
});

type DocOption = {
  id: ComprobanteTipo;
  code: string;
  note: string;
  title: string;
  desc: string;
};

// Order matches the wizard's step 1: pick the document the supplier handed
// over before touching any field, since it decides whether lines carry cost.
const DOC_OPTIONS: DocOption[] = [
  {
    id: "factura",
    code: "C",
    note: "Cód. 11",
    title: "Factura",
    desc: "Trae precios. Se carga cantidad y costo unitario por línea, y queda el total de la compra.",
  },
  {
    id: "remito",
    code: "R",
    note: "Cód. 91",
    title: "Remito",
    desc: "Sin precios. Solo cantidad y descripción de lo que entró al depósito.",
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
  return tipo === "tique" ? "Nro. de tique" : "Número";
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
  const [puntoVenta, setPuntoVenta] = useState("");
  const [numero, setNumero] = useState("");
  const [proveedorId, setProveedorId] = useState<number | null>(null);
  const [fecha, setFecha] = useState(getTodayDateString());
  const [garantia, setGarantia] = useState("");
  const [garantiaError, setGarantiaError] = useState<string | null>(null);
  const [lines, setLines] = useState<LineDraft[]>(
    prefillLines ? prefillLines.map((l) => newLine(l.repId, String(l.cantidad))) : [newLine()],
  );
  const [openField, setOpenField] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const today = useMemo(() => new Date(), []);
  const isRemito = tipoComprobante === "remito";

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
  }

  const units = useMemo(
    () => lines.reduce((acc, l) => acc + (Number(l.cantidad) || 0), 0),
    [lines],
  );

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
    if (!tipoComprobante) {
      setError("Elegí un tipo de comprobante.");
      return;
    }
    setGarantiaError(null);
    if (!proveedorId) {
      setError("Elegí un proveedor.");
      return;
    }
    if (!puntoVenta.trim()) {
      setError("Ingresá el punto de venta.");
      return;
    }
    if (!numero.trim()) {
      setError(`Ingresá el ${docNumberLabel(tipoComprobante).toLowerCase()}.`);
      return;
    }
    if (!fecha.trim() || !isValidDateString(fecha)) {
      setError("La fecha del comprobante no es válida.");
      return;
    }

    const garantiaNum = Number(garantia.trim());
    if (!garantia.trim() || !Number.isInteger(garantiaNum) || garantiaNum <= 0) {
      setGarantiaError("Ingresá la garantía en meses.");
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

      // A remito has no price, so its lines only move stock — costoUnitario
      // stays null and never reaches co_costo_total (see migration 0011).
      if (isRemito) {
        parsed.push({ repId: l.repId, cantidad: qty, costoUnitario: null });
        continue;
      }

      if (!l.costo.trim()) {
        setError("Cada línea tiene que tener un costo unitario.");
        return;
      }
      const costo = Number(l.costo);
      if (!Number.isFinite(costo) || costo < 0) {
        setError("El costo unitario tiene que ser un número ≥ 0.");
        return;
      }

      parsed.push({ repId: l.repId, cantidad: qty, costoUnitario: costo });
    }

    setSaving(true);
    setError(null);
    try {
      await registrarCompra({
        tipoComprobante,
        puntoVenta: puntoVenta.trim(),
        proveedorId,
        nombre: numero.trim() || null,
        fecha: toDbDate(fecha),
        garantia: garantia.trim(),
        lineas: parsed,
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

        <Text style={styles.pageSubtitle}>
          {tipoComprobante == null
            ? "Elegí el tipo de comprobante del proveedor."
            : isRemito || tipoComprobante === "tique"
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
            <View style={[styles.stepDot, tipoComprobante == null && styles.stepDotActive]}>
              <Text
                style={[styles.stepDotText, tipoComprobante == null && styles.stepDotTextActive]}
              >
                1
              </Text>
            </View>

            <Text style={[styles.stepLabel, tipoComprobante == null && styles.stepLabelActive]}>
              Tipo de comprobante
            </Text>
          </Pressable>

          <View style={styles.stepLine} />

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

                  <TextInput
                    style={styles.input}
                    value={puntoVenta}
                    onChangeText={(t) => setPuntoVenta(t.replace(/[^0-9]/g, ""))}
                    placeholder="Ej: 0002"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="number-pad"
                    maxLength={6}
                  />
                </View>

                <View style={styles.docItem}>
                  <Text style={styles.smallLabel}>{docNumberLabel(tipoComprobante)}</Text>

                  <TextInput
                    style={styles.input}
                    value={numero}
                    onChangeText={(t) => setNumero(t.replace(/[^0-9]/g, ""))}
                    placeholder="Ej: 00001111"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="number-pad"
                    maxLength={12}
                  />
                </View>

                <View style={[styles.docItem, styles.dateCol]}>
                  <Text style={styles.smallLabel}>{docDateLabel(tipoComprobante)}</Text>

                  <CustomDatePicker
                    value={fecha}
                    onChange={setFecha}
                    maxDate={today}
                    open={openField === "fecha"}
                    onOpenChange={(o) => setOpenField(o ? "fecha" : null)}
                  />
                </View>

                <View style={styles.docItem}>
                  <Text style={styles.smallLabel}>Garantía (meses)</Text>

                  <TextInput
                    style={[styles.input, garantiaError ? styles.inputError : null]}
                    value={garantia}
                    onChangeText={(text) => {
                      setGarantia(text.replace(/[^0-9]/g, ""));
                      if (garantiaError) setGarantiaError(null);
                    }}
                    placeholder="Ej: 24"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="number-pad"
                    maxLength={5}
                  />

                  {garantiaError && <Text style={styles.fieldError}>{garantiaError}</Text>}
                </View>
              </View>

              <View style={[styles.provRow, openField === "proveedor" && styles.docRowRaised]}>
                <View style={styles.provCol}>
                  <Text style={styles.smallLabel}>Proveedor</Text>

                  <Select
                    value={proveedorId}
                    onChange={setProveedorId}
                    options={supplierOptions}
                    placeholder={
                      supplierOptions.length === 0
                        ? "No hay proveedores cargados"
                        : "Elegí un proveedor"
                    }
                    disabled={supplierOptions.length === 0}
                    open={openField === "proveedor"}
                    onOpenChange={(o) => setOpenField(o ? "proveedor" : null)}
                  />
                </View>

                <View style={styles.cuitCol}>
                  <Text style={styles.smallLabel}>CUIT</Text>

                  <View style={styles.cuitBox}>
                    <Text style={styles.cuitText}>{selectedSupplier?.prov_cuit || "—"}</Text>
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.tableCard}>
              <View style={styles.linesHeader}>
                <View>
                  <Text style={styles.label}>Detalle del comprobante</Text>
                  <Text style={styles.linesSub}>
                    {isRemito || tipoComprobante === "tique"
                      ? "Cada línea suma al stock del repuesto"
                      : "Cada línea define lo facturado; el stock se suma al cargar los remitos de recepción"}
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
                {isRemito ? (
                  <>
                    <Text style={[styles.tableHeadText, styles.colCant]}>Cant.</Text>
                    <Text style={[styles.tableHeadText, styles.colRepFlex]}>Repuesto</Text>
                  </>
                ) : (
                  <>
                    <Text style={[styles.tableHeadText, styles.colNum]}>#</Text>
                    <Text style={[styles.tableHeadText, styles.colRepFlex]}>Repuesto</Text>
                    <Text style={[styles.tableHeadText, styles.colCant]}>Cant.</Text>
                    <Text style={[styles.tableHeadText, styles.colCosto]}>Costo unit.</Text>
                    <Text style={[styles.tableHeadText, styles.colTotal, styles.textRight]}>
                      Total
                    </Text>
                  </>
                )}
                <View style={styles.colRemove} />
              </View>

              {lines.map((l, idx) => (
                <View
                  key={l.key}
                  style={[styles.tableRow, openField === `rep-${l.key}` && styles.tableRowRaised]}
                >
                  {isRemito ? (
                    <>
                      <View style={styles.colCant}>
                        <TextInput
                          style={styles.cellInput}
                          value={l.cantidad}
                          onChangeText={(v) => updateLine(l.key, { cantidad: v })}
                          placeholder="0"
                          placeholderTextColor={colors.textMuted}
                          keyboardType="numeric"
                        />
                      </View>

                      <View style={styles.colRepFlex}>
                        <Select
                          value={l.repId}
                          onChange={(v) => updateLine(l.key, { repId: v })}
                          options={partOptions}
                          placeholder="Elegí un repuesto"
                          open={openField === `rep-${l.key}`}
                          onOpenChange={(o) => setOpenField(o ? `rep-${l.key}` : null)}
                        />
                      </View>
                    </>
                  ) : (
                    <>
                      <Text style={[styles.cellNum, styles.colNum]}>{idx + 1}</Text>

                      <View style={styles.colRepFlex}>
                        <Select
                          value={l.repId}
                          onChange={(v) => updateLine(l.key, { repId: v })}
                          options={partOptions}
                          placeholder="Elegí un repuesto"
                          open={openField === `rep-${l.key}`}
                          onOpenChange={(o) => setOpenField(o ? `rep-${l.key}` : null)}
                        />
                      </View>

                      <View style={styles.colCant}>
                        <TextInput
                          style={styles.cellInput}
                          value={l.cantidad}
                          onChangeText={(v) => updateLine(l.key, { cantidad: v })}
                          placeholder="0"
                          placeholderTextColor={colors.textMuted}
                          keyboardType="numeric"
                        />
                      </View>

                      <View style={styles.colCosto}>
                        <TextInput
                          style={styles.cellInput}
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
                    </>
                  )}

                  <Pressable
                    style={styles.removeBtn}
                    onPress={() => removeLine(l.key)}
                    disabled={lines.length === 1}
                    accessibilityLabel="Quitar línea"
                  >
                    <TrashIcon
                      size={14}
                      color={lines.length === 1 ? colors.textMuted : colors.destructive}
                    />
                  </Pressable>
                </View>
              ))}

              <View style={styles.summary}>
                <Text style={styles.summaryLine}>Unidades a ingresar: {units}</Text>

                {!isRemito && (
                  <Text style={styles.total}>
                    Total del comprobante: $
                    {total.toLocaleString("es-AR", { maximumFractionDigits: 2 })}
                  </Text>
                )}
              </View>
            </View>

            {error && <Text style={styles.error}>{error}</Text>}

            <View style={styles.actions}>
              <Pressable style={styles.cancelButton} onPress={goBackToPurchases}>
                <Text style={styles.cancelText}>Cancelar</Text>
              </Pressable>

              <Pressable style={styles.saveButton} onPress={handleSave} disabled={saving}>
                <Text style={styles.saveText}>{saving ? "Guardando…" : "Registrar"}</Text>
              </Pressable>
            </View>
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
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: c.bgNested,
      alignItems: "center",
      justifyContent: "center",
    },
    stepDotActive: { backgroundColor: c.accent },
    stepDotText: { fontSize: 11.5, fontWeight: "700", color: c.textMuted },
    stepDotTextActive: { color: "#fff" },
    stepLabel: { fontSize: 13, fontWeight: "500", color: c.textMuted },
    stepLabelActive: { color: c.text, fontWeight: "700" },
    stepLine: { width: 28, height: 1, backgroundColor: c.border },
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
      backgroundColor: c.bgNested,
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
      backgroundColor: c.bgCard,
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
      backgroundColor: c.bgNested,
    },
    cuitText: { fontSize: 14.5, color: c.textSecondary, fontVariant: ["tabular-nums"] },
    // No overflow:"hidden" here (unlike a typical card) — the repuesto
    // Select's dropdown for the last couple of rows needs to escape this
    // card's bottom edge instead of being clipped by it.
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
      backgroundColor: c.bgCard,
    },
    addLineText: { fontSize: 13, fontWeight: "700", color: c.textLabel },
    tableHeadRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 20,
      paddingVertical: 11,
      backgroundColor: c.bgTableHeader,
    },
    tableHeadText: { fontSize: 12.5, fontWeight: "700", color: c.textLabel },
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
    colRemove: { width: 30 },
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
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.bgNested,
    },
    summary: {
      flexDirection: "row",
      justifyContent: "flex-end",
      alignItems: "baseline",
      gap: 24,
      borderTopWidth: 1,
      borderTopColor: c.border,
      paddingHorizontal: 20,
      paddingVertical: 16,
    },
    summaryLine: { fontSize: 13, color: c.textSecondary },
    total: { fontSize: 16, fontWeight: "700", color: c.text },
    error: { color: c.destructive, marginTop: 14, fontSize: 13 },
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
    cancelText: { color: "#fff", fontWeight: "600" },
    saveButton: {
      minWidth: 150,
      paddingHorizontal: 24,
      height: 44,
      borderRadius: 10,
      backgroundColor: c.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    saveText: { color: "#fff", fontWeight: "600" },
  });
}
