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
} from "../../../components/CustomDatePicker";
import { EyeIcon, SearchIcon } from "../../../components/icons";
import { Pagination } from "../../../components/Pagination";
import { PurchaseModal, type PurchasePrefill } from "../../../components/PurchaseModal";
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
import { listSuppliers, type SupplierWithRubro } from "../../../lib/queries/suppliers";
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
          { backgroundColor: colors.bgCard, borderColor: value ? colors.accent : colors.borderInput },
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
            <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
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
    height: 38,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 9,
    minWidth: 160,
    maxWidth: 200,
  },
  btnText: { fontSize: 13, flex: 1 },
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
    top: 42,
    left: 0,
    minWidth: 200,
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
  optionText: { fontSize: 13 },
});

export default function PurchaseOrdersScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [orders, setOrders] = useState<PurchaseOrderWithLines[]>([]);
  const [techNames, setTechNames] = useState<Map<string, string>>(new Map());
  const [spareParts, setSpareParts] = useState<Repuesto[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierWithRubro[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [techFilter, setTechFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<PurchaseOrderWithLines | null>(null);
  const [rejecting, setRejecting] = useState<number | null>(null);
  const [purchaseFor, setPurchaseFor] = useState<PurchasePrefill | null>(null);

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
        const [profiles, supplierList] = await Promise.all([listProfiles(), listSuppliers()]);
        setTechNames(new Map(profiles.map((p) => [p.id, p.name])));
        setSuppliers(supplierList);
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

  function openPurchaseFor(order: PurchaseOrderWithLines) {
    setViewing(null);
    setPurchaseFor({
      pedidoId: order.ped_id_ped_compra,
      lines: order.linea_pedido
        .filter((l) => l.lp_cantidad != null)
        .map((l) => ({ repId: l.rep_id, cantidad: l.lp_cantidad as number })),
    });
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

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: orders.length,
      pendiente: 0,
      aprobado: 0,
      recibido: 0,
      rechazado: 0,
    };
    orders.forEach((o) => {
      if (counts[o.ped_estado] !== undefined) {
        counts[o.ped_estado]++;
      }
    });
    return counts;
  }, [orders]);

  const statusChips = useMemo(() => {
    const list = [
      { key: "", label: "Todos" },
      { key: "pendiente", label: "Pendiente" },
    ];
    if (orders.some((o) => o.ped_estado === "aprobado")) {
      list.push({ key: "aprobado", label: "Aprobado" });
    }
    list.push({ key: "recibido", label: "Recibido" });
    list.push({ key: "rechazado", label: "Rechazado" });
    return list;
  }, [orders]);

  const parsedDateFrom = useMemo(() => parseDateString(dateFrom), [dateFrom]);
  const parsedDateTo = useMemo(() => parseDateString(dateTo), [dateTo]);
  const hasDateFilter = dateFrom.length > 0 || dateTo.length > 0;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const dbFrom = isValidDateString(dateFrom) ? toDbDate(dateFrom) : null;
    const dbTo = isValidDateString(dateTo) ? toDbDate(dateTo) : null;

    return orders.filter((o) => {
      // 1. Search by technician name or spare part name
      const techName = techNames.get(o.p_id_tecnico)?.toLowerCase() ?? "";
      const matchSearch =
        !q ||
        techName.includes(q) ||
        o.linea_pedido.some((l) => l.repuesto?.rep_nombre?.toLowerCase().includes(q));

      // 2. Status filter
      const matchStatus = !statusFilter || o.ped_estado === statusFilter;

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
      recibido: colors.eqOperational,
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
          <SearchIcon size={15} color={colors.textMuted} />

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

        {isAdmin && techOptions.length > 2 && (
          <TechFilterDropdown
            value={techFilter}
            onChange={setTechFilter}
            options={techOptions}
            colors={colors}
          />
        )}

        <View style={styles.dateRangeWrap}>
          <View style={styles.dateInputWrap}>
            <CustomDatePicker
              value={dateFrom}
              onChange={setDateFrom}
              placeholder="Desde"
              compact
              maxDate={parsedDateTo ?? undefined}
              alignDropdown="left"
            />
          </View>

          <Text style={styles.dateArrow}>→</Text>

          <View style={styles.dateInputWrap}>
            <CustomDatePicker
              value={dateTo}
              onChange={setDateTo}
              placeholder="Hasta"
              compact
              minDate={parsedDateFrom ?? undefined}
              alignDropdown="right"
            />
          </View>

          {hasDateFilter && (
            <Pressable
              style={styles.clearDateBtn}
              onPress={() => {
                setDateFrom("");
                setDateTo("");
              }}
              accessibilityLabel="Limpiar filtro de fecha"
            >
              <Text style={styles.clearDateText}>Limpiar</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.spacer} />

        <Text style={styles.count}>
          {sorted.length} {sorted.length === 1 ? "pedido" : "pedidos"}
        </Text>
      </View>

      <View style={styles.chipsRow}>
        {statusChips.map((chip) => {
          const active = statusFilter === chip.key;
          const count = statusCounts[chip.key || "all"] ?? 0;
          return (
            <Pressable
              key={chip.key}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setStatusFilter(chip.key)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {chip.label} ({count})
              </Text>
            </Pressable>
          );
        })}
      </View>

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
              style={{ flex: 1.2 }}
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

            <Text style={[styles.headerCell, styles.actionsCol]}>VER</Text>
          </View>

          {pageItems.map((o, i) => {
            const st = estadoColors[o.ped_estado];
            return (
              <View key={o.ped_id_ped_compra} style={[styles.row, i % 2 === 1 && styles.rowAlt]}>
                <View style={styles.rowMain}>
                  <View style={{ flex: 1.2, justifyContent: "center", alignItems: "flex-start", paddingRight: 8 }}>
                    <View style={[styles.badge, { backgroundColor: st.bg }]}>
                      <Text style={[styles.badgeText, { color: st.fg }]} numberOfLines={1}>
                        {ESTADO_LABELS[o.ped_estado]}
                      </Text>
                    </View>

                    <Text style={styles.sub} numberOfLines={1}>
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
                  <Pressable
                    style={styles.viewBtn}
                    onPress={() => setViewing(o)}
                    accessibilityLabel="Ver pedido"
                  >
                    <EyeIcon size={16} color={colors.accent} />
                  </Pressable>
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
        onRegisterPurchase={openPurchaseFor}
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
        <>
          <RejectPurchaseOrderModal
            visible={rejecting != null}
            pedidoId={rejecting}
            onClose={() => setRejecting(null)}
            onResolved={load}
          />

          <PurchaseModal
            visible={purchaseFor != null}
            onClose={() => setPurchaseFor(null)}
            onSaved={load}
            suppliers={suppliers}
            spareParts={spareParts}
            prefill={purchaseFor}
          />
        </>
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
    title: { fontSize: 22, fontWeight: "600", color: c.text },
    subtitle: { marginTop: 3, fontSize: 13.5, color: c.textSecondary },
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
      marginBottom: 10,
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
      height: 38,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: c.borderInput,
      borderRadius: 9,
      backgroundColor: c.bgCard,
    },
    searchInput: {
      flex: 1,
      height: "100%",
      fontSize: 13.5,
      color: c.text,
      padding: 0,
      ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : {}),
    },
    clearSearchText: {
      fontSize: 13,
      color: c.textMuted,
      fontWeight: "600",
    },
    dateRangeWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      zIndex: 60,
    },
    dateInputWrap: {
      width: 140,
    },
    dateArrow: {
      fontSize: 14,
      fontWeight: "600",
      color: c.textMuted,
    },
    clearDateBtn: {
      height: 38,
      paddingHorizontal: 12,
      borderRadius: 9,
      borderWidth: 1,
      borderColor: c.borderInput,
      backgroundColor: c.bgCard,
      alignItems: "center",
      justifyContent: "center",
    },
    clearDateText: {
      fontSize: 12.5,
      fontWeight: "600",
      color: c.accent,
    },
    spacer: {
      flex: 1,
      minWidth: 0,
    },
    count: {
      fontSize: 13,
      fontWeight: "500",
      color: c.textSecondary,
    },
    chipsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 7,
      marginBottom: 14,
    },
    chip: {
      paddingHorizontal: 13,
      paddingVertical: 7,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: c.borderInput,
      backgroundColor: c.bgStatCard,
    },
    chipActive: {
      backgroundColor: c.accent,
      borderColor: c.accent,
    },
    chipText: {
      fontSize: 12.5,
      fontWeight: "600",
      color: c.textLabel,
    },
    chipTextActive: {
      color: "#fff",
    },
    empty: {
      color: c.textMuted,
      fontSize: 13.5,
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
      paddingHorizontal: 16,
      paddingVertical: 13,
      backgroundColor: c.accent,
      borderTopLeftRadius: 13,
      borderTopRightRadius: 13,
    },
    headerCell: {
      fontSize: 13.5,
      fontWeight: "700",
      letterSpacing: 0.6,
      textTransform: "uppercase",
      color: "#fff",
      fontFamily: "monospace",
    },
    actionsCol: { width: 56, flexShrink: 0, alignItems: "center" },
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
    badge: {
      alignSelf: "flex-start",
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: 999,
    },
    badgeText: { fontSize: 11.5, fontWeight: "600" },
    sub: { marginTop: 3, fontSize: 12, color: c.textMuted },
    dateCell: { fontSize: 13, color: c.textLabel },
    tech: { fontSize: 13, color: c.textLabel, fontWeight: "500" },
    viewBtn: {
      width: 32,
      height: 32,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
    },
  });
}
