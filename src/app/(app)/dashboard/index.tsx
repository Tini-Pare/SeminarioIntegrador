import { Redirect, router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { getTodayDbDate } from "../../../components/CustomDatePicker";
import { BREAKPOINT } from "../../../constants";
import { getProfile } from "../../../lib/auth";
import { listLowStockParts } from "../../../lib/queries/alerts";
import { listEquipment, listHistorySince } from "../../../lib/queries/equipment";
import { listAllRequests, listWorkOrders } from "../../../lib/queries/faults";
import { listNotifications, type StockNotification } from "../../../lib/queries/notifications";
import { listProfiles } from "../../../lib/queries/profiles";
import { overdueOrders } from "../../../lib/statistics";
import type { ThemeColors } from "../../../lib/theme";
import { useTheme } from "../../../lib/ThemeContext";
import {
  buildTodayActivity,
  computeTodayKpis,
  isOrderWithoutTechnician,
  preventiveDueToday,
  type ActivityItem,
  type ActivityKind,
} from "../../../lib/todaySummary";
import { useIsPhone } from "../../../lib/useIsPhone";
import type {
  Equipo,
  HistorialEntry,
  Profile,
  Repuesto,
  Solicitud,
  WorkOrder,
} from "../../../types/database";

// Activity rows shown before "Ver todo".
const ACTIVITY_PREVIEW = 8;

const KIND_LABEL: Record<ActivityKind, string> = {
  solicitud: "Solicitud",
  preventiva: "Preventiva",
  ot: "OT",
  tarea: "Tarea",
  repuesto: "Repuesto",
  stock: "Stock",
};

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// "Domingo 8 de noviembre"
function formatLongDate(d: Date): string {
  const weekday = d.toLocaleDateString("es-AR", { weekday: "long" });
  const month = d.toLocaleDateString("es-AR", { month: "long" });
  return `${capitalize(weekday)} ${d.getDate()} de ${month}`;
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

// Inicio is today only: what happened in the day and what's still waiting
// for the admin. Analysis over a period lives in Estadísticas.
export default function DashboardScreen() {
  const [role, setRole] = useState<Profile["role"] | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [equipment, setEquipment] = useState<Equipo[]>([]);
  const [requests, setRequests] = useState<Solicitud[]>([]);
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [stockAlerts, setStockAlerts] = useState<Repuesto[]>([]);
  const [stockEvents, setStockEvents] = useState<StockNotification[]>([]);
  const [taskFinishLog, setTaskFinishLog] = useState<HistorialEntry[]>([]);
  const [showAllActivity, setShowAllActivity] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const isWide = width >= BREAKPOINT.desktop;
  const isPhone = useIsPhone();
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const load = useCallback(async () => {
    setError(null);
    try {
      const profile = await getProfile();
      setRole(profile?.role ?? null);
      if (profile?.role !== "admin") return;

      const [faults, equip, people, lowStock, workOrders, finishLog, notifications] =
        await Promise.all([
          listAllRequests(),
          listEquipment(),
          listProfiles(),
          listLowStockParts(),
          listWorkOrders(),
          listHistorySince(startOfToday(), "Tarea finalizada"),
          listNotifications(),
        ]);
      setRequests(faults);
      setEquipment(equip);
      setProfiles(people);
      setStockAlerts(lowStock);
      setOrders(workOrders);
      setTaskFinishLog(finishLog);
      setStockEvents(
        notifications.notifications.filter(
          (n): n is StockNotification => n.kind === "stock_minimo",
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().finally(() => setLoading(false));
    }, [load]),
  );

  const today = getTodayDbDate();
  const longDate = useMemo(() => formatLongDate(new Date()), []);

  const kpis = useMemo(() => computeTodayKpis(today, requests, orders), [today, requests, orders]);

  const activity = useMemo(
    () =>
      buildTodayActivity({
        today,
        requests,
        orders,
        equipmentById: new Map(equipment.map((e) => [e.id, e])),
        technicianNames: new Map(profiles.map((p) => [p.id, p.name])),
        taskFinishLog,
        stockEvents,
      }),
    [today, requests, orders, equipment, profiles, taskFinishLog, stockEvents],
  );

  const toResolve = useMemo(
    () => ({
      unassignedRequests: requests.filter((r) => r.status === "new").length,
      ordersWithoutTechnician: orders.filter(isOrderWithoutTechnician).length,
      dueToday: preventiveDueToday(orders, today).length,
      overdue: overdueOrders(orders, today).length,
      lowStock: stockAlerts.length,
    }),
    [requests, orders, stockAlerts, today],
  );

  // Only equipos still in use: an inactive one isn't "fuera de servicio".
  const equipmentState = useMemo(() => {
    const active = equipment.filter((e) => e.active);
    const count = (s: Equipo["status"]) => active.filter((e) => e.status === s).length;
    return {
      total: active.length,
      outOfService: active.filter((e) => e.status !== "operational").length,
      segments: [
        { label: "Funcionando", value: count("operational"), color: colors.eqOperational.dot },
        { label: "En espera", value: count("waiting"), color: colors.eqWaiting.dot },
        { label: "En reparación", value: count("repair"), color: colors.eqRepair.dot },
        {
          label: "Pendiente de instalación",
          value: count("pending_install"),
          color: colors.eqPendingInstall.dot,
        },
      ],
    };
  }, [equipment, colors]);

  if (role === undefined || (role === "admin" && loading)) {
    return <ActivityIndicator style={styles.center} />;
  }

  // Inicio is an admin overview; other roles start on the equipment list.
  if (role !== "admin") return <Redirect href="/equipment" />;

  const kindTone: Record<ActivityKind, { bg: string; fg: string }> = {
    solicitud: colors.eqRepair,
    preventiva: colors.eqPendingInstall,
    ot: colors.faultAssigned,
    tarea: colors.faultInProgress,
    repuesto: colors.urgencyLow,
    stock: colors.urgencyMedium,
  };

  const visibleActivity = showAllActivity ? activity : activity.slice(0, ACTIVITY_PREVIEW);

  const resolveRows: {
    key: string;
    count: number;
    label: string;
    action: string;
    href: string;
    always: boolean;
  }[] = [
    {
      key: "requests",
      count: toResolve.unassignedRequests,
      label: plural(
        toResolve.unassignedRequests,
        "Solicitud sin asignar",
        "Solicitudes sin asignar",
      ),
      action: "Asignar",
      href: "/requests",
      always: true,
    },
    {
      key: "no-tech",
      count: toResolve.ordersWithoutTechnician,
      label: "OT sin técnico",
      action: "Asignar",
      href: "/work-orders",
      always: true,
    },
    {
      key: "due",
      count: toResolve.dueToday,
      label: plural(
        toResolve.dueToday,
        "Mantenimiento que vence hoy",
        "Mantenimientos que vencen hoy",
      ),
      action: "Ver",
      href: "/work-orders?tipo=preventivo",
      always: true,
    },
    {
      key: "overdue",
      count: toResolve.overdue,
      label: plural(toResolve.overdue, "OT vencida", "OT vencidas"),
      action: "Ver",
      href: "/work-orders",
      always: false,
    },
    {
      key: "stock",
      count: toResolve.lowStock,
      label: plural(toResolve.lowStock, "Repuesto bajo el mínimo", "Repuestos bajo el mínimo"),
      action: "Ver",
      href: "/spare-parts",
      always: false,
    },
  ];

  const kpiTiles = [
    {
      key: "requests",
      label: "Solicitudes nuevas hoy",
      value: String(kpis.newRequests),
      hint:
        kpis.newRequests === 0 ? "ninguna por ahora" : `${kpis.newRequestsUnassigned} sin asignar`,
    },
    {
      key: "preventive",
      label: "OT preventivas generadas hoy",
      value: String(kpis.preventiveOrders),
      hint:
        kpis.preventiveOrders === 0
          ? "ninguna generada"
          : kpis.preventiveWithoutTechnician === 0
            ? "todas con técnico"
            : kpis.preventiveWithoutTechnician < kpis.preventiveOrders
              ? `${kpis.preventiveWithoutTechnician} sin técnico`
              : kpis.preventiveOrders === 1
                ? "sin técnico"
                : kpis.preventiveOrders === 2
                  ? "ambas sin técnico"
                  : "todas sin técnico",
    },
    {
      key: "tasks",
      label: "Tareas finalizadas hoy",
      value: String(kpis.finishedTasks),
      hint:
        kpis.finishedTasks === 0
          ? "ninguna todavía"
          : `por ${kpis.finishingTechnicians} ${plural(kpis.finishingTechnicians, "técnico", "técnicos")}`,
    },
    {
      key: "parts",
      label: "Repuestos usados hoy",
      value: kpis.partsValue,
      hint:
        kpis.tasksWithParts === 0
          ? "ninguno registrado"
          : `${kpis.partsMixedUnits ? "repuestos distintos " : ""}en ${kpis.tasksWithParts} ${plural(kpis.tasksWithParts, "tarea", "tareas")}`,
    },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, isPhone && styles.contentPhone]}
    >
      <View style={styles.pageHeader}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Inicio · Hoy</Text>

          <Text style={styles.subtitle}>Lo que pasó y lo que hay que resolver en el día</Text>
        </View>

        <View style={styles.datePill}>
          <Text style={styles.datePillText}>{longDate}</Text>
        </View>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.kpiRow}>
        {kpiTiles.map((k) => (
          <View key={k.key} style={[styles.kpiTile, isPhone && styles.kpiTilePhone]}>
            <Text style={styles.kpiLabel} numberOfLines={2}>
              {k.label}
            </Text>

            <Text style={styles.kpiValue} numberOfLines={1}>
              {k.value}
            </Text>

            <Text style={styles.kpiHint} numberOfLines={1}>
              {k.hint}
            </Text>
          </View>
        ))}
      </View>

      {/* Stacked (phone/tablet) columns must not use flex: 1: in a vertical
          ScrollView that means flexBasis 0, so a column ends up shorter
          than its panels and the next one draws on top of them. */}
      <View style={isWide ? styles.columns : styles.stack}>
        <View style={[styles.panel, isWide && styles.mainColumn]}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelTitle}>Actividad de hoy</Text>

            {activity.length > ACTIVITY_PREVIEW && (
              <Pressable onPress={() => setShowAllActivity((v) => !v)} hitSlop={8}>
                <Text style={styles.panelLink}>{showAllActivity ? "Ver menos" : "Ver todo"}</Text>
              </Pressable>
            )}
          </View>

          {activity.length === 0 ? (
            <Text style={styles.panelEmpty}>Todavía no hubo actividad hoy.</Text>
          ) : (
            visibleActivity.map((item) => (
              <ActivityRow
                key={item.key}
                item={item}
                tone={
                  item.kind === "stock" && item.severe ? colors.urgencyHigh : kindTone[item.kind]
                }
                isPhone={isPhone}
                styles={styles}
              />
            ))
          )}
        </View>

        <View style={isWide ? styles.sideColumn : styles.stack}>
          <View style={styles.panel}>
            <Text style={[styles.panelTitle, styles.panelTitleAlone]}>Para resolver hoy</Text>

            {resolveRows
              .filter((r) => r.always || r.count > 0)
              .map((r) => {
                const pending = r.count > 0;
                return (
                  <Pressable
                    key={r.key}
                    style={styles.resolveRow}
                    onPress={() => router.push(r.href as never)}
                  >
                    <View style={[styles.countBadge, !pending && styles.countBadgeDone]}>
                      <Text style={[styles.countBadgeText, !pending && styles.countBadgeTextDone]}>
                        {r.count}
                      </Text>
                    </View>

                    <Text
                      style={[styles.resolveLabel, !pending && styles.resolveLabelDone]}
                      numberOfLines={2}
                    >
                      {r.label}
                    </Text>

                    <Text style={styles.resolveAction}>{pending ? `${r.action} →` : "Al día"}</Text>
                  </Pressable>
                );
              })}
          </View>

          <View style={styles.panel}>
            <Text style={[styles.panelTitle, styles.panelTitleAlone]}>
              Estado de los equipos ahora
            </Text>

            <View style={styles.stateBar}>
              {equipmentState.total === 0 ? (
                <View style={[styles.stateSegment, { flex: 1, backgroundColor: colors.border }]} />
              ) : (
                equipmentState.segments
                  .filter((s) => s.value > 0)
                  .map((s) => (
                    <View
                      key={s.label}
                      style={[styles.stateSegment, { flex: s.value, backgroundColor: s.color }]}
                    />
                  ))
              )}
            </View>

            <View style={styles.legend}>
              {equipmentState.segments.map((s) => (
                <View key={s.label} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: s.color }]} />

                  <Text style={styles.legendText}>
                    {s.label} {s.value}
                  </Text>
                </View>
              ))}
            </View>

            <Text style={styles.stateSummary}>
              {equipmentState.outOfService} de {equipmentState.total} fuera de servicio ·{" "}
              <Text style={styles.stateLink} onPress={() => router.push("/equipment")}>
                Ver equipos →
              </Text>
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

function ActivityRow({
  item,
  tone,
  isPhone,
  styles,
}: {
  item: ActivityItem;
  tone: { bg: string; fg: string };
  isPhone: boolean;
  styles: ReturnType<typeof makeStyles>;
}) {
  const text = (
    <Text style={styles.activityText} numberOfLines={isPhone ? 3 : 2}>
      {item.segments.map((s, i) => (
        <Text key={i} style={s.bold ? styles.activityBold : undefined}>
          {s.text}
        </Text>
      ))}
    </Text>
  );

  return (
    <Pressable
      style={[styles.activityRow, isPhone && styles.activityRowPhone]}
      onPress={() => router.push(item.href as never)}
    >
      <View style={styles.activityMeta}>
        <Text style={styles.activityTime}>{formatTime(item.at)}</Text>

        <View style={[styles.kindChip, { backgroundColor: tone.bg }]}>
          <Text style={[styles.kindChipText, { color: tone.fg }]}>{KIND_LABEL[item.kind]}</Text>
        </View>
      </View>

      {text}
    </Pressable>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    content: { padding: 24, paddingBottom: 48, gap: 16 },
    contentPhone: { padding: 20, paddingBottom: 48 },
    center: { flex: 1 },
    error: { color: c.destructive },
    pageHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: 12,
      marginBottom: 4,
    },
    headerText: { flexShrink: 1, minWidth: 0 },
    title: { fontSize: 22, fontWeight: "600", color: c.text },
    subtitle: { marginTop: 3, fontSize: 14, color: c.textSecondary },
    datePill: {
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.bgCard,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 7,
    },
    datePillText: { fontSize: 13, fontWeight: "500", color: c.text },
    kpiRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
    kpiTile: {
      flexGrow: 1,
      flexBasis: 200,
      minWidth: 0,
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    // Two per row on a phone.
    kpiTilePhone: { flexBasis: 140 },
    kpiLabel: { fontSize: 12.5, color: c.textSecondary },
    kpiValue: {
      marginTop: 6,
      fontSize: 26,
      fontWeight: "700",
      letterSpacing: -0.5,
      color: c.text,
      fontVariant: ["tabular-nums"],
    },
    kpiHint: { marginTop: 4, fontSize: 12.5, color: c.textMuted },
    columns: { flexDirection: "row", gap: 16, alignItems: "flex-start" },
    mainColumn: { flex: 1.7, minWidth: 0 },
    sideColumn: { flex: 1, gap: 16, minWidth: 0 },
    stack: { gap: 16 },
    panel: {
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 14,
      padding: 16,
    },
    panelHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      marginBottom: 8,
    },
    panelTitle: { flexShrink: 1, minWidth: 0, fontSize: 15.5, fontWeight: "600", color: c.text },
    panelTitleAlone: { marginBottom: 8 },
    panelLink: { fontSize: 13, fontWeight: "500", color: c.textSecondary },
    panelEmpty: { fontSize: 13.5, color: c.textMuted, paddingVertical: 8 },
    activityRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: c.borderRow,
    },
    activityRowPhone: { flexDirection: "column", alignItems: "flex-start", gap: 6 },
    activityMeta: { flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 0 },
    activityTime: {
      width: 40,
      fontSize: 12.5,
      color: c.textMuted,
      fontVariant: ["tabular-nums"],
    },
    kindChip: {
      minWidth: 76,
      alignItems: "center",
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 999,
    },
    kindChipText: { fontSize: 11.5, fontWeight: "600" },
    activityText: { flex: 1, minWidth: 0, fontSize: 13.5, color: c.text, lineHeight: 19 },
    activityBold: { fontWeight: "700" },
    resolveRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: c.borderRow,
    },
    countBadge: {
      minWidth: 22,
      height: 22,
      paddingHorizontal: 6,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.urgencyHigh.bg,
    },
    countBadgeDone: { backgroundColor: c.bgNested },
    countBadgeText: { fontSize: 12, fontWeight: "700", color: c.urgencyHigh.fg },
    countBadgeTextDone: { color: c.textMuted },
    resolveLabel: { flex: 1, minWidth: 0, fontSize: 13.5, color: c.text },
    resolveLabelDone: { color: c.textMuted },
    resolveAction: { fontSize: 13, fontWeight: "500", color: c.textSecondary },
    stateBar: {
      flexDirection: "row",
      height: 12,
      borderRadius: 999,
      overflow: "hidden",
      gap: 2,
      marginTop: 4,
    },
    stateSegment: { height: "100%" },
    legend: { flexDirection: "row", flexWrap: "wrap", columnGap: 14, rowGap: 6, marginTop: 12 },
    legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
    legendText: { fontSize: 12.5, color: c.textSecondary, fontVariant: ["tabular-nums"] },
    stateSummary: { marginTop: 12, fontSize: 13, color: c.textSecondary },
    stateLink: { fontWeight: "600", color: c.text },
  });
}
