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
import { ExportPdfModal } from "../../../components/statistics/ExportPdfModal";
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
import { getProfile } from "../../../lib/auth";
import { exportHtmlAsPdf } from "../../../lib/exportPdf";
import { loadStatisticsData, type StatisticsData } from "../../../lib/queries/statistics";
import type { OrderTypeFilter, StatsPeriod } from "../../../lib/statistics";
import {
  STATISTICS_TAB_LABELS,
  TAB_USES_TYPE,
  availablePdfBlocks,
  buildStatisticsHtml,
  statisticsPdfBaseName,
  type StatisticsTabKey,
} from "../../../lib/statisticsPdf";
import type { ThemeColors } from "../../../lib/theme";
import { useTheme } from "../../../lib/ThemeContext";
import { useIsPhone } from "../../../lib/useIsPhone";

type TabKey = StatisticsTabKey;

const TABS = (Object.keys(STATISTICS_TAB_LABELS) as TabKey[]).map((key) => ({
  key,
  label: STATISTICS_TAB_LABELS[key],
  usesType: TAB_USES_TYPE[key],
}));

// Phone labels: the full ones add up to ~620px, so on a phone the last tabs
// would sit off-screen with nothing hinting they exist.
const TAB_PHONE_LABELS: Record<TabKey, string> = {
  orders: "Órdenes",
  technicians: "Técnicos",
  equipment: "Equipos",
  requests: "Solicitudes",
  parts: "Repuestos",
};

const DEFAULT_PRESET: Exclude<PeriodPreset, "custom"> = "90d";

// Admin-only analysis over a period (HU-071..076), split in tabs so each
// one shows a handful of blocks instead of one endless page. Today's state
// (what to attend right now) lives in Inicio, not here.
export default function StatisticsScreen() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { width } = useWindowDimensions();
  const isWide = width >= BREAKPOINT.desktop;
  const isPhone = useIsPhone();

  const today = getTodayDbDate();
  const [data, setData] = useState<StatisticsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<TabKey>("orders");
  const [preset, setPreset] = useState<PeriodPreset>(DEFAULT_PRESET);
  const [period, setPeriod] = useState<StatsPeriod>(() => presetPeriod(DEFAULT_PRESET, today));
  const [type, setType] = useState<OrderTypeFilter>("all");
  const [equipmentId, setEquipmentId] = useState<number | null>(null);
  const [partId, setPartId] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportPickerOpen, setExportPickerOpen] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

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
  // Memoized: the picker resets its checkboxes whenever this list changes.
  const pdfBlocks = useMemo(() => availablePdfBlocks(tab, type), [tab, type]);

  // HU-077: the active tab, with the selected period and type, as a PDF
  // carrying Mantia's name and logo (see lib/statisticsPdf) — only the
  // blocks the admin ticked in ExportPdfModal.
  async function exportPdf(blocks: string[]) {
    if (!data || exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      const profile = await getProfile();
      const html = buildStatisticsHtml({
        tab,
        data,
        period,
        type,
        today,
        ...lookups,
        selectedEquipmentId: equipmentId,
        selectedPartId: partId,
        generatedAt: new Date(),
        generatedBy: profile?.name ?? null,
        blocks,
      });
      await exportHtmlAsPdf(html, statisticsPdfBaseName(tab, period));
    } catch (e) {
      setExportError(`No se pudo exportar el PDF: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExporting(false);
    }
  }

  const tabProps: StatsTabProps | null = data
    ? { data, period, type, today, isWide, ...lookups }
    : null;

  const tabButtons = TABS.map((t) => (
    <Pressable
      key={t.key}
      style={[styles.tab, tab === t.key && styles.tabActive]}
      onPress={() => setTab(t.key)}
      accessibilityRole="tab"
      accessibilityState={{ selected: tab === t.key }}
    >
      <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>
        {isPhone ? TAB_PHONE_LABELS[t.key] : t.label}
      </Text>
    </Pressable>
  ));

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, isPhone && styles.contentPhone]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
    >
      <View style={styles.pageHeader}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Estadísticas</Text>

          <Text style={styles.subtitle}>Análisis del mantenimiento en un período</Text>
        </View>

        <Pressable
          style={[styles.exportButton, (!data || exporting) && styles.exportButtonDisabled]}
          onPress={() => setExportPickerOpen(true)}
          disabled={!data || exporting}
          accessibilityRole="button"
          accessibilityLabel={`Exportar ${activeTab.label} a PDF`}
        >
          {exporting && <ActivityIndicator size="small" color="#fff" />}

          <Text style={styles.exportButtonText}>
            {exporting ? (isPhone ? "Generando…" : "Generando PDF…") : "Exportar PDF"}
          </Text>
        </Pressable>
      </View>

      {exportError && <Text style={styles.error}>{exportError}</Text>}

      <ExportPdfModal
        visible={exportPickerOpen}
        tabLabel={activeTab.label}
        blocks={pdfBlocks}
        onClose={() => setExportPickerOpen(false)}
        onConfirm={(blocks) => {
          // Closed first: on web the browser's print dialog opens next.
          setExportPickerOpen(false);
          exportPdf(blocks);
        }}
      />

      {isPhone ? (
        // On a phone the short labels wrap into rows, so every tab is visible.
        <View style={[styles.tabs, styles.tabsWrap]}>{tabButtons}</View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabsScroll}
          contentContainerStyle={styles.tabs}
        >
          {tabButtons}
        </ScrollView>
      )}

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

          {tab === "equipment" && (
            <EquipmentTab {...tabProps} selectedId={equipmentId} onSelect={setEquipmentId} />
          )}

          {tab === "requests" && <RequestsTab {...tabProps} />}

          {tab === "parts" && (
            <PartsTab {...tabProps} selectedPart={partId} onSelectPart={setPartId} />
          )}
        </View>
      )}
    </ScrollView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    content: { padding: 24, paddingBottom: 48 },
    contentPhone: { padding: 20, paddingBottom: 48 },
    pageHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 12,
      marginBottom: 16,
    },
    // No wrap: a wrapped button would drop onto its own line on the left
    // (see Proveedores); on a phone the text shrinks instead.
    headerText: { flex: 1, minWidth: 0 },
    exportButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: c.accent,
      paddingHorizontal: 20,
      height: 40,
      borderRadius: 10,
    },
    exportButtonDisabled: { opacity: 0.6 },
    exportButtonText: { color: "#fff", fontWeight: "600", fontSize: 14 },
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
    tabsWrap: { flexWrap: "wrap", marginBottom: 16 },
    tab: { paddingHorizontal: 14, height: 34, borderRadius: 9, justifyContent: "center" },
    tabActive: { backgroundColor: c.bgToggleActive },
    tabText: { fontSize: 13.5, fontWeight: "500", color: c.textSecondary },
    tabTextActive: { color: c.text, fontWeight: "600" },
    filters: { marginBottom: 20, zIndex: 10 },
    error: { color: c.destructive, marginBottom: 12 },
    loading: { marginTop: 40 },
  });
}
