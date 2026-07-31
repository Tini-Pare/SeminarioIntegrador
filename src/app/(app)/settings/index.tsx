import { useEffect, useState } from "react";
import { ScrollView, View, Text, Pressable, TextInput, StyleSheet } from "react-native";
import { router } from "expo-router";
import { changePassword, getProfile, signOut } from "../../../lib/auth";
import { BackIcon } from "../../../components/icons";
import type { Profile } from "../../../types/database";

const ROLE_LABELS: Record<Profile["role"], string> = {
  admin: "Administrador",
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

export default function SettingsScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    getProfile().then(setProfile);
  }, []);

  async function handleChangePassword() {
    setError(null);
    setSuccess(false);
    if (newPassword.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setSaving(true);
    try {
      const { error: err } = await changePassword(newPassword);
      if (err) throw new Error(err);
      setSuccess(true);
      setNewPassword("");
      setConfirmPassword("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (!profile) return null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Pressable style={styles.backLink} onPress={() => router.back()}>
        <BackIcon />
        <Text style={styles.backText}>Volver</Text>
      </Pressable>

      <Text style={styles.title}>Configuración</Text>
      <Text style={styles.subtitle}>Tu cuenta y preferencias</Text>

      <View style={styles.card}>
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(profile.name)}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.name}>{profile.name}</Text>
            <Text style={styles.email}>{profile.email}</Text>
          </View>
        </View>

        <View style={styles.metaGrid}>
          <MetaCell label="Rol" value={ROLE_LABELS[profile.role]} />
          <MetaCell label="Área" value={profile.area || "—"} />
          <MetaCell label="Estado" value={profile.active ? "Activo" : "Inactivo"} />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Cambiar contraseña</Text>
        <TextInput
          style={styles.input}
          value={newPassword}
          onChangeText={setNewPassword}
          placeholder="Nueva contraseña"
          placeholderTextColor="#9a9da6"
          secureTextEntry
        />

        <TextInput
          style={[styles.input, { marginTop: 8 }]}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Confirmar contraseña"
          placeholderTextColor="#9a9da6"
          secureTextEntry
        />
        {error && <Text style={styles.error}>{error}</Text>}
        {success && <Text style={styles.success}>Contraseña actualizada.</Text>}
        <Pressable
          style={styles.changePasswordButton}
          onPress={handleChangePassword}
          disabled={saving}
        >
          <Text style={styles.changePasswordText}>
            {saving ? "Guardando…" : "Actualizar contraseña"}
          </Text>
        </Pressable>
      </View>

      <Pressable style={styles.logoutButton} onPress={() => signOut()}>
        <Text style={styles.logoutText}>Cerrar sesión</Text>
      </Pressable>
    </ScrollView>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaCell}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: "#eeeae2" },
  content: { padding: 20, maxWidth: 560 },
  backLink: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 18 },
  backText: { color: "#6c6f78", fontSize: 13.5 },
  title: { fontSize: 22, fontWeight: "600", color: "#17191f" },
  subtitle: { marginTop: 3, fontSize: 13.5, color: "#7b7e86", marginBottom: 20 },
  card: {
    backgroundColor: "#f8f6f1",
    borderWidth: 1,
    borderColor: "#e2ddd3",
    borderRadius: 14,
    padding: 20,
    marginBottom: 16,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: "#e2dcf3",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#5b3eb8", fontWeight: "700", fontSize: 16 },
  name: { fontSize: 17, fontWeight: "600", color: "#17191f" },
  email: { fontSize: 13, color: "#8a8d95", marginTop: 2 },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 18,
    gap: 1,
    backgroundColor: "#e7e2d8",
    borderWidth: 1,
    borderColor: "#e7e2d8",
    borderRadius: 12,
    overflow: "hidden",
  },
  metaCell: { flexGrow: 1, minWidth: 100, backgroundColor: "#fcfbf8", padding: 12 },
  metaLabel: { fontSize: 11, color: "#9a9da6", fontWeight: "500" },
  metaValue: { marginTop: 3, fontSize: 13.5, fontWeight: "600", color: "#2c2f36" },
  sectionTitle: { fontSize: 12.5, fontWeight: "600", color: "#4b4e56", marginBottom: 10 },
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
  error: { color: "#c0392b", marginTop: 10, fontSize: 13 },
  success: { color: "#1e7f47", marginTop: 10, fontSize: 13 },
  changePasswordButton: {
    marginTop: 12,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2f53e0",
    alignItems: "center",
    justifyContent: "center",
  },
  changePasswordText: { color: "#2f53e0", fontWeight: "600", fontSize: 13.5 },
  logoutButton: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#c0392b",
    alignItems: "center",
    justifyContent: "center",
  },
  logoutText: { color: "#c0392b", fontWeight: "600" },
});
