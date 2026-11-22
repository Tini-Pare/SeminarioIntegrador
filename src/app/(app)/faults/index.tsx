import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { DetailModal } from "../../../components/DetailModal";
import { FaultTypeModal } from "../../../components/FaultTypeModal";
import { Pagination } from "../../../components/Pagination";
import { RowActions } from "../../../components/RowActions";
import { ScrollableTable, tableCol } from "../../../components/ScrollableTable";
import { SortHeaderCell } from "../../../components/SortHeaderCell";
import { TableFilterBar } from "../../../components/TableFilterBar";
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
import { normalizeSearch, startsWithSearch } from "../../../lib/search";
import { useTableSort } from "../../../lib/useTableSort";
import type { Fallo } from "../../../types/database";
import { useInitialLoad } from "../../../lib/useInitialLoad";

const GRAVEDAD_RANK: Record<"low" | "medium" | "high", number> = { low: 0, medium: 1, high: 2 };

export default function FaultsScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [faults, setFaults] = useState<Fallo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [gravedadFilter, setGravedadFilter] = useState("");
  const [estadoFilter, setEstadoFilter] = useState("");

  const [editingFault, setEditingFault] = useState<Fallo | null>(null);
  const [creatingFault, setCreatingFault] = useState(false);
  const [viewingFault, setViewingFault] = useState<Fallo | null>(null);

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

  const loading = useInitialLoad(load);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const filtered = useMemo(() => {
    const q = normalizeSearch(search.trim());
    return faults.filter((f) => {
      const matchSearch = !q || startsWithSearch(f.fa_nombre, q);
      const matchGravedad = !gravedadFilter || normalizeGravedad(f.fa_gravedad) === gravedadFilter;
      const matchEstado = !estadoFilter || f.fa_estado === estadoFilter;
      return matchSearch && matchGravedad && matchEstado;
    });
  }, [faults, search, gravedadFilter, estadoFilter]);

  const { sorted, field, dir, toggle } = useTableSort<Fallo>(
    filtered,
    {
      nombre: (f) => f.fa_nombre,
      gravedad: (f) => GRAVEDAD_RANK[normalizeGravedad(f.fa_gravedad)],
    },
    "nombre",
  );

  const faultsPage = usePagination(
    sorted,
    `${search}|${gravedadFilter}|${estadoFilter}|${field}|${dir}`,
    8,
  );

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

  function renderGravedadBadge(raw: string | null) {
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
      contentContainerStyle={styles.content}
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
          <Text style={styles.addButtonText}>+ Nueva</Text>
        </Pressable>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <TableFilterBar
        searchValue={search}
        onSearch={setSearch}
        searchPlaceholder="Buscar por nombre…"
        filters={[
          {
            key: "gravedad",
            label: "Gravedad",
            value: gravedadFilter,
            onChange: setGravedadFilter,
            options: [
              { value: "", label: "Todas" },
              { value: "high", label: GRAVEDAD_LABELS.high },
              { value: "medium", label: GRAVEDAD_LABELS.medium },
              { value: "low", label: GRAVEDAD_LABELS.low },
            ],
          },
          {
            key: "estado",
            label: "Estado",
            value: estadoFilter,
            onChange: setEstadoFilter,
            options: [
              { value: "", label: "Todos" },
              { value: "activo", label: "Activa" },
              { value: "inactivo", label: "Inactiva" },
            ],
          },
        ]}
        right={
          <Text style={styles.count}>
            {sorted.length} {sorted.length === 1 ? "falla" : "fallas"}
          </Text>
        }
      />

      {sorted.length === 0 ? (
        <Text style={styles.empty}>
          {faults.length === 0
            ? "Todavía no hay fallas genéricas cargadas."
            : "No hay fallas que coincidan con la búsqueda o los filtros."}
        </Text>
      ) : (
        <View style={styles.table}>
          <ScrollableTable minWidth={480}>
            <View style={styles.tableHeader}>
              <SortHeaderCell
                label="Falla"
                field="nombre"
                activeField={field}
                dir={dir}
                onSort={toggle}
                style={tableCol(2.2)}
              />

              <SortHeaderCell
                label="Gravedad"
                field="gravedad"
                activeField={field}
                dir={dir}
                onSort={toggle}
                style={tableCol(1)}
              />

              <Text style={[styles.headerCell, styles.actionsCol]}>ACCIONES</Text>
            </View>

            {faultsPage.pageItems.map((f, i) => (
              <View key={f.fa_id_fallo} style={[styles.row, i % 2 === 1 && styles.rowAlt]}>
                <View style={styles.rowMain}>
                  <View style={[tableCol(2.2), styles.cell]}>
                    <Text style={styles.name} numberOfLines={1}>
                      {f.fa_nombre}
                    </Text>

                    {f.fa_estado === "inactivo" && <Text style={styles.inactive}>Inactiva</Text>}
                  </View>

                  <View style={[tableCol(1), styles.cell]}>
                    {renderGravedadBadge(f.fa_gravedad)}
                  </View>
                </View>

                <View style={styles.actionsCol}>
                  <RowActions
                    onView={() => setViewingFault(f)}
                    onEdit={() => setEditingFault(f)}
                    onDelete={() => deleteFault(f)}
                    viewTooltip="Ver falla"
                    editTooltip="Editar falla"
                    deleteTooltip="Eliminar falla"
                  />
                </View>
              </View>
            ))}
          </ScrollableTable>
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

      <DetailModal
        visible={!!viewingFault}
        onClose={() => setViewingFault(null)}
        actionTitle="Ver falla genérica"
        title={viewingFault?.fa_nombre ?? ""}
        description={viewingFault?.fa_desperfecto}
        fields={
          viewingFault
            ? [
                { label: "Gravedad", value: renderGravedadBadge(viewingFault.fa_gravedad) },
                {
                  label: "Estado",
                  value: viewingFault.fa_estado === "inactivo" ? "Inactiva" : "Activa",
                },
              ]
            : undefined
        }
      />

      {dialog}
    </ScrollView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { backgroundColor: c.bg },
    content: { padding: 20 },
    center: { flex: 1 },
    // No wrapping: on a phone a long subtitle would push the button onto its
    // own line, on the left. The text wraps instead and the button stays right.
    pageHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 12,
      marginBottom: 16,
    },
    sectionHeadingText: { flex: 1, minWidth: 0 },
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
    count: { fontSize: 13, fontWeight: "500", color: c.textSecondary },
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
      paddingHorizontal: 18,
      paddingVertical: 12,
      backgroundColor: c.accent,
      borderTopLeftRadius: 13,
      borderTopRightRadius: 13,
    },
    headerCell: {
      fontSize: 11.5,
      fontWeight: "700",
      letterSpacing: 0.5,
      textTransform: "uppercase",
      color: "#fff",
      fontFamily: "monospace",
    },
    // 3 buttons of 36 + 2 gaps of 6.
    actionsCol: { width: 120, flexShrink: 0, alignItems: "flex-start" },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 18,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: c.borderRow,
    },
    rowAlt: { backgroundColor: c.bgRowAlt },
    rowMain: { flex: 1, flexDirection: "row", alignItems: "center", minWidth: 0 },
    cell: { justifyContent: "center" },
    name: { fontWeight: "600", fontSize: 14.5, color: c.text },
    inactive: { fontSize: 13, color: c.textMuted, marginTop: 2 },
    badge: {
      alignSelf: "flex-start",
      paddingHorizontal: 11,
      paddingVertical: 3.5,
      borderRadius: 999,
    },
    badgeText: { fontSize: 12.5, fontWeight: "600" },
  });
}
