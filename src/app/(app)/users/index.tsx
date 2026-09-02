import { useCallback, useEffect, useState } from "react";
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
import { BREAKPOINT } from "../../../constants";
import { getProfile } from "../../../lib/auth";
import { confirmDelete } from "../../../lib/confirm";
import { deleteUser, listProfiles } from "../../../lib/queries/profiles";
import type { ThemeColors } from "../../../lib/theme";
import { useTheme } from "../../../lib/ThemeContext";
import { usePagination } from "../../../lib/usePagination";
import type { Profile } from "../../../types/database";

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
  const { width } = useWindowDimensions();
  const isWide = width >= BREAKPOINT.mobile;
  const { colors } = useTheme();
  const styles = makeStyles(colors);

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
    confirmDelete(
      "Eliminar persona",
      `¿Eliminar la cuenta de ${p.name}? Esta acción no se puede deshacer.`,
      async () => {
        try {
          await deleteUser(p.id);
          await load();
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      },
    );
  }

  const { pageItems, page, pageCount, setPage } = usePagination(profiles);

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
      contentContainerStyle={{ padding: 20 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Usuarios y roles</Text>
          <Text style={styles.subtitle}>Gestioná quién es usuario y quién es técnico</Text>
        </View>

        <Pressable style={styles.addButton} onPress={() => setInviting(true)}>
          <Text style={styles.addButtonText}>+ Nueva persona</Text>
        </Pressable>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      {isWide ? (
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.headerCell, { flex: 2.2 }]}>PERSONA</Text>
            <Text style={[styles.headerCell, { flex: 1.1 }]}>ROL</Text>
            <Text style={[styles.headerCell, { flex: 1 }]}>ESTADO</Text>
            <Text style={[styles.headerCell, styles.actionsCol]}>ACCIONES</Text>
          </View>

          {pageItems.map((p) => {
            const rm = roleMeta[p.role];
            const isSelf = p.id === currentUserId;
            return (
              <View key={p.id} style={styles.row}>
                <Pressable
                  style={styles.rowMain}
                  onPress={() => setEditing(p)}
                  accessibilityLabel={`Editar ${p.name}`}
                >
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
                </Pressable>

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
                <Pressable onPress={() => setEditing(p)} accessibilityLabel={`Editar ${p.name}`}>
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
                </Pressable>

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
    </ScrollView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { backgroundColor: c.bg },
    center: { flex: 1 },
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
    error: { color: c.destructive, marginBottom: 12 },
    table: {
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 14,
      overflow: "hidden",
      maxWidth: 980,
    },
    tableHeader: {
      flexDirection: "row",
      alignItems: "center",
      padding: 14,
      backgroundColor: c.bgTableHeader,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    headerCell: {
      fontSize: 11,
      letterSpacing: 0.6,
      textTransform: "uppercase",
      color: c.textMuted,
      fontFamily: "monospace",
    },
    actionsCol: { width: 76, flexShrink: 0, alignItems: "flex-start" },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: c.borderRow,
    },
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
