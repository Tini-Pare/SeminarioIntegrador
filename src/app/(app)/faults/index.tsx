import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { FaultTypeModal } from "../../../components/FaultTypeModal";
import { Pagination } from "../../../components/Pagination";
import { RowActions } from "../../../components/RowActions";
import { useConfirm } from "../../../lib/useConfirm";
import {
  deleteFaultType,
  GRAVEDAD_LABELS,
  listFaultTypes,
  normalizeGravedad,
} from "../../../lib/queries/faultTypes";
import type { ThemeColors } from "../../../lib/theme";
import { useTheme } from "../../../lib/ThemeContext";
import { usePagination } from "../../../lib/usePagination";
import type { Fallo } from "../../../types/database";

export default function FaultsScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [faults, setFaults] = useState<Fallo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [editingFault, setEditingFault] = useState<Fallo | null>(null);
  const [creatingFault, setCreatingFault] = useState(false);

  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { confirm, dialog } = useConfirm();

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

  const faultsPage = usePagination(faults, "", 8);

  function deleteFault(f: Fallo) {
    confirm({
      title: "Eliminar falla genérica",
      message: `¿Eliminar "${f.fa_nombre}"? Esta acción no se puede deshacer.`,
      onConfirm: async () => {
        try {
          await deleteFaultType(f.fa_id_fallo);
          await load();
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      },
    });
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
      <View style={styles.pageHeader}>
        <View style={styles.sectionHeadingText}>
          <Text style={styles.title}>Fallas genéricas</Text>
          <Text style={styles.subtitle}>
            Catálogo de tipos de falla para clasificar las incidencias
          </Text>
        </View>

        <Pressable style={styles.addButton} onPress={() => setCreatingFault(true)}>
          <Text style={styles.addButtonText}>+ Nuevo</Text>
        </Pressable>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      {faults.length === 0 ? (
        <Text style={styles.empty}>Todavía no hay fallas genéricas cargadas.</Text>
      ) : (
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.headerCell, { flex: 2.2 }]}>FALLA</Text>
            <Text style={[styles.headerCell, { flex: 1 }]}>GRAVEDAD</Text>
            <Text style={[styles.headerCell, styles.actionsCol]}>ACCIONES</Text>
          </View>

          {faultsPage.pageItems.map((f, i) => (
            <View key={f.fa_id_fallo} style={[styles.row, i % 2 === 1 && styles.rowAlt]}>
              <View style={styles.rowMain}>
                <View style={{ flex: 2.2, justifyContent: "center", paddingRight: 12 }}>
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
              </View>

              <View style={styles.actionsCol}>
                <RowActions
                  onEdit={() => setEditingFault(f)}
                  onDelete={() => deleteFault(f)}
                  editTooltip="Editar falla"
                  deleteTooltip="Eliminar falla"
                />
              </View>
            </View>
          ))}
        </View>
      )}

      <Pagination
        page={faultsPage.page}
        pageCount={faultsPage.pageCount}
        onPage={faultsPage.setPage}
      />

      {editingFault && (
        <FaultTypeModal
          visible={!!editingFault}
          onClose={() => setEditingFault(null)}
          onSaved={load}
          fault={editingFault}
          existingFaults={faults}
        />
      )}

      <FaultTypeModal
        visible={creatingFault}
        onClose={() => setCreatingFault(false)}
        onSaved={load}
        existingFaults={faults}
      />

      {dialog}
    </ScrollView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { backgroundColor: c.bg },
    center: { flex: 1 },
    pageHeader: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 12,
      marginBottom: 20,
    },
    sectionHeadingText: { flexShrink: 1, minWidth: 0 },
    title: { fontSize: 22, fontWeight: "600", color: c.text },
    subtitle: { marginTop: 3, fontSize: 13.5, color: c.textSecondary },
    error: { color: c.destructive, marginBottom: 12 },
    addButton: {
      backgroundColor: c.accent,
      paddingHorizontal: 16,
      height: 40,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    addButtonText: { color: "#fff", fontWeight: "600", fontSize: 13.5 },
    empty: { color: c.textMuted, fontSize: 13.5, marginTop: 4 },
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
      paddingHorizontal: 16,
      paddingVertical: 13,
      backgroundColor: c.accent,
      borderTopLeftRadius: 13,
      borderTopRightRadius: 13,
    },
    headerCell: {
      fontSize: 11.5,
      fontWeight: "600",
      letterSpacing: 0.7,
      textTransform: "uppercase",
      color: "#fff",
      fontFamily: "monospace",
    },
    actionsCol: { width: 76, flexShrink: 0, alignItems: "flex-start" },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.borderRow,
    },
    rowAlt: { backgroundColor: c.bgRowAlt },
    rowMain: { flex: 1, flexDirection: "row", alignItems: "center", minWidth: 0 },
    name: { fontWeight: "600", fontSize: 14, color: c.text },
    desc: { fontSize: 12.5, color: c.textMuted, marginTop: 3 },
    badge: {
      alignSelf: "flex-start",
      paddingHorizontal: 11,
      paddingVertical: 4,
      borderRadius: 999,
    },
    badgeText: { fontSize: 12, fontWeight: "600" },
  });
}
