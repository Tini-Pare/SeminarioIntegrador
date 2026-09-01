import { useEffect, useState } from "react";
import { Modal, View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { supabase } from "../lib/supabase";
import { listProfiles } from "../lib/queries/profiles";
import type { Profile } from "../types/database";
import { useTheme } from "../lib/ThemeContext";
import type { ThemeColors } from "../lib/theme";

const ROLES: Profile["role"][] = ["user", "technician", "admin"];
const ROLE_LABELS: Record<Profile["role"], string> = {
  user: "Usuario",
  technician: "Técnico",
  admin: "Admin",
};

export function InvitePersonModal({
  visible,
  onClose,
  onInvited,
}: {
  visible: boolean;
  onClose: () => void;
  onInvited: () => void;
}) {
  const [legajo, setLegajo] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Profile["role"]>("user");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingProfiles, setExistingProfiles] = useState<Profile[]>([]);
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  useEffect(() => {
    if (!visible) return;
    listProfiles()
      .then(setExistingProfiles)
      .catch(() => {});
  }, [visible]);

  async function handleSubmit() {
    const legajoTrimmed = legajo.trim();
    if (!legajoTrimmed || !name.trim() || !password.trim()) {
      setError("Completá legajo, nombre y contraseña.");
      return;
    }
    if (!/^[0-9]+$/.test(legajoTrimmed)) {
      setError("El legajo solo puede tener números.");
      return;
    }
    if (password.trim().length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (existingProfiles.some((p) => p.legajo === legajoTrimmed)) {
      setError(`Ya existe una persona con el legajo ${legajoTrimmed}. Usá otro número.`);
      return;
    }
    setSending(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Sin sesión activa");

      const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/invite-user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
        },
        body: JSON.stringify({
          legajo: legajoTrimmed,
          name: name.trim(),
          password: password.trim(),
          role,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        if (body.error === "legajo_exists") {
          setError(`Ya existe una persona con el legajo ${legajoTrimmed}. Usá otro número.`);
          return;
        }
        throw new Error(body.error ?? "No se pudo crear la cuenta");
      }

      setLegajo("");
      setName("");
      setPassword("");
      setRole("user");
      onInvited();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Nueva persona</Text>
          <Text style={styles.subtitle}>
            Se crea la cuenta ya activa con esta contraseña — compartísela a la persona por otro
            medio.
          </Text>

          <Text style={styles.label}>Legajo</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej: 1234"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            value={legajo}
            onChangeText={setLegajo}
          />

          <Text style={styles.label}>Nombre</Text>
          <TextInput
            style={styles.input}
            placeholder="Nombre completo"
            placeholderTextColor={colors.textMuted}
            value={name}
            onChangeText={setName}
          />

          <Text style={styles.label}>Contraseña</Text>
          <TextInput
            style={styles.input}
            placeholder="Mínimo 6 caracteres"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          <Text style={styles.label}>Rol</Text>
          <View style={styles.chipsRow}>
            {ROLES.map((r) => (
              <Pressable
                key={r}
                style={[
                  styles.chip,
                  role === r && { backgroundColor: colors.accent, borderColor: colors.accent },
                ]}
                onPress={() => setRole(r)}
              >
                <Text style={[styles.chipText, role === r && styles.chipTextActive]}>
                  {ROLE_LABELS[r]}
                </Text>
              </Pressable>
            ))}
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.actions}>
            <Pressable style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </Pressable>

            <Pressable style={styles.sendButton} onPress={handleSubmit} disabled={sending}>
              <Text style={styles.sendText}>{sending ? "Guardando…" : "Guardar"}</Text>
            </Pressable>
          </View>
        </View>
      </View>
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
      maxWidth: 480,
      alignSelf: "center",
    },
    title: { fontSize: 19, fontWeight: "600", color: c.text, marginBottom: 4 },
    subtitle: { fontSize: 12.5, color: c.textMuted, lineHeight: 17 },
    label: {
      fontSize: 12.5,
      fontWeight: "600",
      color: c.textLabel,
      marginTop: 14,
      marginBottom: 6,
    },
    input: {
      height: 44,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: c.borderInput,
      borderRadius: 10,
      fontSize: 14,
      backgroundColor: c.bgInput,
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
    error: { color: c.destructive, marginTop: 14, fontSize: 13 },
    actions: { flexDirection: "row", gap: 10, marginTop: 22 },
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
    sendButton: {
      flex: 1,
      height: 44,
      borderRadius: 10,
      backgroundColor: c.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    sendText: { color: "#fff", fontWeight: "600" },
  });
}
