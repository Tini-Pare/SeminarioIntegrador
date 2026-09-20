import { useCallback, useEffect, useState } from "react";
import {
  ScrollView,
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { getProfile } from "../../../lib/auth";
import { listMyRequests, listAllRequests } from "../../../lib/queries/faults";
import { listEquipment } from "../../../lib/queries/equipment";
import { listProfiles } from "../../../lib/queries/profiles";
import { Pagination } from "../../../components/Pagination";
import { ReportFaultModal } from "../../../components/ReportFaultModal";
import { RequestList } from "../../../components/RequestList";
import { supabase } from "../../../lib/supabase";
import type { ThemeColors } from "../../../lib/theme";
import { useTheme } from "../../../lib/ThemeContext";
import { usePagination } from "../../../lib/usePagination";
import type { Solicitud, Equipo } from "../../../types/database";

type Item = Solicitud & {
  equipment: Pick<Equipo, "code" | "name">;
  reporterName: string;
  technicianName: string | null;
};

type EquipmentOption = Pick<Equipo, "id" | "code" | "name">;

export default function RequestsScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [equipmentOptions, setEquipmentOptions] = useState<EquipmentOption[]>([]);
  const [reportOpen, setReportOpen] = useState(false);
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
      setEquipmentOptions(equipment.map(({ id, code, name }) => ({ id, code, name })));
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
      .on("postgres_changes", { event: "*", schema: "public", table: "solicitudes" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "orden_de_trabajo" }, load)
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

  const { pageItems, page, pageCount, setPage } = usePagination(items, isAdmin ? "admin" : "mine");

  if (loading) return <ActivityIndicator style={styles.center} />;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>{isAdmin ? "Solicitudes" : "Mis solicitudes"}</Text>
          <Text style={styles.subtitle}>
            {isAdmin
              ? "Todas las fallas reportadas en la organización"
              : "Seguimiento de las fallas que reportaste"}
          </Text>
        </View>

        <Pressable style={styles.reportButton} onPress={() => setReportOpen(true)}>
          <Text style={styles.reportButtonText}>+ Reportar falla</Text>
        </Pressable>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <RequestList items={pageItems} />

      <Pagination page={page} pageCount={pageCount} onPage={setPage} />

      <ReportFaultModal
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        onSubmitted={load}
        equipmentOptions={equipmentOptions}
      />
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
    headerText: { flexShrink: 1, minWidth: 0 },
    title: { fontSize: 22, fontWeight: "600", color: c.text },
    subtitle: { marginTop: 3, fontSize: 13.5, color: c.textSecondary },
    reportButton: {
      backgroundColor: c.accent,
      paddingHorizontal: 18,
      height: 42,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    reportButtonText: { color: "#fff", fontWeight: "600", fontSize: 14 },
    error: { color: c.destructive, marginBottom: 12 },
  });
}
