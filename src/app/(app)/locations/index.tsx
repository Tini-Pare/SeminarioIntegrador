import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { LocationModal } from "../../../components/LocationModal";
import { BREAKPOINT } from "../../../constants";
import { listLocations } from "../../../lib/queries/locations";
import { supabase } from "../../../lib/supabase";
import type { LocationWithCount } from "../../../lib/queries/locations";
import type { ThemeColors } from "../../../lib/theme";
import { useTheme } from "../../../lib/ThemeContext";

export default function LocationsScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [locations, setLocations] = useState<LocationWithCount[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<LocationWithCount | null>(null);
  const [creating, setCreating] = useState(false);
  const { width } = useWindowDimensions();
  const isMobile = width >= BREAKPOINT.mobile;
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const load = useCallback(async () => {
    setError(null);
    try {
      setLocations(await listLocations());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel(`locations-list-changes-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "lugares" }, load)
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

  if (loading) return <ActivityIndicator style={styles.center} />;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 20 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Ubicaciones</Text>
          <Text style={styles.subtitle}>
            Gestioná los sectores y pisos donde se ubican los equipos
          </Text>
        </View>

        <Pressable style={styles.addButton} onPress={() => setCreating(true)}>
          <Text style={styles.addButtonText}>+ Nueva ubicación</Text>
        </Pressable>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      {locations.length === 0 ? (
        <Text style={styles.empty}>Todavía no hay ubicaciones cargadas.</Text>
      ) : isMobile ? (
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.headerCell, { flex: 2 }]}>SECTOR</Text>
            <Text style={[styles.headerCell, { flex: 1.2 }]}>PISO</Text>
            <Text style={[styles.headerCell, { flex: 1 }]}>EQUIPOS</Text>
          </View>

          {locations.map((l) => (
            <Pressable key={l.lu_codigo} style={styles.row} onPress={() => setEditing(l)}>
              <View style={{ flex: 2, justifyContent: "center" }}>
                <Text style={styles.name} numberOfLines={1}>
                  {l.lu_nombre_sector}
                </Text>
              </View>

              <View style={{ flex: 1.2, justifyContent: "center" }}>
                <Text style={styles.floorText} numberOfLines={1}>
                  {l.lu_piso || "—"}
                </Text>
              </View>

              <View style={{ flex: 1, justifyContent: "center" }}>
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>{l.equipmentCount}</Text>
                </View>
              </View>
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={styles.cardList}>
          {locations.map((l) => (
            <Pressable key={l.lu_codigo} style={styles.locationCard} onPress={() => setEditing(l)}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {l.lu_nombre_sector}
                </Text>
                <Text style={styles.floorText} numberOfLines={1}>
                  {l.lu_piso || "Sin piso especificado"}
                </Text>
              </View>

              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>
                  {l.equipmentCount} equipo{l.equipmentCount === 1 ? "" : "s"}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}

      {editing && (
        <LocationModal
          visible={!!editing}
          onClose={() => setEditing(null)}
          onSaved={load}
          location={editing}
        />
      )}

      <LocationModal visible={creating} onClose={() => setCreating(false)} onSaved={load} />
    </ScrollView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { backgroundColor: c.bg },
    center: { flex: 1 },
    header: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 12,
      marginBottom: 20,
    },
    title: { fontSize: 22, fontWeight: "600", color: c.text },
    subtitle: { marginTop: 3, fontSize: 13.5, color: c.textSecondary },
    addButton: {
      backgroundColor: c.accent,
      paddingHorizontal: 18,
      height: 42,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    addButtonText: { color: "#fff", fontWeight: "600", fontSize: 14 },
    error: { color: c.destructive, marginBottom: 12 },
    empty: { color: c.textMuted, fontSize: 13.5, marginTop: 8 },
    table: {
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 14,
      overflow: "hidden",
      maxWidth: 700,
    },
    tableHeader: {
      flexDirection: "row",
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
    row: {
      flexDirection: "row",
      padding: 14,
      borderBottomWidth: 1,
      borderBottomColor: c.borderRow,
    },
    name: { fontWeight: "600", fontSize: 14, color: c.text },
    floorText: { fontSize: 13, color: c.textMuted, marginTop: 2 },
    cardList: { gap: 10 },
    locationCard: {
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 14,
      padding: 16,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    countBadge: {
      alignSelf: "flex-start",
      paddingHorizontal: 11,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: c.bgAreaChip,
    },
    countBadgeText: { fontSize: 12.5, fontWeight: "600", color: c.textLabel },
  });
}
