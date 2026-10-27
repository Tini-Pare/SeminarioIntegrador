import { Stack, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { MaintenancePlanModal } from "../../../components/MaintenancePlanModal";
import { Pagination } from "../../../components/Pagination";
import { RowActions } from "../../../components/RowActions";
import { SortHeaderCell } from "../../../components/SortHeaderCell";
import { TableFilterBar } from "../../../components/TableFilterBar";
import { WarningIcon } from "../../../components/icons";
import { BREAKPOINT } from "../../../constants";
import { getProfile } from "../../../lib/auth";
import {
  deactivateMaintenancePlan,
  deleteMaintenancePlan,
  listMaintenancePlans,
} from "../../../lib/queries/maintenancePlans";
import { listEquipmentTypes } from "../../../lib/queries/equipmentTypes";
import { supabase } from "../../../lib/supabase";
import type { ThemeColors } from "../../../lib/theme";
import { useTheme } from "../../../lib/ThemeContext";
import { usePagination } from "../../../lib/usePagination";
import { includesSearch, normalizeSearch } from "../../../lib/search";
import { useTableSort } from "../../../lib/useTableSort";
import type { PlanMantenimientoItem, Profile } from "../../../types/database";

export default function MaintenancePlansScreen() {
  const [plans, setPlans] = useState<PlanMantenimientoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters & Search
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [availableTypes, setAvailableTypes] = useState<{ value: string; label: string }[]>([]);

  // Modals state
  const [modalMode, setModalMode] = useState<"create" | "edit" | "view">("create");
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  // Delete & Deactivate handling
  const [planToDelete, setPlanToDelete] = useState<PlanMantenimientoItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showDeactivatePrompt, setShowDeactivatePrompt] = useState(false);

  const [profile, setProfile] = useState<Profile | null>(null);
  const { width } = useWindowDimensions();
  const isWide = width >= BREAKPOINT.tablet;
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const isAdmin = profile?.role === "admin";
  const hasLoadedOnce = useRef(false);

  function reload() {
    if (!hasLoadedOnce.current) setLoading(true);
    listMaintenancePlans()
      .then((data) => {
        setPlans(data);
        hasLoadedOnce.current = true;
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    getProfile().then(setProfile);
    listEquipmentTypes()
      .then((tList) => {
        setAvailableTypes([
          { value: "", label: "Todos los tipos" },
          ...tList.map((t) => ({ value: String(t.te_id), label: t.te_nombre })),
        ]);
      })
      .catch(() => {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, []),
  );

  // Subscribe to realtime database changes for plan_mantenimiento
  useEffect(() => {
    const channel = supabase
      .channel(`maintenance-plans-changes-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "plan_mantenimiento" }, reload)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!successMessage) return;
    const timer = setTimeout(() => setSuccessMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [successMessage]);

  // Filtering
  const filteredPlans = useMemo(() => {
    const q = normalizeSearch(search.trim());
    return plans.filter((p) => {
      const matchQ =
        !q ||
        includesSearch(`${p.pm_nombre_plan} ${p.te_nombre} ${p.pm_descripcion_plan ?? ""}`, q);
      const matchStatus = !statusFilter || p.pm_estado === statusFilter;
      const matchType = !typeFilter || String(p.te_id) === typeFilter;
      return matchQ && matchStatus && matchType;
    });
  }, [plans, search, statusFilter, typeFilter]);

  // Sorting
  const { sorted, field, dir, toggle } = useTableSort<PlanMantenimientoItem>(
    filteredPlans,
    {
      plan: (p) => p.pm_nombre_plan,
      tipo: (p) => p.te_nombre,
      frecuencia: (p) => p.pm_frecuencia,
      tareas: (p) => p.task_count,
      equipos: (p) => p.equipment_count,
      vencimiento: (p) => p.prox_vencimiento ?? "9999-12-31",
      estado: (p) => (p.pm_estado === "activo" ? 0 : 1),
    },
    "plan",
  );

  // Pagination (8 items per page)
  const { pageItems, page, pageCount, setPage } = usePagination(
    sorted,
    `${search}|${statusFilter}|${typeFilter}|${field}|${dir}`,
    8,
  );

  function handleOpenCreate() {
    setSelectedPlanId(null);
    setModalMode("create");
    setModalVisible(true);
  }

  function handleOpenView(p: PlanMantenimientoItem) {
    setSelectedPlanId(p.pm_id_plan);
    setModalMode("view");
    setModalVisible(true);
  }

  function handleOpenEdit(p: PlanMantenimientoItem) {
    setSelectedPlanId(p.pm_id_plan);
    setModalMode("edit");
    setModalVisible(true);
  }

  function handleDeleteClick(p: PlanMantenimientoItem) {
    setPlanToDelete(p);
    setShowDeactivatePrompt(false);
  }

  async function handleConfirmDelete() {
    if (!planToDelete) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteMaintenancePlan(planToDelete.pm_id_plan);
      setPlanToDelete(null);
      setSuccessMessage("Plan de mantenimiento eliminado con éxito");
      reload();
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("HAS_WORK_ORDERS")) {
        // Plan has associated work orders: offer deactivation instead
        setShowDeactivatePrompt(true);
      } else {
        setError(msg);
        setPlanToDelete(null);
      }
    } finally {
      setDeleting(false);
    }
  }

  async function handleConfirmDeactivate() {
    if (!planToDelete) return;
    setDeleting(true);
    setError(null);
    try {
      await deactivateMaintenancePlan(planToDelete.pm_id_plan);
      setPlanToDelete(null);
      setShowDeactivatePrompt(false);
      setSuccessMessage("Plan de mantenimiento dado de baja (marcado como inactivo)");
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPlanToDelete(null);
      setShowDeactivatePrompt(false);
    } finally {
      setDeleting(false);
    }
  }

  // Non-admin block (R8)
  if (!loading && profile && !isAdmin) {
    return (
      <View style={styles.centerWrap}>
        <Stack.Screen options={{ headerShown: false }} />

        <WarningIcon size={32} color={colors.urgencyMedium.accent} />

        <Text style={styles.accessDeniedTitle}>Acceso restringido</Text>

        <Text style={styles.accessDeniedText}>
          Solo los administradores pueden gestionar los planes de mantenimiento preventivo.
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />

        <ActivityIndicator style={styles.center} color={colors.accent} />
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.pageHeader}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Planes de mantenimiento</Text>

            <Text style={styles.subtitle}>
              Planes preventivos por tipo de equipo; generan OTs automáticas
            </Text>
          </View>

          {isAdmin && (
            <View style={styles.headerActions}>
              <Pressable style={styles.primaryButton} onPress={handleOpenCreate}>
                <Text style={styles.primaryButtonText}>+ Nuevo plan</Text>
              </Pressable>
            </View>
          )}
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        {successMessage && (
          <View style={styles.successBanner}>
            <Text style={styles.successText}>{successMessage}</Text>

            <Pressable onPress={() => setSuccessMessage(null)} hitSlop={8}>
              <Text style={styles.successClose}>✕</Text>
            </Pressable>
          </View>
        )}

        {/* Filter bar */}
        <TableFilterBar
          searchValue={search}
          onSearch={setSearch}
          searchPlaceholder="Buscar por plan o tipo de equipo…"
          filters={[
            {
              key: "estado",
              label: "Estado",
              value: statusFilter,
              onChange: setStatusFilter,
              options: [
                { value: "", label: "Todos los estados" },
                { value: "activo", label: "Activo" },
                { value: "inactivo", label: "Inactivo" },
              ],
            },
            ...(availableTypes.length > 1
              ? [
                  {
                    key: "tipo",
                    label: "Tipo",
                    value: typeFilter,
                    onChange: setTypeFilter,
                    options: availableTypes,
                  },
                ]
              : []),
          ]}
          right={
            <Text style={styles.countBadgePillText}>
              {sorted.length} {sorted.length === 1 ? "plan" : "planes"}
            </Text>
          }
        />

        {/* Table or Empty State */}
        {sorted.length === 0 ? (
          <Text style={styles.empty}>
            No hay planes que coincidan con la búsqueda o los filtros.
          </Text>
        ) : isWide ? (
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <SortHeaderCell
                label="PLAN"
                field="plan"
                activeField={field}
                dir={dir}
                onSort={toggle}
                style={{ flex: 2.2 }}
              />

              <SortHeaderCell
                label="TIPO DE EQUIPO"
                field="tipo"
                activeField={field}
                dir={dir}
                onSort={toggle}
                style={{ flex: 1.6 }}
              />

              <SortHeaderCell
                label="FRECUENCIA"
                field="frecuencia"
                activeField={field}
                dir={dir}
                onSort={toggle}
                style={{ flex: 1.2 }}
              />

              <SortHeaderCell
                label="TAREAS"
                field="tareas"
                activeField={field}
                dir={dir}
                onSort={toggle}
                style={{ flex: 1 }}
              />

              <SortHeaderCell
                label="EQUIPOS"
                field="equipos"
                activeField={field}
                dir={dir}
                onSort={toggle}
                style={{ flex: 1 }}
              />

              <SortHeaderCell
                label="ESTADO"
                field="estado"
                activeField={field}
                dir={dir}
                onSort={toggle}
                style={{ flex: 1.1 }}
              />

              <Text style={[styles.headerCell, styles.actionsCol]}>ACCIONES</Text>
            </View>

            {pageItems.map((p, idx) => (
              <PlanTableRow
                key={p.pm_id_plan}
                plan={p}
                index={idx}
                isAdmin={isAdmin}
                onView={() => handleOpenView(p)}
                onEdit={() => handleOpenEdit(p)}
                onDelete={() => handleDeleteClick(p)}
                colors={colors}
                styles={styles}
              />
            ))}
          </View>
        ) : (
          /* Mobile Card List */
          <View style={styles.cardList}>
            {pageItems.map((p) => (
              <View key={p.pm_id_plan} style={styles.card}>
                <View style={styles.cardTopRow}>
                  <Text style={styles.cardTitle}>{p.pm_nombre_plan}</Text>

                  <ActiveBadge active={p.pm_estado === "activo"} styles={styles} colors={colors} />
                </View>

                {p.pm_descripcion_plan ? (
                  <Text style={styles.cardDesc} numberOfLines={2}>
                    {p.pm_descripcion_plan}
                  </Text>
                ) : null}

                <View style={styles.cardMetaGrid}>
                  <View style={styles.cardMetaItem}>
                    <Text style={styles.cardMetaLabel}>TIPO</Text>

                    <Text style={styles.cardMetaVal}>{p.te_nombre}</Text>
                  </View>

                  <View style={styles.cardMetaItem}>
                    <Text style={styles.cardMetaLabel}>FRECUENCIA</Text>

                    <Text style={styles.cardMetaVal}>
                      Cada {p.pm_frecuencia} {p.pm_frecuencia === 1 ? "día" : "días"}
                    </Text>
                  </View>

                  <View style={styles.cardMetaItem}>
                    <Text style={styles.cardMetaLabel}>TAREAS / EQUIPOS</Text>

                    <Text style={styles.cardMetaVal}>
                      {p.task_count} tareas · {p.equipment_count} eq.
                    </Text>
                  </View>
                </View>

                <View style={styles.cardActions}>
                  <RowActions
                    onView={() => handleOpenView(p)}
                    onEdit={isAdmin ? () => handleOpenEdit(p) : undefined}
                    onDelete={isAdmin ? () => handleDeleteClick(p) : undefined}
                    viewTooltip="Ver plan"
                    editTooltip="Editar plan"
                    deleteTooltip="Eliminar o dar de baja"
                  />
                </View>
              </View>
            ))}
          </View>
        )}

        <Pagination page={page} pageCount={pageCount} onPage={setPage} />

        {/* Create / Edit / View Modal */}
        <MaintenancePlanModal
          visible={modalVisible}
          onClose={() => setModalVisible(false)}
          onSaved={reload}
          planId={selectedPlanId}
          mode={modalMode}
        />

        {/* Delete / Deactivate confirmation — same dialog as the other screens */}
        <ConfirmDialog
          visible={!!planToDelete}
          title={showDeactivatePrompt ? "Plan con órdenes de trabajo" : "Eliminar plan"}
          message={
            showDeactivatePrompt
              ? `El plan "${planToDelete?.pm_nombre_plan}" ya tiene órdenes de trabajo asociadas y no puede ser borrado físicamente para resguardar el historial. ¿Deseás darlo de baja marcándolo como Inactivo?`
              : `¿Desea eliminar el plan "${planToDelete?.pm_nombre_plan}"? Esta acción borrará también sus tareas previstas y registros de mantenimiento.`
          }
          confirmLabel={showDeactivatePrompt ? "Dar de baja" : "Eliminar"}
          busy={deleting}
          onConfirm={showDeactivatePrompt ? handleConfirmDeactivate : handleConfirmDelete}
          onCancel={() => {
            setPlanToDelete(null);
            setShowDeactivatePrompt(false);
          }}
        />
      </ScrollView>
    </>
  );
}

function ActiveBadge({
  active,
  styles,
  colors,
}: {
  active: boolean;
  styles: ReturnType<typeof makeStyles>;
  colors: ThemeColors;
}) {
  return (
    <View style={styles.statusChip}>
      <View
        style={[styles.statusDot, { backgroundColor: active ? colors.success : colors.textMuted }]}
      />

      <Text style={[styles.statusText, { color: active ? colors.success : colors.textMuted }]}>
        {active ? "Activo" : "Inactivo"}
      </Text>
    </View>
  );
}

function PlanTableRow({
  plan: p,
  index,
  isAdmin,
  onView,
  onEdit,
  onDelete,
  colors,
  styles,
}: {
  plan: PlanMantenimientoItem;
  index: number;
  isAdmin: boolean;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={[styles.tableRow, index % 2 === 1 ? styles.rowAlt : styles.rowNormal]}>
      {/* Plan Column */}
      <View style={{ flex: 2.2 }}>
        <Text style={styles.planNameText} numberOfLines={1}>
          {p.pm_nombre_plan}
        </Text>

        {p.pm_descripcion_plan ? (
          <Text style={styles.planDescText} numberOfLines={1}>
            {p.pm_descripcion_plan}
          </Text>
        ) : null}
      </View>

      {/* Tipo */}
      <View style={{ flex: 1.6 }}>
        <Text style={styles.typeText} numberOfLines={1}>
          {p.te_nombre}
        </Text>
      </View>

      {/* Frecuencia */}
      <View style={{ flex: 1.2 }}>
        <Text style={styles.cellText}>
          Cada {p.pm_frecuencia} {p.pm_frecuencia === 1 ? "día" : "días"}
        </Text>
      </View>

      {/* Tareas */}
      <View style={{ flex: 1 }}>
        <Text style={styles.cellText}>{p.task_count}</Text>
      </View>

      {/* Equipos */}
      <View style={{ flex: 1 }}>
        <Text style={styles.cellText}>{p.equipment_count}</Text>
      </View>

      {/* Estado */}
      <View style={{ flex: 1.1 }}>
        <ActiveBadge active={p.pm_estado === "activo"} styles={styles} colors={colors} />
      </View>

      {/* Acciones */}
      <View style={styles.actionsCol}>
        <RowActions
          onView={onView}
          onEdit={isAdmin ? onEdit : undefined}
          onDelete={isAdmin ? onDelete : undefined}
          viewTooltip="Ver plan"
          editTooltip="Editar plan"
          deleteTooltip="Eliminar o dar de baja"
        />
      </View>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.bg,
    },
    content: {
      padding: 20,
      gap: 16,
    },
    center: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
    },
    centerWrap: {
      flex: 1,
      backgroundColor: c.bg,
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
      gap: 12,
    },
    accessDeniedTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: c.text,
    },
    accessDeniedText: {
      fontSize: 14,
      color: c.textMuted,
      textAlign: "center",
      maxWidth: 400,
    },
    pageHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    headerText: {
      gap: 3,
    },
    title: {
      fontSize: 22,
      fontWeight: "600",
      color: c.text,
    },
    subtitle: {
      fontSize: 13.5,
      color: c.textSecondary,
    },
    headerActions: {
      flexDirection: "row",
      gap: 12,
    },
    primaryButton: {
      backgroundColor: c.accent,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 10,
      alignItems: "center",
    },
    primaryButtonText: {
      color: "#FFFFFF",
      fontWeight: "600",
      fontSize: 14,
    },
    error: {
      color: c.destructive,
      backgroundColor: c.bgNested,
      padding: 12,
      borderRadius: 8,
      fontSize: 13,
    },
    successBanner: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      backgroundColor: c.eqOperational.bg,
      borderWidth: 1,
      borderColor: c.success,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    successText: {
      fontSize: 13.5,
      color: c.success,
      fontWeight: "600",
    },
    successClose: {
      fontSize: 14,
      color: c.success,
      paddingHorizontal: 4,
    },
    countBadgePillText: {
      fontSize: 13,
      fontWeight: "600",
      color: c.textMuted,
    },
    empty: {
      textAlign: "center",
      paddingVertical: 48,
      color: c.textMuted,
      fontSize: 14,
    },
    table: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      overflow: "hidden",
      backgroundColor: c.bgCard,
    },
    tableHeader: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
      paddingHorizontal: 16,
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
    actionsCol: {
      width: 128,
      flexShrink: 0,
      alignItems: "flex-start",
    },
    tableRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    rowNormal: {
      backgroundColor: c.bgRow,
    },
    rowAlt: {
      backgroundColor: c.bgRowAlt,
    },
    planNameText: {
      fontSize: 14,
      fontWeight: "700",
      color: c.text,
    },
    planDescText: {
      fontSize: 12,
      color: c.textMuted,
      marginTop: 2,
    },
    typeText: {
      fontSize: 13,
      color: c.text,
      fontWeight: "500",
    },
    cellText: {
      fontSize: 13,
      color: c.text,
    },
    statusChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      alignSelf: "flex-start",
    },
    statusDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
    },
    statusText: {
      fontSize: 12.5,
      fontWeight: "600",
    },
    cardList: {
      gap: 12,
    },
    card: {
      backgroundColor: c.bgCard,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      padding: 16,
      gap: 10,
    },
    cardTopRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: c.text,
      flex: 1,
      marginRight: 10,
    },
    cardDesc: {
      fontSize: 12.5,
      color: c.textMuted,
    },
    cardMetaGrid: {
      gap: 6,
      backgroundColor: c.bgNested,
      padding: 10,
      borderRadius: 8,
    },
    cardMetaItem: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    cardMetaLabel: {
      fontSize: 11,
      fontWeight: "700",
      color: c.textMuted,
      letterSpacing: 0.5,
    },
    cardMetaVal: {
      fontSize: 12.5,
      fontWeight: "500",
      color: c.text,
    },
    cardActions: {
      flexDirection: "row",
      justifyContent: "flex-end",
      marginTop: 4,
    },
  });
}
