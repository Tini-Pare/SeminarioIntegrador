import { useCallback, useEffect, useMemo, useState } from "react";
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
import { listMyRequests, listAllRequests, summarizeTechnicians } from "../../../lib/queries/faults";
import { listEquipment } from "../../../lib/queries/equipment";
import { listProfiles } from "../../../lib/queries/profiles";
import { Pagination } from "../../../components/Pagination";
import { ReportFaultModal } from "../../../components/ReportFaultModal";
import { RequestList } from "../../../components/RequestList";
import { SolicitudDetailModal } from "../../../components/SolicitudDetailModal";
import { TableFilterBar } from "../../../components/TableFilterBar";
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
  const [viewingItem, setViewingItem] = useState<Item | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");

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
          technicianName: summarizeTechnicians(f.tasks, profileById),
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

  const statusCounts = useMemo(() => {
    const counts = { new: 0, in_progress: 0, resolved: 0, rejected: 0 };
    items.forEach((item) => {
      if (item.status === "new") {
        counts.new++;
      } else if (item.status === "assigned" || item.status === "in_progress") {
        counts.in_progress++;
      } else if (item.status === "resolved") {
        counts.resolved++;
      } else if (item.status === "rejected") {
        counts.rejected++;
      }
    });
    return counts;
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchSearch =
        !q ||
        item.equipment.name.toLowerCase().includes(q) ||
        item.equipment.code.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q);

      let matchStatus = true;
      if (statusFilter === "new") {
        matchStatus = item.status === "new";
      } else if (statusFilter === "in_progress") {
        matchStatus = item.status === "in_progress" || item.status === "assigned";
      } else if (statusFilter === "resolved") {
        matchStatus = item.status === "resolved";
      } else if (statusFilter === "rejected") {
        matchStatus = item.status === "rejected";
      }

      const matchPriority = !priorityFilter || item.priority === priorityFilter;

      return matchSearch && matchStatus && matchPriority;
    });
  }, [items, search, statusFilter, priorityFilter]);

  const { pageItems, page, pageCount, setPage } = usePagination(
    filteredItems,
    `${isAdmin ? "admin" : "mine"}|${search}|${statusFilter}|${priorityFilter}`,
  );

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
          <Text style={styles.reportButtonText}>+ Nueva</Text>
        </Pressable>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <TableFilterBar
        searchValue={search}
        onSearch={setSearch}
        searchPlaceholder="Buscar por equipo, código o descripción…"
        filters={[
          {
            key: "estado",
            label: "Estado",
            value: statusFilter,
            onChange: setStatusFilter,
            options: [
              { value: "", label: "Todas" },
              { value: "new", label: `Nueva (${statusCounts.new})` },
              { value: "in_progress", label: `En proceso (${statusCounts.in_progress})` },
              { value: "resolved", label: `Resuelta (${statusCounts.resolved})` },
              { value: "rejected", label: `Rechazada (${statusCounts.rejected})` },
            ],
          },
          {
            key: "prioridad",
            label: "Prioridad",
            value: priorityFilter,
            onChange: setPriorityFilter,
            options: [
              { value: "", label: "Todas" },
              { value: "high", label: "Alta" },
              { value: "medium", label: "Media" },
              { value: "low", label: "Baja" },
            ],
          },
        ]}
        right={
          <Text style={styles.count}>
            {filteredItems.length} {filteredItems.length === 1 ? "solicitud" : "solicitudes"}
          </Text>
        }
      />

      <RequestList
        items={pageItems}
        onSelect={isAdmin ? setViewingItem : undefined}
        emptyMessage={
          items.length === 0
            ? "No hay solicitudes todavía. Reportá una falla con el botón de arriba."
            : "No hay solicitudes que coincidan con la búsqueda o filtros."
        }
      />

      <Pagination page={page} pageCount={pageCount} onPage={setPage} />

      <ReportFaultModal
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        onSubmitted={load}
        equipmentOptions={equipmentOptions}
      />

      {isAdmin && (
        <SolicitudDetailModal
          solicitud={viewingItem}
          onClose={() => setViewingItem(null)}
          onChanged={load}
        />
      )}
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
    count: { fontSize: 13, fontWeight: "500", color: c.textSecondary },
  });
}
