import { Stack, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AddEquipmentModal } from "../../../components/AddEquipmentModal";
import { EquipmentCard } from "../../../components/EquipmentCard";
import { ReportFaultModal } from "../../../components/ReportFaultModal";
import { getProfile } from "../../../lib/auth";
import { buildLocationColorMap } from "../../../lib/locationColor";
import { listEquipment } from "../../../lib/queries/equipment";
import { supabase } from "../../../lib/supabase";
import type { ThemeColors } from "../../../lib/theme";
import { useTheme } from "../../../lib/ThemeContext";
import type { Equipment, Profile } from "../../../types/database";

type Filter = "all" | Equipment["status"];
type SortBy = "location" | "code";

const SORT_OPTIONS: { key: SortBy; label: string }[] = [
  { key: "location", label: "Ubicación" },
  { key: "code", label: "Código" },
];

export default function EquipmentScreen() {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("location");
  const [profile, setProfile] = useState<Profile | null>(null);
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const hasLoadedOnce = useRef(false);

  function reload() {
    if (!hasLoadedOnce.current) setLoading(true);
    listEquipment()
      .then((data) => {
        setEquipment(data);
        hasLoadedOnce.current = true;
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    getProfile().then(setProfile);
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, []),
  );

  useEffect(() => {
    const channel = supabase
      .channel(`equipment-list-changes-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "equipment" }, reload)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const stats = useMemo(
    () => [
      {
        key: "all" as Filter,
        label: "Equipos totales",
        value: equipment.length,
        color: colors.textMuted,
      },
      {
        key: "operational" as Filter,
        label: "Funcionando",
        value: equipment.filter((e) => e.status === "operational").length,
        color: colors.eqOperational.dot,
      },
      {
        key: "waiting" as Filter,
        label: "En espera",
        value: equipment.filter((e) => e.status === "waiting").length,
        color: colors.eqWaiting.dot,
      },
      {
        key: "repair" as Filter,
        label: "En reparación",
        value: equipment.filter((e) => e.status === "repair").length,
        color: colors.eqRepair.dot,
      },
    ],
    [equipment, colors],
  );

  const equipmentView = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = equipment.filter((e) => {
      const matchQ = !q || `${e.name} ${e.code} ${e.location}`.toLowerCase().includes(q);
      const matchF = filter === "all" || e.status === filter;
      return matchQ && matchF;
    });
    if (sortBy === "code") {
      return [...filtered].sort((a, b) => a.code.localeCompare(b.code));
    }
    return filtered;
  }, [equipment, search, filter, sortBy]);

  const groupedByLocation = useMemo(() => {
    if (sortBy !== "location") return null;
    const groups: { location: string; items: Equipment[] }[] = [];
    for (const item of equipmentView) {
      const last = groups[groups.length - 1];
      if (last && last.location === item.location) last.items.push(item);
      else groups.push({ location: item.location, items: [item] });
    }
    return groups;
  }, [equipmentView, sortBy]);

  const locationColors = useMemo(
    () => buildLocationColorMap(equipment.map((e) => e.location)),
    [equipment],
  );

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator style={styles.center} />
      </>
    );
  }
  if (error) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={styles.error}>{error}</Text>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.pageHeader}>
          <View>
            <Text style={styles.title}>Equipos</Text>
            <Text style={styles.subtitle}>Estado en tiempo real de todos los equipos</Text>
          </View>

          <View style={styles.headerActions}>
            {profile?.role === "admin" && (
              <Pressable style={styles.addButton} onPress={() => setAddModalVisible(true)}>
                <Text style={styles.addButtonText}>+ Agregar equipo</Text>
              </Pressable>
            )}

            <Pressable style={styles.reportButton} onPress={() => setModalVisible(true)}>
              <Text style={styles.reportButtonText}>+ Reportar falla</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.statsRow}>
          {stats.map((s) => {
            const active = filter === s.key;
            return (
              <Pressable
                key={s.key}
                style={[
                  styles.statCard,
                  active && { borderColor: s.color, backgroundColor: colors.bgToggleActive },
                ]}
                onPress={() => setFilter(active ? "all" : s.key)}
              >
                <View style={styles.statLabelRow}>
                  <View style={[styles.statDot, { backgroundColor: s.color }]} />
                  <Text style={styles.statLabel}>{s.label}</Text>
                </View>
                <Text style={styles.statValue}>{s.value}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.searchRow}>
          <TextInput
            style={styles.search}
            placeholder="Buscar por nombre, código o ubicación…"
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />

          <View style={styles.sortToggle}>
            {SORT_OPTIONS.map((s) => (
              <Pressable
                key={s.key}
                style={[styles.sortOption, sortBy === s.key && styles.sortOptionActive]}
                onPress={() => setSortBy(s.key)}
              >
                <Text
                  style={[styles.sortOptionText, sortBy === s.key && styles.sortOptionTextActive]}
                >
                  {s.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {groupedByLocation ? (
          groupedByLocation.map((group) => (
            <View key={group.location} style={styles.locationGroup}>
              <View style={styles.locationHeader}>
                <View
                  style={[
                    styles.locationHeaderDot,
                    { backgroundColor: locationColors.get(group.location) ?? "#6b7280" },
                  ]}
                />
                <Text style={styles.locationHeaderText}>{group.location}</Text>
                <Text style={styles.locationHeaderCount}>
                  {group.items.length} {group.items.length === 1 ? "equipo" : "equipos"}
                </Text>
              </View>

              <View style={styles.grid}>
                {group.items.map((item) => (
                  <View key={item.id} style={styles.gridItem}>
                    <EquipmentCard
                      equipment={item}
                      locationColor={locationColors.get(item.location) ?? "#6b7280"}
                    />
                  </View>
                ))}
              </View>
            </View>
          ))
        ) : (
          <View style={styles.grid}>
            {equipmentView.map((item) => (
              <View key={item.id} style={styles.gridItem}>
                <EquipmentCard
                  equipment={item}
                  locationColor={locationColors.get(item.location) ?? "#6b7280"}
                />
              </View>
            ))}
          </View>
        )}

        <ReportFaultModal
          visible={modalVisible}
          onClose={() => setModalVisible(false)}
          onSubmitted={() => {}}
          equipmentOptions={equipment.map(({ id, code, name }) => ({ id, code, name }))}
        />

        <AddEquipmentModal
          visible={addModalVisible}
          onClose={() => setAddModalVisible(false)}
          onCreated={reload}
        />
      </ScrollView>
    </>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    content: { padding: 24, paddingBottom: 48 },
    center: { flex: 1 },
    error: { padding: 16, color: c.destructive },
    pageHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 20,
      gap: 12,
      flexWrap: "wrap",
    },
    title: { fontSize: 22, fontWeight: "600", color: c.text },
    subtitle: { marginTop: 3, fontSize: 13.5, color: c.textSecondary },
    headerActions: {
      flexDirection: "row",
      gap: 10,
      flexWrap: "wrap",
      flexShrink: 1,
      maxWidth: "100%",
    },
    reportButton: {
      backgroundColor: c.accent,
      paddingHorizontal: 18,
      height: 42,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    reportButtonText: { color: "#fff", fontWeight: "600", fontSize: 14 },
    addButton: {
      borderWidth: 1,
      borderColor: c.accent,
      paddingHorizontal: 18,
      height: 42,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    addButtonText: { color: c.accent, fontWeight: "600", fontSize: 14 },
    statsRow: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginBottom: 20 },
    statCard: {
      flexGrow: 1,
      minWidth: 150,
      backgroundColor: c.bgStatCard,
      borderWidth: 1.5,
      borderColor: c.border,
      borderRadius: 12,
      padding: 14,
    },
    statLabelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    statDot: { width: 8, height: 8, borderRadius: 4 },
    statLabel: { fontSize: 12.5, color: c.textSecondary, fontWeight: "500" },
    statValue: { marginTop: 6, fontSize: 28, fontWeight: "600", color: c.text },
    searchRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: 12,
      marginBottom: 20,
    },
    search: {
      flexGrow: 1,
      minWidth: 220,
      maxWidth: 340,
      height: 42,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: c.borderInput,
      borderRadius: 10,
      backgroundColor: c.bgInput,
      fontSize: 14,
      color: c.text,
    },
    sortToggle: {
      flexDirection: "row",
      backgroundColor: c.bgToggle,
      borderRadius: 9,
      padding: 3,
      gap: 2,
    },
    sortOption: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 7 },
    sortOptionActive: { backgroundColor: c.bgToggleActive },
    sortOptionText: { fontSize: 12.5, fontWeight: "600", color: c.textMuted },
    sortOptionTextActive: { color: c.text },
    locationGroup: { marginBottom: 24 },
    locationHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
    locationHeaderDot: { width: 9, height: 9, borderRadius: 5 },
    locationHeaderText: { fontSize: 14.5, fontWeight: "700", color: c.text },
    locationHeaderCount: { fontSize: 12.5, color: c.textMuted },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
    gridItem: { flexGrow: 1, minWidth: 310, maxWidth: 420 },
  });
}
