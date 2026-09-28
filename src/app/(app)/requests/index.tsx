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
import { RequestDetailModal } from "../../../components/RequestDetailModal";
import { RequestList, type RequestListItem } from "../../../components/RequestList";
import { TableFilterBar } from "../../../components/TableFilterBar";
import { supabase } from "../../../lib/supabase";
import type { ThemeColors } from "../../../lib/theme";
import { useTheme } from "../../../lib/ThemeContext";
import { usePagination } from "../../../lib/usePagination";
import type { Profile, Equipo } from "../../../types/database";

type Item = RequestListItem;

export default function RequestsScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [equipmentOptions, setEquipmentOptions] = useState<Equipo[]>([]);
  const [reportOpen, setReportOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [urgencyFilter, setUrgencyFilter] = useState("all");
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const load = useCallback(async () => {
    setError(null);
    try {
      const profile = await getProfile();
      if (!profile) {
        throw new Error("No se pudo obtener el perfil del usuario actual.");
      }

      const admin = profile.role === "admin";
      setProfile(profile);
      const [faults, equipment, profiles] = await Promise.all([
        admin ? listAllRequests() : listMyRequests(),
        listEquipment(),
        listProfiles(),
      ]);
      setEquipmentOptions(equipment);
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
      if (e instanceof Error && e.message === "No se pudo obtener el perfil del usuario actual.") {
        setError(e.message);
      } else {
        setError("No pudimos cargar las solicitudes. Intentá nuevamente.");
      }
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    if (!successMessage) return;
    const timer = setTimeout(() => setSuccessMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [successMessage]);

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

  async function handleSubmitted() {
    await load();
    setSuccessMessage("Solicitud registrada con éxito");
  }

  const isAdmin = profile?.role === "admin";
  const canCreateRequest = profile?.role === "user";
  const normalizedSearch = search.trim().toLocaleLowerCase("es");
  const filteredItems = items.filter((item) => {
    const matchesSearch =
      !normalizedSearch ||
      item.equipment.code.toLocaleLowerCase("es").includes(normalizedSearch) ||
      item.equipment.name.toLocaleLowerCase("es").includes(normalizedSearch) ||
      (item.equipment.location ?? "").toLocaleLowerCase("es").includes(normalizedSearch) ||
      item.description.toLocaleLowerCase("es").includes(normalizedSearch) ||
      String(item.id).includes(normalizedSearch);
    const matchesStatus = statusFilter === "all" || item.status === statusFilter;
    const matchesUrgency = urgencyFilter === "all" || item.urgency === urgencyFilter;
    return matchesSearch && matchesStatus && matchesUrgency;
  });
  const filterKey = `${isAdmin ? "admin" : "mine"}:${search}:${statusFilter}:${urgencyFilter}`;
  const { pageItems, page, pageCount, setPage } = usePagination(filteredItems, filterKey);
  const selectedRequest = items.find((item) => item.id === selectedRequestId) ?? null;
  const hasActiveFilters =
    Boolean(normalizedSearch) || statusFilter !== "all" || urgencyFilter !== "all";

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

        {canCreateRequest && (
          <Pressable style={styles.reportButton} onPress={() => setReportOpen(true)}>
            <Text style={styles.reportButtonText}>+ Nuevo</Text>
          </Pressable>
        )}
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.error}>{error}</Text>

          <Pressable style={styles.retryButton} onPress={load}>
            <Text style={styles.retryText}>Reintentar</Text>
          </Pressable>
        </View>
      )}

      {successMessage && <Text style={styles.success}>{successMessage}</Text>}

      <TableFilterBar
        searchValue={search}
        onSearch={setSearch}
        searchPlaceholder="Buscar por solicitud, equipo o descripción…"
        filters={[
          {
            key: "status",
            label: "Estado",
            value: statusFilter,
            onChange: setStatusFilter,
            options: [
              { value: "all", label: "Todos" },
              { value: "new", label: "Pendiente" },
              { value: "assigned", label: "Asignada" },
              { value: "in_progress", label: "En curso" },
              { value: "resolved", label: "Resuelta" },
            ],
          },
          {
            key: "urgency",
            label: "Urgencia",
            value: urgencyFilter,
            onChange: setUrgencyFilter,
            options: [
              { value: "all", label: "Todas" },
              { value: "low", label: "Baja" },
              { value: "medium", label: "Media" },
              { value: "high", label: "Alta" },
            ],
          },
        ]}
      />

      {(!error || items.length > 0) && (
        <RequestList
          items={pageItems}
          onOpen={(item) => setSelectedRequestId(item.id)}
          emptyMessage={
            hasActiveFilters
              ? "No hay solicitudes que coincidan con la búsqueda o los filtros."
              : isAdmin
                ? "No hay solicitudes registradas todavía."
                : "No hay solicitudes todavía. Reportá una falla con el botón de arriba."
          }
        />
      )}

      <Pagination page={page} pageCount={pageCount} onPage={setPage} />

      <RequestDetailModal item={selectedRequest} onClose={() => setSelectedRequestId(null)} />

      <ReportFaultModal
        visible={canCreateRequest && reportOpen}
        onClose={() => setReportOpen(false)}
        onSubmitted={handleSubmitted}
        equipmentOptions={equipmentOptions}
        reporterName={profile?.name ?? null}
        role={profile?.role ?? null}
      />
    </ScrollView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { backgroundColor: c.bg },
    content: { width: "100%", padding: 20, maxWidth: 980 },
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
    errorBanner: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      marginBottom: 14,
      padding: 12,
      borderWidth: 1,
      borderColor: c.destructive,
      borderRadius: 10,
      backgroundColor: c.bgCard,
    },
    error: { flex: 1, color: c.destructive, fontSize: 13 },
    retryButton: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 8,
      backgroundColor: c.destructive,
    },
    retryText: { color: "#fff", fontSize: 12.5, fontWeight: "600" },
    success: { color: c.success, fontWeight: "600", marginBottom: 12 },
  });
}
