import { useEffect, useState } from "react";
import { Modal, View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { supabase } from "../lib/supabase";
import { listProfiles } from "../lib/queries/profiles";
import { AutocompleteInput } from "./AutocompleteInput";
import type { Profile } from "../types/database";

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
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [area, setArea] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Profile["role"]>("user");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingProfiles, setExistingProfiles] = useState<Profile[]>([]);

  useEffect(() => {
    if (!visible) return;
    listProfiles()
      .then(setExistingProfiles)
      .catch(() => {});
  }, [visible]);

  async function handleSubmit() {
    if (!email.trim() || !name.trim() || !password.trim()) {
      setError("Completá email, nombre y contraseña.");
      return;
    }
    if (password.trim().length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
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
          email: email.trim(),
          name: name.trim(),
          area: area.trim(),
          password: password.trim(),
          role,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "No se pudo crear la cuenta");

      setEmail("");
      setName("");
      setArea("");
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
          <Text style={styles.title}>Invitar persona</Text>
          <Text style={styles.subtitle}>
            Se crea la cuenta ya activa con esta contraseña — compartísela a la persona por otro
            medio.
          </Text>

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="persona@empresa.com"
            placeholderTextColor="#9a9da6"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />

          <Text style={styles.label}>Nombre</Text>
          <TextInput
            style={styles.input}
            placeholder="Nombre completo"
            placeholderTextColor="#9a9da6"
            value={name}
            onChangeText={setName}
          />

          <Text style={styles.label}>Área</Text>
          <AutocompleteInput
            value={area}
            onChangeText={setArea}
            options={existingProfiles.map((p) => p.area).filter((a): a is string => !!a)}
            placeholder="Ej: Mantenimiento"
          />

          <Text style={styles.label}>Contraseña</Text>
          <TextInput
            style={styles.input}
            placeholder="Mínimo 6 caracteres"
            placeholderTextColor="#9a9da6"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          <Text style={styles.label}>Rol</Text>
          <View style={styles.chipsRow}>
            {ROLES.map((r) => (
              <Pressable
                key={r}
                style={[styles.chip, role === r && styles.chipActive]}
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
              <Text style={styles.sendText}>{sending ? "Enviando…" : "Invitar"}</Text>
            </Pressable>
          </View>
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
    maxWidth: 480,
    alignSelf: "center",
  },
  title: { fontSize: 19, fontWeight: "600", color: "#17191f", marginBottom: 4 },
  subtitle: { fontSize: 12.5, color: "#8a8d95", lineHeight: 17 },
  label: { fontSize: 12.5, fontWeight: "600", color: "#4b4e56", marginTop: 14, marginBottom: 6 },
  input: {
    height: 44,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#d8d3c9",
    borderRadius: 10,
    fontSize: 14,
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
  error: { color: "#c0392b", marginTop: 14, fontSize: 13 },
  actions: { flexDirection: "row", gap: 10, marginTop: 22 },
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
  sendButton: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#2f53e0",
    alignItems: "center",
    justifyContent: "center",
  },
  sendText: { color: "#fff", fontWeight: "600" },
});
