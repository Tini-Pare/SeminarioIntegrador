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

export default function DashboardScreen() {
  const [role, setRole] = useState<Profile["role"] | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [equipment, setEquipment] = useState<Equipo[]>([]);
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const isWide = width >= BREAKPOINT.tablet;
  const { colors } = useTheme();
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

      <View style={styles.hero}>
        <View style={styles.heroText}>
          <Text style={styles.heroEyebrow}>REQUIEREN ATENCIÓN</Text>
          <Text style={styles.heroValue}>
            {attention.length === 0
              ? "Todo en orden"
              : `${attention.length} ${attention.length === 1 ? "equipo" : "equipos"} fuera de servicio`}
          </Text>
          <Text style={styles.heroCopy}>
            {stats.waiting} en espera · {stats.repair} en reparación · {stats.reqNew} solicitudes
            sin asignar
          </Text>
        </View>

        <View style={styles.heroActions}>
          <Pressable style={styles.primaryButton} onPress={() => router.push("/equipment")}>
            <Text style={styles.primaryButtonText}>Ver equipos</Text>
          </Pressable>

          <Pressable style={styles.ghostButton} onPress={() => router.push("/requests")}>
            <Text style={styles.ghostButtonText}>Ver solicitudes</Text>
          </Pressable>
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
      borderRadius: 16,
      padding: 22,
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "flex-end",
      justifyContent: "space-between",
      gap: 18,
      marginBottom: 20,
    },
    heroText: { flexShrink: 1, minWidth: 220, gap: 8 },
    heroEyebrow: {
      fontFamily: "monospace",
      fontSize: 10.5,
      letterSpacing: 1.2,
      color: c.accent,
    },
    heroValue: { fontSize: 24, fontWeight: "600", color: c.text, letterSpacing: -0.5 },
    heroCopy: { fontSize: 13.5, color: c.textSecondary, lineHeight: 19 },
    heroActions: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
    primaryButton: {
      backgroundColor: c.accent,
      paddingHorizontal: 18,
      height: 42,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    primaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 14 },
    ghostButton: {
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.bgCard,
      paddingHorizontal: 18,
      height: 42,
      borderRadius: 10,
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
