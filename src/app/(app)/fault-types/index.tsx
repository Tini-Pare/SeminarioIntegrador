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
import { FaultTypeModal } from "../../../components/FaultTypeModal";
import { BREAKPOINT } from "../../../constants";
import {
  GRAVEDAD_LABELS,
  listFaultTypes,
  normalizeGravedad,
} from "../../../lib/queries/faultTypes";
import type { ThemeColors } from "../../../lib/theme";
import { useTheme } from "../../../lib/ThemeContext";
import type { Fallo } from "../../../types/database";

export default function FaultTypesScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [faults, setFaults] = useState<Fallo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Fallo | null>(null);
  const [creating, setCreating] = useState(false);
  const { width } = useWindowDimensions();
  const isMobile = width >= BREAKPOINT.mobile;
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const gravedadColor = {
    low: colors.urgencyLow,
    medium: colors.urgencyMedium,
    high: colors.urgencyHigh,
  };

  const load = useCallback(async () => {
    setError(null);
    try {
      setFaults(await listFaultTypes());
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

  function GravedadBadge({ raw }: { raw: string | null }) {
    const g = normalizeGravedad(raw);
    const c = gravedadColor[g];
    return (
      <View style={[styles.badge, { backgroundColor: c.bg }]}>
        <Text style={[styles.badgeText, { color: c.fg }]}>{GRAVEDAD_LABELS[g]}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 20 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Fallas genéricas</Text>
          <Text style={styles.subtitle}>
            Catálogo de tipos de falla para clasificar las incidencias
          </Text>
        </View>

        <Pressable style={styles.addButton} onPress={() => setCreating(true)}>
          <Text style={styles.addButtonText}>+ Nueva falla</Text>
        </Pressable>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      {faults.length === 0 ? (
        <Text style={styles.empty}>Todavía no hay fallas genéricas cargadas.</Text>
      ) : isMobile ? (
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.headerCell, { flex: 2.5 }]}>FALLA</Text>
            <Text style={[styles.headerCell, { flex: 1 }]}>GRAVEDAD</Text>
          </View>

          {faults.map((f) => (
            <Pressable key={f.fa_id_fallo} style={styles.row} onPress={() => setEditing(f)}>
              <View style={{ flex: 2.5, justifyContent: "center", paddingRight: 12 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {f.fa_nombre}
                </Text>

                {!!f.fa_desperfecto && (
                  <Text style={styles.desc} numberOfLines={1}>
                    {f.fa_desperfecto}
                  </Text>
                )}
              </View>

              <View style={{ flex: 1, justifyContent: "center" }}>
                <GravedadBadge raw={f.fa_gravedad} />
              </View>
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={styles.cardList}>
          {faults.map((f) => (
            <Pressable key={f.fa_id_fallo} style={styles.faultCard} onPress={() => setEditing(f)}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {f.fa_nombre}
                </Text>

                {!!f.fa_desperfecto && (
                  <Text style={styles.desc} numberOfLines={2}>
                    {f.fa_desperfecto}
                  </Text>
                )}
              </View>

              <GravedadBadge raw={f.fa_gravedad} />
            </Pressable>
          ))}
        </View>
      )}

      {editing && (
        <FaultTypeModal
          visible={!!editing}
          onClose={() => setEditing(null)}
          onSaved={load}
          fault={editing}
        />
      )}

      <FaultTypeModal visible={creating} onClose={() => setCreating(false)} onSaved={load} />
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
      maxWidth: 760,
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
    desc: { fontSize: 12.5, color: c.textMuted, marginTop: 3 },
    cardList: { gap: 10 },
    faultCard: {
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
    badge: {
      alignSelf: "flex-start",
      paddingHorizontal: 11,
      paddingVertical: 4,
      borderRadius: 999,
    },
    badgeText: { fontSize: 12, fontWeight: "600" },
  });
}
