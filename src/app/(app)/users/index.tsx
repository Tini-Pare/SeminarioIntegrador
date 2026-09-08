import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { EditUserModal } from "../../../components/EditUserModal";
import { InvitePersonModal } from "../../../components/InvitePersonModal";
import { Pagination } from "../../../components/Pagination";
import { RowActions } from "../../../components/RowActions";
import { SortHeaderCell } from "../../../components/SortHeaderCell";
import { TableFilterBar } from "../../../components/TableFilterBar";
import { BREAKPOINT } from "../../../constants";
import { getProfile } from "../../../lib/auth";
import { useConfirm } from "../../../lib/useConfirm";
import { deleteUser, listProfiles } from "../../../lib/queries/profiles";
import type { ThemeColors } from "../../../lib/theme";
import { useTheme } from "../../../lib/ThemeContext";
import { usePagination } from "../../../lib/usePagination";
import { useTableSort } from "../../../lib/useTableSort";
import type { Profile } from "../../../types/database";

const ROLE_RANK: Record<Profile["role"], number> = { admin: 0, technician: 1, user: 2 };
const ROLE_LABELS: Record<Profile["role"], string> = {
  admin: "Admin",
  technician: "Técnico",
  user: "Usuario",
};

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function UsersScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [inviting, setInviting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [areaFilter, setAreaFilter] = useState("");
  const { width } = useWindowDimensions();
  const isWide = width >= BREAKPOINT.mobile;
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { confirm, dialog } = useConfirm();

  const roleMeta: Record<Profile["role"], { label: string; bg: string; fg: string }> = {
    admin: { label: "Admin", ...colors.roleAdmin },
    technician: { label: "Técnico", ...colors.roleTechnician },
    user: { label: "Usuario", ...colors.roleUser },
  };

  useEffect(() => {
    getProfile().then((p) => setCurrentUserId(p?.id ?? null));
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      setProfiles(await listProfiles());
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

  function handleDelete(p: Profile) {
    confirm({
      title: "Eliminar persona",
      message: `¿Eliminar la cuenta de ${p.name}? Esta acción no se puede deshacer.`,
      onConfirm: async () => {
        try {
          await deleteUser(p.id);
          await load();
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      },
    });
  }

  const areaOptions = useMemo(() => {
    const areas = Array.from(
      new Set(profiles.map((p) => p.area?.trim()).filter((a): a is string => !!a)),
    ).sort((a, b) => a.localeCompare(b, "es"));
    return [{ value: "", label: "Todas" }, ...areas.map((a) => ({ value: a, label: a }))];
  }, [profiles]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return profiles.filter((p) => {
      const matchSearch =
        !q || p.name.toLowerCase().includes(q) || (p.legajo ?? "").toLowerCase().includes(q);
      const matchRole = !roleFilter || p.role === roleFilter;
      const matchStatus = !statusFilter || (statusFilter === "active" ? p.active : !p.active);
      const matchArea = !areaFilter || p.area?.trim() === areaFilter;
      return matchSearch && matchRole && matchStatus && matchArea;
    });
  }, [profiles, search, roleFilter, statusFilter, areaFilter]);

  const { sorted, field, dir, toggle } = useTableSort<Profile>(
    filtered,
    {
      persona: (p) => p.name,
      rol: (p) => ROLE_RANK[p.role],
      estado: (p) => (p.active ? 0 : 1),
    },
    "persona",
  );

  const { pageItems, page, pageCount, setPage } = usePagination(
    sorted,
    `${search}|${roleFilter}|${statusFilter}|${areaFilter}|${field}|${dir}`,
  );

  if (loading) return <ActivityIndicator style={styles.center} />;

  function StatusPill({ active }: { active: boolean }) {
    return (
      <View style={styles.statusChip}>
        <View
          style={[
            styles.statusDot,
            { backgroundColor: active ? colors.success : colors.textMuted },
          ]}
        />
        <Text
          style={{
            fontSize: 12.5,
            color: active ? colors.success : colors.textMuted,
            fontWeight: "500",
          }}
        >
          {active ? "Activo" : "Inactivo"}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Usuarios y roles</Text>
          <Text style={styles.subtitle}>Gestioná quién es usuario y quién es técnico</Text>
        </View>

        <Pressable style={styles.addButton} onPress={() => setInviting(true)}>
          <Text style={styles.addButtonText}>+ Nuevo</Text>
        </Pressable>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <TableFilterBar
        searchValue={search}
        onSearch={setSearch}
        searchPlaceholder="Buscar por nombre o legajo…"
        filters={[
          {
            key: "rol",
            label: "Rol",
            value: roleFilter,
            onChange: setRoleFilter,
            options: [
              { value: "", label: "Todos" },
              { value: "admin", label: ROLE_LABELS.admin },
              { value: "technician", label: ROLE_LABELS.technician },
              { value: "user", label: ROLE_LABELS.user },
            ],
          },
          {
            key: "estado",
            label: "Estado",
            value: statusFilter,
            onChange: setStatusFilter,
            options: [
              { value: "", label: "Todos" },
              { value: "active", label: "Activo" },
              { value: "inactive", label: "Inactivo" },
            ],
          },
          ...(areaOptions.length > 1
            ? [
                {
                  key: "area",
                  label: "Área",
                  value: areaFilter,
                  onChange: setAreaFilter,
                  options: areaOptions,
                },
              ]
            : []),
        ]}
        right={
          <Text style={styles.count}>
            {sorted.length} {sorted.length === 1 ? "persona" : "personas"}
          </Text>
        }
      />

      {sorted.length === 0 ? (
        <Text style={styles.empty}>
          {profiles.length === 0
            ? "Todavía no hay personas cargadas."
            : "Nadie coincide con la búsqueda."}
        </Text>
      ) : isWide ? (
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <SortHeaderCell
              label="Persona"
              field="persona"
              activeField={field}
              dir={dir}
              onSort={toggle}
              style={{ flex: 2.2 }}
            />
            <SortHeaderCell
              label="Rol"
              field="rol"
              activeField={field}
              dir={dir}
              onSort={toggle}
              style={{ flex: 1.1 }}
            />
            <SortHeaderCell
              label="Estado"
              field="estado"
              activeField={field}
              dir={dir}
              onSort={toggle}
              style={{ flex: 1 }}
            />
            <Text style={[styles.headerCell, styles.actionsCol]}>ACCIONES</Text>
          </View>

          {pageItems.map((p, i) => {
            const rm = roleMeta[p.role];
            const isSelf = p.id === currentUserId;
            return (
              <View key={p.id} style={[styles.row, i % 2 === 1 && styles.rowAlt]}>
                <View style={styles.rowMain}>
                  <View
                    style={{
                      flex: 2.2,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 11,
                    }}
                  >
                    <View style={[styles.avatar, { backgroundColor: rm.bg }]}>
                      <Text style={[styles.avatarText, { color: rm.fg }]}>{initials(p.name)}</Text>
                    </View>

                    <View style={{ minWidth: 0, flexShrink: 1 }}>
                      <Text style={styles.name} numberOfLines={1}>
                        {p.name}
                      </Text>
                      <Text style={styles.email} numberOfLines={1}>
                        {p.legajo ? `Legajo ${p.legajo}` : "—"}
                      </Text>
                    </View>
                  </View>

                  <View style={{ flex: 1.1, justifyContent: "center" }}>
                    <View style={[styles.badge, { backgroundColor: rm.bg }]}>
                      <Text style={[styles.badgeText, { color: rm.fg }]}>{rm.label}</Text>
                    </View>
                  </View>

                  <View style={{ flex: 1, justifyContent: "center" }}>
                    <StatusPill active={p.active} />
                  </View>
                </View>

                <View style={styles.actionsCol}>
                  <RowActions
                    onEdit={() => setEditing(p)}
                    onDelete={() => handleDelete(p)}
                    deleteDisabled={p.role === "admin" || isSelf}
                    editTooltip="Editar usuario"
                    deleteTooltip="Eliminar usuario"
                  />
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <View style={styles.cardList}>
          {pageItems.map((p) => {
            const rm = roleMeta[p.role];
            const isSelf = p.id === currentUserId;
            return (
              <View key={p.id} style={styles.personCard}>
                <View>
                  <View style={styles.personCardHeader}>
                    <View style={[styles.avatar, { backgroundColor: rm.bg }]}>
                      <Text style={[styles.avatarText, { color: rm.fg }]}>{initials(p.name)}</Text>
                    </View>

                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.name} numberOfLines={1}>
                        {p.name}
                      </Text>
                      <Text style={styles.email} numberOfLines={1}>
                        {p.legajo ? `Legajo ${p.legajo}` : "—"}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.personCardChips}>
                    {!!p.area && (
                      <View style={styles.areaChip}>
                        <Text style={styles.areaChipText} numberOfLines={1}>
                          {p.area}
                        </Text>
                      </View>
                    )}

                    <View style={[styles.badge, { backgroundColor: rm.bg }]}>
                      <Text style={[styles.badgeText, { color: rm.fg }]}>{rm.label}</Text>
                    </View>

                    <StatusPill active={p.active} />
                  </View>
                </View>

                <View style={styles.cardActions}>
                  <RowActions
                    onEdit={() => setEditing(p)}
                    onDelete={() => handleDelete(p)}
                    deleteDisabled={p.role === "admin" || isSelf}
                    editTooltip="Editar usuario"
                    deleteTooltip="Eliminar usuario"
                  />
                </View>
              </View>
            );
          })}
        </View>
      )}

      <Pagination page={page} pageCount={pageCount} onPage={setPage} />

      {editing && (
        <EditUserModal
          visible={!!editing}
          onClose={() => setEditing(null)}
          onSaved={load}
          profile={editing}
          isSelf={editing.id === currentUserId}
        />
      )}

      <InvitePersonModal visible={inviting} onClose={() => setInviting(false)} onInvited={load} />

      {dialog}
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
    count: { fontSize: 13, fontWeight: "500", color: c.textSecondary },
    empty: { color: c.textMuted, fontSize: 13.5, marginTop: 4 },
    addButton: {
      backgroundColor: c.accent,
      paddingHorizontal: 18,
      height: 42,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    addButtonText: { color: "#fff", fontWeight: "600", fontSize: 14 },
    error: { color: c.destructive, marginBottom: 12 },
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
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: c.borderRow,
    },
    rowAlt: { backgroundColor: c.bgRowAlt },
    rowMain: { flex: 1, flexDirection: "row", alignItems: "center", minWidth: 0 },
    cardList: { gap: 10 },
    personCard: {
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 14,
      padding: 14,
    },
    personCardHeader: { flexDirection: "row", alignItems: "center", gap: 11 },
    personCardChips: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: 8,
      marginTop: 12,
    },
    cardActions: {
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: c.borderRow,
      flexDirection: "row",
      justifyContent: "flex-end",
    },
    areaChip: {
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: 999,
      backgroundColor: c.bgAreaChip,
      maxWidth: 160,
    },
    areaChipText: { fontSize: 12, color: c.textLabel, fontWeight: "500" },
    statusChip: { flexDirection: "row", alignItems: "center", gap: 6 },
    avatar: {
      width: 34,
      height: 34,
      borderRadius: 9,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: { fontWeight: "600", fontSize: 13 },
    name: { fontWeight: "600", fontSize: 14, color: c.text },
    email: { fontSize: 12, color: c.textMuted },
    badge: {
      alignSelf: "flex-start",
      paddingHorizontal: 11,
      paddingVertical: 3,
      borderRadius: 999,
    },
    badgeText: { fontSize: 12, fontWeight: "600" },
    statusDot: { width: 7, height: 7, borderRadius: 4 },
  });
}
