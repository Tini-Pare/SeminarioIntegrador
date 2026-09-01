import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { InfoIcon, SearchIcon } from "../../../components/icons";
import { LocationModal } from "../../../components/LocationModal";
import { Pagination } from "../../../components/Pagination";
import { RowActions } from "../../../components/RowActions";
import { BREAKPOINT } from "../../../constants";
import { confirmDelete } from "../../../lib/confirm";
import { deleteLocation, listLocations } from "../../../lib/queries/locations";
import type { LocationWithCount } from "../../../lib/queries/locations";
import type { ThemeColors } from "../../../lib/theme";
import { useTheme } from "../../../lib/ThemeContext";
import { usePagination } from "../../../lib/usePagination";

export default function LocationsScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [locations, setLocations] = useState<LocationWithCount[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<LocationWithCount | null>(null);
  const [creating, setCreating] = useState(false);
  const { width } = useWindowDimensions();
  const isWide = width >= BREAKPOINT.mobile;
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const load = useCallback(async () => {
    setError(null);
    try {
      setLocations(await listLocations());
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

  function handleDelete(l: LocationWithCount) {
    confirmDelete(
      "Eliminar ubicación",
      `¿Eliminar "${l.lu_nombre_sector}"? Esta acción no se puede deshacer.`,
      async () => {
        try {
          await deleteLocation(l.lu_codigo);
          await load();
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      },
    );
  }

  const filteredLocations = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return locations;
    return locations.filter((l) => l.lu_nombre_sector.toLowerCase().includes(query));
  }, [locations, search]);

  const { pageItems, page, pageCount, setPage } = usePagination(filteredLocations);

  if (loading) return <ActivityIndicator style={styles.center} />;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 20 }}
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
            <Text style={styles.addButtonText}>+ Nueva ubicación</Text>
          </Pressable>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        {locations.length === 0 ? (
          <Text style={styles.empty}>Todavía no hay ubicaciones cargadas.</Text>
        ) : (
          <>
            <View style={styles.toolbar}>
              <View style={styles.searchBox}>
                <SearchIcon size={16} color={colors.textMuted} />

                <TextInput
                  style={styles.searchInput}
                  placeholder="Buscar por sector..."
                  placeholderTextColor={colors.textMuted}
                  value={search}
                  onChangeText={(text) => {
                    setSearch(text);
                    setPage(1);
                  }}
                />
              </View>

              <View style={styles.countBadgePill}>
                <Text style={styles.countBadgePillText}>
                  {filteredLocations.length}{" "}
                  {filteredLocations.length === 1 ? "ubicación" : "ubicaciones"}
                </Text>
              </View>
            </View>

            {filteredLocations.length === 0 ? (
              <Text style={styles.empty}>
                No se encontraron ubicaciones que coincidan con la búsqueda.
              </Text>
            ) : isWide ? (
              <View style={styles.table}>
                <View style={styles.tableHeader}>
                  <Text style={[styles.headerCell, { flex: 2 }]}>SECTOR</Text>

                  <Text style={[styles.headerCell, { flex: 1.2 }]}>PISO</Text>

                  <Text style={[styles.headerCell, { flex: 1 }]}>EQUIPOS</Text>

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
              </View>
            ) : (
              <View style={styles.cardList}>
                {pageItems.map((l) => (
                  <View key={l.lu_codigo} style={styles.locationCard}>
                    <Pressable
                      style={styles.cardMain}
                      onPress={() => setEditing(l)}
                      accessibilityLabel={`Editar ${l.lu_nombre_sector}`}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.name} numberOfLines={1}>
                          {l.lu_nombre_sector}
                        </Text>

                        <Text style={styles.floorText} numberOfLines={1}>
                          {l.lu_piso || "Sin piso especificado"}
                        </Text>
                      </View>

                      <View
                        style={[
                          styles.countBadge,
                          l.equipmentCount > 0 ? styles.countBadgeActive : styles.countBadgeZero,
                        ]}
                      >
                        <Text
                          style={[
                            styles.countBadgeText,
                            l.equipmentCount > 0
                              ? styles.countBadgeTextActive
                              : styles.countBadgeTextZero,
                          ]}
                        >
                          {l.equipmentCount} equipo{l.equipmentCount === 1 ? "" : "s"}
                        </Text>
                      </View>
                    </Pressable>

                    <RowActions
                      onEdit={() => setEditing(l)}
                      onDelete={() => handleDelete(l)}
                      deleteDisabled={l.equipmentCount > 0}
                      editTooltip="Editar ubicación"
                      deleteTooltip="Eliminar ubicación"
                    />
                  </View>
                ))}
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
      // @ts-expect-error onMouseEnter and onMouseLeave are supported on Web
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Pressable
        style={styles.rowMain}
        onPress={onEdit}
        accessibilityLabel={`Editar ${location.lu_nombre_sector}`}
      >
        <View style={{ flex: 2, justifyContent: "center" }}>
          <Text style={styles.name} numberOfLines={1}>
            {location.lu_nombre_sector}
          </Text>
        </View>

        <View style={{ flex: 1.2, justifyContent: "center" }}>
          <Text style={styles.floorText} numberOfLines={1}>
            {location.lu_piso || "—"}
          </Text>
        </View>

        <View style={{ flex: 1, justifyContent: "center" }}>
          <View
            style={[
              styles.countBadge,
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
      </Pressable>

      <View style={styles.actionsCol}>
        <RowActions
          onEdit={onEdit}
          onDelete={onDelete}
          deleteDisabled={location.equipmentCount > 0}
          editTooltip="Editar ubicación"
          deleteTooltip="Eliminar ubicación"
        />
      </View>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  const isLight = c.bg === "#eceeea";

  return StyleSheet.create({
    container: { backgroundColor: c.bg },
    center: { flex: 1 },
    contentWrap: {
      maxWidth: 980,
      width: "100%",
      alignSelf: "flex-start",
    },
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
    addButton: {
      backgroundColor: c.accent,
      paddingHorizontal: 18,
      height: 42,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    addButtonText: { color: "#fff", fontWeight: "600", fontSize: 14 },
    toolbar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: 12,
      marginBottom: 16,
    },
    searchBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      maxWidth: 340,
      flexGrow: 1,
      minWidth: 200,
      height: 40,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: c.borderInput,
      borderRadius: 9,
      backgroundColor: c.bgCard,
    },
    searchInput: {
      flex: 1,
      height: "100%",
      fontSize: 14,
      color: c.text,
      padding: 0,
      ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : {}),
    },
    countBadgePill: {
      height: 40,
      paddingHorizontal: 14,
      borderRadius: 9,
      borderWidth: 1,
      borderColor: c.borderInput,
      backgroundColor: c.bgCard,
      alignItems: "center",
      justifyContent: "center",
    },
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
      maxWidth: 980,
      width: "100%",
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
      paddingVertical: 15,
      borderBottomWidth: 1,
      borderBottomColor: c.borderRow,
    },
    rowPlain: {
      backgroundColor: c.bgCard,
    },
    rowZebra: {
      backgroundColor: isLight ? "#f8f6f0" : "rgba(255, 255, 255, 0.025)",
    },
    rowHover: {
      backgroundColor: isLight ? "#f0ede4" : "rgba(255, 255, 255, 0.05)",
    },
    rowMain: { flex: 1, flexDirection: "row", alignItems: "center" },
    name: { fontWeight: "600", fontSize: 15, color: c.text },
    floorText: { fontSize: 13.5, color: c.textSecondary, marginTop: 2 },
    cardList: { gap: 10, maxWidth: 980, width: "100%" },
    locationCard: {
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 14,
      padding: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    cardMain: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      minWidth: 0,
    },
    countBadge: {
      alignSelf: "flex-start",
      minWidth: 26,
      height: 26,
      paddingHorizontal: 7,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center",
    },
    countBadgeZero: {
      backgroundColor: isLight ? "#eaede6" : "rgba(255, 255, 255, 0.06)",
    },
    countBadgeActive: {
      backgroundColor: c.eqOperational.bg,
    },
    countBadgeText: {
      fontSize: 12,
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
      maxWidth: 980,
    },
    helpText: {
      fontSize: 12.5,
      color: c.textMuted,
    },
  });
}

