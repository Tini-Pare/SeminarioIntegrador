import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { fromDbDate } from "../../../components/CustomDatePicker";
import { Pagination } from "../../../components/Pagination";
import { RowActions } from "../../../components/RowActions";
import { SortHeaderCell } from "../../../components/SortHeaderCell";
import { TableFilterBar } from "../../../components/TableFilterBar";
import { listEquipment } from "../../../lib/queries/equipment";
import { listAllRequests } from "../../../lib/queries/faults";
import { listProfiles } from "../../../lib/queries/profiles";
import { supabase } from "../../../lib/supabase";
import type { ThemeColors } from "../../../lib/theme";
import { useTheme } from "../../../lib/ThemeContext";
import { usePagination } from "../../../lib/usePagination";
import { useTableSort } from "../../../lib/useTableSort";
import type { Equipo, Solicitud } from "../../../types/database";

type Item = Solicitud & {
  equipment: Pick<Equipo, "code" | "name">;
  reporterName: string;
};

type OrderStatus = "assigned" | "in_progress" | "resolved";
type Priority = Exclude<Solicitud["priority"], null>;

const STATUS_LABELS: Record<OrderStatus, string> = {
  assigned: "Asignada",
  in_progress: "En curso",
  resolved: "Resuelta",
};
const STATUS_RANK: Record<OrderStatus, number> = { assigned: 0, in_progress: 1, resolved: 2 };
const PRIORITY_LABELS: Record<Priority, string> = { low: "Baja", medium: "Media", high: "Alta" };
const PRIORITY_RANK: Record<Priority, number> = { low: 0, medium: 1, high: 2 };

// Every solicitud here already has an orden_de_trabajo (order_id != null) —
// solicitudes still pendiente, or closed without one (SCRUM-27), belong on
// the "Solicitudes" screen instead, not here.
export default function WorkOrdersScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");

  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const statusColors: Record<OrderStatus, { bg: string; fg: string }> = {
    assigned: colors.faultAssigned,
    in_progress: colors.faultInProgress,
    resolved: colors.faultResolved,
  };
  const priorityColors: Record<Priority, { bg: string; fg: string }> = {
    low: colors.urgencyLow,
    medium: colors.urgencyMedium,
    high: colors.urgencyHigh,
  };

  const load = useCallback(async () => {
    setError(null);
    try {
      const [requests, equipment, profiles] = await Promise.all([
        listAllRequests(),
        listEquipment(),
        listProfiles(),
      ]);
      const equipmentById = new Map(equipment.map((e) => [e.id, e]));
      const profileById = new Map(profiles.map((p) => [p.id, p]));
      setItems(
        requests
          .filter((r) => r.order_id != null)
          .map((f) => ({
            ...f,
            equipment: equipmentById.get(f.equipment_id) ?? {
              code: "—",
              name: "Equipo desconocido",
            },
            reporterName: profileById.get(f.reported_by)?.name ?? "Desconocido",
          })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel(`work-orders-changes-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "solicitudes" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "orden_de_trabajo" }, load)
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((r) => {
      const matchSearch =
        !q ||
        r.equipment.code.toLowerCase().includes(q) ||
        r.equipment.name.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q);
      const matchStatus = !statusFilter || r.status === statusFilter;
      const matchPriority = !priorityFilter || r.priority === priorityFilter;
      return matchSearch && matchStatus && matchPriority;
    });
  }, [items, search, statusFilter, priorityFilter]);

  const { sorted, field, dir, toggle } = useTableSort<Item>(
    filtered,
    {
      equipo: (r) => r.equipment.code,
      estado: (r) => STATUS_RANK[r.status as OrderStatus],
      prioridad: (r) => (r.priority ? PRIORITY_RANK[r.priority] : -1),
      inicio: (r) => r.order_start_date ?? "",
    },
    "estado",
  );

  const ordersPage = usePagination(
    sorted,
    `${search}|${statusFilter}|${priorityFilter}|${field}|${dir}`,
    8,
  );

  if (loading) return <ActivityIndicator style={styles.center} />;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.pageHeader}>
        <View style={styles.sectionHeadingText}>
          <Text style={styles.title}>Órdenes de trabajo</Text>
          <Text style={styles.subtitle}>Todas las OT generadas y su estado actual</Text>
        </View>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <TableFilterBar
        searchValue={search}
        onSearch={setSearch}
        searchPlaceholder="Buscar por equipo o descripción…"
        filters={[
          {
            key: "estado",
            label: "Estado",
            value: statusFilter,
            onChange: setStatusFilter,
            options: [
              { value: "", label: "Todos" },
              { value: "assigned", label: STATUS_LABELS.assigned },
              { value: "in_progress", label: STATUS_LABELS.in_progress },
              { value: "resolved", label: STATUS_LABELS.resolved },
            ],
          },
          {
            key: "prioridad",
            label: "Prioridad",
            value: priorityFilter,
            onChange: setPriorityFilter,
            options: [
              { value: "", label: "Todas" },
              { value: "high", label: PRIORITY_LABELS.high },
              { value: "medium", label: PRIORITY_LABELS.medium },
              { value: "low", label: PRIORITY_LABELS.low },
            ],
          },
        ]}
        right={
          <Text style={styles.count}>
            {sorted.length} {sorted.length === 1 ? "orden" : "órdenes"}
          </Text>
        }
      />

      {sorted.length === 0 ? (
        <Text style={styles.empty}>
          {items.length === 0
            ? "Todavía no se generó ninguna orden de trabajo."
            : "Nada coincide con la búsqueda."}
        </Text>
      ) : (
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <SortHeaderCell
              label="Equipo"
              field="equipo"
              activeField={field}
              dir={dir}
              onSort={toggle}
              style={{ flex: 1.6 }}
            />

            <SortHeaderCell
              label="Estado"
              field="estado"
              activeField={field}
              dir={dir}
              onSort={toggle}
              style={{ flex: 1 }}
            />

            <SortHeaderCell
              label="Prioridad"
              field="prioridad"
              activeField={field}
              dir={dir}
              onSort={toggle}
              style={{ flex: 1 }}
            />

            <SortHeaderCell
              label="Inicio"
              field="inicio"
              activeField={field}
              dir={dir}
              onSort={toggle}
              style={{ flex: 0.9 }}
            />

            <Text style={[styles.headerCell, styles.actionsCol]}>ACCIONES</Text>
          </View>

          {ordersPage.pageItems.map((item, i) => {
            const status = item.status as OrderStatus;
            const st = statusColors[status];
            const prio = item.priority ? priorityColors[item.priority] : null;
            return (
              <View key={item.id} style={[styles.row, i % 2 === 1 && styles.rowAlt]}>
                <View style={styles.rowMain}>
                  <View style={{ flex: 1.6, justifyContent: "center", paddingRight: 12 }}>
                    <Text style={styles.name} numberOfLines={1}>
                      {item.equipment.name}
                    </Text>
                    <Text style={styles.equipmentCode}>{item.equipment.code}</Text>
                  </View>

                  <View style={{ flex: 1, justifyContent: "center" }}>
                    <View style={[styles.badge, { backgroundColor: st.bg }]}>
                      <Text style={[styles.badgeText, { color: st.fg }]}>
                        {STATUS_LABELS[status]}
                      </Text>
                    </View>
                  </View>

                  <View style={{ flex: 1, justifyContent: "center" }}>
                    {prio ? (
                      <View style={[styles.badge, { backgroundColor: prio.bg }]}>
                        <Text style={[styles.badgeText, { color: prio.fg }]}>
                          {PRIORITY_LABELS[item.priority as Priority]}
                        </Text>
                      </View>
                    ) : (
                      <Text style={styles.cellText}>—</Text>
                    )}
                  </View>

                  <View style={{ flex: 0.9, justifyContent: "center" }}>
                    <Text style={styles.cellText}>{fromDbDate(item.order_start_date) || "—"}</Text>
                  </View>
                </View>

                <View style={styles.actionsCol}>
                  <RowActions
                    onView={() =>
                      router.push({
                        pathname: "/work-orders/[id]",
                        params: { id: String(item.id) },
                      })
                    }
                    viewTooltip="Ver orden de trabajo"
                  />
                </View>
              </View>
            );
          })}
        </View>
      )}

      <Pagination
        page={ordersPage.page}
        pageCount={ordersPage.pageCount}
        onPage={ordersPage.setPage}
      />
    </ScrollView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { backgroundColor: c.bg },
    content: { padding: 20 },
    center: { flex: 1 },
    pageHeader: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 12,
      marginBottom: 16,
    },
    sectionHeadingText: { flexShrink: 1, minWidth: 0 },
    title: { fontSize: 22, fontWeight: "600", color: c.text },
    subtitle: { marginTop: 3, fontSize: 13.5, color: c.textSecondary },
    error: { color: c.destructive, marginBottom: 12 },
    count: { fontSize: 13, fontWeight: "500", color: c.textSecondary },
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
      paddingHorizontal: 18,
      paddingVertical: 12,
      backgroundColor: c.accent,
      borderTopLeftRadius: 13,
      borderTopRightRadius: 13,
    },
    headerCell: {
      fontSize: 11.5,
      fontWeight: "700",
      letterSpacing: 0.5,
      textTransform: "uppercase",
      color: "#fff",
      fontFamily: "monospace",
    },
    actionsCol: { width: 84, flexShrink: 0, alignItems: "flex-start" },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 18,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: c.borderRow,
    },
    rowAlt: { backgroundColor: c.bgRowAlt },
    rowMain: { flex: 1, flexDirection: "row", alignItems: "center", minWidth: 0 },
    name: { fontWeight: "600", fontSize: 14.5, color: c.text },
    equipmentCode: { fontFamily: "monospace", fontSize: 12, color: c.textMuted, marginTop: 2 },
    cellText: { fontSize: 13.5, color: c.textLabel },
    badge: {
      alignSelf: "flex-start",
      paddingHorizontal: 11,
      paddingVertical: 3.5,
      borderRadius: 999,
    },
    badgeText: { fontSize: 12.5, fontWeight: "600" },
  });
}
