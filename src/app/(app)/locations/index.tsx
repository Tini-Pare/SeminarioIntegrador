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
import { InfoIcon } from "../../../components/icons";
import { LocationModal } from "../../../components/LocationModal";
import { Pagination } from "../../../components/Pagination";
import { RowActions } from "../../../components/RowActions";
import { ScrollableTable, tableCol } from "../../../components/ScrollableTable";
import { SortHeaderCell } from "../../../components/SortHeaderCell";
import { TableFilterBar } from "../../../components/TableFilterBar";
import { NUMERIC_COL_GAP } from "../../../constants";
import { useConfirm } from "../../../lib/useConfirm";
import { deleteLocation, listLocations } from "../../../lib/queries/locations";
import type { LocationWithCount } from "../../../lib/queries/locations";
import type { ThemeColors } from "../../../lib/theme";
import { useTheme } from "../../../lib/ThemeContext";
import { usePagination } from "../../../lib/usePagination";
import { includesSearch, normalizeSearch, startsWithSearch } from "../../../lib/search";
import { useTableSort } from "../../../lib/useTableSort";
import { useInitialLoad } from "../../../lib/useInitialLoad";

// The row's trash icon is disabled while the record is still in use, so the
// tooltip carries the reason -- it used to live in the edit modal.
function deleteTooltipFor(count: number) {
  if (count === 0) return "Eliminar ubicación";
  return `No se puede eliminar: tiene ${count} equipo${count === 1 ? "" : "s"} asignado${count === 1 ? "" : "s"}.`;
}

export default function LocationsScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [locations, setLocations] = useState<LocationWithCount[]>([]);
  const [search, setSearch] = useState("");
  const [pisoFilter, setPisoFilter] = useState("");
  const [equiposFilter, setEquiposFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<LocationWithCount | null>(null);
  const [creating, setCreating] = useState(false);
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { confirm, dialog } = useConfirm();

  const load = useCallback(async () => {
    setError(null);
    try {
      setLocations(await listLocations());
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

  function handleDelete(l: LocationWithCount) {
    confirm({
      title: "Eliminar ubicación",
      message: `¿Eliminar "${l.lu_nombre_sector}"? Esta acción no se puede deshacer.`,
      onConfirm: async () => {
        try {
          await deleteLocation(l.lu_codigo);
          await load();
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      },
    });
  }

  const pisoOptions = useMemo(() => {
    const pisos = Array.from(
      new Set(locations.map((l) => l.lu_piso?.trim()).filter((p): p is string => !!p)),
    ).sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
    return [{ value: "", label: "Todos" }, ...pisos.map((p) => ({ value: p, label: p }))];
  }, [locations]);

  const filteredLocations = useMemo(() => {
    const query = normalizeSearch(search.trim());
    return locations.filter((l) => {
      const matchSearch =
        !query || startsWithSearch(l.lu_nombre_sector, query) || includesSearch(l.lu_piso, query);
      const matchPiso = !pisoFilter || l.lu_piso?.trim() === pisoFilter;
      const matchEquipos =
        !equiposFilter ||
        (equiposFilter === "with" ? l.equipmentCount > 0 : l.equipmentCount === 0);
      return matchSearch && matchPiso && matchEquipos;
    });
  }, [locations, search, pisoFilter, equiposFilter]);

  const { sorted, field, dir, toggle } = useTableSort<LocationWithCount>(
    filteredLocations,
    {
      sector: (l) => l.lu_nombre_sector,
      piso: (l) => l.lu_piso,
      equipos: (l) => l.equipmentCount,
    },
    "sector",
  );

  const { pageItems, page, pageCount, setPage } = usePagination(
    sorted,
    `${search}|${pisoFilter}|${equiposFilter}|${field}|${dir}`,
  );

  if (loading) return <ActivityIndicator style={styles.center} />;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.contentWrap}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Ubicaciones</Text>

            <Text style={styles.subtitle}>
              Gestioná los sectores y pisos donde se ubican los equipos
            </Text>
          </View>

          <Pressable style={styles.addButton} onPress={() => setCreating(true)}>
            <Text style={styles.addButtonText}>+ Nueva</Text>
          </Pressable>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        {locations.length === 0 ? (
          <Text style={styles.empty}>Todavía no hay ubicaciones cargadas.</Text>
        ) : (
          <>
            <TableFilterBar
              searchValue={search}
              onSearch={setSearch}
              searchPlaceholder="Buscar por sector o piso…"
              filters={[
                ...(pisoOptions.length > 1
                  ? [
                      {
                        key: "piso",
                        label: "Piso",
                        value: pisoFilter,
                        onChange: setPisoFilter,
                        options: pisoOptions,
                      },
                    ]
                  : []),
                {
                  key: "equipos",
                  label: "Equipos",
                  value: equiposFilter,
                  onChange: setEquiposFilter,
                  options: [
                    { value: "", label: "Todas" },
                    { value: "with", label: "Con equipos" },
                    { value: "without", label: "Sin equipos" },
                  ],
                },
              ]}
              right={
                <Text style={styles.countBadgePillText}>
                  {sorted.length} {sorted.length === 1 ? "ubicación" : "ubicaciones"}
                </Text>
              }
            />

            {sorted.length === 0 ? (
              <Text style={styles.empty}>
                No hay ubicaciones que coincidan con la búsqueda o los filtros.
              </Text>
            ) : (
              <View style={styles.table}>
                <ScrollableTable minWidth={480}>
                  <View style={styles.tableHeader}>
                    <SortHeaderCell
                      label="Sector"
                      field="sector"
                      activeField={field}
                      dir={dir}
                      onSort={toggle}
                      style={tableCol(2)}
                    />

                    <SortHeaderCell
                      label="Piso"
                      field="piso"
                      activeField={field}
                      dir={dir}
                      onSort={toggle}
                      style={tableCol(1.2)}
                    />

                    <SortHeaderCell
                      label="Equipos"
                      field="equipos"
                      activeField={field}
                      dir={dir}
                      onSort={toggle}
                      style={[tableCol(1), styles.countHeaderCell]}
                    />

                    <Text style={[styles.headerCell, styles.actionsCol]}>ACCIONES</Text>
                  </View>

                  {pageItems.map((l, index) => (
                    <LocationTableRow
                      key={l.lu_codigo}
                      location={l}
                      index={index}
                      onEdit={() => setEditing(l)}
                      onDelete={() => handleDelete(l)}
                      styles={styles}
                    />
                  ))}
                </ScrollableTable>
              </View>
            )}

            <View style={styles.helpRow}>
              <InfoIcon size={15} color={colors.textMuted} />

              <Text style={styles.helpText}>
                Los sectores con equipos activos se destacan en verde para diferenciarlos de un
                rápido vistazo.
              </Text>
            </View>

            <Pagination page={page} pageCount={pageCount} onPage={setPage} />
          </>
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
      </View>

      {dialog}
    </ScrollView>
  );
}

function LocationTableRow({
  location,
  index,
  onEdit,
  onDelete,
  styles,
}: {
  location: LocationWithCount;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  const [hovered, setHovered] = useState(false);
  const isZebra = index % 2 === 1;

  const rowBg = hovered
    ? styles.rowHover.backgroundColor
    : isZebra
      ? styles.rowZebra.backgroundColor
      : styles.rowPlain.backgroundColor;

  return (
    <View
      style={[styles.row, { backgroundColor: rowBg }]}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <View style={styles.rowMain}>
        <View style={[tableCol(2), styles.cell]}>
          <Text style={styles.name} numberOfLines={1}>
            {location.lu_nombre_sector}
          </Text>
        </View>

        <View style={[tableCol(1.2), styles.cell]}>
          <Text style={styles.floorText} numberOfLines={1}>
            {location.lu_piso || "—"}
          </Text>
        </View>

        <View style={[tableCol(1), styles.cell, styles.countCol]}>
          <View
            style={[
              styles.countBadge,
              styles.countBadgeEnd,
              location.equipmentCount > 0 ? styles.countBadgeActive : styles.countBadgeZero,
            ]}
          >
            <Text
              style={[
                styles.countBadgeText,
                location.equipmentCount > 0
                  ? styles.countBadgeTextActive
                  : styles.countBadgeTextZero,
              ]}
            >
              {location.equipmentCount}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.actionsCol}>
        <RowActions
          onEdit={onEdit}
          onDelete={onDelete}
          deleteDisabled={location.equipmentCount > 0}
          editTooltip="Editar ubicación"
          deleteTooltip={deleteTooltipFor(location.equipmentCount)}
        />
      </View>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { backgroundColor: c.bg },
    content: { padding: 20 },
    center: { flex: 1 },
    contentWrap: {
      width: "100%",
      alignSelf: "stretch",
    },
    // No wrapping: on a phone a long subtitle would push the button onto its
    // own line, on the left. The text wraps instead and the button stays right.
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 12,
      marginBottom: 16,
    },
    headerText: { flex: 1, minWidth: 0 },
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
    countBadgePillText: {
      fontSize: 13,
      fontWeight: "500",
      color: c.textSecondary,
    },
    error: { color: c.destructive, marginBottom: 12 },
    empty: { color: c.textMuted, fontSize: 13.5, marginTop: 8 },
    table: {
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 14,
      overflow: "hidden",
      width: "100%",
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
    actionsCol: { width: 86, flexShrink: 0, alignItems: "flex-start" },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 18,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: c.borderRow,
    },
    rowPlain: {
      backgroundColor: c.bgCard,
    },
    rowZebra: {
      backgroundColor: c.bgRowAlt,
    },
    rowHover: {
      backgroundColor: c.bgRowHover,
    },
    rowMain: { flex: 1, flexDirection: "row", alignItems: "center", minWidth: 0 },
    cell: { justifyContent: "center" },
    name: { fontWeight: "600", fontSize: 14.5, color: c.text },
    floorText: { fontSize: 13, color: c.textSecondary, marginTop: 2 },
    countBadge: {
      alignSelf: "flex-start",
      minWidth: 26,
      height: 26,
      paddingHorizontal: 7,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center",
    },
    // Table column: counts are right-aligned, with padding to keep them off
    // the actions column that follows.
    countCol: { paddingRight: NUMERIC_COL_GAP },
    countHeaderCell: { justifyContent: "flex-end", paddingRight: NUMERIC_COL_GAP },
    countBadgeEnd: { alignSelf: "flex-end" },
    countBadgeZero: {
      backgroundColor: c.bgNested,
    },
    countBadgeActive: {
      backgroundColor: c.eqOperational.bg,
    },
    countBadgeText: {
      fontSize: 12.5,
      fontWeight: "600",
    },
    countBadgeTextZero: {
      color: c.textMuted,
    },
    countBadgeTextActive: {
      color: c.eqOperational.fg,
    },
    helpRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      marginTop: 14,
    },
    helpText: {
      fontSize: 12.5,
      color: c.textMuted,
    },
  });
}
