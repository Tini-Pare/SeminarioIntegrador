import { Redirect, router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Svg, { Circle, Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { RequestList } from "../../../components/RequestList";
import { StatusBadge } from "../../../components/StatusBadge";
import { BREAKPOINT } from "../../../constants";
import { getProfile } from "../../../lib/auth";
import { listEquipment } from "../../../lib/queries/equipment";
import { listAllRequests } from "../../../lib/queries/faults";
import { listProfiles } from "../../../lib/queries/profiles";
import type { ThemeColors } from "../../../lib/theme";
import { useTheme } from "../../../lib/ThemeContext";
import type { Equipo, Profile, Solicitud } from "../../../types/database";

type RequestItem = Solicitud & {
  equipment: Pick<Equipo, "code" | "name">;
  reporterName: string;
  technicianName: string | null;
};

// Native pixel size of assets/images/dashboard-hero-bg.png — the glow is
// off-center toward the right, so the image is anchored to the card's
// top-right corner (not center-cropped) to keep it visible on narrow screens.
const HERO_BG_ASPECT_RATIO = 1516 / 464;

export default function DashboardScreen() {
  const [role, setRole] = useState<Profile["role"] | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [equipment, setEquipment] = useState<Equipo[]>([]);
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [heroSize, setHeroSize] = useState({ width: 0, height: 0 });
  const { width } = useWindowDimensions();
  const isWide = width >= BREAKPOINT.tablet;
  const { colors, isDark } = useTheme();
  const styles = makeStyles(colors);

  const load = useCallback(async () => {
    setError(null);
    try {
      const profile = await getProfile();
      setRole(profile?.role ?? null);
      if (profile?.role !== "admin") return;

      const [faults, equip, profiles] = await Promise.all([
        listAllRequests(),
        listEquipment(),
        listProfiles(),
      ]);
      const equipmentById = new Map(equip.map((e) => [e.id, e]));
      const profileById = new Map(profiles.map((p) => [p.id, p]));
      setEquipment(equip);
      setRequests(
        faults.map((f) => ({
          ...f,
          equipment: equipmentById.get(f.equipment_id) ?? {
            code: "—",
            name: "Equipo desconocido",
          },
          reporterName: profileById.get(f.reported_by)?.name ?? "Desconocido",
          technicianName: f.technician_id ? (profileById.get(f.technician_id)?.name ?? null) : null,
        })),
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

  const stats = useMemo(() => {
    const byStatus = (s: Equipo["status"]) => equipment.filter((e) => e.status === s).length;
    return {
      total: equipment.length,
      operational: byStatus("operational"),
      waiting: byStatus("waiting"),
      repair: byStatus("repair"),
      reqNew: requests.filter((r) => r.status === "new").length,
      reqInProgress: requests.filter((r) => r.status === "assigned" || r.status === "in_progress")
        .length,
      reqResolved: requests.filter((r) => r.status === "resolved").length,
    };
  }, [equipment, requests]);

  const attention = useMemo(() => equipment.filter((e) => e.status !== "operational"), [equipment]);

  const eyebrowDate = useMemo(() => {
    const now = new Date();
    const weekday = now.toLocaleDateString("es-AR", { weekday: "long" }).toUpperCase();
    const time = now.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
    return `${weekday} ${now.getDate()} · ${time}`;
  }, []);

  const recentRequests = useMemo(
    () =>
      [...requests].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)).slice(0, 4),
    [requests],
  );

  if (role === undefined || (role === "admin" && loading)) {
    return <ActivityIndicator style={styles.center} />;
  }

  // Inicio is an admin overview; other roles start on the equipment list.
  if (role !== "admin") return <Redirect href="/equipment" />;

  const statCards = [
    { label: "Equipos totales", value: stats.total, color: colors.textMuted },
    { label: "Funcionando", value: stats.operational, color: colors.eqOperational.dot },
    { label: "En espera", value: stats.waiting, color: colors.eqWaiting.dot },
    { label: "En reparación", value: stats.repair, color: colors.eqRepair.dot },
  ];

  const requestCards = [
    { label: "Solicitudes nuevas", value: stats.reqNew, color: colors.faultNew.fg },
    { label: "En curso", value: stats.reqInProgress, color: colors.faultInProgress.fg },
    { label: "Resueltas", value: stats.reqResolved, color: colors.faultResolved.fg },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.pageHeader}>
        <Text style={styles.title}>Inicio</Text>
        <Text style={styles.subtitle}>Resumen del estado de mantenimiento</Text>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <View
        style={styles.hero}
        onLayout={(e) => setHeroSize(e.nativeEvent.layout)}
      >
        {isDark ? (
          <>
            <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
              <Defs>
                <RadialGradient id="heroCardBg" cx="88%" cy="15%" r="90%">
                  <Stop offset="0" stopColor={colors.heroGradient[0]} stopOpacity={1} />
                  <Stop offset="0.42" stopColor={colors.heroGradient[1]} stopOpacity={1} />
                  <Stop offset="0.78" stopColor={colors.heroGradient[2]} stopOpacity={1} />
                  <Stop offset="1" stopColor={colors.heroGradient[2]} stopOpacity={1} />
                </RadialGradient>
              </Defs>
              <Rect x={0} y={0} width="100%" height="100%" fill="url(#heroCardBg)" />
            </Svg>

            <View style={styles.heroBlob} pointerEvents="none">
              <Svg width="100%" height="100%" viewBox="0 0 340 340">
                <Defs>
                  <RadialGradient id="heroBlob" cx="36%" cy="32%" r="85%">
                    <Stop offset="0" stopColor={colors.heroBlobColors[0]} stopOpacity={0.75} />
                    <Stop offset="0.18" stopColor={colors.heroBlobColors[0]} stopOpacity={0.65} />
                    <Stop offset="0.34" stopColor={colors.heroBlobColors[1]} stopOpacity={0.5} />
                    <Stop offset="0.5" stopColor={colors.heroBlobColors[1]} stopOpacity={0.38} />
                    <Stop offset="0.66" stopColor={colors.heroBlobColors[1]} stopOpacity={0.26} />
                    <Stop offset="0.8" stopColor={colors.heroBlobColors[1]} stopOpacity={0.14} />
                    <Stop offset="0.92" stopColor={colors.heroBlobColors[1]} stopOpacity={0.05} />
                    <Stop offset="1" stopColor={colors.heroBlobColors[1]} stopOpacity={0} />
                  </RadialGradient>
                </Defs>
                <Circle cx={170} cy={170} r={170} fill="url(#heroBlob)" />
              </Svg>
            </View>
          </>
        ) : (
          <Image
            source={require("../../../../assets/images/dashboard-hero-bg.png")}
            style={[
              styles.heroBgImage,
              heroSize.height
                ? {
                    width: Math.max(heroSize.width, heroSize.height * HERO_BG_ASPECT_RATIO),
                    height: heroSize.height,
                  }
                : StyleSheet.absoluteFillObject,
            ]}
            resizeMode="cover"
          />
        )}

        <View style={styles.heroText}>
          <Text style={styles.heroEyebrow}>{eyebrowDate}</Text>
          <Text style={styles.heroValue}>
            {attention.length === 0
              ? "Todo en orden"
              : `${attention.length} ${attention.length === 1 ? "equipo" : "equipos"} fuera de servicio`}
          </Text>
          <Text style={styles.heroCopy}>
            {stats.waiting} en espera · {stats.repair} en reparación · {stats.reqNew} solicitudes
            sin asignar
          </Text>

          <View style={styles.heroActions}>
            <Pressable style={styles.primaryButton} onPress={() => router.push("/equipment")}>
              <Text style={styles.primaryButtonText}>Ver equipos</Text>
            </Pressable>

            <Pressable style={styles.ghostButton} onPress={() => router.push("/requests")}>
              <Text style={styles.ghostButtonText}>Ver solicitudes</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View style={styles.statsRow}>
        {statCards.map((s) => (
          <View key={s.label} style={styles.statCard}>
            <View style={styles.statLabelRow}>
              <View style={[styles.statDot, { backgroundColor: s.color }]} />
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
            <Text style={styles.statValue}>{s.value}</Text>
          </View>
        ))}
      </View>

      <View style={styles.statsRow}>
        {requestCards.map((s) => (
          <View key={s.label} style={styles.statCard}>
            <View style={styles.statLabelRow}>
              <View style={[styles.statDot, { backgroundColor: s.color }]} />
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
            <Text style={styles.statValue}>{s.value}</Text>
          </View>
        ))}
      </View>

      <View style={isWide ? styles.columns : undefined}>
        <View style={styles.column}>
          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Requieren atención</Text>
              <Pressable onPress={() => router.push("/equipment")}>
                <Text style={styles.panelLink}>Ver equipos</Text>
              </Pressable>
            </View>

            {attention.length === 0 ? (
              <Text style={styles.panelEmpty}>No hay equipos fuera de servicio.</Text>
            ) : (
              attention.slice(0, 6).map((e) => (
                <Pressable
                  key={e.id}
                  style={styles.attentionRow}
                  onPress={() => router.push(`/equipment/${e.id}`)}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.attentionName} numberOfLines={1}>
                      {e.name}
                    </Text>
                    <Text style={styles.attentionMeta} numberOfLines={1}>
                      {e.code} · {e.location || "Sin ubicación"}
                    </Text>
                  </View>

                  <StatusBadge status={e.status} />
                </Pressable>
              ))
            )}
          </View>
        </View>

        <View style={styles.column}>
          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Solicitudes recientes</Text>
              <Pressable onPress={() => router.push("/requests")}>
                <Text style={styles.panelLink}>Ver todas</Text>
              </Pressable>
            </View>

            <RequestList items={recentRequests} />
          </View>

          <View style={styles.placeholderPanel}>
            <Text style={styles.panelTitle}>Plan de la semana</Text>
            <Text style={styles.placeholderText}>
              Los planes de mantenimiento preventivo y el calendario semanal llegan en una próxima
              entrega.
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    content: { padding: 24, paddingBottom: 48 },
    center: { flex: 1 },
    error: { color: c.destructive, marginBottom: 12 },
    pageHeader: { marginBottom: 20 },
    title: { fontSize: 22, fontWeight: "600", color: c.text },
    subtitle: { marginTop: 3, fontSize: 13.5, color: c.textSecondary },
    hero: {
      backgroundColor: c.bgStatCard,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 20,
      padding: 24,
      marginBottom: 20,
      overflow: "hidden",
    },
    heroBgImage: {
      position: "absolute",
      top: 0,
      right: 0,
    },
    heroBlob: {
      position: "absolute",
      top: -60,
      right: -35,
      width: 340,
      height: 340,
      opacity: 0.6,
    },
    heroText: { gap: 8, maxWidth: 460 },
    heroEyebrow: {
      fontFamily: "monospace",
      fontSize: 11,
      letterSpacing: 1.2,
      color: c.accent,
      fontWeight: "600",
    },
    heroValue: { fontSize: 30, fontWeight: "700", color: c.text, letterSpacing: -0.6, lineHeight: 36 },
    heroCopy: { fontSize: 13.5, color: c.textSecondary, lineHeight: 19 },
    heroActions: { flexDirection: "row", gap: 10, flexWrap: "wrap", marginTop: 8 },
    primaryButton: {
      backgroundColor: c.text,
      paddingHorizontal: 20,
      height: 42,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
    },
    primaryButtonText: { color: c.bg, fontWeight: "600", fontSize: 14 },
    ghostButton: {
      backgroundColor: c.heroSecondaryButtonBg,
      paddingHorizontal: 20,
      height: 42,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
    },
    ghostButtonText: { color: c.text, fontWeight: "600", fontSize: 14 },
    statsRow: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginBottom: 20 },
    statCard: {
      flexGrow: 1,
      minWidth: 150,
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      padding: 14,
    },
    statLabelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    statDot: { width: 8, height: 8, borderRadius: 4 },
    statLabel: { fontSize: 12.5, color: c.textSecondary, fontWeight: "500" },
    statValue: { marginTop: 6, fontSize: 28, fontWeight: "600", color: c.text },
    columns: { flexDirection: "row", gap: 16, alignItems: "flex-start" },
    column: { flex: 1, gap: 16, minWidth: 0 },
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
      marginBottom: 12,
    },
    panelTitle: { fontSize: 15.5, fontWeight: "600", color: c.text },
    panelLink: { fontSize: 13, fontWeight: "500", color: c.accent },
    panelEmpty: { fontSize: 13, color: c.textMuted, paddingVertical: 8 },
    attentionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 11,
      borderTopWidth: 1,
      borderTopColor: c.borderRow,
    },
    attentionName: { fontSize: 14, fontWeight: "600", color: c.text },
    attentionMeta: { fontSize: 12.5, color: c.textMuted, marginTop: 2 },
    placeholderPanel: {
      backgroundColor: c.bgNested,
      borderWidth: 1,
      borderColor: c.border,
      borderStyle: "dashed",
      borderRadius: 14,
      padding: 16,
      gap: 8,
    },
    placeholderText: { fontSize: 13, color: c.textMuted, lineHeight: 19 },
  });
}
