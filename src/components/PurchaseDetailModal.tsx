import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { PurchaseWithDetail } from "../lib/queries/purchases";
import type { ThemeColors } from "../lib/theme";
import { useTheme } from "../lib/ThemeContext";

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("es-AR");
}

function money(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${Number(n).toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;
}

export function PurchaseDetailModal({
  visible,
  onClose,
  purchase,
  registradorName,
}: {
  visible: boolean;
  onClose: () => void;
  purchase: PurchaseWithDetail | null;
  registradorName?: string | null;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{purchase?.proveedores?.prov_nombre ?? "Compra"}</Text>

          <Text style={styles.subtitle}>
            {formatDate(purchase?.co_fecha_compra ?? null)}
            {purchase?.co_nombre ? ` · Ref: ${purchase.co_nombre}` : ""}
          </Text>

          <ScrollView style={styles.body}>
            {(purchase?.co_garantia || registradorName) && (
              <Text style={styles.meta}>
                {purchase?.co_garantia ? `Garantía: ${purchase.co_garantia}` : ""}
                {purchase?.co_garantia && registradorName ? "  ·  " : ""}
                {registradorName ? `Registró: ${registradorName}` : ""}
              </Text>
            )}

            <View style={styles.tableHead}>
              <Text style={[styles.hCell, { flex: 2.2 }]}>REPUESTO</Text>
              <Text style={[styles.hCell, styles.num]}>CANT.</Text>
              <Text style={[styles.hCell, styles.num]}>C. UNIT.</Text>
              <Text style={[styles.hCell, styles.num]}>SUBTOT.</Text>
            </View>

            {(purchase?.linea_compra ?? []).map((l) => {
              const qty = l.lc_cantidad ?? 0;
              const unit = l.lc_costo_unitario != null ? Number(l.lc_costo_unitario) : null;
              return (
                <View key={`${l.co_id_compra}-${l.rep_id}`} style={styles.tableRow}>
                  <Text style={[styles.cell, { flex: 2.2 }]} numberOfLines={2}>
                    {l.repuesto?.rep_nombre ?? `Repuesto ${l.rep_id}`}
                  </Text>
                  <Text style={[styles.cell, styles.num]}>{qty}</Text>
                  <Text style={[styles.cell, styles.num]}>{unit != null ? money(unit) : "—"}</Text>
                  <Text style={[styles.cell, styles.num]}>
                    {unit != null ? money(unit * qty) : "—"}
                  </Text>
                </View>
              );
            })}

            {purchase?.co_costo_total != null && Number(purchase.co_costo_total) > 0 && (
              <Text style={styles.total}>Total: {money(purchase.co_costo_total)}</Text>
            )}
          </ScrollView>

          <Pressable style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeText}>Cerrar</Text>
          </Pressable>
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
      maxHeight: "85%",
      alignSelf: "center",
    },
    title: { fontSize: 18, fontWeight: "600", color: c.text },
    subtitle: { marginTop: 2, fontSize: 13, color: c.textMuted },
    body: { marginTop: 14 },
    meta: { fontSize: 12.5, color: c.textSecondary, marginBottom: 12 },
    tableHead: {
      flexDirection: "row",
      paddingBottom: 6,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    hCell: {
      fontSize: 10.5,
      fontWeight: "700",
      letterSpacing: 0.4,
      color: c.textMuted,
    },
    tableRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: c.borderRow,
    },
    cell: { fontSize: 13, color: c.textLabel },
    num: { flex: 1, textAlign: "right", fontFamily: "monospace", fontSize: 12 },
    total: { marginTop: 12, fontSize: 14, fontWeight: "700", color: c.text, textAlign: "right" },
    closeButton: {
      marginTop: 20,
      height: 44,
      borderRadius: 10,
      backgroundColor: c.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    closeText: { color: "#fff", fontWeight: "600" },
  });
}
