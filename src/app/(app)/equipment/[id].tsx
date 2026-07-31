import { Stack, router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { EditEquipmentModal } from "../../../components/EditEquipmentModal";
import { BackIcon, CheckIcon, WarningIcon } from "../../../components/icons";
import { ReportFaultModal } from "../../../components/ReportFaultModal";
import { getProfile } from "../../../lib/auth";
import {
  deleteEquipment,
  getEquipmentById,
  listFaultsByEquipment,
  listHistoryByEquipment,
} from "../../../lib/queries/equipment";
import { listProfiles } from "../../../lib/queries/profiles";
import { supabase } from "../../../lib/supabase";
import type { ThemeColors } from "../../../lib/theme";
import { useTheme } from "../../../lib/ThemeContext";
import type { Equipment, Fault, HistoryEntry, Profile } from "../../../types/database";

const URGENCY_LABEL: Record<Fault["urgency"], string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
};

const TABS = [
  { key: "info", label: "Información" },
  { key: "history", label: "Historial" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function EquipmentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [faults, setFaults] = useState<Fault[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [authorNames, setAuthorNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [tab, setTab] = useState<TabKey>("info");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const statusMeta: Record<Equipment["status"], { label: string; bg: string; fg: string; dot: string }> = {
    operational: { label: "Funcionando", ...colors.eqOperational },
    waiting: { label: "En espera", ...colors.eqWaiting },
    repair: { label: "En reparación", ...colors.eqRepair },
  };

  // Maps history type strings to theme palette (same colors as fault-status badges
  // so "En curso" in Historial reads the same everywhere).
  const historyTypeColor: Record<string, { dot: string; bg: string; fg: string }> = {
    Reporte: colors.histReporte,
    Asignada: colors.histAsignada,
    "En curso": colors.histEnCurso,
    Resuelta: colors.histResuelta,
    Preventivo: colors.histResuelta,
  };

  const loadEquipmentData = useCallback(async () => {
    if (!id) return;
    const [e, f, h, profiles] = await Promise.all([
      getEquipmentById(id),
      listFaultsByEquipment(id),
      listHistoryByEquipment(id),
      listProfiles(),
    ]);
    setEquipment(e);
    setFaults(f);
    setHistory(h);
    setAuthorNames(new Map(profiles.map((p) => [p.id, p.name])));
  }, [id]);

  useEffect(() => {
    loadEquipmentData().finally(() => setLoading(false));
    getProfile().then(setProfile);
  }, [loadEquipmentData]);

  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`equipment-detail-${id}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "equipment", filter: `id=eq.${id}` },
        loadEquipmentData,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "faults", filter: `equipment_id=eq.${id}` },
        loadEquipmentData,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, loadEquipmentData]);

  async function doDelete() {
    if (!id) return;
    setDeleting(true);
    try {
      await deleteEquipment(id);
      router.replace("/equipment");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (Platform.OS === "web") window.alert(message);
      else Alert.alert("No se pudo eliminar", message);
    } finally {
      setDeleting(false);
    }
  }

  function handleDelete() {
    if (!equipment) return;
    const message = `¿Eliminar ${equipment.code} · ${equipment.name}? Esta acción no se puede deshacer.`;
    if (Platform.OS === "web") {
      if (window.confirm(message)) doDelete();
      return;
    }
    Alert.alert("Eliminar equipo", message, [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: doDelete },
    ]);
  }

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator style={styles.center} />
      </>
    );
  }
  if (!equipment) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={styles.error}>Equipo no encontrado</Text>
      </>
    );
  }

  const sm = statusMeta[equipment.status];

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.topBar}>
          <Pressable style={styles.backLink} onPress={() => router.back()}>
            <BackIcon />
            <Text style={styles.backText}>Volver a equipos</Text>
          </Pressable>

          <View style={styles.topBarActions}>
            {profile?.role === "admin" && (
              <>
                <Pressable style={styles.editButton} onPress={() => setEditModalVisible(true)}>
                  <Text style={styles.editButtonText}>Editar equipo</Text>
                </Pressable>

                <Pressable style={styles.deleteButton} onPress={handleDelete} disabled={deleting}>
                  <Text style={styles.deleteButtonText}>
                    {deleting ? "Eliminando…" : "Eliminar equipo"}
                  </Text>
                </Pressable>
              </>
            )}

            <Pressable style={styles.reportButton} onPress={() => setModalVisible(true)}>
              <Text style={styles.reportButtonText}>+ Reportar falla</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.badgeRow}>
            <Text style={styles.code}>{equipment.code}</Text>
            <View style={[styles.badge, { backgroundColor: sm.bg }]}>
              <View style={[styles.badgeDot, { backgroundColor: sm.dot }]} />
              <Text style={[styles.badgeText, { color: sm.fg }]}>{sm.label}</Text>
            </View>
          </View>

          <Text style={styles.title}>{equipment.name}</Text>
          <Text style={styles.subtitle}>{equipment.type}</Text>

          <View style={styles.metaGrid}>
            <MetaCell label="Ubicación" value={equipment.location} />
            <MetaCell label="Tipo" value={equipment.type} />
          </View>
        </View>

        <View style={styles.tabsRow}>
          {TABS.map((t) => (
            <Pressable key={t.key} style={styles.tabItem} onPress={() => setTab(t.key)}>
              <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
              {tab === t.key && <View style={styles.tabUnderline} />}
            </Pressable>
          ))}
        </View>

        {tab === "info" && (
          <View>
            <Text style={styles.sectionTitle}>Fallas activas</Text>
            {faults.length === 0 ? (
              <View style={[styles.emptyRow, { backgroundColor: colors.eqOperational.bg, borderColor: colors.eqOperational.bg }]}>
                <View style={[styles.emptyIconWrap, { backgroundColor: colors.eqOperational.bg }]}>
                  <CheckIcon size={16} color={colors.eqOperational.fg} />
                </View>
                <Text style={[styles.emptyText, { color: colors.eqOperational.fg }]}>
                  Sin fallas activas. El equipo opera con normalidad.
                </Text>
              </View>
            ) : (
              faults.map((f) => (
                <View key={f.id} style={styles.faultCard}>
                  {f.photo_url ? (
                    <Image source={{ uri: f.photo_url }} style={styles.faultPhoto} />
                  ) : (
                    <View style={[styles.faultIconWrap, { backgroundColor: colors.eqRepair.bg }]}>
                      <WarningIcon size={16} color={colors.eqRepair.fg} />
                    </View>
                  )}

                  <View style={{ flex: 1 }}>
                    <Text style={styles.faultText}>{f.description}</Text>
                    <Text style={styles.faultMeta}>
                      Reportado {new Date(f.created_at).toLocaleDateString("es-AR")} · Urgencia{" "}
                      {URGENCY_LABEL[f.urgency]}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {tab === "history" && (
          <View style={styles.timeline}>
            {history.length === 0 && (
              <Text style={styles.emptyMuted}>Sin eventos registrados.</Text>
            )}
            {history.map((h, i) => {
              const c = historyTypeColor[h.type] ?? historyTypeColor.Reporte;
              return (
                <View key={h.id} style={styles.timelineRow}>
                  {i < history.length - 1 && <View style={styles.timelineLine} />}

                  <View style={styles.timelineRail}>
                    <View style={[styles.timelineDot, { backgroundColor: c.dot }]} />
                  </View>

                  <View style={styles.timelineCard}>
                    <View style={styles.timelineHeader}>
                      <View style={[styles.tag, { backgroundColor: c.bg }]}>
                        <Text style={[styles.tagText, { color: c.fg }]}>{h.type}</Text>
                      </View>

                      <Text style={styles.timelineDate}>
                        {new Date(h.created_at).toLocaleDateString("es-AR")}
                      </Text>
                    </View>

                    <Text style={styles.timelineNote}>{h.note}</Text>

                    <Text style={styles.timelineAuthor}>
                      {authorNames.get(h.author_id) ?? "Desconocido"}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <ReportFaultModal
          visible={modalVisible}
          onClose={() => setModalVisible(false)}
          onSubmitted={loadEquipmentData}
          equipment={{ id: equipment.id, code: equipment.code, name: equipment.name }}
        />

        <EditEquipmentModal
          visible={editModalVisible}
          onClose={() => setEditModalVisible(false)}
          onSaved={loadEquipmentData}
          equipment={equipment}
        />
      </ScrollView>
    </>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexGrow: 1, minWidth: 150, backgroundColor: colors.bgNested, padding: 14 }}>
      <Text style={{ fontSize: 11.5, color: colors.textMuted, fontWeight: "500" }}>{label}</Text>
      <Text style={{ marginTop: 4, fontSize: 14, fontWeight: "600", color: colors.text }}>{value}</Text>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { backgroundColor: c.bg },
    content: { padding: 20, maxWidth: 900 },
    center: { flex: 1 },
    error: { padding: 16, color: c.destructive },
    topBar: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 18,
      flexWrap: "wrap",
      gap: 12,
    },
    backLink: { flexDirection: "row", alignItems: "center", gap: 7 },
    backText: { color: c.textLabel, fontSize: 13.5 },
    reportButton: {
      backgroundColor: c.accent,
      paddingHorizontal: 14,
      height: 38,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    reportButtonText: { color: "#fff", fontWeight: "600", fontSize: 13 },
    topBarActions: {
      flexDirection: "row",
      gap: 10,
      flexWrap: "wrap",
      flexShrink: 1,
      maxWidth: "100%",
    },
    deleteButton: {
      borderWidth: 1,
      borderColor: c.destructive,
      paddingHorizontal: 14,
      height: 38,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    deleteButtonText: { color: c.destructive, fontWeight: "600", fontSize: 13 },
    editButton: {
      borderWidth: 1,
      borderColor: c.accent,
      paddingHorizontal: 14,
      height: 38,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    editButtonText: { color: c.accent, fontWeight: "600", fontSize: 13 },
    card: {
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 16,
      padding: 24,
    },
    badgeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      flexWrap: "wrap",
      marginBottom: 8,
    },
    code: { fontFamily: "monospace", fontSize: 13, color: c.textMuted },
    badge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 11,
      paddingVertical: 4,
      borderRadius: 999,
    },
    badgeDot: { width: 7, height: 7, borderRadius: 4 },
    badgeText: { fontSize: 12, fontWeight: "600" },
    title: { fontSize: 26, fontWeight: "600", color: c.text },
    subtitle: { fontSize: 14, color: c.textSecondary, marginTop: 4 },
    metaGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      marginTop: 22,
      gap: 1,
      backgroundColor: c.bgMetaGrid,
      borderWidth: 1,
      borderColor: c.bgMetaGrid,
      borderRadius: 12,
      overflow: "hidden",
    },
    tabsRow: {
      flexDirection: "row",
      gap: 4,
      marginTop: 22,
      marginBottom: 18,
      borderBottomWidth: 1,
      borderBottomColor: c.borderBottom,
    },
    tabItem: { paddingVertical: 11, paddingHorizontal: 4, marginRight: 20 },
    tabText: { fontSize: 14, fontWeight: "600", color: c.textMuted },
    tabTextActive: { color: c.accent },
    tabUnderline: { height: 2.5, backgroundColor: c.accent, marginTop: 9, borderRadius: 2 },
    sectionTitle: { fontSize: 16, fontWeight: "600", marginBottom: 12, color: c.text },
    emptyRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderWidth: 1,
      borderRadius: 12,
      padding: 16,
    },
    emptyIconWrap: {
      width: 30,
      height: 30,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyText: { fontSize: 14, fontWeight: "500", flex: 1 },
    emptyMuted: { color: c.textMuted, fontSize: 13.5 },
    faultCard: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
      backgroundColor: c.eqRepair.bg,
      borderWidth: 1,
      borderColor: c.eqRepair.bg,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
    },
    faultIconWrap: {
      width: 30,
      height: 30,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
    },
    faultPhoto: { width: 30, height: 30, borderRadius: 8, backgroundColor: c.bgNested },
    faultText: { fontWeight: "600", fontSize: 14, color: c.text },
    faultMeta: { fontSize: 12.5, color: c.eqRepair.fg, marginTop: 2 },
    timeline: { paddingLeft: 4 },
    // position:"relative" + paddingBottom separates the cards. The line is a
    // position:"absolute" child of the ROW (not the rail) so it can cross that
    // padding and reach the next dot, instead of stopping at the card's edge.
    timelineRow: { position: "relative", flexDirection: "row", gap: 16, paddingBottom: 20 },
    // bottom:-18 because the next dot is also shifted 18px down within ITS OWN
    // row (timelineRail.marginTop) — without this the line stops short of the next dot.
    timelineLine: {
      position: "absolute",
      top: 26,
      bottom: -18,
      left: 5.5,
      width: 2,
      backgroundColor: c.borderBottom,
    },
    timelineRail: { alignItems: "center", width: 13, marginTop: 18 },
    timelineDot: { width: 8, height: 8, borderRadius: 4 },
    timelineCard: {
      flex: 1,
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      padding: 14,
    },
    timelineHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    tag: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 6 },
    tagText: { fontSize: 11.5, fontWeight: "600" },
    timelineDate: { fontSize: 12, color: c.textMuted, fontFamily: "monospace" },
    timelineNote: { marginTop: 9, fontSize: 14, color: c.textSecondary, lineHeight: 20 },
    timelineAuthor: { marginTop: 6, fontSize: 12, color: c.textMuted },
  });
}
