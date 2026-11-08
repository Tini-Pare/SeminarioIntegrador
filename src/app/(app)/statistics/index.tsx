import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { getTodayDbDate } from "../../../components/CustomDatePicker";
import { EquipmentTab } from "../../../components/statistics/EquipmentTab";
import { OrdersTab } from "../../../components/statistics/OrdersTab";
import { PartsTab } from "../../../components/statistics/PartsTab";
import { RequestsTab } from "../../../components/statistics/RequestsTab";
import type { StatsTabProps } from "../../../components/statistics/shared";
import {
  StatisticsFilters,
  presetPeriod,
  type PeriodPreset,
} from "../../../components/statistics/StatisticsFilters";
import { TechniciansTab } from "../../../components/statistics/TechniciansTab";
import { BREAKPOINT } from "../../../constants";
import { loadStatisticsData, type StatisticsData } from "../../../lib/queries/statistics";
import type { OrderTypeFilter, StatsPeriod } from "../../../lib/statistics";
import type { ThemeColors } from "../../../lib/theme";
import { useTheme } from "../../../lib/ThemeContext";

type TabKey = "orders" | "technicians" | "equipment" | "requests" | "parts";

const TABS: { key: TabKey; label: string; usesType: boolean }[] = [
  { key: "orders", label: "Órdenes de trabajo", usesType: true },
  { key: "technicians", label: "Técnicos", usesType: true },
  { key: "equipment", label: "Equipos", usesType: false },
  { key: "requests", label: "Solicitudes", usesType: false },
  { key: "parts", label: "Repuestos y compras", usesType: false },
];

const DEFAULT_PRESET: Exclude<PeriodPreset, "custom"> = "90d";

// Admin-only analysis over a period (HU-071..076), split in tabs so each
// one shows a handful of blocks instead of one endless page. Today's state
// (what to attend right now) lives in Inicio, not here.
export default function StatisticsScreen() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { width } = useWindowDimensions();
  const isWide = width >= BREAKPOINT.desktop;

  const today = getTodayDbDate();
  const [data, setData] = useState<StatisticsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<TabKey>("orders");
  const [preset, setPreset] = useState<PeriodPreset>(DEFAULT_PRESET);
  const [period, setPeriod] = useState<StatsPeriod>(() => presetPeriod(DEFAULT_PRESET, today));
  const [type, setType] = useState<OrderTypeFilter>("all");

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await loadStatisticsData());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const lookups = useMemo(
    () => ({
      equipmentById: new Map((data?.equipment ?? []).map((e) => [e.id, e])),
      profileById: new Map((data?.profiles ?? []).map((p) => [p.id, p])),
    }),
    [data],
  );

  const activeTab = TABS.find((t) => t.key === tab)!;

  const tabProps: StatsTabProps | null = data
    ? { data, period, type, today, isWide, ...lookups }
    : null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
    >
      <View style={styles.pageHeader}>
        <Text style={styles.title}>Estadísticas</Text>

        <Text style={styles.subtitle}>Análisis del mantenimiento en un período</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScroll}
        contentContainerStyle={styles.tabs}
      >
        {TABS.map((t) => (
          <Pressable
            key={t.key}
            style={[styles.tab, tab === t.key && styles.tabActive]}
            onPress={() => setTab(t.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t.key }}
          >
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.filters}>
        <StatisticsFilters
          preset={preset}
          period={period}
          onPeriodChange={(p, next) => {
            setPreset(p);
            setPeriod(next);
          }}
          type={type}
          onTypeChange={setType}
          showType={activeTab.usesType}
          today={today}
        />
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      {!tabProps ? (
        !error && <ActivityIndicator style={styles.loading} />
      ) : (
        <View>
          {tab === "orders" && <OrdersTab {...tabProps} />}

          {tab === "technicians" && <TechniciansTab {...tabProps} />}

          {tab === "equipment" && <EquipmentTab {...tabProps} />}

          {tab === "requests" && <RequestsTab {...tabProps} />}

          {tab === "parts" && <PartsTab {...tabProps} />}
        </View>
      )}
    </ScrollView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    content: { padding: 24, paddingBottom: 48 },
    pageHeader: { marginBottom: 16 },
    title: { fontSize: 22, fontWeight: "600", color: c.text },
    subtitle: { marginTop: 3, fontSize: 14, color: c.textSecondary },
    tabsScroll: { flexGrow: 0, marginBottom: 16 },
    tabs: {
      flexDirection: "row",
      gap: 4,
      padding: 4,
      borderRadius: 12,
      backgroundColor: c.bgToggle,
    },
    tab: { paddingHorizontal: 14, height: 34, borderRadius: 9, justifyContent: "center" },
    tabActive: { backgroundColor: c.bgToggleActive },
    tabText: { fontSize: 13.5, fontWeight: "500", color: c.textSecondary },
    tabTextActive: { color: c.text, fontWeight: "600" },
    filters: { marginBottom: 20, zIndex: 10 },
    error: { color: c.destructive, marginBottom: 12 },
    loading: { marginTop: 40 },
  });
}
