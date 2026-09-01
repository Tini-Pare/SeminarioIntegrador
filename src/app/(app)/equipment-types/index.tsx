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
import { EquipmentTypeModal } from "../../../components/EquipmentTypeModal";
import { InfoIcon, SearchIcon } from "../../../components/icons";
import { RowActions } from "../../../components/RowActions";
import { BREAKPOINT } from "../../../constants";
import { useConfirm } from "../../../lib/useConfirm";
import { deleteEquipmentType, listEquipmentTypes } from "../../../lib/queries/equipmentTypes";
import type { EquipmentTypeWithCount } from "../../../lib/queries/equipmentTypes";
import type { ThemeColors } from "../../../lib/theme";
import { useTheme } from "../../../lib/ThemeContext";
import { usePagination } from "../../../lib/usePagination";

// The row's trash icon is disabled while the record is still in use, so the
// tooltip carries the reason -- it used to live in the edit modal.
function deleteTooltipFor(count: number) {
  if (count === 0) return "Eliminar tipo";
  return `No se puede eliminar: tiene ${count} equipo${count === 1 ? "" : "s"} de este tipo.`;
}

export default function EquipmentTypesScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [types, setTypes] = useState<EquipmentTypeWithCount[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<EquipmentTypeWithCount | null>(null);
  const [creating, setCreating] = useState(false);
  const { width } = useWindowDimensions();
  const isWide = width >= BREAKPOINT.mobile;
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { confirm, dialog } = useConfirm();

  const load = useCallback(async () => {
    setError(null);
    try {
      setTypes(await listEquipmentTypes());
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

  function handleDelete(t: EquipmentTypeWithCount) {
    confirm({
      title: "Eliminar tipo de equipo",
      message: `¿Eliminar "${t.te_nombre}"? Esta acción no se puede deshacer.`,
      onConfirm: async () => {
        try {
          await deleteEquipmentType(t.te_id);
          await load();
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      },
    });
  }

  const filteredTypes = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return types;
    return types.filter((t) => t.te_nombre.toLowerCase().includes(query));
  }, [types, search]);

  const { pageItems, page, pageCount, setPage } = usePagination(filteredTypes, search, 8);

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
            <Text style={styles.title}>Tipos de equipo</Text>

            <Text style={styles.subtitle}>
              Gestioná las categorías con las que se clasifican los equipos
            </Text>
          </View>

          <Pressable style={styles.addButton} onPress={() => setCreating(true)}>
            <Text style={styles.addButtonText}>+ Nuevo tipo</Text>
          </Pressable>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        {types.length === 0 ? (
          <Text style={styles.empty}>Todavía no hay tipos de equipo cargados.</Text>
        ) : (
          <>
            <View style={styles.toolbar}>
              <View style={styles.searchBox}>
                <SearchIcon size={16} color={colors.textMuted} />

                <TextInput
                  style={styles.searchInput}
                  placeholder="Buscar tipo de equipo..."
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
                  {filteredTypes.length} {filteredTypes.length === 1 ? "tipo" : "tipos"}
                </Text>
              </View>
            </View>

            {filteredTypes.length === 0 ? (
              <Text style={styles.empty}>
                No se encontraron tipos de equipo que coincidan con la búsqueda.
              </Text>
            ) : isWide ? (
              <View style={styles.table}>
                <View style={styles.tableHeader}>
                  <Text style={[styles.headerCell, { flex: 2 }]}>TIPO</Text>

                  <Text style={[styles.headerCell, { flex: 1 }]}>EQUIPOS</Text>

                  <Text style={[styles.headerCell, styles.actionsCol]}>ACCIONES</Text>
                </View>

                {pageItems.map((t, index) => (
                  <EquipmentTypeTableRow
                    key={t.te_id}
                    type={t}
                    index={index}
                    onEdit={() => setEditing(t)}
                    onDelete={() => handleDelete(t)}
                    styles={styles}
                  />
                ))}

                {pageCount > 1 && (
                  <TablePagination
                    page={page}
                    pageCount={pageCount}
                    onPage={setPage}
                    styles={styles}
                  />
                )}
              </View>
            ) : (
              <View style={styles.cardList}>
                {pageItems.map((t) => (
                  <View key={t.te_id} style={styles.typeCard}>
                    <View style={styles.cardMain}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.name} numberOfLines={1}>
                          {t.te_nombre}
                        </Text>
                      </View>

                      <View
                        style={[
                          styles.countBadge,
                          t.equipmentCount > 0 ? styles.countBadgeActive : styles.countBadgeZero,
                        ]}
                      >
                        <Text
                          style={[
                            styles.countBadgeText,
                            t.equipmentCount > 0
                              ? styles.countBadgeTextActive
                              : styles.countBadgeTextZero,
                          ]}
                        >
                          {t.equipmentCount} equipo{t.equipmentCount === 1 ? "" : "s"}
                        </Text>
                      </View>
                    </View>

                    <RowActions
                      onEdit={() => setEditing(t)}
                      onDelete={() => handleDelete(t)}
                      deleteDisabled={t.equipmentCount > 0}
                      editTooltip="Editar tipo"
                      deleteTooltip={deleteTooltipFor(t.equipmentCount)}
                    />
                  </View>
                ))}

                {pageCount > 1 && (
                  <View style={styles.mobilePaginationWrap}>
                    <TablePagination
                      page={page}
                      pageCount={pageCount}
                      onPage={setPage}
                      styles={styles}
                    />
                  </View>
                )}
              </View>
            )}

            <View style={styles.helpRow}>
              <InfoIcon size={15} color={colors.textMuted} />

              <Text style={styles.helpText}>
                Los tipos con equipos activos se destacan en verde para diferenciarlos de un rápido
                vistazo.
              </Text>
            </View>
          </>
        )}

        {editing && (
          <EquipmentTypeModal
            visible={!!editing}
            onClose={() => setEditing(null)}
            onSaved={load}
            equipmentType={editing}
          />
        )}

        <EquipmentTypeModal visible={creating} onClose={() => setCreating(false)} onSaved={load} />
      </View>

      {dialog}
    </ScrollView>
  );
}

function EquipmentTypeTableRow({
  type,
  index,
  onEdit,
  onDelete,
  styles,
}: {
  type: EquipmentTypeWithCount;
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
      <View style={styles.rowMain}>
        <View style={{ flex: 2, justifyContent: "center" }}>
          <Text style={styles.name} numberOfLines={1}>
            {type.te_nombre}
          </Text>
        </View>

        <View style={{ flex: 1, justifyContent: "center" }}>
          <View
            style={[
              styles.countBadge,
              type.equipmentCount > 0 ? styles.countBadgeActive : styles.countBadgeZero,
            ]}
          >
            <Text
              style={[
                styles.countBadgeText,
                type.equipmentCount > 0 ? styles.countBadgeTextActive : styles.countBadgeTextZero,
              ]}
            >
              {type.equipmentCount}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.actionsCol}>
        <RowActions
          onEdit={onEdit}
          onDelete={onDelete}
          deleteDisabled={type.equipmentCount > 0}
          editTooltip="Editar tipo"
          deleteTooltip={deleteTooltipFor(type.equipmentCount)}
        />
      </View>
    </View>
  );
}

function getPageNumbers(current: number, total: number): (number | string)[] {
  if (total <= 5) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages: (number | string)[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  if (start > 2) pages.push("…");
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }
  if (end < total - 1) pages.push("…");
  pages.push(total);
  return pages;
}

function TablePagination({
  page,
  pageCount,
  onPage,
  styles,
}: {
  page: number;
  pageCount: number;
  onPage: (p: number) => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  if (pageCount <= 1) return null;

  const pageNumbers = getPageNumbers(page, pageCount);

  return (
    <View style={styles.paginationWrap}>
      <Pressable
        style={[styles.pageNavBtn, page <= 1 ? styles.pageNavBtnDisabled : styles.pageNavBtnActive]}
        onPress={() => onPage(page - 1)}
        disabled={page <= 1}
        accessibilityLabel="Página anterior"
      >
        <Text
          style={[
            styles.pageNavBtnText,
            page <= 1 ? styles.pageNavBtnTextDisabled : styles.pageNavBtnTextActive,
          ]}
        >
          ‹ Anterior
        </Text>
      </Pressable>

      <View style={styles.pageNumbersWrap}>
        {pageNumbers.map((p, idx) =>
          typeof p === "number" ? (
            <Pressable
              key={`page-${p}`}
              style={[
                styles.pageNumberBtn,
                p === page ? styles.pageNumberBtnActive : styles.pageNumberBtnInactive,
              ]}
              onPress={() => onPage(p)}
              accessibilityLabel={`Página ${p}`}
            >
              <Text
                style={[
                  styles.pageNumberText,
                  p === page ? styles.pageNumberTextActive : styles.pageNumberTextInactive,
                ]}
              >
                {p}
              </Text>
            </Pressable>
          ) : (
            <View key={`ellipsis-${idx}`} style={styles.pageEllipsis}>
              <Text style={styles.pageEllipsisText}>…</Text>
            </View>
          ),
        )}
      </View>

      <Pressable
        style={[
          styles.pageNavBtn,
          page >= pageCount ? styles.pageNavBtnDisabled : styles.pageNavBtnActive,
        ]}
        onPress={() => onPage(page + 1)}
        disabled={page >= pageCount}
        accessibilityLabel="Página siguiente"
      >
        <Text
          style={[
            styles.pageNavBtnText,
            page >= pageCount ? styles.pageNavBtnTextDisabled : styles.pageNavBtnTextActive,
          ]}
        >
          Siguiente ›
        </Text>
      </Pressable>
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
    cardList: { gap: 10, maxWidth: 980, width: "100%" },
    typeCard: {
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
    paginationWrap: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderTopWidth: 1,
      borderTopColor: c.borderRow,
      backgroundColor: c.bgCard,
    },
    mobilePaginationWrap: {
      marginTop: 6,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.bgCard,
      overflow: "hidden",
    },
    pageNavBtn: {
      paddingHorizontal: 14,
      height: 36,
      borderRadius: 8,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    pageNavBtnDisabled: {
      borderColor: c.border,
      backgroundColor: c.bgCard,
      opacity: 0.4,
    },
    pageNavBtnActive: {
      borderColor: c.accent,
      backgroundColor: c.accent,
    },
    pageNavBtnText: {
      fontSize: 13,
      fontWeight: "600",
    },
    pageNavBtnTextDisabled: {
      color: c.textMuted,
    },
    pageNavBtnTextActive: {
      color: "#fff",
    },
    pageNumbersWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    pageNumberBtn: {
      minWidth: 32,
      height: 32,
      paddingHorizontal: 6,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
    },
    pageNumberBtnActive: {
      backgroundColor: c.accent,
    },
    pageNumberBtnInactive: {
      backgroundColor: "transparent",
    },
    pageNumberText: {
      fontSize: 13,
      fontWeight: "600",
    },
    pageNumberTextActive: {
      color: "#fff",
    },
    pageNumberTextInactive: {
      color: c.textSecondary,
    },
    pageEllipsis: {
      minWidth: 24,
      height: 32,
      alignItems: "center",
      justifyContent: "center",
    },
    pageEllipsisText: {
      fontSize: 13,
      color: c.textMuted,
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
