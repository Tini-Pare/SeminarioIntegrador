import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { resolvePurchaseOrder, type PurchaseOrderWithLines } from "../lib/queries/purchaseOrders";
import type { ThemeColors } from "../lib/theme";
import { useTheme } from "../lib/ThemeContext";
import type { PedidoCompra } from "../types/database";

const ESTADO_LABELS: Record<PedidoCompra["ped_estado"], string> = {
  pendiente: "Pendiente",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
  recibido: "Recibido",
};

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("es-AR");
}

export function PurchaseOrderDetailModal({
  visible,
  onClose,
  order,
  isAdmin,
  techName,
  onChanged,
  onReject,
  onRegisterPurchase,
}: {
  visible: boolean;
  onClose: () => void;
  order: PurchaseOrderWithLines | null;
  isAdmin: boolean;
  techName?: string | null;
  onChanged: () => void;
  onReject: (order: PurchaseOrderWithLines) => void;
  onRegisterPurchase: (order: PurchaseOrderWithLines) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const estadoColor =
    order?.ped_estado === "rechazado"
      ? colors.eqRepair
      : order?.ped_estado === "recibido"
        ? colors.eqOperational
        : order?.ped_estado === "aprobado"
          ? colors.faultAssigned
          : colors.eqWaiting;

  async function approve() {
    if (!order) return;
    setBusy(true);
    setError(null);
    try {
      await resolvePurchaseOrder(order.ped_id_ped_compra, "aprobado");
      onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.headRow}>
            <Text style={styles.title}>Pedido #{order?.ped_id_ped_compra}</Text>

            <View style={[styles.badge, { backgroundColor: estadoColor.bg }]}>
              <Text style={[styles.badgeText, { color: estadoColor.fg }]}>
                {order ? ESTADO_LABELS[order.ped_estado] : ""}
              </Text>
            </View>
          </View>

          <Text style={styles.subtitle}>
            {formatDate(order?.ped_fecha_solicitud ?? null)}
            {isAdmin && techName ? ` · ${techName}` : ""}
          </Text>

          <ScrollView style={styles.body}>
            <View style={styles.tableHead}>
              <Text style={[styles.hCell, { flex: 3 }]}>REPUESTO</Text>
              <Text style={[styles.hCell, styles.num]}>CANT.</Text>
            </View>

            {(order?.linea_pedido ?? []).map((l) => (
              <View key={`${l.ped_id_ped_compra}-${l.rep_id}`} style={styles.tableRow}>
                <Text style={[styles.cell, { flex: 3 }]} numberOfLines={2}>
                  {l.repuesto?.rep_nombre ?? `Repuesto ${l.rep_id}`}
                </Text>
                <Text style={[styles.cell, styles.num]}>{l.lp_cantidad ?? 0}</Text>
              </View>
            ))}

            {order?.ped_observacion ? (
              <Text style={styles.obs}>“{order.ped_observacion}”</Text>
            ) : null}

            {order?.ped_estado === "rechazado" && order.ped_motivo_rechazo ? (
              <Text style={styles.reject}>Motivo del rechazo: {order.ped_motivo_rechazo}</Text>
            ) : null}

            {error && <Text style={styles.error}>{error}</Text>}
          </ScrollView>

          <View style={styles.actions}>
            <Pressable style={styles.secondaryButton} onPress={onClose}>
              <Text style={styles.secondaryText}>Cerrar</Text>
            </Pressable>

            {isAdmin && order?.ped_estado === "pendiente" && (
              <>
                <Pressable
                  style={styles.rejectButton}
                  onPress={() => order && onReject(order)}
                  disabled={busy}
                >
                  <Text style={styles.rejectText}>Rechazar</Text>
                </Pressable>

                <Pressable style={styles.primaryButton} onPress={approve} disabled={busy}>
                  <Text style={styles.primaryText}>{busy ? "…" : "Aprobar"}</Text>
                </Pressable>
              </>
            )}

            {isAdmin && order?.ped_estado === "aprobado" && (
              <Pressable
                style={styles.primaryButton}
                onPress={() => order && onRegisterPurchase(order)}
              >
                <Text style={styles.primaryText}>Registrar compra</Text>
              </Pressable>
            )}
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
      maxWidth: 460,
      maxHeight: "85%",
      alignSelf: "center",
    },
    headRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    title: { fontSize: 18, fontWeight: "600", color: c.text },
    badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
    badgeText: { fontSize: 11.5, fontWeight: "600" },
    subtitle: { marginTop: 4, fontSize: 13, color: c.textMuted },
    body: { marginTop: 14 },
    tableHead: {
      flexDirection: "row",
      paddingBottom: 6,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    hCell: { fontSize: 10.5, fontWeight: "700", letterSpacing: 0.4, color: c.textMuted },
    tableRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: c.borderRow,
    },
    cell: { fontSize: 13, color: c.textLabel },
    num: { flex: 1, textAlign: "right", fontFamily: "monospace", fontSize: 12 },
    obs: { marginTop: 12, fontSize: 13, color: c.textMuted, fontStyle: "italic" },
    reject: { marginTop: 12, fontSize: 13, color: c.destructive, fontWeight: "600" },
    error: { marginTop: 12, fontSize: 13, color: c.destructive },
    actions: { flexDirection: "row", gap: 8, marginTop: 20, flexWrap: "wrap" },
    secondaryButton: {
      flex: 1,
      minWidth: 90,
      height: 44,
      borderRadius: 10,
      backgroundColor: c.bgNested,
      alignItems: "center",
      justifyContent: "center",
    },
    secondaryText: { color: c.text, fontWeight: "600" },
    primaryButton: {
      flex: 1,
      minWidth: 90,
      height: 44,
      borderRadius: 10,
      backgroundColor: c.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    primaryText: { color: "#fff", fontWeight: "600" },
    rejectButton: {
      flex: 1,
      minWidth: 90,
      height: 44,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.destructive,
      alignItems: "center",
      justifyContent: "center",
    },
    rejectText: { color: c.destructive, fontWeight: "600" },
  });
}
