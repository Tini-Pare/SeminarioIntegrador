import { Stack, router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { AddEquipmentModal } from "../../../components/AddEquipmentModal";
import { EditEquipmentModal } from "../../../components/EditEquipmentModal";
import { EditIcon, TrashIcon } from "../../../components/icons";
import { ReportFaultModal } from "../../../components/ReportFaultModal";
import { BREAKPOINT } from "../../../constants";
import { getProfile } from "../../../lib/auth";
import { deleteEquipment, listEquipment } from "../../../lib/queries/equipment";
import { supabase } from "../../../lib/supabase";
import type { ThemeColors } from "../../../lib/theme";
import { useTheme } from "../../../lib/ThemeContext";
import type { Equipo, Profile } from "../../../types/database";

const STATUS_LABEL: Record<Equipo["status"], string> = {
  operational: "Funcionando",
  waiting: "En espera",
  repair: "En reparación",
};

export default function EquipmentScreen() {
  const [equipment, setEquipment] = useState<Equipo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [editing, setEditing] = useState<Equipo | null>(null);
  const [creating, setCreating] = useState(false);
  const [reportingFault, setReportingFault] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Equipo | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const { width } = useWindowDimensions();
  const isWide = width >= BREAKPOINT.mobile;
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const load = useCallback(async () => {
    setError(null);
    try {
      setEquipment(await listEquipment());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    getProfile().then(setProfile);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().finally(() => setLoading(false));
    }, [load]),
  );

  useEffect(() => {
    const channel = supabase
      .channel(`equipment-list-changes-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "equipo" }, load)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const filteredEquipment = equipment.filter((item) => {
    const query = search.trim().toLowerCase();
    return (
      !query ||
      `${item.code} ${item.name} ${item.type} ${item.location}`.toLowerCase().includes(query)
    );
  });

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function removeEquipment(item: Equipo) {
    setDeletingId(item.id);
    try {
      await deleteEquipment(item.id);
      setDeleteTarget(null);
      await load();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      setDeleteTarget(null);
    } finally {
      setDeletingId(null);
    }
  }

  function confirmDelete(item: Equipo) {
    setError(null);
    setDeleteTarget(item);
  }

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator style={styles.center} />
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Equipos</Text>
            <Text style={styles.subtitle}>Alta, baja y modificación de equipos</Text>
          </View>

          <View style={styles.headerActions}>
            <Pressable style={styles.reportButton} onPress={() => setReportingFault(true)}>
              <Text style={styles.reportButtonText}>+ Reportar falla</Text>
            </Pressable>

            {profile?.role === "admin" && (
              <Pressable style={styles.addButton} onPress={() => setCreating(true)}>
                <Text style={styles.addButtonText}>+ Nuevo equipo</Text>
              </Pressable>
            )}
          </View>
        </View>

        <View style={styles.toolbar}>
          <TextInput
            style={styles.search}
            placeholder="Buscar por código, nombre, tipo o ubicación"
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          <Text style={styles.count}>
            {filteredEquipment.length} {filteredEquipment.length === 1 ? "equipo" : "equipos"}
          </Text>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        {filteredEquipment.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              {search ? "No hay equipos que coincidan" : "Todavía no hay equipos cargados"}
            </Text>
            <Text style={styles.emptyText}>
              {search
                ? "Probá con otro término de búsqueda."
                : "Agregá el primer equipo para comenzar."}
            </Text>
          </View>
        ) : isWide ? (
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.headerCell, styles.codeColumn]}>CÓDIGO</Text>
              <Text style={[styles.headerCell, styles.nameColumn]}>EQUIPO</Text>
              <Text style={[styles.headerCell, styles.typeColumn]}>TIPO</Text>
              <Text style={[styles.headerCell, styles.locationColumn]}>UBICACIÓN</Text>
              <Text style={[styles.headerCell, styles.statusColumn]}>ESTADO</Text>
              {profile?.role === "admin" && (
                <Text style={[styles.headerCell, styles.actionsColumn]}>ACCIONES</Text>
              )}
            </View>

            {filteredEquipment.map((item) => (
              <EquipmentRow
                key={item.id}
                equipment={item}
                isAdmin={profile?.role === "admin"}
                deleting={deletingId === item.id}
                styles={styles}
                colors={colors}
                onOpen={() => router.push(`/equipment/${item.id}`)}
                onEdit={() => setEditing(item)}
                onDelete={() => confirmDelete(item)}
              />
            ))}
          </View>
        ) : (
          <View style={styles.mobileList}>
            {filteredEquipment.map((item) => {
              const status = getStatusColors(item.status, colors);
              return (
                <View key={item.id} style={styles.mobileCard}>
                  <Pressable
                    style={styles.mobileInfo}
                    onPress={() => router.push(`/equipment/${item.id}`)}
                  >
                    <View style={styles.mobileTitleRow}>
                      <Text style={styles.code} numberOfLines={1}>
                        {item.code}
                      </Text>
                      <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                        <View style={[styles.statusDot, { backgroundColor: status.dot }]} />
                        <Text style={[styles.statusText, { color: status.fg }]}>
                          {status.label}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.mobileName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.mobileMeta} numberOfLines={1}>
                      {item.type} · {item.location}
                    </Text>
                  </Pressable>

                  {profile?.role === "admin" && (
                    <View style={styles.mobileActions}>
                      <ActionButton
                        label="Editar equipo"
                        color={colors.accent}
                        onPress={() => setEditing(item)}
                      >
                        <EditIcon size={17} color={colors.accent} />
                      </ActionButton>
                      <ActionButton
                        label="Dar de baja equipo"
                        color={colors.destructive}
                        disabled={deletingId === item.id}
                        onPress={() => confirmDelete(item)}
                      >
                        <TrashIcon size={17} color={colors.destructive} />
                      </ActionButton>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {editing && (
        <EditEquipmentModal
          visible={!!editing}
          onClose={() => setEditing(null)}
          onSaved={load}
          equipment={editing}
        />
      )}

      <AddEquipmentModal visible={creating} onClose={() => setCreating(false)} onCreated={load} />

      <ReportFaultModal
        visible={reportingFault}
        onClose={() => setReportingFault(false)}
        onSubmitted={load}
        equipmentOptions={equipment.map(({ id, code, name }) => ({ id, code, name }))}
      />

      {deleteTarget && (
        <DeleteEquipmentModal
          visible
          equipment={deleteTarget}
          deleting={deletingId === deleteTarget.id}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => void removeEquipment(deleteTarget)}
        />
      )}
    </>
  );
}

function DeleteEquipmentModal({
  visible,
  equipment,
  deleting,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  equipment: Equipo;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { colors } = useTheme();
  const styles = makeDeleteStyles(colors);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Eliminar equipo</Text>
          <Text style={styles.message}>
            ¿Querés eliminar {equipment.code} · {equipment.name}? Esta acción no se puede deshacer.
          </Text>

          <View style={styles.actions}>
            <Pressable style={styles.cancelButton} onPress={onCancel} disabled={deleting}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </Pressable>

            <Pressable style={styles.deleteButton} onPress={onConfirm} disabled={deleting}>
              <Text style={styles.deleteText}>{deleting ? "Eliminando…" : "Eliminar"}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function makeDeleteStyles(c: ThemeColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.55)",
      justifyContent: "center",
      padding: 20,
    },
    sheet: {
      width: "100%",
      maxWidth: 420,
      alignSelf: "center",
      padding: 24,
      backgroundColor: c.bgModal,
      borderRadius: 16,
    },
    title: { color: c.text, fontSize: 19, fontWeight: "600" },
    message: { color: c.textSecondary, fontSize: 14, lineHeight: 21, marginTop: 10 },
    actions: { flexDirection: "row", gap: 10, marginTop: 24 },
    cancelButton: {
      flex: 1,
      height: 44,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.borderInput,
      alignItems: "center",
      justifyContent: "center",
    },
    cancelText: { color: c.textLabel, fontWeight: "600" },
    deleteButton: {
      flex: 1,
      height: 44,
      borderRadius: 10,
      backgroundColor: c.destructive,
      alignItems: "center",
      justifyContent: "center",
    },
    deleteText: { color: "#fff", fontWeight: "600" },
  });
}

function EquipmentRow({
  equipment,
  isAdmin,
  deleting,
  styles,
  colors,
  onOpen,
  onEdit,
  onDelete,
}: {
  equipment: Equipo;
  isAdmin: boolean;
  deleting: boolean;
  styles: ReturnType<typeof makeStyles>;
  colors: ThemeColors;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const status = getStatusColors(equipment.status, colors);

  return (
    <View style={styles.tableRow}>
      <Pressable style={[styles.cell, styles.codeColumn]} onPress={onOpen}>
        <Text style={styles.code} numberOfLines={1}>
          {equipment.code}
        </Text>
      </Pressable>

      <Pressable style={[styles.cell, styles.nameColumn]} onPress={onOpen}>
        <Text style={styles.name} numberOfLines={1}>
          {equipment.name}
        </Text>
      </Pressable>

      <Text style={[styles.cellText, styles.typeColumn]} numberOfLines={1}>
        {equipment.type}
      </Text>

      <Text style={[styles.cellText, styles.locationColumn]} numberOfLines={1}>
        {equipment.location}
      </Text>

      <View style={[styles.cell, styles.statusColumn]}>
        <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
          <View style={[styles.statusDot, { backgroundColor: status.dot }]} />
          <Text style={[styles.statusText, { color: status.fg }]}>{status.label}</Text>
        </View>
      </View>

      {isAdmin && (
        <View style={[styles.cell, styles.actionsColumn, styles.actionsCell]}>
          <ActionButton label="Editar equipo" color={colors.accent} onPress={onEdit}>
            <EditIcon size={17} color={colors.accent} />
          </ActionButton>
          <ActionButton
            label="Dar de baja equipo"
            color={colors.destructive}
            disabled={deleting}
            onPress={onDelete}
          >
            <TrashIcon size={17} color={colors.destructive} />
          </ActionButton>
        </View>
      )}
    </View>
  );
}

function ActionButton({
  children,
  label,
  color,
  disabled,
  onPress,
}: {
  children: React.ReactNode;
  label: string;
  color: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 34,
        height: 34,
        borderRadius: 8,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: pressed ? `${color}18` : "transparent",
        opacity: disabled ? 0.45 : 1,
      })}
    >
      {children}
    </Pressable>
  );
}

function getStatusColors(status: Equipo["status"], colors: ThemeColors) {
  const palette =
    status === "operational"
      ? colors.eqOperational
      : status === "waiting"
        ? colors.eqWaiting
        : colors.eqRepair;
  return { ...palette, label: STATUS_LABEL[status] };
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    content: { padding: 20, paddingBottom: 48 },
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
    headerActions: { flexDirection: "row", flexWrap: "wrap", gap: 10, maxWidth: "100%" },
    addButton: {
      backgroundColor: c.accent,
      paddingHorizontal: 18,
      height: 42,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    addButtonText: { color: "#fff", fontWeight: "600", fontSize: 14 },
    reportButton: {
      borderWidth: 1,
      borderColor: c.accent,
      paddingHorizontal: 16,
      height: 42,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    reportButtonText: { color: c.accent, fontWeight: "600", fontSize: 14 },
    toolbar: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 12,
      marginBottom: 14,
    },
    search: {
      flexGrow: 1,
      minWidth: 240,
      maxWidth: 480,
      height: 42,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: c.borderInput,
      borderRadius: 10,
      backgroundColor: c.bgInput,
      fontSize: 14,
      color: c.text,
    },
    count: { fontSize: 13, color: c.textMuted },
    error: { color: c.destructive, marginBottom: 12 },
    empty: {
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 14,
      padding: 24,
    },
    emptyTitle: { color: c.text, fontWeight: "600", fontSize: 15 },
    emptyText: { color: c.textMuted, fontSize: 13, marginTop: 5 },
    table: {
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 14,
      overflow: "hidden",
      width: "100%",
      maxWidth: 1100,
    },
    tableHeader: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 14,
      paddingVertical: 13,
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
    tableRow: {
      flexDirection: "row",
      alignItems: "center",
      minHeight: 68,
      paddingHorizontal: 14,
      borderBottomWidth: 1,
      borderBottomColor: c.borderRow,
    },
    cell: { justifyContent: "center", paddingVertical: 8 },
    codeColumn: { flex: 1.1, minWidth: 90 },
    nameColumn: { flex: 1.8, minWidth: 140 },
    typeColumn: { flex: 1.3, minWidth: 110, paddingHorizontal: 8 },
    locationColumn: { flex: 1.7, minWidth: 140, paddingHorizontal: 8 },
    statusColumn: { flex: 1.4, minWidth: 120, paddingHorizontal: 8 },
    actionsColumn: { flex: 0.9, minWidth: 76, paddingHorizontal: 4 },
    actionsCell: { flexDirection: "row", alignItems: "center", gap: 2 },
    code: { fontFamily: "monospace", fontSize: 12.5, color: c.textMuted },
    name: { fontWeight: "600", fontSize: 14, color: c.text },
    cellText: { fontSize: 13, color: c.textLabel },
    statusBadge: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 999,
    },
    statusDot: { width: 7, height: 7, borderRadius: 4 },
    statusText: { fontSize: 12, fontWeight: "600" },
    mobileList: { gap: 10 },
    mobileCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 14,
      padding: 14,
    },
    mobileInfo: { flex: 1, minWidth: 0 },
    mobileTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    mobileName: { color: c.text, fontSize: 15, fontWeight: "600", marginTop: 8 },
    mobileMeta: { color: c.textMuted, fontSize: 12.5, marginTop: 3 },
    mobileActions: { flexDirection: "row", alignItems: "center", gap: 2 },
  });
}
