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
          <Pressable style={styles.backLink} onPress={goBackToPurchases}>
            <BackIcon />
            <Text style={styles.backText}>Volver a compras</Text>
          </Pressable>
        </View>

        <View style={styles.headerCard}>
          <View style={styles.headerTop}>
            <Text style={styles.pageTitle}>{purchase.proveedores?.prov_nombre ?? "Compra"}</Text>

            <View style={styles.badgesRow}>
              <View style={styles.tipoBadge}>
                <Text style={styles.tipoBadgeText}>{TIPO_LABEL[purchase.co_tipo_comprobante]}</Text>
              </View>

              <View style={[styles.estadoBadge, { backgroundColor: estadoColors.bg }]}>
                <Text style={[styles.estadoBadgeText, { color: estadoColors.fg }]}>
                  {RECEIPT_STATE_LABEL[estado]}
                </Text>
              </View>
            </View>
          </View>

          <Text style={styles.headerSub}>
            {formatDate(purchase.co_fecha_compra)}
            {comprobanteRef(purchase) ? ` · N.º ${comprobanteRef(purchase)}` : ""}
          </Text>

          <View style={styles.metaRow}>
            {purchase.co_garantia && (
              <Text style={styles.meta}>Garantía: {formatGarantia(purchase.co_garantia)}</Text>
            )}

            {purchase.co_p_id_registrador && (
              <Text style={styles.meta}>
                Registró: {registradorNames.get(purchase.co_p_id_registrador) ?? "—"}
              </Text>
            )}

            {purchase.co_costo_total != null && Number(purchase.co_costo_total) > 0 && (
              <Text style={styles.metaTotal}>Total: {money(purchase.co_costo_total)}</Text>
            )}
          </View>
        </View>

        <View style={styles.tableCard}>
          <Text style={styles.sectionTitle}>{isFactura ? "Ítems facturados" : "Ítems"}</Text>

          <View style={styles.tableHead}>
            <Text style={[styles.hCell, styles.colRep]}>REPUESTO</Text>
            <Text style={[styles.hCell, styles.colNum]}>CANT.</Text>

            {!isFactura && (
              <>
                <Text style={[styles.hCell, styles.colNum]}>C. UNIT.</Text>
                <Text style={[styles.hCell, styles.colNum]}>SUBTOT.</Text>
              </>
            )}

            {isFactura && (
              <>
                <Text style={[styles.hCell, styles.colNum]}>RECIBIDO</Text>
                <Text style={[styles.hCell, styles.colEstado]}>ESTADO</Text>
              </>
            )}
          </View>

          {purchase.linea_compra.map((l) => {
            const qty = l.lc_cantidad ?? 0;
            const unit = l.lc_costo_unitario != null ? Number(l.lc_costo_unitario) : null;
            const recibido = received.get(l.rep_id) ?? 0;
            const lineEstado = lineReceiptState(qty, recibido);
            const lineColors = receiptStateColors(colors)[lineEstado];

            return (
              <View key={l.rep_id} style={styles.tableRow}>
                <Text style={[styles.cell, styles.colRep]} numberOfLines={2}>
                  {l.repuesto?.rep_nombre ?? `Repuesto ${l.rep_id}`}
                </Text>

                <Text style={[styles.cell, styles.colNum]}>{qty}</Text>

                {!isFactura && (
                  <>
                    <Text style={[styles.cell, styles.colNum]}>
                      {unit != null ? money(unit) : "—"}
                    </Text>
                    <Text style={[styles.cell, styles.colNum]}>
                      {unit != null ? money(unit * qty) : "—"}
                    </Text>
                  </>
                )}

                {isFactura && (
                  <>
                    <Text style={[styles.cell, styles.colNum]}>{recibido}</Text>
                    <View style={styles.colEstado}>
                      <View style={[styles.lineBadge, { backgroundColor: lineColors.bg }]}>
                        <Text style={[styles.lineBadgeText, { color: lineColors.fg }]}>
                          {RECEIPT_STATE_LABEL[lineEstado]}
                        </Text>
                      </View>
                    </View>
                  </>
                )}
              </View>
            );
          })}
        </View>

        {isFactura && (
          <View style={styles.tableCard}>
            <View style={styles.remitosHeader}>
              <Text style={styles.sectionTitle}>Remitos de recepción</Text>

              <Pressable
                style={[styles.addRemitoBtn, !hasPendingLines && styles.addRemitoBtnDisabled]}
                onPress={() => setLoadingRemito(true)}
                disabled={!hasPendingLines}
              >
                <Text style={styles.addRemitoText}>+ Cargar remito</Text>
              </Pressable>
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
              <Text style={styles.empty}>Todavía no se cargó ningún remito para esta compra.</Text>
            ) : (
              sortedRemitos.map((r) => (
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
                        <PencilIcon size={14} color={colors.textLabel} />
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
                        <TrashIcon size={14} color={colors.destructive} />
                      </Pressable>
                    </Tooltip>
                  </View>
                </View>
              ))
            )}
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
    container: { backgroundColor: c.bg },
    content: { padding: 20, paddingBottom: 64, maxWidth: 900 },
    center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
    topBar: { flexDirection: "row", marginBottom: 18 },
    backLink: { flexDirection: "row", alignItems: "center", gap: 7 },
    backText: { color: c.textLabel, fontSize: 13.5 },
    error: { color: c.destructive, fontSize: 14 },

    headerCard: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 16,
      backgroundColor: c.bgCard,
      padding: 20,
    },
    headerTop: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    },
    pageTitle: { fontSize: 22, fontWeight: "700", color: c.text },
    badgesRow: { flexDirection: "row", gap: 8 },
    tipoBadge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: c.bgNested,
    },
    tipoBadgeText: { fontSize: 11.5, fontWeight: "700", color: c.textLabel },
    estadoBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
    estadoBadgeText: { fontSize: 11.5, fontWeight: "700" },
    headerSub: { marginTop: 4, fontSize: 13, color: c.textMuted },
    metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 16, marginTop: 14 },
    meta: { fontSize: 12.5, color: c.textSecondary },
    metaTotal: { fontSize: 14, fontWeight: "700", color: c.text },

    tableCard: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 16,
      backgroundColor: c.bgCard,
      padding: 20,
      marginTop: 16,
    },
    sectionTitle: { fontSize: 15, fontWeight: "700", color: c.text },
    tableHead: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingTop: 14,
      paddingBottom: 8,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    hCell: { fontSize: 10.5, fontWeight: "700", letterSpacing: 0.4, color: c.textMuted },
    tableRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: c.borderRow,
    },
    cell: { fontSize: 13, color: c.textLabel },
    colRep: { flex: 2.2, minWidth: 0 },
    colNum: { flex: 1, textAlign: "right", fontVariant: ["tabular-nums"] },
    colEstado: { flex: 1.1, alignItems: "flex-end" },
    lineBadge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 },
    lineBadgeText: { fontSize: 10.5, fontWeight: "700" },

    remitosHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    addRemitoBtn: {
      height: 36,
      paddingHorizontal: 14,
      borderRadius: 9,
      backgroundColor: c.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    addRemitoBtnDisabled: { opacity: 0.45 },
    addRemitoText: { color: "#fff", fontWeight: "600", fontSize: 12.5 },
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
    completeBannerText: { fontSize: 12.5, fontWeight: "600" },
    empty: { marginTop: 14, fontSize: 13, color: c.textMuted },
    remitoRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      paddingVertical: 12,
      borderTopWidth: 1,
      borderTopColor: c.borderRow,
    },
    remitoInfo: { flex: 1, minWidth: 0 },
    remitoDate: { fontSize: 13, fontWeight: "600", color: c.text },
    remitoItems: { marginTop: 2, fontSize: 12, color: c.textMuted },
    remitoActions: { flexDirection: "row", gap: 8 },
    remitoActionBtn: {
      width: 30,
      height: 30,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.bgNested,
    },
  });
}
