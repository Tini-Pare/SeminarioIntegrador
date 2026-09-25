import { router } from "expo-router";
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
  View,
} from "react-native";
import {
  CustomDatePicker,
  isValidDateString,
  parseDateString,
  toDbDate,
  toDay,
} from "../../../components/CustomDatePicker";
import { EyeIcon, FunnelIcon, ReviewIcon, SearchIcon } from "../../../components/icons";
import { Tooltip } from "../../../components/Tooltip";
import { Pagination } from "../../../components/Pagination";
import { PurchaseOrderDetailModal } from "../../../components/PurchaseOrderDetailModal";
import { PurchaseOrderModal } from "../../../components/PurchaseOrderModal";
import { RejectPurchaseOrderModal } from "../../../components/RejectPurchaseOrderModal";
import { SortHeaderCell } from "../../../components/SortHeaderCell";
import { getProfile } from "../../../lib/auth";
import {
  listPurchaseOrders,
  type PurchaseOrderWithLines,
} from "../../../lib/queries/purchaseOrders";
import { listProfiles } from "../../../lib/queries/profiles";
import { listSpareParts } from "../../../lib/queries/spareParts";
import { supabase } from "../../../lib/supabase";
import type { ThemeColors } from "../../../lib/theme";
import { useTheme } from "../../../lib/ThemeContext";
import { usePagination } from "../../../lib/usePagination";
import { useTableSort } from "../../../lib/useTableSort";
import type { PedidoCompra, Repuesto } from "../../../types/database";

const ESTADO_LABELS: Record<PedidoCompra["ped_estado"], string> = {
  pendiente: "Pendiente",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
  recibido: "Recibido",
};

const ESTADO_RANK: Record<PedidoCompra["ped_estado"], number> = {
  pendiente: 0,
  aprobado: 1,
  recibido: 2,
  rechazado: 3,
};

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("es-AR");
}

function itemsSummary(o: PurchaseOrderWithLines): string {
  const names = o.linea_pedido.map((l) => l.repuesto?.rep_nombre ?? `Repuesto ${l.rep_id}`);
  if (names.length === 0) return "—";
  if (names.length <= 2) return names.join(" · ");
  return `${names.slice(0, 2).join(" · ")} +${names.length - 2}`;
}

function TechFilterDropdown({
  value,
  onChange,
  options,
  colors,
}: {
  value: string;
  onChange: (val: string) => void;
  options: { value: string; label: string }[];
  colors: ThemeColors;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value) ?? options[0];

  return (
    <View style={dropdownStyles.wrap}>
      <Pressable
        style={[
          dropdownStyles.btn,
          {
            backgroundColor: colors.bgCard,
            borderColor: value ? colors.accent : colors.borderInput,
          },
          open && { borderColor: colors.accent },
        ]}
        onPress={() => setOpen((v) => !v)}
        accessibilityLabel="Filtrar por técnico"
      >
        <Text
          style={[
            dropdownStyles.btnText,
            { color: value ? colors.accent : colors.textLabel },
            value !== "" && { fontWeight: "600" },
          ]}
          numberOfLines={1}
        >
          {selected?.label ?? "Todos los técnicos"}
        </Text>

        <Text style={[dropdownStyles.chevron, { color: value ? colors.accent : colors.textMuted }]}>
          {open ? "▲" : "▼"}
        </Text>
      </Pressable>

      {open && (
        <>
          <Pressable style={dropdownStyles.backdrop} onPress={() => setOpen(false)} />

          <View
            style={[
              dropdownStyles.menu,
              {
                backgroundColor: colors.bgModal,
                borderColor: colors.border,
              },
            ]}
          >
            <ScrollView
              style={{ maxHeight: 220 }}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
            >
              {options.map((opt) => {
                const active = opt.value === value;
                return (
                  <Pressable
                    key={opt.value}
                    style={[
                      dropdownStyles.option,
                      active && { backgroundColor: colors.accent + "15" },
                    ]}
                    onPress={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                  >
                    <Text
                      style={[
                        dropdownStyles.optionText,
                        { color: active ? colors.accent : colors.text },
                        active && { fontWeight: "700" },
                      ]}
                      numberOfLines={1}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </>
      )}
    </View>
  );
}

const dropdownStyles = StyleSheet.create({
  wrap: { position: "relative", zIndex: 65 },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    height: 40,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 9,
    minWidth: 160,
    maxWidth: 240,
  },
  btnText: { fontSize: 13.5, flex: 1 },
  chevron: { fontSize: 10 },
  backdrop: {
    position: Platform.OS === "web" ? "fixed" : "absolute",
    top: Platform.OS === "web" ? 0 : -1000,
    left: Platform.OS === "web" ? 0 : -1000,
    right: Platform.OS === "web" ? 0 : -1000,
    bottom: Platform.OS === "web" ? 0 : -1000,
    zIndex: 70,
    backgroundColor: "transparent",
  },
  menu: {
    position: "absolute",
    top: 44,
    left: 0,
    minWidth: 220,
    borderWidth: 1,
    borderRadius: 10,
    overflow: "hidden",
    zIndex: 80,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 5,
    ...(Platform.OS === "web" ? { boxShadow: "0px 4px 10px rgba(0, 0, 0, 0.3)" } : {}),
  },
  option: { paddingHorizontal: 14, paddingVertical: 10 },
  optionText: { fontSize: 13.5 },
});

export default function PurchaseOrdersScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [orders, setOrders] = useState<PurchaseOrderWithLines[]>([]);
  const [techNames, setTechNames] = useState<Map<string, string>>(new Map());
  const [spareParts, setSpareParts] = useState<Repuesto[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [techFilter, setTechFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [filtersOpen, setFiltersOpen] = useState(false);

  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<PurchaseOrderWithLines | null>(null);
  const [rejecting, setRejecting] = useState<number | null>(null);

  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const load = useCallback(async () => {
    setError(null);
    try {
      const profile = await getProfile();
      const admin = profile?.role === "admin";
      setIsAdmin(admin);

      const [list, parts] = await Promise.all([
        listPurchaseOrders(admin ? "all" : "mine"),
        listSpareParts(),
      ]);
      setOrders(list);
      setSpareParts(parts);

      if (admin) {
        const profiles = await listProfiles();
        setTechNames(new Map(profiles.map((p) => [p.id, p.name])));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel(`purchase-orders-changes-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "pedido_compra" }, load)
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

  function openReject(order: PurchaseOrderWithLines) {
    setViewing(null);
    setRejecting(order.ped_id_ped_compra);
  }

  const techOptions = useMemo(() => {
    const map = new Map<string, string>();
    orders.forEach((o) => {
      const name = techNames.get(o.p_id_tecnico);
      if (name) {
        map.set(o.p_id_tecnico, name);
      } else if (o.p_id_tecnico) {
        map.set(o.p_id_tecnico, "Técnico " + o.p_id_tecnico.slice(0, 6));
      }
    });
    return [
      { value: "", label: "Todos los técnicos" },
      ...Array.from(map.entries())
        .map(([id, name]) => ({ value: id, label: name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ];
  }, [orders, techNames]);

  const statusChips = useMemo(
    () => [
      { key: "", label: "Todos" },
      { key: "pendiente", label: "Pendiente" },
      { key: "aprobado", label: "Aprobado" },
      { key: "recibido", label: "Recibido" },
      { key: "rechazado", label: "Rechazado" },
    ],
    [],
  );

  const today = useMemo(() => toDay(new Date()), []);
  const parsedDateFrom = useMemo(() => parseDateString(dateFrom), [dateFrom]);
  const parsedDateTo = useMemo(() => parseDateString(dateTo), [dateTo]);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (statusFilter) count++;
    if (dateFrom || dateTo) count++;
    if (techFilter) count++;
    return count;
  }, [statusFilter, dateFrom, dateTo, techFilter]);
  const hasActiveFilters = activeFiltersCount > 0;

  function handleToggleFilters() {
    setFiltersOpen((prev) => !prev);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const dbFrom = isValidDateString(dateFrom) ? toDbDate(dateFrom) : null;
    const dbTo = isValidDateString(dateTo) ? toDbDate(dateTo) : null;
    const cleanStatusFilter = statusFilter.trim().toLowerCase();

    return orders.filter((o) => {
      // 1. Search by technician name or spare part name
      const techName = techNames.get(o.p_id_tecnico)?.toLowerCase() ?? "";
      const matchSearch =
        !q ||
        techName.includes(q) ||
        o.linea_pedido.some((l) => l.repuesto?.rep_nombre?.toLowerCase().includes(q));

      // 2. Status filter
      const oStatus = (o.ped_estado ?? "").toLowerCase().trim();
      const matchStatus = !cleanStatusFilter || oStatus === cleanStatusFilter;

      // 3. Technician filter (for admin)
      const matchTech = !techFilter || o.p_id_tecnico === techFilter;

      // 4. Date range filter
      let matchDate = true;
      if (dbFrom) {
        if (!o.ped_fecha_solicitud || o.ped_fecha_solicitud < dbFrom) {
          matchDate = false;
        }
      }
      if (dbTo) {
        if (!o.ped_fecha_solicitud || o.ped_fecha_solicitud > dbTo) {
          matchDate = false;
        }
      }

      return matchSearch && matchStatus && matchTech && matchDate;
    });
  }, [orders, search, statusFilter, techFilter, dateFrom, dateTo, techNames]);

  const { sorted, field, dir, toggle } = useTableSort<PurchaseOrderWithLines>(
    filtered,
    {
      estado: (o) => ESTADO_RANK[o.ped_estado],
      fecha: (o) => o.ped_fecha_solicitud ?? "",
      tecnico: (o) => techNames.get(o.p_id_tecnico) ?? "",
    },
    "fecha",
    "desc",
  );

  const { pageItems, page, pageCount, setPage } = usePagination(
    sorted,
    `${search}|${statusFilter}|${techFilter}|${dateFrom}|${dateTo}|${field}|${dir}`,
    8,
  );

  const hasActiveParts = useMemo(
    () => spareParts.some((p) => p.rep_estado === "activo"),
    [spareParts],
  );

  const estadoColors = useMemo<Record<PedidoCompra["ped_estado"], { bg: string; fg: string }>>(
    () => ({
      pendiente: colors.eqWaiting,
      aprobado: colors.faultAssigned,
      rechazado: colors.eqRepair,
      recibido: colors.orderReceived,
    }),
    [colors],
  );

  if (loading) return <ActivityIndicator style={styles.center} />;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Pedidos de compra</Text>

          <Text style={styles.subtitle}>
            {isAdmin
              ? "Pedidos de repuestos enviados por los técnicos"
              : "Pedidos de repuestos que enviaste"}
          </Text>
        </View>

        {!isAdmin && (
          <Pressable
            style={[styles.addButton, !hasActiveParts && styles.addButtonDisabled]}
            onPress={() => setCreating(true)}
            disabled={!hasActiveParts}
          >
            <Text style={styles.addButtonText}>+ Nuevo pedido</Text>
          </Pressable>
        )}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      {!isAdmin && !hasActiveParts && (
        <Text style={styles.empty}>
          No hay repuestos activos en el catálogo. Pedile a un administrador que cargue los
          repuestos que necesitás.
        </Text>
      )}

      <View style={styles.filterBar}>
        <View style={styles.searchBox}>
          <SearchIcon size={16} color={colors.textMuted} />

          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por técnico o repuesto…"
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
          />

          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")} hitSlop={8}>
              <Text style={styles.clearSearchText}>✕</Text>
            </Pressable>
          )}
        </View>

        <Pressable
          style={[styles.funnelBtn, (filtersOpen || hasActiveFilters) && styles.funnelBtnActive]}
          onPress={handleToggleFilters}
          accessibilityLabel="Filtros"
        >
          <FunnelIcon size={15} color={hasActiveFilters ? "#fff" : colors.textLabel} />

          <Text style={[styles.funnelText, hasActiveFilters && styles.funnelTextActive]}>
            {hasActiveFilters ? `Filtros (${activeFiltersCount})` : "Filtros"}
          </Text>
        </Pressable>

        <View style={styles.spacer} />

        <Text style={styles.count}>
          {sorted.length} {sorted.length === 1 ? "pedido" : "pedidos"}
        </Text>
      </View>

      {filtersOpen && (
        <View style={styles.filterPanel}>
          <View style={styles.filterSection}>
            <Text style={styles.filterSectionTitle}>Estado</Text>

            <View style={styles.chipsRow}>
              {statusChips.map((chip) => {
                const active = statusFilter === chip.key;
                return (
                  <Pressable
                    key={chip.key}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setStatusFilter(chip.key)}
                    accessibilityLabel={`Filtrar por ${chip.label}`}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {chip.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.filterSection}>
            <Text style={styles.filterSectionTitle}>Rango de fechas</Text>

            <View style={styles.dateRangeRow}>
              <View style={styles.dateInputCol}>
                <Text style={styles.dateInputLabel}>Desde</Text>

                <CustomDatePicker
                  value={dateFrom}
                  onChange={setDateFrom}
                  placeholder="DD/MM/AAAA"
                  maxDate={
                    parsedDateTo && parsedDateTo.getTime() < today.getTime()
                      ? parsedDateTo
                      : today
                  }
                  alignDropdown="left"
                />
              </View>

              <View style={styles.dateInputCol}>
                <Text style={styles.dateInputLabel}>Hasta</Text>

                <CustomDatePicker
                  value={dateTo}
                  onChange={setDateTo}
                  placeholder="DD/MM/AAAA"
                  minDate={parsedDateFrom ?? undefined}
                  maxDate={today}
                  alignDropdown="right"
                />
              </View>
            </View>
          </View>

          {isAdmin && techOptions.length > 2 && (
            <View style={styles.filterSection}>
              <Text style={styles.filterSectionTitle}>Técnico</Text>

              <TechFilterDropdown
                value={techFilter}
                onChange={setTechFilter}
                options={techOptions}
                colors={colors}
              />
            </View>
          )}

          <View style={styles.panelActions}>
            {hasActiveFilters ? (
              <Pressable
                style={styles.clearFiltersBtn}
                onPress={() => {
                  setStatusFilter("");
                  setDateFrom("");
                  setDateTo("");
                  setTechFilter("");
                }}
              >
                <Text style={styles.clearFiltersText}>Limpiar filtros</Text>
              </Pressable>
            ) : (
              <View />
            )}

            <Pressable
              style={styles.applyFiltersBtn}
              onPress={() => setFiltersOpen(false)}
            >
              <Text style={styles.applyFiltersText}>Cerrar</Text>
            </Pressable>
          </View>
        </View>
      )}

      {sorted.length === 0 ? (
        <Text style={styles.empty}>
          {orders.length === 0
            ? isAdmin
              ? "Todavía no hay pedidos de compra."
              : "Todavía no enviaste ningún pedido."
            : "No hay pedidos que coincidan con la búsqueda o filtros."}
        </Text>
      ) : (
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <SortHeaderCell
              label="Estado"
              field="estado"
              activeField={field}
              dir={dir}
              onSort={toggle}
              style={{ flex: 1.4 }}
            />

            <SortHeaderCell
              label="Fecha"
              field="fecha"
              activeField={field}
              dir={dir}
              onSort={toggle}
              style={{ flex: 1 }}
            />

            {isAdmin && (
              <SortHeaderCell
                label="Técnico"
                field="tecnico"
                activeField={field}
                dir={dir}
                onSort={toggle}
                style={{ flex: 1.4 }}
              />
            )}

            <View style={styles.actionsCol}>
              <Text style={styles.headerCell}>VER</Text>
            </View>
          </View>

          {pageItems.map((o, i) => {
            const st = estadoColors[o.ped_estado];
            return (
              <View key={o.ped_id_ped_compra} style={[styles.row, i % 2 === 1 && styles.rowAlt]}>
                <View style={styles.rowMain}>
                  <View
                    style={{
                      flex: 1.4,
                      justifyContent: "center",
                      alignItems: "flex-start",
                      paddingRight: 12,
                    }}
                  >
                    <View style={[styles.badge, { backgroundColor: st.bg }]}>
                      <Text style={[styles.badgeText, { color: st.fg }]} numberOfLines={1}>
                        {ESTADO_LABELS[o.ped_estado]}
                      </Text>
                    </View>

                    <Text style={styles.sub} numberOfLines={2}>
                      {itemsSummary(o)}
                    </Text>
                  </View>

                  <View style={{ flex: 1, justifyContent: "center" }}>
                    <Text style={styles.dateCell}>{formatDate(o.ped_fecha_solicitud)}</Text>
                  </View>

                  {isAdmin && (
                    <View style={{ flex: 1.4, justifyContent: "center" }}>
                      <Text style={styles.tech} numberOfLines={1}>
                        {techNames.get(o.p_id_tecnico) ?? "Desconocido"}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.actionsCol}>
                  {isAdmin && o.ped_estado === "pendiente" ? (
                    <Tooltip text="Revisar pedido">
                      <Pressable
                        style={[styles.viewBtn, styles.reviewBtn]}
                        onPress={() => setViewing(o)}
                        accessibilityLabel="Revisar pedido"
                      >
                        <ReviewIcon size={17} color={colors.accent} />
                      </Pressable>
                    </Tooltip>
                  ) : (
                    <Tooltip text="Ver pedido">
                      <Pressable
                        style={styles.viewBtn}
                        onPress={() => setViewing(o)}
                        accessibilityLabel="Ver pedido"
                      >
                        <EyeIcon size={17} color={colors.accent} />
                      </Pressable>
                    </Tooltip>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}

      <Pagination page={page} pageCount={pageCount} onPage={setPage} />

      <PurchaseOrderDetailModal
        visible={viewing != null}
        onClose={() => setViewing(null)}
        order={viewing}
        isAdmin={isAdmin}
        techName={viewing ? (techNames.get(viewing.p_id_tecnico) ?? null) : null}
        onChanged={load}
        onReject={openReject}
      />

      {!isAdmin && (
        <PurchaseOrderModal
          visible={creating}
          onClose={() => setCreating(false)}
          onSaved={load}
          spareParts={spareParts}
        />
      )}

      {isAdmin && (
        <RejectPurchaseOrderModal
          visible={rejecting != null}
          pedidoId={rejecting}
          onClose={() => setRejecting(null)}
          onResolved={load}
        />
      )}
    </ScrollView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { backgroundColor: c.bg },
    content: { padding: 20 },
    center: { flex: 1 },
    header: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 12,
      marginBottom: 16,
    },
    headerText: { flexShrink: 1, minWidth: 0 },
    title: { fontSize: 22, fontWeight: "700", color: c.text },
    subtitle: { marginTop: 3, fontSize: 14, color: c.textSecondary },
    error: { color: c.destructive, marginBottom: 12 },
    addButton: {
      backgroundColor: c.accent,
      paddingHorizontal: 18,
      height: 42,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    addButtonDisabled: { opacity: 0.45 },
    addButtonText: { color: "#fff", fontWeight: "600", fontSize: 14 },
    filterBar: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 10,
      marginBottom: 12,
      zIndex: 50,
    },
    searchBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      width: 300,
      flexGrow: 1,
      minWidth: 180,
      maxWidth: 340,
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
      ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : {}),
    },
    clearSearchText: {
      fontSize: 13,
      color: c.textMuted,
      fontWeight: "600",
    },
    funnelBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      height: 40,
      paddingHorizontal: 14,
      borderRadius: 9,
      borderWidth: 1,
      borderColor: c.borderInput,
      backgroundColor: c.bgCard,
    },
    funnelBtnActive: {
      borderColor: c.accent,
      backgroundColor: c.accent,
    },
    funnelText: {
      fontSize: 14,
      fontWeight: "600",
      color: c.textLabel,
    },
    funnelTextActive: {
      color: "#fff",
    },
    spacer: {
      flex: 1,
      minWidth: 0,
    },
    count: {
      fontSize: 14,
      fontWeight: "500",
      color: c.textSecondary,
    },
    chipsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: c.borderInput,
      backgroundColor: c.bgStatCard,
      ...(Platform.OS === "web" ? ({ cursor: "pointer" } as object) : {}),
    },
    chipActive: {
      backgroundColor: c.accent,
      borderColor: c.accent,
    },
    chipText: {
      fontSize: 13.5,
      fontWeight: "600",
      color: c.textLabel,
    },
    chipTextActive: {
      color: "#fff",
      fontWeight: "700",
    },
    filterPanel: {
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 14,
      padding: 18,
      marginBottom: 16,
      gap: 16,
      zIndex: 80,
    },
    filterSection: {
      gap: 8,
    },
    filterSectionTitle: {
      fontSize: 12.5,
      fontWeight: "700",
      letterSpacing: 0.6,
      textTransform: "uppercase",
      color: c.textMuted,
    },
    dateRangeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      flexWrap: "wrap",
    },
    dateInputCol: {
      flex: 1,
      minWidth: 140,
      maxWidth: 220,
      gap: 4,
    },
    dateInputLabel: {
      fontSize: 12,
      fontWeight: "600",
      color: c.textSecondary,
    },
    panelActions: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: c.borderRow,
    },
    clearFiltersBtn: {
      paddingVertical: 8,
      paddingHorizontal: 12,
    },
    clearFiltersText: {
      fontSize: 13.5,
      fontWeight: "600",
      color: c.accent,
    },
    applyFiltersBtn: {
      backgroundColor: c.accent,
      paddingHorizontal: 20,
      height: 38,
      borderRadius: 9,
      alignItems: "center",
      justifyContent: "center",
    },
    applyFiltersText: {
      color: "#fff",
      fontWeight: "700",
      fontSize: 13.5,
    },
    empty: {
      color: c.textMuted,
      fontSize: 14,
      marginTop: 4,
    },
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
    actionsCol: { width: 54, flexShrink: 0, alignItems: "center", justifyContent: "center" },
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
    badge: {
      alignSelf: "flex-start",
      paddingHorizontal: 11,
      paddingVertical: 3.5,
      borderRadius: 999,
    },
    badgeText: { fontSize: 12.5, fontWeight: "600" },
    sub: { marginTop: 3, fontSize: 13, color: c.textSecondary, fontWeight: "500" },
    dateCell: { fontSize: 14.5, color: c.text, fontWeight: "500" },
    tech: { fontSize: 14.5, color: c.text, fontWeight: "500" },
    viewBtn: {
      width: 36,
      height: 36,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
    },
    reviewBtn: { borderColor: c.accent },
  });
}

