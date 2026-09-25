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

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("es-AR");
}

function money(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${Number(n).toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;
}

export function formatGarantia(val: string | null | undefined): string {
  if (!val) return "";
  const trimmed = val.trim();
  if (!trimmed) return "";
  if (/^\d+$/.test(trimmed)) {
    const months = parseInt(trimmed, 10);
    return `${months} ${months === 1 ? "mes" : "meses"}`;
  }
  return trimmed;
}

const TIPO_LABEL = { factura: "Factura", remito: "Remito", tique: "Tique" } as const;

function comprobanteRef(p: PurchaseWithDetail): string | null {
  if (p.co_punto_venta && p.co_nombre) return `${p.co_punto_venta}-${p.co_nombre}`;
  if (p.co_nombre) return p.co_nombre;
  return null;
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

  const sortedRemitos = useMemo(
    () => [...(purchase?.remitos ?? [])].sort((a, b) => (a.rc_fecha < b.rc_fecha ? 1 : -1)),
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

        <View style={styles.headerCard}>
          <View style={styles.headerLeft}>
            <View style={styles.badgesRow}>
              <View style={styles.tipoBadge}>
                <Text style={styles.tipoBadgeText}>{TIPO_LABEL[purchase.co_tipo_comprobante]}</Text>
              </View>

              <View style={[styles.estadoBadge, { backgroundColor: estadoColors.bg }]}>
                <View style={[styles.estadoDot, { backgroundColor: estadoColors.fg }]} />

                <Text style={[styles.estadoBadgeText, { color: estadoColors.fg }]}>
                  {RECEIPT_STATE_LABEL[estado]}
                </Text>
              </View>
            </View>

            <Text style={styles.pageTitle}>{purchase.proveedores?.prov_nombre ?? "Compra"}</Text>

            <Text style={styles.headerSub}>
              {formatDate(purchase.co_fecha_compra)}
              {comprobanteRef(purchase) ? ` · N.º ${comprobanteRef(purchase)}` : ""}
            </Text>

            <View style={styles.metaRow}>
              {purchase.co_garantia ? (
                <View style={styles.metaCol}>
                  <Text style={styles.metaLabel}>GARANTÍA</Text>
                  <Text style={styles.metaValue}>{formatGarantia(purchase.co_garantia)}</Text>
                </View>
              ) : null}

              {purchase.co_p_id_registrador ? (
                <View style={styles.metaCol}>
                  <Text style={styles.metaLabel}>REGISTRÓ</Text>
                  <Text style={styles.metaValue}>
                    {registradorNames.get(purchase.co_p_id_registrador) ?? "—"}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.headerRight}>
            <Text style={styles.totalLabel}>
              {isFactura ? "Total facturado" : "Total"}
            </Text>

            <Text style={styles.totalAmount}>
              {money(purchase.co_costo_total)}
            </Text>
          </View>
        </View>

        {isFactura ? (
          <View style={styles.columnsRow}>
            <View style={styles.columnCard}>
              <Text style={styles.sectionTitle}>Ítems facturados</Text>

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
                            <PencilIcon size={16} color={colors.textLabel} />
                          </Pressable>
                        </Tooltip>

                        <Tooltip text="Anular remito">
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
        ) : (
          <View style={styles.singleCard}>
            <Text style={styles.sectionTitle}>Ítems</Text>

            <View style={styles.tableHead}>
              <Text style={[styles.hCell, styles.colRep]}>REPUESTO</Text>
              <Text style={[styles.hCell, styles.colCant]}>CANT.</Text>
              <Text style={[styles.hCell, styles.colPrice]}>C. UNIT.</Text>
              <Text style={[styles.hCell, styles.colSubtotal]}>SUBTOT.</Text>
            </View>

            {purchase.linea_compra.map((l) => {
              const qty = l.lc_cantidad ?? 0;
              const unit = l.lc_costo_unitario != null ? Number(l.lc_costo_unitario) : null;

              return (
                <View key={l.rep_id} style={styles.tableRow}>
                  <Text style={[styles.cell, styles.colRep]} numberOfLines={2}>
                    {l.repuesto?.rep_nombre ?? `Repuesto ${l.rep_id}`}
                  </Text>

                  <Text style={[styles.cell, styles.colCant]}>{qty}</Text>

                  <Text style={[styles.cell, styles.colPrice]}>
                    {unit != null ? money(unit) : "—"}
                  </Text>

                  <Text style={[styles.cell, styles.colSubtotal]}>
                    {unit != null ? money(unit * qty) : "—"}
                  </Text>
                </View>
              );
            })}
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
    content: { padding: 20, paddingBottom: 64, width: "100%" },
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

    headerCard: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      flexWrap: "wrap",
      gap: 20,
      borderWidth: 1,
      borderColor: c.border,
      borderLeftWidth: 5,
      borderLeftColor: c.accent,
      borderRadius: 16,
      backgroundColor: c.bgCard,
      padding: 24,
    },
    headerLeft: {
      flex: 1,
      minWidth: 260,
    },
    headerRight: {
      alignItems: "flex-end",
      justifyContent: "center",
      minWidth: 160,
      paddingTop: 2,
    },
    badgesRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
    tipoBadge: {
      paddingHorizontal: 11,
      paddingVertical: 3.5,
      borderRadius: 999,
      backgroundColor: c.bgNested,
    },
    tipoBadgeText: { fontSize: 12.5, fontWeight: "700", color: c.textLabel },
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
    pageTitle: { fontSize: 24, fontWeight: "700", color: c.text, letterSpacing: -0.3 },
    headerSub: { marginTop: 4, fontSize: 13.5, color: c.textMuted },
    metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 28, marginTop: 16 },
    metaCol: { gap: 3 },
    metaLabel: {
      fontSize: 11.5,
      fontWeight: "700",
      letterSpacing: 0.6,
      color: c.textMuted,
      textTransform: "uppercase",
      fontFamily: "monospace",
    },
    metaValue: { fontSize: 14.5, fontWeight: "700", color: c.text },
    totalLabel: { fontSize: 12.5, color: c.textSecondary, marginBottom: 4, textAlign: "right" },
    totalAmount: {
      fontSize: 32,
      fontWeight: "800",
      color: c.accent,
      textAlign: "right",
      letterSpacing: -0.5,
    },

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
    singleCard: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 16,
      backgroundColor: c.bgCard,
      padding: 22,
      marginTop: 16,
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
    colEstado: { width: 105, alignItems: "flex-end", textAlign: "right" },
    colPrice: { width: 105, textAlign: "right", fontVariant: ["tabular-nums"] },
    colSubtotal: { width: 110, textAlign: "right", fontVariant: ["tabular-nums"] },
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
