import { Stack, router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { BackIcon, CheckIcon, PencilIcon, TrashIcon } from "../../../components/icons";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { RemitoCompraModal } from "../../../components/RemitoCompraModal";
import { Tooltip } from "../../../components/Tooltip";
import {
  anularRemitoCompra,
  getPurchaseById,
  type PurchaseWithDetail,
  type RemitoWithLines,
} from "../../../lib/queries/purchases";
import { FACTURA_LETRAS, TIPO_LABEL } from "../../../lib/comprobante";
import { makePurchaseDocumentStyles } from "../../../lib/purchaseDocumentStyles";
import { listProfiles } from "../../../lib/queries/profiles";
import {
  RECEIPT_STATE_LABEL,
  lineReceiptState,
  lineRemaining,
  purchaseReceiptState,
  receiptStateColors,
  receivedQuantities,
} from "../../../lib/purchaseReceipt";
import { supabase } from "../../../lib/supabase";
import type { ThemeColors } from "../../../lib/theme";
import { useTheme } from "../../../lib/ThemeContext";
import type { ComprobanteTipo } from "../../../types/database";

// Badge of the plain (non-factura) layout, same as the one register.tsx
// shows while loading it. Remito is legacy: new compras can't pick it.
const DOC_BADGE: Record<Exclude<ComprobanteTipo, "factura">, { code: string; note: string }> = {
  tique: { code: "T", note: "Tique" },
  remito: { code: "R", note: "Remito" },
};

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("es-AR");
}

function money(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${Number(n).toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;
}

function remitoItemsSummary(r: RemitoWithLines, names: Map<number, string>): string {
  const parts = r.lineas.map(
    (l) => `${names.get(l.rep_id) ?? `Repuesto ${l.rep_id}`} ×${l.rcl_cantidad}`,
  );
  return parts.join(" · ") || "—";
}

function goBackToPurchases() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace("/purchases");
  }
}

export default function PurchaseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const coId = id ? Number(id) : NaN;

  const [purchase, setPurchase] = useState<PurchaseWithDetail | null>(null);
  const [registradorNames, setRegistradorNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [loadingRemito, setLoadingRemito] = useState(false);
  const [editingRemito, setEditingRemito] = useState<RemitoWithLines | null>(null);
  const [anulando, setAnulando] = useState<RemitoWithLines | null>(null);
  const [anulError, setAnulError] = useState<string | null>(null);
  const [anulBusy, setAnulBusy] = useState(false);

  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const doc = makePurchaseDocumentStyles(colors);

  const load = useCallback(async () => {
    if (!id || Number.isNaN(coId)) return;
    setError(null);
    try {
      const [p, profiles] = await Promise.all([getPurchaseById(coId), listProfiles()]);
      setPurchase(p);
      setRegistradorNames(new Map(profiles.map((pr) => [pr.id, pr.name])));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [id, coId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    if (!id || Number.isNaN(coId)) return;
    const channel = supabase
      .channel(`purchase-detail-${id}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "remito_compra", filter: `co_id_compra=eq.${coId}` },
        load,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "remito_compra_linea",
          filter: `co_id_compra=eq.${coId}`,
        },
        load,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, coId, load]);

  const repNames = useMemo(() => {
    const map = new Map<number, string>();
    purchase?.linea_compra.forEach((l) =>
      map.set(l.rep_id, l.repuesto?.rep_nombre ?? `Repuesto ${l.rep_id}`),
    );
    return map;
  }, [purchase]);

  const received = useMemo(() => (purchase ? receivedQuantities(purchase) : new Map()), [purchase]);
  const isFactura = purchase?.co_tipo_comprobante === "factura";
  const estado = purchase ? purchaseReceiptState(purchase) : "pendiente";
  const estadoColors = receiptStateColors(colors)[estado];

  const hasPendingLines = useMemo(() => {
    if (!purchase || !isFactura) return false;
    return purchase.linea_compra.some(
      (l) => lineRemaining(l.lc_cantidad ?? 0, received.get(l.rep_id) ?? 0) > 0,
    );
  }, [purchase, isFactura, received]);

  // Oldest first, so a newly loaded remito shows up at the end of the list
  // like every other added row; same-day remitos keep their load order.
  const sortedRemitos = useMemo(
    () =>
      [...(purchase?.remitos ?? [])].sort((a, b) =>
        a.rc_fecha === b.rc_fecha ? a.rc_id - b.rc_id : a.rc_fecha < b.rc_fecha ? -1 : 1,
      ),
    [purchase],
  );

  async function handleAnular() {
    if (!anulando) return;
    setAnulBusy(true);
    setAnulError(null);
    try {
      await anularRemitoCompra(anulando.rc_id);
      setAnulando(null);
      await load();
    } catch (e) {
      setAnulError(e instanceof Error ? e.message : String(e));
    } finally {
      setAnulBusy(false);
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

  if (!purchase) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.center}>
          <Text style={styles.error}>{error ?? "La compra no existe."}</Text>

          <Pressable style={styles.backLink} onPress={goBackToPurchases}>
            <BackIcon />
            <Text style={styles.backText}>Volver a compras</Text>
          </Pressable>
        </View>
      </>
    );
  }

  const tipo = purchase.co_tipo_comprobante;
  const numberLabel = tipo === "tique" ? "Nro. de tique" : "Comp. Nro";
  const dateLabel = tipo === "tique" ? "Fecha del tique" : "Fecha de emisión";
  const letraCode = FACTURA_LETRAS.find((o) => o.letra === purchase.co_letra)?.code.toUpperCase();
  const registrador = purchase.co_p_id_registrador
    ? registradorNames.get(purchase.co_p_id_registrador)
    : undefined;

  const estadoBadge = (
    <View style={[styles.estadoBadge, { backgroundColor: estadoColors.bg }]}>
      <View style={[styles.estadoDot, { backgroundColor: estadoColors.fg }]} />

      <Text style={[styles.estadoBadgeText, { color: estadoColors.fg }]}>
        {RECEIPT_STATE_LABEL[estado]}
      </Text>
    </View>
  );

  // Who loaded it + its reception state, where register.tsx has the
  // "Cambiar tipo" button.
  const docStatus = (
    <View style={styles.docStatus}>
      {registrador && <Text style={styles.registrador}>Registró {registrador}</Text>}

      {estadoBadge}
    </View>
  );

  // Read-only version of register.tsx's line table: same columns and
  // widths, minus the trash column.
  const lineRows = (
    <>
      <View style={doc.tableHeadRow}>
        <Text style={[doc.tableHeadText, doc.colNum, { color: "#fff" }]}>#</Text>

        <Text style={[doc.tableHeadText, doc.colRepFlex]}>Repuesto</Text>

        <Text style={[doc.tableHeadText, doc.colCant]}>Cantidad</Text>

        <Text style={[doc.tableHeadText, doc.colCosto, doc.textRight]}>Precio unit.</Text>

        <Text style={[doc.tableHeadText, doc.colTotal, doc.textRight]}>Subtotal</Text>
      </View>

      {purchase.linea_compra.map((l, idx) => {
        const qty = l.lc_cantidad ?? 0;
        const unit = l.lc_costo_unitario != null ? Number(l.lc_costo_unitario) : null;

        return (
          <View key={l.rep_id} style={doc.tableRow}>
            <Text style={[doc.cellNum, doc.colNum]}>{idx + 1}</Text>

            <Text style={[styles.cellText, doc.colRepFlex]} numberOfLines={2}>
              {l.repuesto?.rep_nombre ?? `Repuesto ${l.rep_id}`}
            </Text>

            <Text style={[styles.cellText, doc.cellNum, doc.colCant]}>{qty}</Text>

            <Text style={[styles.cellText, doc.cellNum, doc.colCosto, doc.textRight]}>
              {unit != null ? money(unit) : "—"}
            </Text>

            <Text style={[doc.cellTotal, doc.colTotal, doc.textRight]}>
              {unit != null ? money(unit * qty) : "—"}
            </Text>
          </View>
        );
      })}
    </>
  );

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.topBar}>
          <Pressable style={styles.backBtn} onPress={goBackToPurchases}>
            <BackIcon size={14} color={colors.textLabel} />
            <Text style={styles.backBtnText}>Volver a compras</Text>
          </Pressable>
        </View>

        {/* The comprobante is drawn exactly as register.tsx lays it out
            while loading it (factura like the printed paper, tique as the
            plain form), with each field's value where its input was. */}
        {isFactura ? (
          <View style={[doc.invoice, styles.docFirst]}>
            <View style={doc.invoiceTopBar}>
              <Text style={doc.invoiceTopBarText}>Comprobante del proveedor</Text>

              {docStatus}
            </View>

            <View style={doc.invoiceHeader}>
              <View style={doc.issuerCol}>
                <Text style={doc.smallLabel}>Razón social del proveedor</Text>

                <Text style={styles.issuerName}>{purchase.proveedores?.prov_nombre ?? "—"}</Text>
              </View>

              <View style={doc.letraCol}>
                <View style={doc.letraBox}>
                  <Text style={[doc.letraBoxText, !purchase.co_letra && doc.letraBoxEmpty]}>
                    {purchase.co_letra ?? "—"}
                  </Text>

                  <Text style={doc.letraBoxCode}>{letraCode ?? "COD. —"}</Text>
                </View>
              </View>

              <View style={doc.docDataCol}>
                <Text style={doc.invoiceTitle}>FACTURA</Text>

                <View style={doc.docDataRow}>
                  <View style={doc.docDataItem}>
                    <Text style={doc.smallLabel}>Punto de venta</Text>
                    <Text style={styles.docValue}>{purchase.co_punto_venta || "—"}</Text>
                  </View>

                  <View style={doc.docDataItem}>
                    <Text style={doc.smallLabel}>{numberLabel}</Text>
                    <Text style={styles.docValue}>{purchase.co_nombre || "—"}</Text>
                  </View>
                </View>

                <View style={doc.docDataRow}>
                  <View style={doc.docDataItem}>
                    <Text style={doc.smallLabel}>{dateLabel}</Text>
                    <Text style={styles.docValue}>{formatDate(purchase.co_fecha_compra)}</Text>
                  </View>
                </View>

                <View style={doc.docDataRow}>
                  <View style={doc.docDataItem}>
                    {/* The supplier's current CUIT (compras don't keep a copy). */}
                    <Text style={doc.smallLabel}>CUIT</Text>
                    <Text style={styles.docValue}>{purchase.proveedores?.prov_cuit || "—"}</Text>
                  </View>
                </View>
              </View>
            </View>

            {lineRows}

            <View style={doc.invoiceTotals}>
              <View style={doc.invoiceTotalsBox}>
                <Text style={doc.invoiceTotalLabel}>Importe total:</Text>

                <Text style={doc.summaryTotalAmount}>{money(purchase.co_costo_total)}</Text>
              </View>
            </View>
          </View>
        ) : (
          <>
            <View style={[doc.docHeader, styles.docFirst]}>
              <View style={doc.docBadge}>
                <Text style={doc.docBadgeCode}>{DOC_BADGE[tipo as "tique" | "remito"].code}</Text>
                <Text style={doc.docBadgeNote}>{DOC_BADGE[tipo as "tique" | "remito"].note}</Text>
              </View>

              <View style={{ flex: 1, minWidth: 140 }}>
                <Text style={doc.docHeaderTitle}>{TIPO_LABEL[tipo]}</Text>
                <Text style={doc.docHeaderSub}>Datos del comprobante del proveedor</Text>
              </View>

              {docStatus}
            </View>

            <View style={doc.section}>
              <View style={doc.docRow}>
                <View style={doc.docItem}>
                  <Text style={doc.smallLabel}>Punto de venta</Text>
                  <Text style={styles.docValue}>{purchase.co_punto_venta || "—"}</Text>
                </View>

                <View style={doc.docItem}>
                  <Text style={doc.smallLabel}>{numberLabel}</Text>
                  <Text style={styles.docValue}>{purchase.co_nombre || "—"}</Text>
                </View>

                <View style={doc.docItem}>
                  <Text style={doc.smallLabel}>{dateLabel}</Text>
                  <Text style={styles.docValue}>{formatDate(purchase.co_fecha_compra)}</Text>
                </View>
              </View>

              <View style={doc.provRow}>
                <View style={doc.provCol}>
                  <Text style={doc.smallLabel}>Proveedor</Text>
                  <Text style={styles.docValue}>{purchase.proveedores?.prov_nombre ?? "—"}</Text>
                </View>

                <View style={doc.cuitCol}>
                  <Text style={doc.smallLabel}>CUIT</Text>
                  <Text style={styles.docValue}>{purchase.proveedores?.prov_cuit || "—"}</Text>
                </View>
              </View>
            </View>

            <View style={doc.tableCard}>
              <View style={doc.linesHeader}>
                <Text style={doc.label}>Detalle del comprobante</Text>
              </View>

              {lineRows}

              <View style={doc.tableFooter}>
                <Text style={doc.summaryTotal}>
                  Total del comprobante:{" "}
                  <Text style={doc.summaryTotalAmount}>{money(purchase.co_costo_total)}</Text>
                </Text>
              </View>
            </View>
          </>
        )}

        {isFactura && (
          <View style={styles.columnsRow}>
            <View style={styles.columnCard}>
              <Text style={styles.sectionTitle}>Recepción por ítem</Text>

              <View style={styles.tableHead}>
                <Text style={[styles.hCell, styles.colRep]}>REPUESTO</Text>
                <Text style={[styles.hCell, styles.colCant]}>CANT.</Text>
                <Text style={[styles.hCell, styles.colRecibido]}>RECIBIDO</Text>
                <Text style={[styles.hCell, styles.colEstado]}>ESTADO</Text>
              </View>

              {purchase.linea_compra.map((l) => {
                const qty = l.lc_cantidad ?? 0;
                const recibido = received.get(l.rep_id) ?? 0;
                const lineEstado = lineReceiptState(qty, recibido);
                const lineColors = receiptStateColors(colors)[lineEstado];

                return (
                  <View key={l.rep_id} style={styles.tableRow}>
                    <Text style={[styles.cell, styles.colRep]} numberOfLines={2}>
                      {l.repuesto?.rep_nombre ?? `Repuesto ${l.rep_id}`}
                    </Text>

                    <Text style={[styles.cell, styles.colCant]}>{qty}</Text>

                    <Text style={[styles.cell, styles.colRecibido]}>{recibido}</Text>

                    <View style={styles.colEstado}>
                      <View style={[styles.lineBadge, { backgroundColor: lineColors.bg }]}>
                        <Text style={[styles.lineBadgeText, { color: lineColors.fg }]}>
                          {RECEIPT_STATE_LABEL[lineEstado]}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>

            <View style={styles.columnCard}>
              <View style={styles.remitosHeader}>
                <Text style={styles.sectionTitle}>Remitos de recepción</Text>
              </View>

              {!hasPendingLines && (
                <View style={styles.completeBanner}>
                  <CheckIcon size={15} color={colors.eqOperational.fg} />
                  <Text style={[styles.completeBannerText, { color: colors.eqOperational.fg }]}>
                    Ya llegaron todos los ítems facturados.
                  </Text>
                </View>
              )}

              {sortedRemitos.length === 0 ? (
                <View style={styles.emptyRemitosWrap}>
                  <Text style={styles.emptyText}>
                    Todavía no se cargó ningún remito para esta compra.
                  </Text>

                  <Pressable
                    style={[
                      styles.addRemitoFullBtn,
                      !hasPendingLines && styles.addRemitoBtnDisabled,
                    ]}
                    onPress={() => setLoadingRemito(true)}
                    disabled={!hasPendingLines}
                  >
                    <Text style={styles.addRemitoFullText}>+ Cargar remito</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.remitosListWrap}>
                  {sortedRemitos.map((r) => (
                    <View key={r.rc_id} style={styles.remitoRow}>
                      <View style={styles.remitoInfo}>
                        <Text style={styles.remitoDate}>{formatDate(r.rc_fecha)}</Text>
                        <Text style={styles.remitoItems} numberOfLines={2}>
                          {remitoItemsSummary(r, repNames)}
                        </Text>
                      </View>

                      <View style={styles.remitoActions}>
                        <Tooltip text="Editar remito">
                          <Pressable
                            style={styles.remitoActionBtn}
                            onPress={() => setEditingRemito(r)}
                            accessibilityLabel="Editar remito"
                          >
                            <PencilIcon size={16} color={colors.accent} />
                          </Pressable>
                        </Tooltip>

                        <Tooltip text="Anular remito" align="right">
                          <Pressable
                            style={styles.remitoActionBtn}
                            onPress={() => {
                              setAnulError(null);
                              setAnulando(r);
                            }}
                            accessibilityLabel="Anular remito"
                          >
                            <TrashIcon size={16} color={colors.destructive} />
                          </Pressable>
                        </Tooltip>
                      </View>
                    </View>
                  ))}

                  {hasPendingLines && (
                    <Pressable
                      style={[styles.addRemitoFullBtn, { marginTop: 16 }]}
                      onPress={() => setLoadingRemito(true)}
                    >
                      <Text style={styles.addRemitoFullText}>+ Cargar remito</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>
          </View>
        )}
      </ScrollView>

      <RemitoCompraModal
        visible={loadingRemito}
        onClose={() => setLoadingRemito(false)}
        onSaved={load}
        purchase={purchase}
      />

      <RemitoCompraModal
        visible={editingRemito != null}
        onClose={() => setEditingRemito(null)}
        onSaved={load}
        purchase={purchase}
        editing={editingRemito}
      />

      <ConfirmDialog
        visible={anulando != null}
        title="Anular remito"
        message={
          anulError ??
          `Se va a descontar del stock lo que este remito sumó (${anulando ? remitoItemsSummary(anulando, repNames) : ""}).`
        }
        confirmLabel="ANULAR"
        busy={anulBusy}
        onConfirm={handleAnular}
        onCancel={() => setAnulando(null)}
      />
    </>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    // Same max width as register.tsx, so the comprobante keeps the
    // proportions it had while being loaded.
    content: { padding: 20, paddingBottom: 64, width: "100%", maxWidth: 1040 },
    center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
    topBar: { flexDirection: "row", marginBottom: 16 },
    backBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 10,
    },
    backBtnText: { color: c.textLabel, fontSize: 13, fontWeight: "600" },
    backLink: { flexDirection: "row", alignItems: "center", gap: 7 },
    backText: { color: c.textLabel, fontSize: 13.5 },
    error: { color: c.destructive, fontSize: 14 },

    // The shared invoice/docHeader styles carry a top margin meant for
    // register.tsx's step indicator above them; here they follow the top bar.
    docFirst: { marginTop: 0 },
    docStatus: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 12 },
    registrador: { fontSize: 13, color: c.textMuted },
    // What each field's input holds while loading, as plain printed text.
    docValue: {
      fontSize: 15,
      fontWeight: "600",
      color: c.text,
      fontVariant: ["tabular-nums"],
    },
    issuerName: { fontSize: 18, fontWeight: "700", color: c.text },
    cellText: { fontSize: 14, color: c.text },
    estadoBadge: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 11,
      paddingVertical: 3.5,
      borderRadius: 999,
    },
    estadoDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      marginRight: 6,
    },
    estadoBadgeText: { fontSize: 12.5, fontWeight: "700" },

    columnsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 16,
      marginTop: 16,
    },
    columnCard: {
      flex: 1,
      minWidth: 320,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 16,
      backgroundColor: c.bgCard,
      padding: 22,
    },
    sectionTitle: { fontSize: 16, fontWeight: "700", color: c.text },
    tableHead: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingTop: 14,
      paddingBottom: 8,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    hCell: {
      fontSize: 11.5,
      fontWeight: "700",
      letterSpacing: 0.5,
      textTransform: "uppercase",
      color: c.textMuted,
      fontFamily: "monospace",
    },
    tableRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.borderRow,
    },
    cell: { fontSize: 14.5, color: c.textLabel },
    colRep: { flex: 1, minWidth: 0 },
    colCant: { width: 85, textAlign: "center", fontVariant: ["tabular-nums"] },
    colRecibido: { width: 85, textAlign: "center", fontVariant: ["tabular-nums"] },
    // Wide enough for "Pendiente en recepción" on a single line.
    colEstado: { width: 165, alignItems: "flex-end", textAlign: "right" },
    lineBadge: { paddingHorizontal: 11, paddingVertical: 3.5, borderRadius: 999 },
    lineBadgeText: { fontSize: 12.5, fontWeight: "700" },

    remitosHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    emptyRemitosWrap: {
      paddingTop: 36,
      paddingBottom: 10,
      alignItems: "center",
      justifyContent: "center",
      gap: 20,
    },
    emptyText: {
      fontSize: 13.5,
      color: c.textMuted,
      textAlign: "center",
    },
    addRemitoFullBtn: {
      width: "100%",
      height: 42,
      borderRadius: 10,
      backgroundColor: c.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    addRemitoBtnDisabled: { opacity: 0.45 },
    addRemitoFullText: { color: "#fff", fontWeight: "600", fontSize: 13.5 },

    completeBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: c.eqOperational.bg,
    },
    completeBannerText: { fontSize: 13.5, fontWeight: "600" },

    remitosListWrap: { marginTop: 8 },
    remitoRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.borderRow,
    },
    remitoInfo: { flex: 1, minWidth: 0 },
    remitoDate: { fontSize: 14.5, fontWeight: "600", color: c.text },
    remitoItems: { marginTop: 2, fontSize: 13, color: c.textMuted },
    remitoActions: { flexDirection: "row", gap: 8 },
    remitoActionBtn: {
      width: 36,
      height: 36,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.bgNested,
    },
  });
}
