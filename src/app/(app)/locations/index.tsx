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
import { AddLocationModal } from "../../../components/AddLocationModal";
import { EditLocationModal } from "../../../components/EditLocationModal";
import { BREAKPOINT } from "../../../constants";
import { getProfile } from "../../../lib/auth";
import { listLocationsWithCounts } from "../../../lib/queries/locations";
import type { ThemeColors } from "../../../lib/theme";
import { useTheme } from "../../../lib/ThemeContext";
import type { Location, Profile } from "../../../types/database";

type LocationRow = Location & { equipmentCount: number };

export default function LocationsScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<LocationRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const { width } = useWindowDimensions();
  const isMobile = width >= BREAKPOINT.mobile;
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  useEffect(() => {
    getProfile().then(setProfile);
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      setLocations(await listLocationsWithCounts());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
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
          <Text style={styles.title}>Lugares</Text>
          <Text style={styles.subtitle}>Gestioná las ubicaciones donde están los equipos</Text>
        </View>

        {profile?.role === "admin" && (
          <Pressable style={styles.addButton} onPress={() => setAdding(true)}>
            <Text style={styles.addButtonText}>+ Agregar lugar</Text>
          </Pressable>
        )}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      {isMobile ? (
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.headerCell, { flex: 2.5 }]}>NOMBRE</Text>
            <Text style={[styles.headerCell, { flex: 1 }]}>EQUIPOS</Text>
          </View>

          {locations.map((l) => (
            <Pressable key={l.id} style={styles.row} onPress={() => setEditing(l)}>
              <View style={{ flex: 2.5, justifyContent: "center" }}>
                <Text style={styles.name} numberOfLines={1}>
                  {l.name}
                </Text>
              </View>

              <View style={{ flex: 1, justifyContent: "center" }}>
                <Text style={styles.countText}>{l.equipmentCount}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={styles.cardList}>
          {locations.map((l) => (
            <Pressable key={l.id} style={styles.locationCard} onPress={() => setEditing(l)}>
              <Text style={styles.name} numberOfLines={1}>
                {l.name}
              </Text>

              <View style={styles.countChip}>
                <Text style={styles.countChipText}>
                  {l.equipmentCount} {l.equipmentCount === 1 ? "equipo" : "equipos"}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}

      {editing && (
        <EditLocationModal
          visible={!!editing}
          onClose={() => setEditing(null)}
          onSaved={load}
          location={editing}
        />
      )}

      <AddLocationModal visible={adding} onClose={() => setAdding(false)} onCreated={load} />
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
    countText: { fontSize: 13.5, color: c.textLabel },
    cardList: { gap: 10 },
    locationCard: {
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 14,
      padding: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    },
    countChip: {
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: 999,
      backgroundColor: c.bgAreaChip,
    },
    countChipText: { fontSize: 12, color: c.textLabel, fontWeight: "500" },
  });
}
