import { useEffect, useState } from "react";
import { ScrollView, View, Text, Pressable, TextInput, StyleSheet, Switch } from "react-native";
import { router } from "expo-router";
import { changePassword, getProfile, signOut } from "../../../lib/auth";
import { BackIcon } from "../../../components/icons";
import type { ThemeColors } from "../../../lib/theme";
import { useTheme } from "../../../lib/ThemeContext";
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
  const { colors, isDark, toggleTheme } = useTheme();
  const styles = makeStyles(colors);

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
        <View style={styles.themeRow}>
          <View>
            <Text style={styles.sectionTitle}>Tema oscuro</Text>
            <Text style={styles.themeSubtitle}>
              {isDark ? "Activado" : "Desactivado"}
            </Text>
          </View>

          <Switch
            value={isDark}
            onValueChange={toggleTheme}
            trackColor={{ false: colors.bgToggle, true: colors.accent }}
            thumbColor={colors.bgToggleActive}
          />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Cambiar contraseña</Text>

        <TextInput
          style={styles.input}
          value={newPassword}
          onChangeText={setNewPassword}
          placeholder="Nueva contraseña"
          placeholderTextColor={colors.textMuted}
          secureTextEntry
        />

        <TextInput
          style={[styles.input, { marginTop: 8 }]}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Confirmar contraseña"
          placeholderTextColor={colors.textMuted}
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
  const { colors } = useTheme();
  return (
    <View style={{ flexGrow: 1, minWidth: 100, backgroundColor: colors.bgNested, padding: 12 }}>
      <Text style={{ fontSize: 11, color: colors.textMuted, fontWeight: "500" }}>{label}</Text>
      <Text style={{ marginTop: 3, fontSize: 13.5, fontWeight: "600", color: colors.text }}>{value}</Text>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { backgroundColor: c.bg },
    content: { padding: 20, maxWidth: 560 },
    backLink: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 18 },
    backText: { color: c.textLabel, fontSize: 13.5 },
    title: { fontSize: 22, fontWeight: "600", color: c.text },
    subtitle: { marginTop: 3, fontSize: 13.5, color: c.textSecondary, marginBottom: 20 },
    card: {
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 14,
      padding: 20,
      marginBottom: 16,
    },
    header: { flexDirection: "row", alignItems: "center", gap: 14 },
    avatar: {
      width: 46,
      height: 46,
      borderRadius: 12,
      backgroundColor: c.avatarBg,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: { color: c.avatarFg, fontWeight: "700", fontSize: 16 },
    name: { fontSize: 17, fontWeight: "600", color: c.text },
    email: { fontSize: 13, color: c.textMuted, marginTop: 2 },
    metaGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      marginTop: 18,
      gap: 1,
      backgroundColor: c.bgMetaGrid,
      borderWidth: 1,
      borderColor: c.bgMetaGrid,
      borderRadius: 12,
      overflow: "hidden",
    },
    themeRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    sectionTitle: { fontSize: 14, fontWeight: "600", color: c.text, marginBottom: 4 },
    themeSubtitle: { fontSize: 12.5, color: c.textMuted },
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
    error: { color: c.destructive, marginTop: 10, fontSize: 13 },
    success: { color: c.success, marginTop: 10, fontSize: 13 },
    changePasswordButton: {
      marginTop: 12,
      height: 42,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    changePasswordText: { color: c.accent, fontWeight: "600", fontSize: 13.5 },
    logoutButton: {
      height: 44,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.destructive,
      alignItems: "center",
      justifyContent: "center",
    },
    logoutText: { color: c.destructive, fontWeight: "600" },
  });
}
