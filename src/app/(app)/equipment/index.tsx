import { Stack, router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { AddEquipmentModal } from "../../../components/AddEquipmentModal";
import { EditEquipmentModal } from "../../../components/EditEquipmentModal";
import { ReportFaultModal } from "../../../components/ReportFaultModal";
import { Pagination } from "../../../components/Pagination";
import { RowActions } from "../../../components/RowActions";
import { StatusBadge } from "../../../components/StatusBadge";
import { LocationIcon } from "../../../components/icons";
import { BREAKPOINT } from "../../../constants";
import { getProfile } from "../../../lib/auth";
import { confirmDelete } from "../../../lib/confirm";
import { buildLocationColorMap } from "../../../lib/locationColor";
import { deleteEquipment, listEquipment } from "../../../lib/queries/equipment";
import { supabase } from "../../../lib/supabase";
import type { ThemeColors } from "../../../lib/theme";
import { useTheme } from "../../../lib/ThemeContext";
import { usePagination } from "../../../lib/usePagination";
import type { Equipo, Profile } from "../../../types/database";

type Filter = "all" | Equipo["status"];
type SortBy = "location" | "code";

const SORT_OPTIONS: { key: SortBy; label: string }[] = [
  { key: "location", label: "Ubicación" },
  { key: "code", label: "Código" },
];

const STATUS_FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "operational", label: "Funcionando" },
  { key: "waiting", label: "En espera" },
  { key: "repair", label: "En reparación" },
];

export default function EquipmentScreen() {
  const [equipment, setEquipment] = useState<Equipo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [editing, setEditing] = useState<Equipo | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("location");
  const [profile, setProfile] = useState<Profile | null>(null);
  const { width } = useWindowDimensions();
  const isWide = width >= BREAKPOINT.tablet;
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const isAdmin = profile?.role === "admin";
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
      .on("postgres_changes", { event: "*", schema: "public", table: "equipo" }, reload)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

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
    return [...filtered].sort(
      (a, b) => a.location.localeCompare(b.location) || a.code.localeCompare(b.code),
    );
  }, [equipment, search, filter, sortBy]);

  const locationColors = useMemo(
    () => buildLocationColorMap(equipment.map((e) => e.location)),
    [equipment],
  );

  const { pageItems, page, pageCount, setPage } = usePagination(
    equipmentView,
    `${search}|${filter}|${sortBy}`,
  );

  function handleDelete(e: Equipo) {
    confirmDelete(
      "Eliminar equipo",
      `¿Eliminar "${e.name}" (${e.code})? Esta acción no se puede deshacer.`,
      async () => {
        try {
          await deleteEquipment(e.id);
          reload();
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        }
      },
    );
  }

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
          <View style={styles.headerText}>
            <Text style={styles.title}>Equipos</Text>
            <Text style={styles.subtitle}>Estado en tiempo real de todos los equipos</Text>
          </View>

          <View style={styles.headerActions}>
            {isAdmin && (
              <Pressable style={styles.primaryButton} onPress={() => setAddModalVisible(true)}>
                <Text style={styles.primaryButtonText}>+ Nuevo equipo</Text>
              </Pressable>
            )}

            <Pressable style={styles.primaryButton} onPress={() => setModalVisible(true)}>
              <Text style={styles.primaryButtonText}>+ Reportar falla</Text>
            </Pressable>
          </View>
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

        <View style={styles.filterRow}>
          {STATUS_FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <Pressable
                key={f.key}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setFilter(f.key)}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {equipmentView.length === 0 ? (
          <Text style={styles.empty}>No hay equipos que coincidan con el filtro.</Text>
        ) : isWide ? (
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.headerCell, { flex: 1.6 }]}>EQUIPO</Text>
              <Text style={[styles.headerCell, { flex: 1.2 }]}>UBICACIÓN</Text>
              <Text style={[styles.headerCell, { flex: 1 }]}>ESTADO</Text>
              <Text style={[styles.headerCell, { flex: 1 }]}>TIPO</Text>
              {isAdmin && <Text style={[styles.headerCell, styles.actionsCol]}>ACCIONES</Text>}
            </View>

            {pageItems.map((e) => (
              <View key={e.id} style={styles.row}>
                <Pressable
                  style={styles.rowMain}
                  onPress={() => router.push(`/equipment/${e.id}`)}
                  accessibilityLabel={`Abrir ${e.name}`}
                >
                  <View style={{ flex: 1.6, justifyContent: "center", paddingRight: 12 }}>
                    <Text style={styles.name} numberOfLines={1}>
                      {e.name}
                    </Text>
                    <Text style={styles.code} numberOfLines={1}>
                      {e.code}
                    </Text>
                  </View>

                  <View style={styles.locationCell}>
                    <View
                      style={[
                        styles.locationDot,
                        { backgroundColor: locationColors.get(e.location) ?? "#6a7b62" },
                      ]}
                    />
                    <Text style={styles.locationText} numberOfLines={1}>
                      {e.location || "—"}
                    </Text>
                  </View>

                  <View style={{ flex: 1, justifyContent: "center", alignItems: "flex-start" }}>
                    <StatusBadge status={e.status} />
                  </View>

                  <View style={{ flex: 1, justifyContent: "center" }}>
                    <Text style={styles.typeText} numberOfLines={1}>
                      {e.type || "—"}
                    </Text>
                  </View>
                </Pressable>

                {isAdmin && (
                  <View style={styles.actionsCol}>
                    <RowActions onEdit={() => setEditing(e)} onDelete={() => handleDelete(e)} />
                  </View>
                )}
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.cardList}>
            {pageItems.map((e) => (
              <View key={e.id} style={styles.card}>
                <Pressable
                  onPress={() => router.push(`/equipment/${e.id}`)}
                  accessibilityLabel={`Abrir ${e.name}`}
                >
                  <View style={styles.cardTopRow}>
                    <Text style={styles.code}>{e.code}</Text>
                    <StatusBadge status={e.status} />
                  </View>

                  <Text style={styles.cardName}>{e.name}</Text>
                  <Text style={styles.typeText}>{e.type}</Text>

                  <View style={styles.cardLocationRow}>
                    <View
                      style={[
                        styles.locationDot,
                        { backgroundColor: locationColors.get(e.location) ?? "#6a7b62" },
                      ]}
                    />
                    <LocationIcon size={14} color={colors.textMuted} />
                    <Text style={styles.locationText}>{e.location}</Text>
                  </View>
                </Pressable>

                {isAdmin && (
                  <View style={styles.cardActions}>
                    <RowActions onEdit={() => setEditing(e)} onDelete={() => handleDelete(e)} />
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        <Pagination page={page} pageCount={pageCount} onPage={setPage} />

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

        {editing && (
          <EditEquipmentModal
            visible={!!editing}
            onClose={() => setEditing(null)}
            onSaved={reload}
            equipment={editing}
          />
        )}
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
    headerText: { flexShrink: 1, minWidth: 0 },
    title: { fontSize: 22, fontWeight: "600", color: c.text },
    subtitle: { marginTop: 3, fontSize: 13.5, color: c.textSecondary },
    headerActions: {
      flexDirection: "row",
      gap: 10,
      flexWrap: "wrap",
      flexShrink: 1,
      maxWidth: "100%",
    },
    primaryButton: {
      backgroundColor: c.accent,
      paddingHorizontal: 18,
      height: 42,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    primaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 14 },
    searchRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: 12,
      marginBottom: 14,
    },
    filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
    filterChip: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.bgCard,
    },
    filterChipActive: { backgroundColor: c.text, borderColor: c.text },
    filterChipText: { fontSize: 12.5, fontWeight: "600", color: c.textSecondary },
    filterChipTextActive: { color: c.bgCard },
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
    empty: { color: c.textMuted, fontSize: 13.5, marginTop: 8 },
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
      padding: 14,
      backgroundColor: c.bgTableHeader,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    headerCell: {
      fontSize: 11,
      letterSpacing: 0.6,
      textTransform: "uppercase",
      color: c.textMuted,
      fontFamily: "monospace",
    },
    actionsCol: { width: 76, flexShrink: 0, alignItems: "flex-start" },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.borderRow,
    },
    rowMain: { flex: 1, flexDirection: "row", alignItems: "center", minWidth: 0 },
    name: { fontWeight: "600", fontSize: 14, color: c.text },
    code: { fontFamily: "monospace", fontSize: 12, color: c.textMuted, marginTop: 2 },
    locationCell: {
      flex: 1.2,
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      paddingRight: 12,
    },
    locationDot: { width: 7, height: 7, borderRadius: 4 },
    locationText: { fontSize: 13, color: c.textLabel, flexShrink: 1 },
    typeText: { fontSize: 13, color: c.textLabel, marginTop: 2 },
    cardList: { gap: 12 },
    card: {
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 14,
      padding: 18,
    },
    cardTopRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 10,
    },
    cardName: { fontSize: 18, fontWeight: "600", color: c.text },
    cardLocationRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 13 },
    cardActions: {
      marginTop: 14,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: c.borderRow,
      flexDirection: "row",
      justifyContent: "flex-end",
    },
  });
}
