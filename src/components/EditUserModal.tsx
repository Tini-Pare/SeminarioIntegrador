import { useEffect, useState } from "react";
import { Modal, View, Text, Pressable, Switch, TextInput, StyleSheet } from "react-native";
import { confirmDelete } from "../lib/confirm";
import { deleteUser, listProfiles, updateProfile } from "../lib/queries/profiles";
import { AutocompleteInput } from "./AutocompleteInput";
import type { Profile } from "../types/database";
import { useTheme } from "../lib/ThemeContext";
import type { ThemeColors } from "../lib/theme";

const ROLES: Profile["role"][] = ["user", "technician", "admin"];
const ROLE_LABELS: Record<Profile["role"], string> = {
  user: "Usuario",
  technician: "Técnico",
  admin: "Admin",
};

export function EditUserModal({
  visible,
  onClose,
  onSaved,
  profile,
  isSelf = false,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  profile: Profile;
  isSelf?: boolean;
}) {
  const [name, setName] = useState(profile.name);
  const [area, setArea] = useState(profile.area ?? "");
  const [legajo, setLegajo] = useState(profile.legajo ?? "");
  const [role, setRole] = useState<Profile["role"]>(profile.role);
  const [active, setActive] = useState(profile.active);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState(false);
  const [existingProfiles, setExistingProfiles] = useState<Profile[]>([]);
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  useEffect(() => {
    if (!visible) return;
    listProfiles()
      .then(setExistingProfiles)
      .catch(() => {});
  }, [visible]);

  async function handleSave() {
    if (!name.trim()) {
      setError("El nombre no puede estar vacío");
      return;
    }
    const legajoTrimmed = legajo.trim();
    if (legajoTrimmed && !/^[0-9]+$/.test(legajoTrimmed)) {
      setError("El legajo solo puede tener números.");
      return;
    }
    if (
      legajoTrimmed &&
      existingProfiles.some((p) => p.id !== profile.id && p.legajo === legajoTrimmed)
    ) {
      setDuplicateWarning(true);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // isSelf: role/active are ignored here even if local state changed —
      // the UI already disables them, this is the safety net so an admin
      // can never demote or deactivate themselves.
      await updateProfile(profile.id, {
        name: name.trim(),
        area: area.trim(),
        legajo: legajoTrimmed || null,
        role: isSelf ? profile.role : role,
        active: isSelf ? profile.active : active,
      });
      onSaved();
      onClose();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes("profiles_legajo")) {
        setDuplicateWarning(true);
      } else {
        setError(message);
      }
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    setDeleting(true);
    setError(null);
    try {
      await deleteUser(profile.id);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  }

  function handleDelete() {
    confirmDelete(
      "Eliminar persona",
      `¿Eliminar la cuenta de ${profile.name}? Esta acción no se puede deshacer.`,
      doDelete,
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{profile.name}</Text>

          <Text style={styles.label}>Nombre</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Nombre"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.label}>Legajo</Text>
          <TextInput
            style={styles.input}
            value={legajo}
            onChangeText={setLegajo}
            placeholder="Ej: 1234"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
          />

          <Text style={styles.label}>Área</Text>
          <AutocompleteInput
            value={area}
            onChangeText={setArea}
            options={existingProfiles.map((p) => p.area).filter((a): a is string => !!a)}
            placeholder="Área"
          />

          <Text style={styles.label}>Rol</Text>
          <View style={[styles.chipsRow, isSelf && styles.disabled]}>
            {ROLES.map((r) => (
              <Pressable
                key={r}
                style={[
                  styles.chip,
                  role === r && { backgroundColor: colors.accent, borderColor: colors.accent },
                ]}
                onPress={() => !isSelf && setRole(r)}
                disabled={isSelf}
              >
                <Text style={[styles.chipText, role === r && styles.chipTextActive]}>
                  {ROLE_LABELS[r]}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={[styles.switchRow, isSelf && styles.disabled]}>
            <Text style={styles.label}>Activo</Text>
            <Switch value={active} onValueChange={setActive} disabled={isSelf} />
          </View>

          {isSelf && (
            <Text style={styles.selfNote}>
              No podés cambiar tu propio rol ni desactivarte — pedile a otro admin que lo haga.
            </Text>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.actions}>
            <Pressable style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </Pressable>

            <Pressable style={styles.saveButton} onPress={handleSave} disabled={saving}>
              <Text style={styles.saveText}>{saving ? "Guardando…" : "Guardar"}</Text>
            </Pressable>
          </View>

          {profile.role !== "admin" && (
            <Pressable style={styles.deleteButton} onPress={handleDelete} disabled={deleting}>
              <Text style={styles.deleteText}>{deleting ? "Eliminando…" : "Eliminar persona"}</Text>
            </Pressable>
          )}
        </View>
      </View>

      <Modal
        visible={duplicateWarning}
        transparent
        animationType="fade"
        onRequestClose={() => setDuplicateWarning(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.warningSheet}>
            <Text style={styles.title}>Legajo ya registrado</Text>
            <Text style={styles.subtitle}>
              Ya existe otra persona con el legajo {legajo.trim()}. Usá otro número.
            </Text>

            <Pressable style={styles.saveButton} onPress={() => setDuplicateWarning(false)}>
              <Text style={styles.saveText}>Entendido</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.55)",
      justifyContent: "center",
      padding: 20,
    },
    sheet: {
      backgroundColor: c.bgModal,
      borderRadius: 16,
      padding: 24,
      width: "100%",
      maxWidth: 440,
      alignSelf: "center",
    },
    warningSheet: {
      backgroundColor: c.bgModal,
      borderRadius: 16,
      padding: 24,
      width: "100%",
      maxWidth: 380,
      alignSelf: "center",
      gap: 16,
    },
    title: { fontSize: 18, fontWeight: "600", color: c.text },
    subtitle: { marginTop: 2, fontSize: 13, color: c.textMuted },
    label: {
      fontSize: 12.5,
      fontWeight: "600",
      color: c.textLabel,
      marginTop: 18,
      marginBottom: 8,
    },
    input: {
      height: 42,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: c.borderInput,
      borderRadius: 10,
      backgroundColor: c.bgInput,
      fontSize: 14,
      color: c.text,
    },
    chipsRow: { flexDirection: "row", gap: 8 },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: c.borderInput,
      backgroundColor: c.bgInput,
    },
    chipText: { fontSize: 13, color: c.textLabel, fontWeight: "600" },
    chipTextActive: { color: "#fff" },
    disabled: { opacity: 0.45 },
    selfNote: { marginTop: 10, fontSize: 12.5, color: c.textMuted },
    switchRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 4,
    },
    error: { color: c.destructive, marginTop: 12, fontSize: 13 },
    actions: { flexDirection: "row", gap: 10, marginTop: 24 },
    cancelButton: {
      flex: 1,
      height: 44,
      borderRadius: 10,
      backgroundColor: "#dc2626",
      alignItems: "center",
      justifyContent: "center",
    },
    cancelText: { color: "#fff", fontWeight: "600" },
    saveButton: {
      flex: 1,
      height: 44,
      borderRadius: 10,
      backgroundColor: c.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    saveText: { color: "#fff", fontWeight: "600" },
    deleteButton: {
      marginTop: 12,
      height: 44,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.destructive,
      alignItems: "center",
      justifyContent: "center",
    },
    deleteText: { color: c.destructive, fontWeight: "600", fontSize: 14 },
  });
}
