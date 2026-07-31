import { useCallback, useEffect, useState } from "react";
import {
  ScrollView,
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { getProfile } from "../../../lib/auth";
import { listMyRequests, listAllRequests } from "../../../lib/queries/faults";
import { listEquipment } from "../../../lib/queries/equipment";
import { listProfiles } from "../../../lib/queries/profiles";
import { RequestList } from "../../../components/RequestList";
import { supabase } from "../../../lib/supabase";
import type { ThemeColors } from "../../../lib/theme";
import { useTheme } from "../../../lib/ThemeContext";
import type { Fault, Equipment } from "../../../types/database";

type Item = Fault & {
  equipment: Pick<Equipment, "code" | "name">;
  reporterName: string;
  technicianName: string | null;
};

export default function RequestsScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const load = useCallback(async () => {
    setError(null);
    try {
      const profile = await getProfile();
      const admin = profile?.role === "admin";
      setIsAdmin(admin);
      const [faults, equipment, profiles] = await Promise.all([
        admin ? listAllRequests() : listMyRequests(),
        listEquipment(),
        listProfiles(),
      ]);
      const equipmentById = new Map(equipment.map((e) => [e.id, e]));
      const profileById = new Map(profiles.map((p) => [p.id, p]));
      setItems(
        faults.map((f) => ({
          ...f,
          equipment: equipmentById.get(f.equipment_id) ?? { code: "—", name: "Equipo desconocido" },
          reporterName: profileById.get(f.reported_by)?.name ?? "Desconocido",
          technicianName: f.technician_id ? (profileById.get(f.technician_id)?.name ?? null) : null,
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel(`requests-faults-changes-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "faults" }, load)
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
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{isAdmin ? "Solicitudes" : "Mis solicitudes"}</Text>
          <Text style={styles.subtitle}>
            {isAdmin
              ? "Todas las fallas reportadas en la organización"
              : "Seguimiento de las fallas que reportaste"}
          </Text>
        </View>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <RequestList items={items} />
    </ScrollView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { backgroundColor: c.bg },
    content: { padding: 20, maxWidth: 920 },
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
    error: { color: c.destructive, marginBottom: 12 },
  });
}
