import { useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  View,
  Text,
  Pressable,
  Switch,
  TextInput,
  StyleSheet,
} from "react-native";
import { listProfiles, updateProfile } from "../lib/queries/profiles";
import { supabase } from "../lib/supabase";
import { AutocompleteInput } from "./AutocompleteInput";
import type { Profile } from "../types/database";

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
  const [role, setRole] = useState<Profile["role"]>(profile.role);
  const [active, setActive] = useState(profile.active);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingProfiles, setExistingProfiles] = useState<Profile[]>([]);

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
    setSaving(true);
    setError(null);
    try {
      // isSelf: role/active are ignored here even if local state changed —
      // the UI already disables them, this is the safety net so an admin
      // can never demote or deactivate themselves.
      await updateProfile(profile.id, {
        name: name.trim(),
        area: area.trim(),
        role: isSelf ? profile.role : role,
        active: isSelf ? profile.active : active,
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    setDeleting(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Sin sesión activa");

      const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/delete-user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
        },
        body: JSON.stringify({ id: profile.id }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "No se pudo eliminar");

      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  }

  function handleDelete() {
    const message = `¿Eliminar la cuenta de ${profile.name}? Esta acción no se puede deshacer.`;
    if (Platform.OS === "web") {
      if (window.confirm(message)) doDelete();
      return;
    }
    Alert.alert("Eliminar persona", message, [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: doDelete },
    ]);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{profile.name}</Text>
          <Text style={styles.subtitle}>{profile.email}</Text>

          <Text style={styles.label}>Nombre</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Nombre"
            placeholderTextColor="#9a9da6"
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
                style={[styles.chip, role === r && styles.chipActive]}
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
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 20 },
  sheet: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 440,
    alignSelf: "center",
  },
  title: { fontSize: 18, fontWeight: "600", color: "#17191f" },
  subtitle: { marginTop: 2, fontSize: 13, color: "#8a8d95" },
  label: { fontSize: 12.5, fontWeight: "600", color: "#4b4e56", marginTop: 18, marginBottom: 8 },
  input: {
    height: 42,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#dcd7cd",
    borderRadius: 10,
    backgroundColor: "#fff",
    fontSize: 14,
    color: "#17191f",
  },
  chipsRow: { flexDirection: "row", gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d8d3c9",
  },
  chipActive: { backgroundColor: "#2f53e0", borderColor: "#2f53e0" },
  chipText: { fontSize: 13, color: "#4b4e56", fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  disabled: { opacity: 0.45 },
  selfNote: { marginTop: 10, fontSize: 12.5, color: "#8a8d95" },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  error: { color: "#c0392b", marginTop: 12, fontSize: 13 },
  actions: { flexDirection: "row", gap: 10, marginTop: 24 },
  cancelButton: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d8d3c9",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: { color: "#4b4e56", fontWeight: "600" },
  saveButton: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#2f53e0",
    alignItems: "center",
    justifyContent: "center",
  },
  saveText: { color: "#fff", fontWeight: "600" },
  deleteButton: {
    marginTop: 12,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#c0392b",
    alignItems: "center",
    justifyContent: "center",
  },
  deleteText: { color: "#c0392b", fontWeight: "600", fontSize: 14 },
});
