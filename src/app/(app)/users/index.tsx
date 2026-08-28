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
import { CrudActions } from "../../../components/CrudActions";
import { DeleteConfirmationModal } from "../../../components/DeleteConfirmationModal";
import { InvitePersonModal } from "../../../components/InvitePersonModal";
import { BREAKPOINT } from "../../../constants";
import { getProfile } from "../../../lib/auth";
import { deleteProfile, listProfiles } from "../../../lib/queries/profiles";
import type { ThemeColors } from "../../../lib/theme";
import { useTheme } from "../../../lib/ThemeContext";
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
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const isMobile = width >= BREAKPOINT.mobile;
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

  async function removeProfile(profile: Profile) {
    setDeletingId(profile.id);
    try {
      await deleteProfile(profile.id);
      setDeleteTarget(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDeleteTarget(null);
    } finally {
      setDeletingId(null);
    }
  }

  function confirmDelete(profile: Profile) {
    setError(null);
    setDeleteTarget(profile);
  }

  if (loading) return <ActivityIndicator style={styles.center} />;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 20 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Usuarios y roles</Text>
          <Text style={styles.subtitle}>Gestioná quién es usuario y quién es técnico</Text>
        </View>

        <Pressable style={styles.inviteButton} onPress={() => setInviting(true)}>
          <Text style={styles.inviteButtonText}>+ Invitar Persona</Text>
        </Pressable>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      {isMobile ? (
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.headerCell, { flex: 2.2 }]}>PERSONA</Text>
            <Text style={[styles.headerCell, { flex: 1.4 }]}>ÁREA</Text>
            <Text style={[styles.headerCell, { flex: 1.1 }]}>ROL</Text>
            <Text style={[styles.headerCell, { flex: 1 }]}>ESTADO</Text>
            <Text style={[styles.headerCell, styles.actionsColumn]}>ACCIONES</Text>
          </View>

          {profiles.map((p) => {
            const rm = roleMeta[p.role];
            return (
              <View key={p.id} style={styles.row}>
                <Pressable
                  style={[
                    styles.cell,
                    { flex: 2.2, flexDirection: "row", alignItems: "center", gap: 11 },
                  ]}
                  onPress={() => setEditing(p)}
                >
                  <View style={[styles.avatar, { backgroundColor: rm.bg }]}>
                    <Text style={[styles.avatarText, { color: rm.fg }]}>{initials(p.name)}</Text>
                  </View>

                  <View style={{ minWidth: 0 }}>
                    <Text style={styles.name} numberOfLines={1}>
                      {p.name}
                    </Text>
                    <Text style={styles.email} numberOfLines={1}>
                      {p.email}
                    </Text>
                  </View>
                </Pressable>

                <View style={{ flex: 1.4, justifyContent: "center" }}>
                  <Text style={styles.areaText} numberOfLines={1}>
                    {p.area}
                  </Text>
                </View>

                <View style={{ flex: 1.1, justifyContent: "center" }}>
                  <View style={[styles.badge, { backgroundColor: rm.bg }]}>
                    <Text style={[styles.badgeText, { color: rm.fg }]}>{rm.label}</Text>
                  </View>
                </View>

                <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <View
                    style={[
                      styles.statusDot,
                      { backgroundColor: p.active ? colors.success : colors.textMuted },
                    ]}
                  />
                  <Text
                    style={{
                      fontSize: 13,
                      color: p.active ? colors.success : colors.textMuted,
                      fontWeight: "500",
                    }}
                  >
                    {p.active ? "Activo" : "Inactivo"}
                  </Text>
                </View>

                <View style={styles.actionsColumn}>
                  <CrudActions
                    onEdit={() => setEditing(p)}
                    onDelete={() => confirmDelete(p)}
                    deleteDisabled={
                      p.role === "admin" || p.id === currentUserId || deletingId === p.id
                    }
                  />
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <View style={styles.cardList}>
          {profiles.map((p) => {
            const rm = roleMeta[p.role];
            return (
              <View key={p.id} style={styles.personCard}>
                <Pressable style={styles.personCardHeader} onPress={() => setEditing(p)}>
                  <View style={[styles.avatar, { backgroundColor: rm.bg }]}>
                    <Text style={[styles.avatarText, { color: rm.fg }]}>{initials(p.name)}</Text>
                  </View>

                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.name} numberOfLines={1}>
                      {p.name}
                    </Text>
                    <Text style={styles.email} numberOfLines={1}>
                      {p.email}
                    </Text>
                  </View>
                </Pressable>

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

                  <View style={styles.statusChip}>
                    <View
                      style={[
                        styles.statusDot,
                        { backgroundColor: p.active ? colors.success : colors.textMuted },
                      ]}
                    />
                    <Text
                      style={{
                        fontSize: 12.5,
                        color: p.active ? colors.success : colors.textMuted,
                        fontWeight: "500",
                      }}
                    >
                      {p.active ? "Activo" : "Inactivo"}
                    </Text>
                  </View>
                </View>

                <View style={styles.personCardActions}>
                  <CrudActions
                    onEdit={() => setEditing(p)}
                    onDelete={() => confirmDelete(p)}
                    deleteDisabled={
                      p.role === "admin" || p.id === currentUserId || deletingId === p.id
                    }
                  />
                </View>
              </View>
            );
          })}
        </View>
      )}

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

      {deleteTarget && (
        <DeleteConfirmationModal
          visible
          title="Eliminar persona"
          message={`¿Querés eliminar la cuenta de ${deleteTarget.name}? Esta acción no se puede deshacer.`}
          deleting={deletingId === deleteTarget.id}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => void removeProfile(deleteTarget)}
        />
      )}
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
    title: { fontSize: 22, fontWeight: "600", color: c.text },
    subtitle: { marginTop: 3, fontSize: 13.5, color: c.textSecondary },
    inviteButton: {
      backgroundColor: c.accent,
      paddingHorizontal: 18,
      height: 42,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    inviteButtonText: { color: "#fff", fontWeight: "600", fontSize: 14 },
    error: { color: c.destructive, marginBottom: 12 },
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
    row: {
      flexDirection: "row",
      padding: 14,
      borderBottomWidth: 1,
      borderBottomColor: c.borderRow,
    },
    cell: {},
    actionsColumn: { flex: 0.9, minWidth: 76, justifyContent: "center" },
    areaText: { fontSize: 13.5, color: c.textLabel },
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
    personCardActions: { alignSelf: "flex-end", marginTop: 8 },
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
