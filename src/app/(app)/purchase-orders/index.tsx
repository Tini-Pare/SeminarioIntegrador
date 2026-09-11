import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { EyeIcon } from "../../../components/icons";
import { Pagination } from "../../../components/Pagination";
import { PurchaseModal, type PurchasePrefill } from "../../../components/PurchaseModal";
import { PurchaseOrderDetailModal } from "../../../components/PurchaseOrderDetailModal";
import { PurchaseOrderModal } from "../../../components/PurchaseOrderModal";
import { RejectPurchaseOrderModal } from "../../../components/RejectPurchaseOrderModal";
import { SortHeaderCell } from "../../../components/SortHeaderCell";
import { getProfile } from "../../../lib/auth";
import {
  listPurchaseOrders,
  type PurchaseOrderWithLines,
} from "../../../lib/queries/purchaseOrders";
import { listProfiles } from "../../../lib/queries/profiles";
import { listSpareParts } from "../../../lib/queries/spareParts";
import { listSuppliers, type SupplierWithRubro } from "../../../lib/queries/suppliers";
import { supabase } from "../../../lib/supabase";
import type { ThemeColors } from "../../../lib/theme";
import { useTheme } from "../../../lib/ThemeContext";
import { usePagination } from "../../../lib/usePagination";
import { useTableSort } from "../../../lib/useTableSort";
import type { PedidoCompra, Repuesto } from "../../../types/database";

const ESTADO_LABELS: Record<PedidoCompra["ped_estado"], string> = {
  pendiente: "Pendiente",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
  recibido: "Recibido",
};
const ESTADO_RANK: Record<PedidoCompra["ped_estado"], number> = {
  pendiente: 0,
  aprobado: 1,
  recibido: 2,
  rechazado: 3,
};

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("es-AR");
}

function itemsSummary(o: PurchaseOrderWithLines): string {
  const names = o.linea_pedido.map((l) => l.repuesto?.rep_nombre ?? `Repuesto ${l.rep_id}`);
  if (names.length === 0) return "—";
  if (names.length <= 2) return names.join(" · ");
  return `${names.slice(0, 2).join(" · ")} +${names.length - 2}`;
}

export default function PurchaseOrdersScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [orders, setOrders] = useState<PurchaseOrderWithLines[]>([]);
  const [techNames, setTechNames] = useState<Map<string, string>>(new Map());
  const [spareParts, setSpareParts] = useState<Repuesto[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierWithRubro[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<PurchaseOrderWithLines | null>(null);
  const [rejecting, setRejecting] = useState<number | null>(null);
  const [purchaseFor, setPurchaseFor] = useState<PurchasePrefill | null>(null);

  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const load = useCallback(async () => {
    setError(null);
    try {
      const profile = await getProfile();
      const admin = profile?.role === "admin";
      setIsAdmin(admin);

      const [list, parts] = await Promise.all([
        listPurchaseOrders(admin ? "all" : "mine"),
        listSpareParts(),
      ]);
      setOrders(list);
      setSpareParts(parts);

      if (admin) {
        const [profiles, supplierList] = await Promise.all([listProfiles(), listSuppliers()]);
        setTechNames(new Map(profiles.map((p) => [p.id, p.name])));
        setSuppliers(supplierList);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel(`purchase-orders-changes-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "pedido_compra" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function openPurchaseFor(order: PurchaseOrderWithLines) {
    setViewing(null);
    setPurchaseFor({
      pedidoId: order.ped_id_ped_compra,
      lines: order.linea_pedido
        .filter((l) => l.lp_cantidad != null)
        .map((l) => ({ repId: l.rep_id, cantidad: l.lp_cantidad as number })),
    });
  }

  function openReject(order: PurchaseOrderWithLines) {
    setViewing(null);
    setRejecting(order.ped_id_ped_compra);
  }

  const { sorted, field, dir, toggle } = useTableSort<PurchaseOrderWithLines>(
    orders,
    {
      estado: (o) => ESTADO_RANK[o.ped_estado],
      fecha: (o) => o.ped_fecha_solicitud,
      tecnico: (o) => techNames.get(o.p_id_tecnico) ?? "",
    },
    "fecha",
    "desc",
  );

  const { pageItems, page, pageCount, setPage } = usePagination(sorted, `${field}|${dir}`, 8);

  const hasActiveParts = useMemo(
    () => spareParts.some((p) => p.rep_estado === "activo"),
    [spareParts],
  );

  const estadoColors = useMemo<Record<PedidoCompra["ped_estado"], { bg: string; fg: string }>>(
    () => ({
      pendiente: colors.eqWaiting,
      aprobado: colors.faultAssigned,
      rechazado: colors.eqRepair,
      recibido: colors.eqOperational,
    }),
    [colors],
  );

  if (loading) return <ActivityIndicator style={styles.center} />;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Pedidos de compra</Text>

          <Text style={styles.subtitle}>
            {isAdmin
              ? "Pedidos de repuestos enviados por los técnicos"
              : "Pedidos de repuestos que enviaste"}
          </Text>
        </View>

        {!isAdmin && (
          <Pressable
            style={[styles.addButton, !hasActiveParts && styles.addButtonDisabled]}
            onPress={() => setCreating(true)}
            disabled={!hasActiveParts}
          >
            <Text style={styles.addButtonText}>+ Nuevo pedido</Text>
          </Pressable>
        )}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      {!isAdmin && !hasActiveParts && (
        <Text style={styles.empty}>
          No hay repuestos activos en el catálogo. Pedile a un administrador que cargue los
          repuestos que necesitás.
        </Text>
      )}

      {orders.length === 0 ? (
        <Text style={styles.empty}>
          {isAdmin ? "Todavía no hay pedidos de compra." : "Todavía no enviaste ningún pedido."}
        </Text>
      ) : (
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <SortHeaderCell
              label="Estado"
              field="estado"
              activeField={field}
              dir={dir}
              onSort={toggle}
              style={{ flex: 1 }}
            />

            <SortHeaderCell
              label="Fecha"
              field="fecha"
              activeField={field}
              dir={dir}
              onSort={toggle}
              style={{ flex: 1 }}
            />

            {isAdmin && (
              <SortHeaderCell
                label="Técnico"
                field="tecnico"
                activeField={field}
                dir={dir}
                onSort={toggle}
                style={{ flex: 1.4 }}
              />
            )}

            <Text style={[styles.headerCell, styles.actionsCol]}>VER</Text>
          </View>

          {pageItems.map((o, i) => {
            const st = estadoColors[o.ped_estado];
            return (
              <View key={o.ped_id_ped_compra} style={[styles.row, i % 2 === 1 && styles.rowAlt]}>
                <View style={styles.rowMain}>
                  <View style={{ flex: 1, justifyContent: "center", paddingRight: 8 }}>
                    <View style={[styles.badge, { backgroundColor: st.bg }]}>
                      <Text style={[styles.badgeText, { color: st.fg }]} numberOfLines={1}>
                        {ESTADO_LABELS[o.ped_estado]}
                      </Text>
                    </View>

                    <Text style={styles.sub} numberOfLines={1}>
                      {itemsSummary(o)}
                    </Text>
                  </View>

                  <View style={{ flex: 1, justifyContent: "center" }}>
                    <Text style={styles.dateCell}>{formatDate(o.ped_fecha_solicitud)}</Text>
                  </View>

                  {isAdmin && (
                    <View style={{ flex: 1.4, justifyContent: "center" }}>
                      <Text style={styles.tech} numberOfLines={1}>
                        {techNames.get(o.p_id_tecnico) ?? "Desconocido"}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.actionsCol}>
                  <Pressable
                    style={styles.viewBtn}
                    onPress={() => setViewing(o)}
                    accessibilityLabel="Ver pedido"
                  >
                    <EyeIcon size={16} color={colors.accent} />
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      )}

      <Pagination page={page} pageCount={pageCount} onPage={setPage} />

      <PurchaseOrderDetailModal
        visible={viewing != null}
        onClose={() => setViewing(null)}
        order={viewing}
        isAdmin={isAdmin}
        techName={viewing ? (techNames.get(viewing.p_id_tecnico) ?? null) : null}
        onChanged={load}
        onReject={openReject}
        onRegisterPurchase={openPurchaseFor}
      />

      {!isAdmin && (
        <PurchaseOrderModal
          visible={creating}
          onClose={() => setCreating(false)}
          onSaved={load}
          spareParts={spareParts}
        />
      )}

      {isAdmin && (
        <>
          <RejectPurchaseOrderModal
            visible={rejecting != null}
            pedidoId={rejecting}
            onClose={() => setRejecting(null)}
            onResolved={load}
          />

          <PurchaseModal
            visible={purchaseFor != null}
            onClose={() => setPurchaseFor(null)}
            onSaved={load}
            suppliers={suppliers}
            spareParts={spareParts}
            prefill={purchaseFor}
          />
        </>
      )}
    </ScrollView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { backgroundColor: c.bg },
    content: { padding: 20, maxWidth: 900 },
    center: { flex: 1 },
    header: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 12,
      marginBottom: 16,
    },
    headerText: { flexShrink: 1, minWidth: 0 },
    title: { fontSize: 22, fontWeight: "600", color: c.text },
    subtitle: { marginTop: 3, fontSize: 13.5, color: c.textSecondary },
    error: { color: c.destructive, marginBottom: 12 },
    addButton: {
      backgroundColor: c.accent,
      paddingHorizontal: 18,
      height: 42,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    addButtonDisabled: { opacity: 0.45 },
    addButtonText: { color: "#fff", fontWeight: "600", fontSize: 14 },
    empty: { color: c.textMuted, fontSize: 13.5, marginTop: 4 },
    table: {
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 14,
      overflow: "hidden",
    },
    tableHeader: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 13,
      backgroundColor: c.accent,
      borderTopLeftRadius: 13,
      borderTopRightRadius: 13,
    },
    headerCell: {
      fontSize: 13.5,
      fontWeight: "700",
      letterSpacing: 0.6,
      textTransform: "uppercase",
      color: "#fff",
      fontFamily: "monospace",
    },
    actionsCol: { width: 52, flexShrink: 0, alignItems: "flex-start" },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.borderRow,
    },
    rowAlt: { backgroundColor: c.bgRowAlt },
    rowMain: { flex: 1, flexDirection: "row", alignItems: "center", minWidth: 0 },
    badge: {
      alignSelf: "flex-start",
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: 999,
    },
    badgeText: { fontSize: 11.5, fontWeight: "600" },
    sub: { marginTop: 3, fontSize: 12, color: c.textMuted },
    dateCell: { fontSize: 13, color: c.textLabel },
    tech: { fontSize: 13, color: c.textLabel, fontWeight: "500" },
    viewBtn: {
      width: 32,
      height: 32,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
    },
  });
}
