import { Stack, router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { BackIcon, CheckIcon, ChevronDownIcon, SparePartIcon } from "../../../components/icons";
import { Pagination } from "../../../components/Pagination";
import { withSiglas } from "../../../components/Sigla";
import { SortHeaderCell } from "../../../components/SortHeaderCell";
import { TableFilterBar } from "../../../components/TableFilterBar";
import { usePagination } from "../../../lib/usePagination";
import { useTableSort } from "../../../lib/useTableSort";
import {
  getEquipmentById,
  isActiveFault,
  listFaultHistoryByEquipment,
  listHistoryByEquipment,
  summarizeFaultHistory,
} from "../../../lib/queries/equipment";
import { listProfiles } from "../../../lib/queries/profiles";
import { formatOrderNumber } from "../../../lib/orderNumber";
import { supabase } from "../../../lib/supabase";
import type { ThemeColors } from "../../../lib/theme";
import { useTheme } from "../../../lib/ThemeContext";
import { includesSearch, normalizeSearch } from "../../../lib/search";
import type { Equipo, Solicitud, SolicitudTask, HistorialEntry } from "../../../types/database";

const PRIORITY_LABEL: Record<Exclude<Solicitud["priority"], null>, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
};

// Labels from the equipo's point of view: a "rejected" solicitud is one the
// admin closed without generating an OT (see SolicitudDetailModal).
const FAULT_STATUS_LABEL: Record<Solicitud["status"], string> = {
  new: "Pendiente",
  assigned: "En proceso",
  in_progress: "En proceso",
  resolved: "Resuelta",
  rejected: "Cerrada sin OT",
};

// Sort ranks: "estado" ascending puts active faults first (pendiente, then
// en proceso) and closed ones last; "prioridad" descending puts Alta first.
const FAULT_STATUS_RANK: Record<Solicitud["status"], number> = {
  new: 0,
  assigned: 1,
  in_progress: 1,
  resolved: 2,
  rejected: 3,
};
const PRIORITY_RANK: Record<Exclude<Solicitud["priority"], null>, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

// historial.hi_tipo alone ("Asignada", "En curso") doesn't say what the
// event was about, so each one is shown prefixed with its subject: the
// fault report, the solicitud, the OT or one of its tareas. "Asignada" is
// logged both when the OT is generated and when a tarea is added to it, so
// that one is told apart by its note (see logHistorial callers in
// lib/queries/faults.ts). Unknown types fall back to the raw value.
const HISTORY_EVENT_LABEL: Record<string, string> = {
  Reporte: "Falla · Reportada",
  Cerrada: "Solicitud · Cerrada sin OT",
  Asignada: "OT · Generada",
  Diagnóstico: "OT · Diagnóstico",
  Replanificada: "OT · Replanificada",
  Resuelta: "OT · Resuelta",
  Reasignada: "Tarea · Reasignada",
  "En curso": "Tarea · Iniciada",
  Suspendida: "Tarea · Suspendida",
  Reanudada: "Tarea · Reanudada",
  "Tarea finalizada": "Tarea · Finalizada",
  Preventivo: "Mantenimiento · Preventivo",
};

function historyEventLabel(h: HistorialEntry): string {
  if (h.type === "Asignada" && h.note.startsWith("Tarea agregada")) {
    return "Tarea · Agregada a la OT";
  }
  return HISTORY_EVENT_LABEL[h.type] ?? h.type;
}

// Filter value meaning "the field is empty" (fault not evaluated yet, so no
// prioridad / tipo de falla), next to "" which means "no filter".
const NONE = "__none__";

// Every text a técnico might remember a fault by, lowercased, so the search
// box matches on any of them (OT number, tipo, descripción, people, tareas,
// diagnósticos, repuestos).
function faultSearchText(f: Solicitud, names: Map<string, string>): string {
  return [
    f.order_id !== null ? formatOrderNumber(f.order_id) : "",
    f.fault_type_name ?? "",
    f.description,
    names.get(f.reported_by) ?? "",
    ...f.tasks.flatMap((t) => [
      t.taskName,
      names.get(t.technicianId) ?? "",
      t.diagnosis ?? "",
      ...t.consumedParts.map((p) => p.nombre),
    ]),
  ].join(" ");
}

// The equipo's características live in the card above the tabs, always
// visible. "Historial de fallas" (SCRUM-35) is every fault with what was
// done about it, active ones first (it replaced the old "Información" tab,
// which only listed active faults); "Actividad" is the raw event log
// (historial table).
const TABS = [
  { key: "faults", label: "Historial de fallas" },
  { key: "activity", label: "Actividad" },
] as const;

function formatDate(dbDate: string | null): string {
  if (!dbDate) return "No registrada";
  return new Date(dbDate + "T00:00:00").toLocaleDateString("es-AR");
}

type TabKey = (typeof TABS)[number]["key"];

export default function EquipmentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const equipoId = id ? Number(id) : NaN;
  const [equipment, setEquipment] = useState<Equipo | null>(null);
  const [faults, setFaults] = useState<Solicitud[]>([]);
  const [history, setHistory] = useState<HistorialEntry[]>([]);
  const [authorNames, setAuthorNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("faults");
  // Same "" = no filter convention as the other list screens' TableFilterBar.
  const [faultSearch, setFaultSearch] = useState("");
  const [faultStatusFilter, setFaultStatusFilter] = useState("");
  const [faultPriorityFilter, setFaultPriorityFilter] = useState("");
  const [faultTypeFilter, setFaultTypeFilter] = useState("");
  const [faultTechFilter, setFaultTechFilter] = useState("");
  const [activitySearch, setActivitySearch] = useState("");
  const [activityTypeFilter, setActivityTypeFilter] = useState("");
  const [activityAuthorFilter, setActivityAuthorFilter] = useState("");
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const statusMeta: Record<
    Equipo["status"],
    { label: string; bg: string; fg: string; dot: string }
  > = {
    operational: { label: "Funcionando", ...colors.eqOperational },
    waiting: { label: "En espera", ...colors.eqWaiting },
    repair: { label: "En reparación", ...colors.eqRepair },
  };

  // Maps history type strings to theme palette (same colors as fault-status badges
  // so "En curso" in Historial reads the same everywhere).
  const historyTypeColor: Record<string, { dot: string; bg: string; fg: string }> = {
    Reporte: colors.histReporte,
    Asignada: colors.histAsignada,
    Reasignada: colors.histAsignada,
    Replanificada: colors.histAsignada,
    Diagnóstico: colors.histAsignada,
    "En curso": colors.histEnCurso,
    // Same amber as a suspended tarea's badge in the Cola de trabajo.
    Suspendida: colors.eqWaiting,
    Reanudada: colors.histEnCurso,
    "Tarea finalizada": colors.histResuelta,
    Resuelta: colors.histResuelta,
    Cerrada: colors.histResuelta,
    Preventivo: colors.histResuelta,
  };

  const loadEquipmentData = useCallback(async () => {
    if (!id || Number.isNaN(equipoId)) return;
    const [e, f, h, profiles] = await Promise.all([
      getEquipmentById(equipoId),
      listFaultHistoryByEquipment(equipoId),
      listHistoryByEquipment(equipoId),
      listProfiles(),
    ]);
    setEquipment(e);
    setFaults(f);
    setHistory(h);
    setAuthorNames(new Map(profiles.map((p) => [p.id, p.name])));
  }, [id, equipoId]);

  useEffect(() => {
    loadEquipmentData().finally(() => setLoading(false));
  }, [loadEquipmentData]);

  useEffect(() => {
    if (!id || Number.isNaN(equipoId)) return;
    const channel = supabase
      .channel(`equipment-detail-${id}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "equipo", filter: `eq_id_equipo=eq.${equipoId}` },
        loadEquipmentData,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "solicitudes",
          filter: `eq_id_equipo=eq.${equipoId}`,
        },
        loadEquipmentData,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orden_de_trabajo",
          filter: `eq_id_equipo=eq.${equipoId}`,
        },
        loadEquipmentData,
      )
      // Tareas carry no eq_id_equipo to filter on; any change may be a
      // diagnóstico or repuesto shown in this equipo's fault history.
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tareas_realizadas_orden" },
        loadEquipmentData,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, equipoId, loadEquipmentData]);

  const summary = useMemo(() => summarizeFaultHistory(faults), [faults]);

  // Filter options built from what this equipo actually has, so no chip
  // ever leads to an empty list.
  const faultTypeOptions = useMemo(
    () => [...new Set(faults.map((f) => f.fault_type_name).filter((n): n is string => !!n))].sort(),
    [faults],
  );
  const faultTechOptions = useMemo(
    () =>
      [...new Set(faults.flatMap((f) => f.tasks.map((t) => t.technicianId)))]
        .map((techId) => ({ value: techId, label: authorNames.get(techId) ?? "Desconocido" }))
        .sort((a, b) => a.label.localeCompare(b.label, "es")),
    [faults, authorNames],
  );

  const filteredFaults = useMemo(() => {
    const q = normalizeSearch(faultSearch.trim());
    return faults.filter((f) => {
      const matchSearch = !q || includesSearch(faultSearchText(f, authorNames), q);
      const matchStatus =
        !faultStatusFilter ||
        (faultStatusFilter === "in_progress"
          ? f.status === "in_progress" || f.status === "assigned"
          : f.status === faultStatusFilter);
      const matchPriority =
        !faultPriorityFilter ||
        (faultPriorityFilter === NONE ? f.priority === null : f.priority === faultPriorityFilter);
      const matchType =
        !faultTypeFilter ||
        (faultTypeFilter === NONE
          ? f.fault_type_name === null
          : f.fault_type_name === faultTypeFilter);
      const matchTech = !faultTechFilter || f.tasks.some((t) => t.technicianId === faultTechFilter);
      return matchSearch && matchStatus && matchPriority && matchType && matchTech;
    });
  }, [
    faults,
    authorNames,
    faultSearch,
    faultStatusFilter,
    faultPriorityFilter,
    faultTypeFilter,
    faultTechFilter,
  ]);

  // Default "estado" ascending: active faults on top, and since the sort is
  // stable each group keeps the query's newest-first order.
  const faultSort = useTableSort<Solicitud>(
    filteredFaults,
    {
      fecha: (f) => Date.parse(f.created_at),
      estado: (f) => FAULT_STATUS_RANK[f.status],
      prioridad: (f) => (f.priority ? PRIORITY_RANK[f.priority] : null),
      tipo: (f) => f.fault_type_name,
    },
    "estado",
  );
  const faultPage = usePagination(
    faultSort.sorted,
    `${faultSearch}|${faultStatusFilter}|${faultPriorityFilter}|${faultTypeFilter}|${faultTechFilter}|${faultSort.field}|${faultSort.dir}`,
    5,
  );

  const activityTypeOptions = useMemo(
    () => [...new Set(history.map(historyEventLabel))].sort((a, b) => a.localeCompare(b, "es")),
    [history],
  );
  const activityAuthorOptions = useMemo(
    () =>
      [...new Set(history.map((h) => h.author_id))]
        .map((authorId) => ({
          value: authorId,
          label: authorNames.get(authorId) ?? "Desconocido",
        }))
        .sort((a, b) => a.label.localeCompare(b.label, "es")),
    [history, authorNames],
  );

  const filteredHistory = useMemo(() => {
    const q = normalizeSearch(activitySearch.trim());
    return history.filter((h) => {
      const matchSearch =
        !q ||
        includesSearch(h.note, q) ||
        includesSearch(historyEventLabel(h), q) ||
        includesSearch(authorNames.get(h.author_id), q);
      const matchType = !activityTypeFilter || historyEventLabel(h) === activityTypeFilter;
      const matchAuthor = !activityAuthorFilter || h.author_id === activityAuthorFilter;
      return matchSearch && matchType && matchAuthor;
    });
  }, [history, authorNames, activitySearch, activityTypeFilter, activityAuthorFilter]);

  const activitySort = useTableSort<HistorialEntry>(
    filteredHistory,
    {
      fecha: (h) => Date.parse(h.created_at),
      // Labels start with their subject, so this also groups the events
      // by falla / OT / solicitud / tarea.
      tipo: historyEventLabel,
      autor: (h) => authorNames.get(h.author_id) ?? null,
    },
    "fecha",
    "desc",
  );
  const activityPage = usePagination(
    activitySort.sorted,
    `${activitySearch}|${activityTypeFilter}|${activityAuthorFilter}|${activitySort.field}|${activitySort.dir}`,
  );

  const faultStatusColor: Record<Solicitud["status"], { bg: string; fg: string }> = {
    new: colors.faultNew,
    assigned: colors.faultAssigned,
    in_progress: colors.faultInProgress,
    resolved: colors.faultResolved,
    rejected: colors.faultRejected,
  };

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator style={styles.center} />
      </>
    );
  }
  if (!equipment) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={styles.error}>Equipo no encontrado</Text>
      </>
    );
  }

  const sm = statusMeta[equipment.status];

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.topBar}>
          <Pressable style={styles.backLink} onPress={() => router.back()}>
            <BackIcon />

            {/* Plain "Volver": this screen is also opened from the técnico's
                Cola de trabajo ("Ver equipo"), not only from Equipos. */}
            <Text style={styles.backText}>Volver</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <View style={styles.badgeRow}>
            <Text style={styles.code}>{equipment.code}</Text>
            <View style={[styles.badge, { backgroundColor: sm.bg }]}>
              <View style={[styles.badgeDot, { backgroundColor: sm.dot }]} />
              <Text style={[styles.badgeText, { color: sm.fg }]}>{sm.label}</Text>
            </View>

            {/* Why the equipo is in that state, at a glance. */}
            <Text style={styles.statusNote}>
              {summary.active === 0
                ? "Sin fallas activas"
                : `${summary.active} ${summary.active === 1 ? "falla activa" : "fallas activas"}`}
              {` · ${summary.total} ${summary.total === 1 ? "falla registrada" : "fallas registradas"} en total`}
            </Text>
          </View>

          <Text style={styles.title}>{equipment.name}</Text>
          <Text style={styles.subtitle}>{equipment.type}</Text>

          <View style={styles.metaGrid}>
            <MetaCell label="Ubicación" value={equipment.location} />

            <MetaCell label="Tipo" value={equipment.type} />

            <MetaCell label="Modelo" value={equipment.model || "No registrado"} />

            <MetaCell label="Fecha de instalación" value={formatDate(equipment.installDate)} />
          </View>
        </View>

        <View style={styles.tabsRow}>
          {TABS.map((t) => (
            <Pressable key={t.key} style={styles.tabItem} onPress={() => setTab(t.key)}>
              <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
              {tab === t.key && <View style={styles.tabUnderline} />}
            </Pressable>
          ))}
        </View>

        {tab === "faults" && (
          <View>
            {summary.active === 0 && (
              <View
                style={[
                  styles.emptyRow,
                  {
                    backgroundColor: colors.eqOperational.bg,
                    borderColor: colors.eqOperational.bg,
                  },
                ]}
              >
                <View style={[styles.emptyIconWrap, { backgroundColor: colors.eqOperational.bg }]}>
                  <CheckIcon size={16} color={colors.eqOperational.fg} />
                </View>

                <Text style={[styles.emptyText, { color: colors.eqOperational.fg }]}>
                  Sin fallas activas. El equipo opera con normalidad.
                </Text>
              </View>
            )}

            <View style={styles.statsRow}>
              <StatTile
                label="Fallas registradas"
                value={String(summary.total)}
                hint={
                  summary.active > 0
                    ? `${summary.active} ${summary.active === 1 ? "activa" : "activas"}`
                    : "Ninguna activa"
                }
              />

              <StatTile
                label="Última falla"
                value={
                  summary.lastReportedAt
                    ? new Date(summary.lastReportedAt).toLocaleDateString("es-AR")
                    : "—"
                }
              />

              <StatTile
                label="Falla más frecuente"
                value={summary.mostFrequentType?.name ?? "—"}
                hint={
                  summary.mostFrequentType
                    ? `${summary.mostFrequentType.count} ${summary.mostFrequentType.count === 1 ? "vez" : "veces"}`
                    : undefined
                }
              />
            </View>

            <TableFilterBar
              searchValue={faultSearch}
              onSearch={setFaultSearch}
              searchPlaceholder="Buscar por OT, falla, tarea, técnico, diagnóstico o repuesto…"
              filters={[
                {
                  key: "estado",
                  label: "Estado",
                  value: faultStatusFilter,
                  onChange: setFaultStatusFilter,
                  options: [
                    { value: "", label: "Todos" },
                    { value: "new", label: FAULT_STATUS_LABEL.new },
                    { value: "in_progress", label: FAULT_STATUS_LABEL.in_progress },
                    { value: "resolved", label: FAULT_STATUS_LABEL.resolved },
                    { value: "rejected", label: FAULT_STATUS_LABEL.rejected },
                  ],
                },
                {
                  key: "prioridad",
                  label: "Prioridad",
                  value: faultPriorityFilter,
                  onChange: setFaultPriorityFilter,
                  options: [
                    { value: "", label: "Todas" },
                    { value: "high", label: PRIORITY_LABEL.high },
                    { value: "medium", label: PRIORITY_LABEL.medium },
                    { value: "low", label: PRIORITY_LABEL.low },
                    { value: NONE, label: "Sin evaluar" },
                  ],
                },
                {
                  key: "tipo",
                  label: "Tipo de falla",
                  value: faultTypeFilter,
                  onChange: setFaultTypeFilter,
                  options: [
                    { value: "", label: "Todos" },
                    ...faultTypeOptions.map((name) => ({ value: name, label: name })),
                    { value: NONE, label: "Sin definir" },
                  ],
                },
                ...(faultTechOptions.length > 0
                  ? [
                      {
                        key: "tecnico",
                        label: "Técnico",
                        value: faultTechFilter,
                        onChange: setFaultTechFilter,
                        options: [{ value: "", label: "Todos" }, ...faultTechOptions],
                      },
                    ]
                  : []),
              ]}
              right={
                <Text style={styles.count}>
                  {faultSort.sorted.length} {faultSort.sorted.length === 1 ? "falla" : "fallas"}
                </Text>
              }
            />

            {/* Cards have no table header, so the sortable "columns" live in
                a bar styled like one (same SortHeaderCell as the tables). */}
            <View style={styles.sortBar}>
              <Text style={styles.sortBarLabel}>Ordenar por</Text>

              <SortHeaderCell
                label="Fecha"
                field="fecha"
                activeField={faultSort.field}
                dir={faultSort.dir}
                onSort={faultSort.toggle}
              />

              <SortHeaderCell
                label="Estado"
                field="estado"
                activeField={faultSort.field}
                dir={faultSort.dir}
                onSort={faultSort.toggle}
              />

              <SortHeaderCell
                label="Prioridad"
                field="prioridad"
                activeField={faultSort.field}
                dir={faultSort.dir}
                onSort={faultSort.toggle}
              />

              <SortHeaderCell
                label="Tipo de falla"
                field="tipo"
                activeField={faultSort.field}
                dir={faultSort.dir}
                onSort={faultSort.toggle}
              />
            </View>

            {faultSort.sorted.length === 0 && (
              <Text style={styles.emptyMuted}>
                {faults.length === 0
                  ? "Este equipo no tiene fallas registradas."
                  : "Ninguna falla coincide con la búsqueda o los filtros."}
              </Text>
            )}

            {faultPage.pageItems.map((f) => (
              <FaultHistoryCard
                key={f.id}
                fault={f}
                names={authorNames}
                statusColor={faultStatusColor[f.status]}
                colors={colors}
                styles={styles}
              />
            ))}

            <Pagination
              page={faultPage.page}
              pageCount={faultPage.pageCount}
              onPage={faultPage.setPage}
            />
          </View>
        )}

        {tab === "activity" && (
          <View>
            <TableFilterBar
              searchValue={activitySearch}
              onSearch={setActivitySearch}
              searchPlaceholder="Buscar en la actividad…"
              filters={[
                {
                  key: "tipo",
                  label: "Tipo de evento",
                  value: activityTypeFilter,
                  onChange: setActivityTypeFilter,
                  options: [
                    { value: "", label: "Todos" },
                    ...activityTypeOptions.map((t) => ({ value: t, label: t })),
                  ],
                },
                {
                  key: "autor",
                  label: "Autor",
                  value: activityAuthorFilter,
                  onChange: setActivityAuthorFilter,
                  options: [{ value: "", label: "Todos" }, ...activityAuthorOptions],
                },
              ]}
              right={
                <Text style={styles.count}>
                  {activitySort.sorted.length}{" "}
                  {activitySort.sorted.length === 1 ? "evento" : "eventos"}
                </Text>
              }
            />

            <View style={styles.sortBar}>
              <Text style={styles.sortBarLabel}>Ordenar por</Text>

              <SortHeaderCell
                label="Fecha"
                field="fecha"
                activeField={activitySort.field}
                dir={activitySort.dir}
                onSort={activitySort.toggle}
              />

              <SortHeaderCell
                label="Tipo"
                field="tipo"
                activeField={activitySort.field}
                dir={activitySort.dir}
                onSort={activitySort.toggle}
              />

              <SortHeaderCell
                label="Autor"
                field="autor"
                activeField={activitySort.field}
                dir={activitySort.dir}
                onSort={activitySort.toggle}
              />
            </View>

            <View style={styles.timeline}>
              {activitySort.sorted.length === 0 && (
                <Text style={styles.emptyMuted}>
                  {history.length === 0
                    ? "Sin eventos registrados."
                    : "Ningún evento coincide con la búsqueda o los filtros."}
                </Text>
              )}

              {activityPage.pageItems.map((h, i) => {
                const c = historyTypeColor[h.type] ?? historyTypeColor.Reporte;
                return (
                  <View key={h.id} style={styles.timelineRow}>
                    {i < activityPage.pageItems.length - 1 && <View style={styles.timelineLine} />}

                    <View style={styles.timelineRail}>
                      <View style={[styles.timelineDot, { backgroundColor: c.dot }]} />
                    </View>

                    <View style={styles.timelineCard}>
                      <View style={styles.timelineHeader}>
                        <View style={[styles.tag, { backgroundColor: c.bg }]}>
                          <Text style={[styles.tagText, { color: c.fg }]}>
                            {withSiglas(historyEventLabel(h))}
                          </Text>
                        </View>

                        <Text style={styles.timelineDate}>
                          {new Date(h.created_at).toLocaleDateString("es-AR")}
                        </Text>
                      </View>

                      <Text style={styles.timelineNote}>{h.note}</Text>

                      <Text style={styles.timelineAuthor}>
                        {authorNames.get(h.author_id) ?? "Desconocido"}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>

            <Pagination
              page={activityPage.page}
              pageCount={activityPage.pageCount}
              onPage={activityPage.setPage}
            />
          </View>
        )}
      </ScrollView>
    </>
  );
}

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <View style={styles.statTile}>
      <Text style={styles.statLabel}>{label}</Text>

      <Text style={styles.statValue} numberOfLines={2}>
        {value}
      </Text>

      {hint && <Text style={styles.statHint}>{hint}</Text>}
    </View>
  );
}

function taskStateLabel(task: SolicitudTask): string {
  if (task.endDate) return `Finalizada el ${formatDate(task.endDate)}`;
  if (task.suspension) return `Suspendida desde el ${formatDate(task.suspension.since)}`;
  if (task.startDate) return "En curso";
  return "Pendiente";
}

// One past or current fault of the equipo: what was reported, how it was
// classified and closed, and what each técnico did on its OT (diagnóstico
// and repuestos used) — what a técnico wants to know before touching it.
function FaultHistoryCard({
  fault: f,
  names,
  statusColor,
  colors,
  styles,
}: {
  fault: Solicitud;
  names: Map<string, string>;
  statusColor: { bg: string; fg: string };
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
}) {
  // Collapsed by default: an OT can carry many tareas and would bury the
  // rest of the history under them.
  const [tasksOpen, setTasksOpen] = useState(false);
  const finishedCount = f.tasks.filter((t) => t.endDate).length;

  return (
    <View
      style={[
        styles.historyCard,
        // Side stripe in the status color so active faults stand out
        // from the closed ones below them.
        isActiveFault(f) && { borderLeftWidth: 4, borderLeftColor: statusColor.fg },
      ]}
    >
      <View style={styles.historyHeader}>
        <View style={styles.historyHeaderLeft}>
          {f.order_id !== null && (
            <View style={styles.orderPill}>
              <Text style={styles.orderPillText}>{withSiglas(formatOrderNumber(f.order_id))}</Text>
            </View>
          )}

          <View style={[styles.tag, { backgroundColor: statusColor.bg }]}>
            <Text style={[styles.tagText, { color: statusColor.fg }]}>
              {withSiglas(FAULT_STATUS_LABEL[f.status])}
            </Text>
          </View>

          {f.priority && (
            <Text style={styles.historyMeta}>Prioridad {PRIORITY_LABEL[f.priority]}</Text>
          )}
        </View>

        <Text style={styles.timelineDate}>
          {new Date(f.created_at).toLocaleDateString("es-AR")}
        </Text>
      </View>

      <Text style={[styles.historyType, !f.fault_type_name && { color: colors.textMuted }]}>
        {f.fault_type_name ?? "Tipo de falla sin definir"}
      </Text>

      <Text style={styles.historyDesc}>{f.description}</Text>

      {f.photo_urls.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.gallery}
          contentContainerStyle={styles.galleryContent}
        >
          {f.photo_urls.map((url) => (
            <Image key={url} source={{ uri: url }} style={styles.galleryPhoto} />
          ))}
        </ScrollView>
      )}

      <Text style={styles.historyMeta}>
        Reportó {names.get(f.reported_by) ?? "Desconocido"}
        {f.status === "resolved" && f.order_end_date
          ? ` · Resuelta el ${formatDate(f.order_end_date)}`
          : ""}
      </Text>

      {f.status === "rejected" && (
        <View style={styles.closedBox}>
          <Text style={styles.closedText}>
            Motivo del cierre:{" "}
            {f.motivo_rechazo ? withSiglas(f.motivo_rechazo) : "Sin motivo especificado"}
          </Text>

          {f.comentario_rechazo && <Text style={styles.closedText}>{f.comentario_rechazo}</Text>}
        </View>
      )}

      {f.tasks.length > 0 && (
        <View style={styles.workBox}>
          {/* The whole header toggles the list; collapsed, the progress
              count still says how the OT is going. */}
          <Pressable
            style={styles.workToggle}
            onPress={() => setTasksOpen((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={tasksOpen ? "Ocultar tareas" : "Mostrar tareas"}
          >
            <Text style={styles.workTitle}>Trabajo realizado</Text>

            <View style={styles.workToggleRight}>
              <Text style={styles.workProgress}>
                {finishedCount} de {f.tasks.length}{" "}
                {f.tasks.length === 1 ? "tarea finalizada" : "tareas finalizadas"}
              </Text>

              <View style={tasksOpen && styles.chevronOpen}>
                <ChevronDownIcon size={16} color={colors.textMuted} />
              </View>
            </View>
          </Pressable>

          {tasksOpen &&
            f.tasks.map((t, i) => (
              <View key={t.id} style={[styles.workRow, i > 0 && styles.workRowDivider]}>
                <View style={styles.workRowHeader}>
                  <Text style={styles.workTaskName}>{t.taskName}</Text>

                  <Text style={styles.workTaskState}>{taskStateLabel(t)}</Text>
                </View>

                <Text style={styles.workTechnician}>
                  {names.get(t.technicianId) ?? "Técnico desconocido"}
                </Text>

                {t.suspension && (
                  <Text style={styles.workDetail}>
                    <Text style={styles.workDetailLabel}>Motivo de la suspensión: </Text>
                    {t.suspension.reason}
                    {t.suspension.comment ? ` - ${t.suspension.comment}` : ""}
                  </Text>
                )}

                {t.diagnosis && (
                  <Text style={styles.workDetail}>
                    <Text style={styles.workDetailLabel}>Diagnóstico: </Text>
                    {t.diagnosis}
                  </Text>
                )}

                {t.consumedParts.length > 0 && (
                  <View style={styles.partsRow}>
                    <SparePartIcon size={13} color={colors.textMuted} />

                    <Text style={styles.workDetail}>
                      {t.consumedParts.map((p) => `${p.nombre} ×${p.cantidad}`).join(" · ")}
                    </Text>
                  </View>
                )}
              </View>
            ))}
        </View>
      )}

      {f.order_id !== null && f.tasks.length === 0 && (
        <Text style={[styles.historyMeta, { marginTop: 10 }]}>
          La orden todavía no tiene tareas cargadas.
        </Text>
      )}
    </View>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexGrow: 1, minWidth: 150, backgroundColor: colors.bgNested, padding: 14 }}>
      <Text style={{ fontSize: 11.5, color: colors.textMuted, fontWeight: "500" }}>{label}</Text>
      <Text style={{ marginTop: 4, fontSize: 14.5, fontWeight: "600", color: colors.text }}>
        {value}
      </Text>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { backgroundColor: c.bg },
    content: { padding: 20, maxWidth: 900 },
    center: { flex: 1 },
    error: { padding: 16, color: c.destructive },
    topBar: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 18,
      flexWrap: "wrap",
      gap: 12,
    },
    backLink: { flexDirection: "row", alignItems: "center", gap: 7 },
    backText: { color: c.textLabel, fontSize: 13.5 },

    card: {
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 16,
      padding: 24,
    },
    badgeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      flexWrap: "wrap",
      marginBottom: 8,
    },
    code: { fontFamily: "monospace", fontSize: 13, color: c.textMuted },
    badge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 11,
      paddingVertical: 3.5,
      borderRadius: 999,
    },
    badgeDot: { width: 7, height: 7, borderRadius: 4 },
    badgeText: { fontSize: 12.5, fontWeight: "600" },
    title: { fontSize: 26, fontWeight: "600", color: c.text },
    subtitle: { fontSize: 14, color: c.textSecondary, marginTop: 4 },
    metaGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      marginTop: 22,
      gap: 1,
      backgroundColor: c.bgMetaGrid,
      borderWidth: 1,
      borderColor: c.bgMetaGrid,
      borderRadius: 12,
      overflow: "hidden",
    },
    tabsRow: {
      flexDirection: "row",
      gap: 4,
      marginTop: 22,
      marginBottom: 18,
      borderBottomWidth: 1,
      borderBottomColor: c.borderBottom,
    },
    tabItem: { paddingVertical: 11, paddingHorizontal: 4, marginRight: 20 },
    tabText: { fontSize: 14, fontWeight: "600", color: c.textMuted },
    tabTextActive: { color: c.accent },
    tabUnderline: { height: 2.5, backgroundColor: c.accent, marginTop: 9, borderRadius: 2 },
    emptyRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderWidth: 1,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
    },
    emptyIconWrap: {
      width: 30,
      height: 30,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyText: { fontSize: 14.5, fontWeight: "500", flex: 1 },
    emptyMuted: { color: c.textMuted, fontSize: 13.5 },
    timeline: { paddingLeft: 4 },
    // position:"relative" + paddingBottom separates the cards. The line is a
    // position:"absolute" child of the ROW (not the rail) so it can cross that
    // padding and reach the next dot, instead of stopping at the card's edge.
    timelineRow: { position: "relative", flexDirection: "row", gap: 16, paddingBottom: 20 },
    // bottom:-18 because the next dot is also shifted 18px down within ITS OWN
    // row (timelineRail.marginTop) — without this the line stops short of the next dot.
    timelineLine: {
      position: "absolute",
      top: 26,
      bottom: -18,
      left: 5.5,
      width: 2,
      backgroundColor: c.borderBottom,
    },
    timelineRail: { alignItems: "center", width: 13, marginTop: 18 },
    timelineDot: { width: 8, height: 8, borderRadius: 4 },
    timelineCard: {
      flex: 1,
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      padding: 14,
    },
    timelineHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    tag: { paddingHorizontal: 11, paddingVertical: 3.5, borderRadius: 999 },
    tagText: { fontSize: 12.5, fontWeight: "600" },
    timelineDate: { fontSize: 12.5, color: c.textMuted, fontFamily: "monospace" },
    timelineNote: { marginTop: 9, fontSize: 14.5, color: c.textSecondary, lineHeight: 20 },
    timelineAuthor: { marginTop: 6, fontSize: 12.5, color: c.textMuted },

    statusNote: { fontSize: 13, color: c.textSecondary, fontWeight: "500" },

    statsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
    statTile: {
      flexGrow: 1,
      flexBasis: 160,
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      padding: 14,
    },
    statLabel: {
      fontSize: 11,
      fontWeight: "600",
      color: c.textMuted,
      letterSpacing: 0.4,
      textTransform: "uppercase",
    },
    statValue: { marginTop: 4, fontSize: 18, fontWeight: "700", color: c.text },
    statHint: { marginTop: 2, fontSize: 12.5, color: c.textSecondary },

    count: { fontSize: 13, fontWeight: "500", color: c.textSecondary },
    // Same look as the tables' accent header bar (work-orders tableHeader),
    // standalone and fully rounded since there's no table below it.
    sortBar: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      columnGap: 22,
      rowGap: 8,
      paddingHorizontal: 18,
      paddingVertical: 11,
      marginBottom: 14,
      backgroundColor: c.accent,
      borderRadius: 11,
    },
    sortBarLabel: {
      fontSize: 11.5,
      fontWeight: "500",
      letterSpacing: 0.5,
      textTransform: "uppercase",
      color: "#fff",
      opacity: 0.75,
    },

    historyCard: {
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
    },
    historyHeader: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    historyHeaderLeft: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
    orderPill: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: c.accent,
    },
    orderPillText: { fontFamily: "monospace", fontSize: 12, fontWeight: "700", color: c.accent },
    historyType: { marginTop: 10, fontSize: 15, fontWeight: "600", color: c.text },
    historyDesc: { marginTop: 4, fontSize: 14, color: c.textSecondary, lineHeight: 20 },
    historyMeta: { marginTop: 6, fontSize: 12.5, color: c.textMuted },
    gallery: { marginTop: 10 },
    galleryContent: { gap: 8, paddingRight: 4 },
    galleryPhoto: { width: 72, height: 72, borderRadius: 8, backgroundColor: c.bgNested },
    closedBox: {
      marginTop: 10,
      padding: 10,
      borderRadius: 8,
      backgroundColor: c.faultRejected.bg,
      gap: 2,
    },
    closedText: { fontSize: 12.5, color: c.text, lineHeight: 17 },
    workBox: {
      marginTop: 12,
      backgroundColor: c.bgNested,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    workTitle: {
      fontSize: 11,
      fontWeight: "600",
      color: c.textMuted,
      letterSpacing: 0.4,
      textTransform: "uppercase",
    },
    workToggle: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
      paddingVertical: 2,
    },
    workToggleRight: { flexDirection: "row", alignItems: "center", gap: 6 },
    workProgress: { fontSize: 12.5, color: c.textSecondary },
    chevronOpen: { transform: [{ rotate: "180deg" }] },
    workRow: { paddingVertical: 8, gap: 3 },
    workRowDivider: { borderTopWidth: 1, borderTopColor: c.borderRow },
    workRowHeader: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      gap: 8,
    },
    workTaskName: { fontSize: 13.5, fontWeight: "600", color: c.text, flexShrink: 1 },
    workTaskState: { fontSize: 12.5, color: c.textSecondary },
    workTechnician: { fontSize: 12.5, color: c.textMuted },
    workDetail: { fontSize: 13, color: c.textLabel, lineHeight: 18, flexShrink: 1 },
    workDetailLabel: { fontWeight: "600" },
    partsRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  });
}
