import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ScrollView,
  View,
  Text,
  Image,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { getProfile } from "../../../lib/auth";
import { listWorkQueue, assignToMe, advanceStatus } from "../../../lib/queries/faults";
import { listEquipment } from "../../../lib/queries/equipment";
import { listProfiles } from "../../../lib/queries/profiles";
import { supabase } from "../../../lib/supabase";
import { buildLocationColorMap } from "../../../lib/locationColor";
import { LocationIcon, WarningIcon } from "../../../components/icons";
import type { Fault, Equipment } from "../../../types/database";

type Item = Fault & {
  equipment: Pick<Equipment, "code" | "name" | "location">;
  reporterName: string;
};

type Scope = "all" | "mine" | "unassigned";
type UrgencyFilter = "all" | Fault["urgency"];

const STATUS_LABELS: Record<Fault["status"], string> = {
  new: "Nueva",
  assigned: "Asignada",
  in_progress: "En curso",
  resolved: "Resuelta",
};
// Same palette as RequestList.tsx — deliberately distinct from
// equipment.status (green/orange/red) so a fault's color is never
// mistaken for the equipment's status.
const STATUS_COLORS: Record<Fault["status"], { bg: string; fg: string }> = {
  new: { bg: "#e2dcf3", fg: "#5b3eb8" },
  assigned: { bg: "#dde3f8", fg: "#2f53e0" },
  in_progress: { bg: "#d7f0ec", fg: "#0f766e" },
  resolved: { bg: "#d2ecdb", fg: "#1e7f47" },
};
const STATUS_ORDER: Record<Fault["status"], number> = {
  new: 0,
  assigned: 1,
  in_progress: 2,
  resolved: 3,
};
const URGENCY_LABELS: Record<Fault["urgency"], string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
};
const URGENCY_COLORS: Record<Fault["urgency"], { bg: string; fg: string }> = {
  low: { bg: "#ecEae4", fg: "#4b5563" },
  medium: { bg: "#f7ecd6", fg: "#9a6512" },
  high: { bg: "#f8e3e3", fg: "#b23636" },
};
const SCOPE_OPTIONS: { key: Scope; label: string }[] = [
  { key: "mine", label: "Mías" },
  { key: "unassigned", label: "Sin asignar" },
  { key: "all", label: "Todas" },
];
const URGENCY_OPTIONS: UrgencyFilter[] = ["all", "high", "medium", "low"];

export default function QueueScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>("all");
  const [urgencyFilter, setUrgencyFilter] = useState<UrgencyFilter>("all");

  const load = useCallback(async () => {
    setError(null);
    try {
      const profile = await getProfile();
      setUserId(profile?.id ?? null);
      const [faults, equipment, profiles] = await Promise.all([
        listWorkQueue(),
        listEquipment(),
        listProfiles(),
      ]);
      const equipmentById = new Map(equipment.map((e) => [e.id, e]));
      const profileById = new Map(profiles.map((p) => [p.id, p]));
      setItems(
        faults
          .map((f) => ({
            ...f,
            equipment: equipmentById.get(f.equipment_id) ?? {
              code: "—",
              name: "Equipo desconocido",
              location: "",
            },
            reporterName: profileById.get(f.reported_by)?.name ?? "Desconocido",
          }))
          .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]),
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
      .channel(`queue-faults-changes-${Math.random().toString(36).slice(2)}`)
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

  async function handleAction(item: Item) {
    setActingOn(item.id);
    try {
      if (item.status === "new") await assignToMe(item.id);
      else if (item.status === "assigned") await advanceStatus(item.id, "in_progress");
      else if (item.status === "in_progress") await advanceStatus(item.id, "resolved");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActingOn(null);
    }
  }

  function actionLabel(item: Item): string | null {
    if (item.status === "new") return "Asignarme";
    if (item.status === "assigned" && item.technician_id === userId) return "Iniciar trabajo";
    if (item.status === "in_progress" && item.technician_id === userId) return "Marcar resuelta";
    return null;
  }

  const locationColors = useMemo(
    () => buildLocationColorMap(items.map((i) => i.equipment.location)),
    [items],
  );

  const visibleItems = useMemo(() => {
    return items.filter((item) => {
      const matchScope =
        scope === "all" ||
        (scope === "mine" && item.technician_id === userId) ||
        (scope === "unassigned" && item.status === "new");
      const matchUrgency = urgencyFilter === "all" || item.urgency === urgencyFilter;
      return matchScope && matchUrgency;
    });
  }, [items, scope, urgencyFilter, userId]);

  if (loading) return <ActivityIndicator style={styles.center} />;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Cola de trabajo</Text>
          <Text style={styles.subtitle}>Órdenes asignadas y fallas sin asignar</Text>
        </View>
      </View>
      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.filtersRow}>
        <View style={styles.scopeToggle}>
          {SCOPE_OPTIONS.map((o) => (
            <Pressable
              key={o.key}
              style={[styles.scopeOption, scope === o.key && styles.scopeOptionActive]}
              onPress={() => setScope(o.key)}
            >
              <Text style={[styles.scopeText, scope === o.key && styles.scopeTextActive]}>
                {o.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.urgencyChips}>
          {URGENCY_OPTIONS.map((u) => {
            const active = urgencyFilter === u;
            const meta = u === "all" ? null : URGENCY_COLORS[u];
            return (
              <Pressable
                key={u}
                style={[
                  styles.urgencyChip,
                  active && {
                    backgroundColor: meta?.bg ?? "#e2ddd3",
                    borderColor: meta?.fg ?? "#8a8d95",
                  },
                ]}
                onPress={() => setUrgencyFilter(u)}
              >
                <Text
                  style={[
                    styles.urgencyChipText,
                    active && { color: meta?.fg ?? "#4b4e56", fontWeight: "700" },
                  ]}
                >
                  {u === "all" ? "Toda urgencia" : URGENCY_LABELS[u]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {visibleItems.length === 0 ? (
        <Text style={styles.empty}>
          {items.length === 0 ? "No hay órdenes en tu cola." : "Nada coincide con este filtro."}
        </Text>
      ) : (
        visibleItems.map((item) => {
          const label = actionLabel(item);
          const st = STATUS_COLORS[item.status];
          const urg = URGENCY_COLORS[item.urgency];
          const locColor = locationColors.get(item.equipment.location) ?? "#6b7280";
          return (
            <View key={item.id} style={styles.card}>
              <View style={styles.cardTop}>
                {item.photo_url ? (
                  <Image source={{ uri: item.photo_url }} style={styles.photo} />
                ) : (
                  <View style={[styles.photoPlaceholder, { backgroundColor: urg.bg }]}>
                    <WarningIcon size={20} color={urg.fg} />
                  </View>
                )}

                <View style={styles.cardMain}>
                  <View style={styles.row}>
                    <Text style={styles.equipmentName}>{item.equipment.name}</Text>
                    <Text style={styles.equipmentCode}>{item.equipment.code}</Text>
                  </View>

                  <View style={styles.row}>
                    <View style={[styles.badge, { backgroundColor: st.bg }]}>
                      <Text style={[styles.badgeText, { color: st.fg }]}>
                        {STATUS_LABELS[item.status]}
                      </Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: urg.bg }]}>
                      <Text style={[styles.badgeText, { color: urg.fg }]}>
                        Urgencia {URGENCY_LABELS[item.urgency]}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              <Text style={styles.desc}>{item.description}</Text>

              <View style={styles.metaRow}>
                <View style={styles.locationRow}>
                  <View style={[styles.locationDot, { backgroundColor: locColor }]} />
                  <LocationIcon size={13} />
                  <Text style={styles.locationText}>{item.equipment.location}</Text>
                </View>

                <Text style={styles.meta}>
                  Reportó {item.reporterName} ·{" "}
                  {new Date(item.created_at).toLocaleDateString("es-AR")}
                </Text>
              </View>

              {item.status === "resolved" ? (
                <View style={styles.doneRow}>
                  <Text style={styles.doneText}>✓ Resuelta</Text>
                </View>
              ) : (
                label && (
                  <Pressable
                    style={styles.actionButton}
                    onPress={() => handleAction(item)}
                    disabled={actingOn === item.id}
                  >
                    <Text style={styles.actionText}>
                      {actingOn === item.id ? "Procesando…" : label}
                    </Text>
                  </Pressable>
                )
              )}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: "#eeeae2" },
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
  title: { fontSize: 22, fontWeight: "600", color: "#17191f" },
  subtitle: { marginTop: 3, fontSize: 13.5, color: "#7b7e86" },
  error: { color: "#c0392b", marginBottom: 12 },
  empty: { padding: 40, textAlign: "center", color: "#8a8d95" },
  filtersRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
    marginBottom: 18,
  },
  scopeToggle: {
    flexDirection: "row",
    backgroundColor: "#e9e4da",
    borderRadius: 9,
    padding: 3,
    gap: 2,
  },
  scopeOption: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 7 },
  scopeOptionActive: { backgroundColor: "#fff" },
  scopeText: { fontSize: 12.5, fontWeight: "600", color: "#8a8d95" },
  scopeTextActive: { color: "#17191f" },
  urgencyChips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  urgencyChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#dcd7cd",
    backgroundColor: "#f7f5f0",
  },
  urgencyChipText: { fontSize: 12.5, fontWeight: "600", color: "#6c6f78" },
  card: {
    backgroundColor: "#f8f6f1",
    borderWidth: 1,
    borderColor: "#e2ddd3",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardTop: { flexDirection: "row", gap: 12 },
  cardMain: { flex: 1, minWidth: 0, gap: 6 },
  photo: { width: 48, height: 48, borderRadius: 10, backgroundColor: "#efebe3" },
  photoPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  equipmentName: { fontWeight: "600", fontSize: 15, color: "#17191f" },
  equipmentCode: { fontFamily: "monospace", fontSize: 12, color: "#9a9da6" },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 11.5, fontWeight: "600" },
  desc: { marginTop: 12, fontSize: 13.5, color: "#4b4e56", lineHeight: 19 },
  metaRow: {
    marginTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  locationDot: { width: 7, height: 7, borderRadius: 4 },
  locationText: { fontSize: 12.5, color: "#5b5e66", fontWeight: "500" },
  meta: { fontSize: 12.5, color: "#9a9da6" },
  actionButton: {
    marginTop: 14,
    height: 40,
    borderRadius: 9,
    backgroundColor: "#2f53e0",
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: { color: "#fff", fontSize: 13.5, fontWeight: "600" },
  doneRow: { marginTop: 14, flexDirection: "row", alignItems: "center" },
  doneText: { color: "#1e7f47", fontSize: 13.5, fontWeight: "600" },
});
