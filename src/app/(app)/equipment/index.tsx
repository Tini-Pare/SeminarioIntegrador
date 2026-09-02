import { Stack, router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { AddEquipmentModal } from "../../../components/AddEquipmentModal";
import { EditEquipmentModal } from "../../../components/EditEquipmentModal";
import { ReportFaultModal } from "../../../components/ReportFaultModal";
import { StatusBadge } from "../../../components/StatusBadge";
import { Tooltip } from "../../../components/Tooltip";
import {
  EyeIcon,
  LocationIcon,
  PencilIcon,
  SearchIcon,
  TrashIcon,
} from "../../../components/icons";
import { BREAKPOINT } from "../../../constants";
import { getProfile } from "../../../lib/auth";
import { buildLocationColorMap } from "../../../lib/locationColor";
import { deleteEquipment, listEquipment } from "../../../lib/queries/equipment";
import { supabase } from "../../../lib/supabase";
import type { ThemeColors } from "../../../lib/theme";
import { useTheme } from "../../../lib/ThemeContext";
import { usePagination } from "../../../lib/usePagination";
import type { Equipo, Profile } from "../../../types/database";

type Filter = "all" | Equipo["status"];
type SortBy = "location" | "code";

const SORT_OPTIONS: { key: SortBy; label: string }[] = [
  { key: "location", label: "Ubicación" },
  { key: "code", label: "Código" },
];

const STATUS_FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "operational", label: "Funcionando" },
  { key: "waiting", label: "En espera" },
  { key: "repair", label: "En reparación" },
];

export default function EquipmentScreen() {
  const [equipment, setEquipment] = useState<Equipo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [editing, setEditing] = useState<Equipo | null>(null);
  const [equipmentToDelete, setEquipmentToDelete] = useState<Equipo | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("location");
  const [profile, setProfile] = useState<Profile | null>(null);
  const { width } = useWindowDimensions();
  const isWide = width >= BREAKPOINT.tablet;
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const isAdmin = profile?.role === "admin";
  const hasLoadedOnce = useRef(false);

  function reload() {
    if (!hasLoadedOnce.current) setLoading(true);
    listEquipment()
      .then((data) => {
        setEquipment(data);
        hasLoadedOnce.current = true;
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    getProfile().then(setProfile);
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, []),
  );

  useEffect(() => {
    const channel = supabase
      .channel(`equipment-list-changes-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "equipo" }, reload)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const equipmentView = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = equipment.filter((e) => {
      const matchQ = !q || `${e.name} ${e.code} ${e.location}`.toLowerCase().includes(q);
      const matchF = filter === "all" || e.status === filter;
      return matchQ && matchF;
    });
    if (sortBy === "code") {
      return [...filtered].sort((a, b) => a.code.localeCompare(b.code));
    }
    return [...filtered].sort(
      (a, b) => a.location.localeCompare(b.location) || a.code.localeCompare(b.code),
    );
  }, [equipment, search, filter, sortBy]);

  const locationColors = useMemo(
    () => buildLocationColorMap(equipment.map((e) => e.location)),
    [equipment],
  );

  const { pageItems, page, pageCount, setPage } = usePagination(
    equipmentView,
    `${search}|${filter}|${sortBy}`,
    8,
  );

  function handleDelete(e: Equipo) {
    setEquipmentToDelete(e);
  }

  async function handleConfirmDelete() {
    if (!equipmentToDelete) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteEquipment(equipmentToDelete.id);
      setEquipmentToDelete(null);
      setSuccessMessage("Equipo eliminado con éxito");
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setEquipmentToDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  useEffect(() => {
    if (!successMessage) return;
    const timer = setTimeout(() => setSuccessMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [successMessage]);

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator style={styles.center} />
      </>
    );
  }
  if (error) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={styles.error}>{error}</Text>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.pageHeader}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Equipos</Text>

            <Text style={styles.subtitle}>Estado en tiempo real de todos los equipos</Text>
          </View>

          <View style={styles.headerActions}>
            <Pressable style={styles.primaryButton} onPress={() => setModalVisible(true)}>
              <Text style={styles.primaryButtonText}>+ Reportar falla</Text>
            </Pressable>

            {isAdmin && (
              <Pressable style={styles.primaryButton} onPress={() => setAddModalVisible(true)}>
                <Text style={styles.primaryButtonText}>+ Nuevo equipo</Text>
              </Pressable>
            )}
          </View>
        </View>

        {successMessage && (
          <View style={styles.successBanner}>
            <Text style={styles.successText}>{successMessage}</Text>

            <Pressable onPress={() => setSuccessMessage(null)} hitSlop={8}>
              <Text style={styles.successClose}>✕</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.toolbar}>
          <View style={styles.searchBox}>
            <SearchIcon size={16} color={colors.textMuted} />

            <TextInput
              style={styles.searchInput}
              placeholder="Buscar por nombre, código o ubicación…"
              placeholderTextColor={colors.textMuted}
              value={search}
              onChangeText={(text) => {
                setSearch(text);
                setPage(1);
              }}
            />
          </View>

          <View style={styles.sortToggle}>
            {SORT_OPTIONS.map((s) => (
              <Pressable
                key={s.key}
                style={[styles.sortOption, sortBy === s.key && styles.sortOptionActive]}
                onPress={() => setSortBy(s.key)}
              >
                <Text
                  style={[styles.sortOptionText, sortBy === s.key && styles.sortOptionTextActive]}
                >
                  {s.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.countBadgePill}>
            <Text style={styles.countBadgePillText}>
              {equipmentView.length} {equipmentView.length === 1 ? "equipo" : "equipos"}
            </Text>
          </View>
        </View>

        <View style={styles.filterRow}>
          {STATUS_FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <Pressable
                key={f.key}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setFilter(f.key)}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {equipmentView.length === 0 ? (
          <Text style={styles.empty}>No hay equipos que coincidan con el filtro.</Text>
        ) : isWide ? (
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.headerCell, { flex: 1.6 }]}>EQUIPO</Text>

              <Text style={[styles.headerCell, { flex: 1.2 }]}>UBICACIÓN</Text>

              <Text style={[styles.headerCell, { flex: 1 }]}>ESTADO</Text>

              <Text style={[styles.headerCell, { flex: 1 }]}>TIPO</Text>

              <Text style={[styles.headerCell, styles.actionsCol]}>ACCIONES</Text>
            </View>

            {pageItems.map((e, index) => (
              <EquipmentTableRow
                key={e.id}
                equipment={e}
                index={index}
                isAdmin={isAdmin}
                locationColor={locationColors.get(e.location) ?? "#6a7b62"}
                onEdit={() => setEditing(e)}
                onDelete={() => handleDelete(e)}
                colors={colors}
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
            {pageItems.map((e) => (
              <View key={e.id} style={styles.card}>
                <View>
                  <View style={styles.cardTopRow}>
                    <Text style={styles.code}>{e.code}</Text>

                    <StatusBadge status={e.status} />
                  </View>

                  <Text style={styles.cardName}>{e.name}</Text>

                  <Text style={styles.typeText}>{e.type}</Text>

                  <View style={styles.cardLocationRow}>
                    <View
                      style={[
                        styles.locationDot,
                        { backgroundColor: locationColors.get(e.location) ?? "#6a7b62" },
                      ]}
                    />

                    <LocationIcon size={14} color={colors.textMuted} />

                    <Text style={styles.locationText}>{e.location}</Text>
                  </View>
                </View>

                <View style={styles.cardActions}>
                  <EquipmentRowActions
                    equipment={e}
                    isAdmin={isAdmin}
                    onEdit={() => setEditing(e)}
                    onDelete={() => handleDelete(e)}
                    colors={colors}
                    styles={styles}
                  />
                </View>
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

        <ReportFaultModal
          visible={modalVisible}
          onClose={() => setModalVisible(false)}
          onSubmitted={() => {}}
          equipmentOptions={equipment.map(({ id, code, name }) => ({ id, code, name }))}
        />

        <AddEquipmentModal
          visible={addModalVisible}
          onClose={() => setAddModalVisible(false)}
          onCreated={reload}
        />

        {editing && (
          <EditEquipmentModal
            visible={!!editing}
            onClose={() => setEditing(null)}
            onSaved={reload}
            equipment={editing}
          />
        )}

        <Modal
          visible={!!equipmentToDelete}
          transparent
          animationType="fade"
          onRequestClose={() => {
            if (!deleting) setEquipmentToDelete(null);
          }}
        >
          <View style={styles.overlay}>
            <View style={styles.confirmSheet}>
              <Text style={styles.confirmTitle}>Eliminar equipo</Text>

              <Text style={styles.confirmMessage}>
                ¿Desea eliminar el equipo "{equipmentToDelete?.name}" ({equipmentToDelete?.code})?
              </Text>

              <View style={styles.confirmActions}>
                <Pressable
                  style={styles.confirmCancelButton}
                  onPress={() => setEquipmentToDelete(null)}
                  disabled={deleting}
                >
                  <Text style={styles.confirmCancelText}>CANCELAR</Text>
                </Pressable>

                <Pressable
                  style={styles.confirmAcceptButton}
                  onPress={handleConfirmDelete}
                  disabled={deleting}
                >
                  <Text style={styles.confirmAcceptText}>
                    {deleting ? "Procesando…" : "ACEPTAR"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </>
  );
}

function EquipmentRowActions({
  equipment: e,
  isAdmin,
  onEdit,
  onDelete,
  colors,
  styles,
}: {
  equipment: Equipo;
  isAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
}) {
  const [hoverView, setHoverView] = useState(false);
  const [hoverEdit, setHoverEdit] = useState(false);
  const [hoverDelete, setHoverDelete] = useState(false);

  return (
    <View style={styles.actionsWrap}>
      <Tooltip text="Ver detalle">
        <Pressable
          style={[styles.actionButton, hoverView && styles.actionButtonViewHover]}
          onPress={() => router.push(`/equipment/${e.id}`)}
          onHoverIn={() => setHoverView(true)}
          onHoverOut={() => setHoverView(false)}
          hitSlop={6}
          accessibilityLabel="Ver detalle"
        >
          <EyeIcon size={16} color={colors.accent} />
        </Pressable>
      </Tooltip>

      {isAdmin && (
        <>
          <Tooltip text="Editar equipo">
            <Pressable
              style={[styles.actionButton, hoverEdit && styles.actionButtonEditHover]}
              onPress={onEdit}
              onHoverIn={() => setHoverEdit(true)}
              onHoverOut={() => setHoverEdit(false)}
              hitSlop={6}
              accessibilityLabel="Editar equipo"
            >
              <PencilIcon size={16} color={colors.accent} />
            </Pressable>
          </Tooltip>

          <Tooltip text="Eliminar equipo" align="right">
            <Pressable
              style={[styles.actionButton, hoverDelete && styles.actionButtonDeleteHover]}
              onPress={onDelete}
              onHoverIn={() => setHoverDelete(true)}
              onHoverOut={() => setHoverDelete(false)}
              hitSlop={6}
              accessibilityLabel="Eliminar equipo"
            >
              <TrashIcon size={16} color={colors.destructive} />
            </Pressable>
          </Tooltip>
        </>
      )}
    </View>
  );
}

function EquipmentTableRow({
  equipment: e,
  index,
  isAdmin,
  locationColor,
  onEdit,
  onDelete,
  colors,
  styles,
}: {
  equipment: Equipo;
  index: number;
  isAdmin: boolean;
  locationColor: string;
  onEdit: () => void;
  onDelete: () => void;
  colors: ThemeColors;
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
        <View style={{ flex: 1.6, justifyContent: "center", paddingRight: 12 }}>
          <Text style={styles.name} numberOfLines={1}>
            {e.name}
          </Text>

          <Text style={styles.code} numberOfLines={1}>
            {e.code}
          </Text>
        </View>

        <View style={styles.locationCell}>
          <View style={[styles.locationDot, { backgroundColor: locationColor }]} />

          <Text style={styles.locationText} numberOfLines={1}>
            {e.location || "—"}
          </Text>
        </View>

        <View style={{ flex: 1, justifyContent: "center", alignItems: "flex-start" }}>
          <StatusBadge status={e.status} />
        </View>

        <View style={{ flex: 1, justifyContent: "center" }}>
          <Text style={styles.typeText} numberOfLines={1}>
            {e.type || "—"}
          </Text>
        </View>
      </View>

      <View style={styles.actionsCol}>
        <EquipmentRowActions
          equipment={e}
          isAdmin={isAdmin}
          onEdit={onEdit}
          onDelete={onDelete}
          colors={colors}
          styles={styles}
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
    container: { flex: 1, backgroundColor: c.bg },
    content: { padding: 24, paddingBottom: 48 },
    center: { flex: 1 },
    error: { padding: 16, color: c.destructive },
    pageHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 20,
      gap: 12,
      flexWrap: "wrap",
    },
    headerText: { flexShrink: 1, minWidth: 0 },
    title: { fontSize: 22, fontWeight: "600", color: c.text },
    subtitle: { marginTop: 3, fontSize: 13.5, color: c.textSecondary },
    headerActions: {
      flexDirection: "row",
      gap: 10,
      flexWrap: "wrap",
      flexShrink: 1,
      maxWidth: "100%",
    },
    primaryButton: {
      backgroundColor: c.accent,
      paddingHorizontal: 22,
      height: 46,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    primaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 15 },
    toolbar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: 12,
      marginBottom: 14,
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
    sortToggle: {
      flexDirection: "row",
      backgroundColor: c.bgToggle,
      borderRadius: 9,
      padding: 3,
      gap: 2,
    },
    sortOption: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 7 },
    sortOptionActive: { backgroundColor: c.bgToggleActive },
    sortOptionText: { fontSize: 12.5, fontWeight: "600", color: c.textMuted },
    sortOptionTextActive: { color: c.text },
    filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
    filterChip: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.bgCard,
    },
    filterChipActive: { backgroundColor: c.text, borderColor: c.text },
    filterChipText: { fontSize: 12.5, fontWeight: "600", color: c.textSecondary },
    filterChipTextActive: { color: c.bgCard },
    empty: { color: c.textMuted, fontSize: 13.5, marginTop: 8 },
    table: {
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 14,
      overflow: "hidden",
      maxWidth: 1040,
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
    actionsCol: { width: 114, flexShrink: 0, alignItems: "flex-start" },
    actionsWrap: {
      flexDirection: "row",
      gap: 6,
    },
    actionButton: {
      width: 32,
      height: 32,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
    },
    actionButtonViewHover: {
      backgroundColor: c.eqOperational.bg,
      borderColor: c.accent,
    },
    actionButtonEditHover: {
      backgroundColor: c.eqOperational.bg,
      borderColor: c.accent,
    },
    actionButtonDeleteHover: {
      backgroundColor: c.eqRepair.bg,
      borderColor: c.destructive,
    },
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
    rowMain: { flex: 1, flexDirection: "row", alignItems: "center", minWidth: 0 },
    name: { fontWeight: "600", fontSize: 15, color: c.text },
    code: { fontSize: 12, color: c.textSecondary, marginTop: 2 },
    locationCell: {
      flex: 1.2,
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      paddingRight: 12,
    },
    locationDot: { width: 7, height: 7, borderRadius: 4 },
    locationText: { fontSize: 13.5, color: c.textSecondary, flexShrink: 1 },
    typeText: { fontSize: 13.5, color: c.textSecondary },
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
    cardList: { gap: 12, maxWidth: 1040, width: "100%" },
    card: {
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 14,
      padding: 18,
    },
    cardTopRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 10,
    },
    cardName: { fontSize: 18, fontWeight: "600", color: c.text },
    cardLocationRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 13 },
    cardActions: {
      marginTop: 14,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: c.borderRow,
      flexDirection: "row",
      justifyContent: "flex-end",
    },
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.45)",
      justifyContent: "center",
      alignItems: "center",
      padding: 20,
    },
    confirmSheet: {
      backgroundColor: c.bgModal,
      borderRadius: 16,
      padding: 24,
      width: "100%",
      maxWidth: 420,
      borderWidth: 1,
      borderColor: c.border,
    },
    confirmTitle: { fontSize: 18, fontWeight: "600", color: c.text, marginBottom: 10 },
    confirmMessage: {
      fontSize: 14.5,
      lineHeight: 21,
      color: c.textSecondary,
      marginBottom: 24,
    },
    confirmActions: { flexDirection: "row", gap: 12, justifyContent: "flex-end" },
    confirmCancelButton: {
      flex: 1,
      height: 42,
      borderRadius: 10,
      backgroundColor: "#dc2626",
      alignItems: "center",
      justifyContent: "center",
    },
    confirmCancelText: { color: "#fff", fontWeight: "600", fontSize: 13.5 },
    confirmAcceptButton: {
      flex: 1,
      height: 42,
      borderRadius: 10,
      backgroundColor: c.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    confirmAcceptText: { color: "#fff", fontWeight: "600", fontSize: 13.5 },
    successBanner: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: c.bgCard,
      borderColor: c.success,
      borderWidth: 1,
      borderLeftWidth: 4,
      borderRadius: 10,
      paddingHorizontal: 16,
      paddingVertical: 12,
      marginBottom: 18,
    },
    successText: { color: c.success, fontWeight: "600", fontSize: 14 },
    successClose: { color: c.textMuted, fontSize: 14, fontWeight: "600", paddingLeft: 8 },
  });
}

