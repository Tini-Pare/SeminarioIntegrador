import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { fromDbDate } from "../../../components/CustomDatePicker";
import { EquipmentIcon, RefreshCwIcon, WarningIcon } from "../../../components/icons";
import { Pagination } from "../../../components/Pagination";
import { RowActions } from "../../../components/RowActions";
import { Sigla } from "../../../components/Sigla";
import { SortHeaderCell } from "../../../components/SortHeaderCell";
import { TableFilterBar } from "../../../components/TableFilterBar";
import { formatOrderNumber } from "../../../lib/orderNumber";
import { listEquipment } from "../../../lib/queries/equipment";
import {
  getWorkOrderOrigin,
  listWorkOrders,
  type WorkOrderOrigin,
} from "../../../lib/queries/faults";
import { includesSearch, normalizeSearch } from "../../../lib/search";
import { supabase } from "../../../lib/supabase";
import type { ThemeColors } from "../../../lib/theme";
import { useTheme } from "../../../lib/ThemeContext";
import { usePagination } from "../../../lib/usePagination";
import { useTableSort } from "../../../lib/useTableSort";
import type { Equipo, WorkOrder } from "../../../types/database";

type Item = WorkOrder & {
  equipment: Pick<Equipo, "code" | "name">;
};

type OrderStatus = WorkOrder["status"];
type Priority = WorkOrder["priority"];

const STATUS_LABELS: Record<OrderStatus, string> = {
  assigned: "Asignada",
  in_progress: "En curso",
  resolved: "Resuelta",
};
const STATUS_RANK: Record<OrderStatus, number> = { assigned: 0, in_progress: 1, resolved: 2 };

// The priority labels are in Spanish. The 'notranslate' attribute is added in JSX
// to prevent automated browser translation (e.g. Chrome translating 'Media' to 'Medios de comunicación').
const PRIORITY_LABELS: Record<Priority, string> = { low: "Baja", medium: "Media", high: "Alta" };
const PRIORITY_RANK: Record<Priority, number> = { low: 0, medium: 1, high: 2 };

// ot_tipo_orden is free text in the DB; anything not listed here shows as is.
const TYPE_LABELS: Record<string, string> = {
  correctivo: "Correctivo",
  preventivo: "Preventivo",
  instalacion: "Instalación",
};

function getOriginLabel(item: Item): string {
  const origin = getWorkOrderOrigin(item);
  if (origin === "solicitud") return "Solicitud";
  if (origin === "plan") return "Plan preventivo";
  if (origin === "instalacion") return "Instalación";
  return "Sin origen";
}

// Every orden_de_trabajo, whether it came from a solicitud, maintenance plan, or installation.
export default function WorkOrdersScreen() {
  const params = useLocalSearchParams<{ tipo?: string }>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState(params.tipo ?? "");

  useEffect(() => {
    if (params.tipo !== undefined) {
      setTypeFilter(params.tipo);
    }
  }, [params.tipo]);

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
      const [orders, equipment] = await Promise.all([listWorkOrders(), listEquipment()]);
      const equipmentById = new Map(equipment.map((e) => [e.id, e]));
      setItems(
        orders.map((o) => ({
          ...o,
          equipment: equipmentById.get(o.equipment_id) ?? {
            code: "—",
            name: "Equipo desconocido",
          },
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
      .on("postgres_changes", { event: "*", schema: "public", table: "orden_de_trabajo" }, load)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tareas_realizadas_orden" },
        load,
      )
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

  // List filtered by search and header dropdown filters.
  const filtered = useMemo(() => {
    const q = normalizeSearch(search.trim());
    return items.filter((r) => {
      const matchSearch =
        !q ||
        includesSearch(formatOrderNumber(r.id), q) ||
        includesSearch(r.equipment.code, q) ||
        includesSearch(r.equipment.name, q) ||
        includesSearch(r.solicitud?.description ?? "", q) ||
        includesSearch(r.plan_name ?? "", q) ||
        includesSearch(r.observation ?? "", q);
      const matchStatus = !statusFilter || r.status === statusFilter;
      const matchPriority = !priorityFilter || r.priority === priorityFilter;
      const matchType = !typeFilter || r.type === typeFilter;
      return matchSearch && matchStatus && matchPriority && matchType;
    });
  }, [items, search, statusFilter, priorityFilter, typeFilter]);

  const { sorted, field, dir, toggle } = useTableSort<Item>(
    filtered,
    {
      numero: (r) => r.id,
      equipo: (r) => r.equipment.code,
      origen: (r) => getOriginLabel(r),
      estado: (r) => STATUS_RANK[r.status],
      prioridad: (r) => PRIORITY_RANK[r.priority],
      inicio: (r) => r.start_date,
    },
    "estado",
  );

  const ordersPage = usePagination(
    sorted,
    `${search}|${statusFilter}|${priorityFilter}|${typeFilter}|${field}|${dir}`,
    8,
  );

  const emptyMessage = useMemo(() => {
    if (items.length === 0) {
      return "Todavía no se generó ninguna orden de trabajo.";
    }
    return "No hay órdenes que coincidan con la búsqueda o los filtros.";
  }, [items]);

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

          <Text style={styles.subtitle}>
            Todas las <Sigla>OT</Sigla> generadas, por solicitud o por plan de mantenimiento
          </Text>
        </View>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <TableFilterBar
        searchValue={search}
        onSearch={setSearch}
        searchPlaceholder="Buscar por N° de OT, equipo, plan o descripción…"
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
            key: "tipo",
            label: "Tipo",
            value: typeFilter,
            onChange: setTypeFilter,
            options: [
              { value: "", label: "Todos" },
              { value: "correctivo", label: TYPE_LABELS.correctivo },
              { value: "preventivo", label: TYPE_LABELS.preventivo },
              { value: "instalacion", label: TYPE_LABELS.instalacion },
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
        <Text style={styles.empty}>{emptyMessage}</Text>
      ) : (
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <SortHeaderCell
              label="N° OT"
              field="numero"
              activeField={field}
              dir={dir}
              onSort={toggle}
              style={{ flex: 0.85 }}
            />

            <SortHeaderCell
              label="Equipo"
              field="equipo"
              activeField={field}
              dir={dir}
              onSort={toggle}
              style={{ flex: 1.8 }}
            />

            <SortHeaderCell
              label="Origen"
              field="origen"
              activeField={field}
              dir={dir}
              onSort={toggle}
              style={{ flex: 1.8 }}
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
              style={{ flex: 0.95 }}
            />

            <SortHeaderCell
              label="Inicio"
              field="inicio"
              activeField={field}
              dir={dir}
              onSort={toggle}
              style={{ flex: 0.85 }}
            />

            <Text style={[styles.headerCell, styles.actionsCol]}>ACCIONES</Text>
          </View>

          {ordersPage.pageItems.map((item, i) => {
            const status = item.status;
            const st = statusColors[status];
            const prio = priorityColors[item.priority];
            const origin: WorkOrderOrigin = getWorkOrderOrigin(item);

            let subtitleText = "—";
            if (origin === "solicitud") {
              subtitleText = item.solicitud?.description || "Sin descripción";
            } else if (origin === "plan") {
              subtitleText = item.plan_name || "Plan de mantenimiento";
            } else if (item.observation) {
              subtitleText = item.observation;
            }

            return (
              <View key={item.id} style={[styles.row, i % 2 === 1 && styles.rowAlt]}>
                <View style={styles.rowMain}>
                  <View style={{ flex: 0.85, justifyContent: "center" }}>
                    <Text style={styles.orderNumber}>{formatOrderNumber(item.id)}</Text>
                  </View>

                  <View style={{ flex: 1.8, justifyContent: "center", paddingRight: 12 }}>
                    <Text style={styles.name} numberOfLines={1}>
                      {item.equipment.name}
                    </Text>

                    <Text style={styles.equipmentCode}>{item.equipment.code}</Text>
                  </View>

                  <View style={{ flex: 1.8, justifyContent: "center", paddingRight: 12 }}>
                    {origin === "solicitud" ? (
                      <View style={[styles.originChip, styles.originChipSolicitud]}>
                        <WarningIcon size={12} color="#8a2a22" />

                        <Text style={styles.originChipTextSolicitud}>Solicitud</Text>
                      </View>
                    ) : origin === "plan" ? (
                      <View style={[styles.originChip, styles.originChipPlan]}>
                        <RefreshCwIcon size={12} color="#2d4a7a" />

                        <Text style={styles.originChipTextPlan}>Plan preventivo</Text>
                      </View>
                    ) : origin === "instalacion" ? (
                      <View style={[styles.originChip, styles.originChipInstalacion]}>
                        <EquipmentIcon size={12} color="#8a5d12" />

                        <Text style={styles.originChipTextInstalacion}>Instalación</Text>
                      </View>
                    ) : (
                      <View style={[styles.originChip, styles.originChipNone]}>
                        <Text style={styles.originChipTextNone}>Sin origen</Text>
                      </View>
                    )}

                    <Text
                      style={styles.originSubtitle}
                      numberOfLines={1}
                      {...(Platform.OS === "web" ? ({ title: subtitleText } as any) : {})}
                    >
                      {subtitleText}
                    </Text>
                  </View>

                  <View style={{ flex: 1, justifyContent: "center" }}>
                    <View style={[styles.badge, { backgroundColor: st.bg }]}>
                      <Text style={[styles.badgeText, { color: st.fg }]}>
                        {item.tasks.length === 0 && status === "assigned"
                          ? "Sin tareas"
                          : STATUS_LABELS[status]}
                      </Text>
                    </View>
                  </View>

                  <View style={{ flex: 0.95, justifyContent: "center" }}>
                    <View
                      style={[styles.badge, { backgroundColor: prio.bg }]}
                      {...(Platform.OS === "web"
                        ? ({ className: "notranslate", translate: "no" } as any)
                        : {})}
                    >
                      <Text
                        style={[styles.badgeText, { color: prio.fg }]}
                        {...(Platform.OS === "web"
                          ? ({ className: "notranslate", translate: "no" } as any)
                          : {})}
                      >
                        {PRIORITY_LABELS[item.priority]}
                      </Text>
                    </View>
                  </View>

                  <View style={{ flex: 0.85, justifyContent: "center" }}>
                    <Text style={styles.cellText}>{fromDbDate(item.start_date) || "—"}</Text>
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
    orderNumber: { fontFamily: "monospace", fontSize: 13.5, fontWeight: "700", color: c.text },
    equipmentCode: { fontFamily: "monospace", fontSize: 12, color: c.textMuted, marginTop: 2 },
    cellText: { fontSize: 13.5, color: c.textLabel },
    originChip: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      gap: 5,
      paddingHorizontal: 9,
      paddingVertical: 3,
      borderRadius: 999,
    },
    originChipSolicitud: {
      backgroundColor: "#f6d5d2",
    },
    originChipTextSolicitud: {
      fontSize: 12,
      fontWeight: "600",
      color: "#8a2a22",
    },
    originChipPlan: {
      backgroundColor: "#dbe4f3",
    },
    originChipTextPlan: {
      fontSize: 12,
      fontWeight: "600",
      color: "#2d4a7a",
    },
    originChipInstalacion: {
      backgroundColor: "#f7efdb",
    },
    originChipTextInstalacion: {
      fontSize: 12,
      fontWeight: "600",
      color: "#8a5d12",
    },
    originChipNone: {
      backgroundColor: "#edeadd",
    },
    originChipTextNone: {
      fontSize: 12,
      fontWeight: "600",
      color: "#6e7364",
    },
    originSubtitle: {
      fontSize: 12,
      color: c.textMuted,
      marginTop: 3,
    },
    badge: {
      alignSelf: "flex-start",
      paddingHorizontal: 11,
      paddingVertical: 3.5,
      borderRadius: 999,
    },
    badgeText: { fontSize: 12.5, fontWeight: "600" },
  });
}
