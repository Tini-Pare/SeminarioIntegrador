import { router } from "expo-router";
import { useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BREAKPOINT } from "../../constants";
import { signIn } from "../../lib/auth";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { width } = useWindowDimensions();
  const isTablet = width >= BREAKPOINT.tablet;
  const insets = useSafeAreaInsets();
  const passwordRef = useRef<TextInput>(null);

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) {
      setError(error);
      return;
    }
    router.replace("/equipment");
  }

  const form = (
    <View style={isTablet ? styles.formPanel : styles.formPanelNarrow}>
      <View style={styles.formInner}>
        <Text style={styles.title}>Ingresar</Text>
        <Text style={styles.subtitle}>Iniciá sesión para ver el estado de tus equipos.</Text>

        <View style={styles.fields}>
          <View>
            <Text style={styles.label}>Correo</Text>
            <TextInput
              style={styles.input}
              placeholder="usuario@empresa.com"
              placeholderTextColor="#9a9da6"
              autoCapitalize="none"
              keyboardType="email-address"
              returnKeyType="next"
              value={email}
              onChangeText={setEmail}
              onSubmitEditing={() => passwordRef.current?.focus()}
              blurOnSubmit={false}
            />
          </View>

          <View>
            <Text style={styles.label}>Contraseña</Text>
            <TextInput
              ref={passwordRef}
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor="#9a9da6"
              secureTextEntry
              returnKeyType="go"
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={handleSubmit}
            />
          </View>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable style={styles.button} onPress={handleSubmit} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? "Ingresando…" : "Ingresar"}</Text>
        </Pressable>
      </View>
    </View>
  );

  if (!isTablet) {
    return (
      <ScrollView
        style={styles.narrowContainer}
        contentContainerStyle={[styles.narrowContent, { paddingTop: insets.top + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brandRowNarrow}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>M</Text>
          </View>
          <Text style={styles.brandNameDark}>Mantia</Text>
        </View>

        {form}
      </ScrollView>
    );
  }

  return (
    <View style={styles.wideContainer}>
      <View style={styles.brandPanel}>
        <View style={styles.brandRow}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>M</Text>
          </View>
          <Text style={styles.brandName}>Mantia</Text>
        </View>

        <View style={styles.brandCopy}>
          <Text style={styles.eyebrow}>CMMS · GESTIÓN DE MANTENIMIENTO</Text>
          <Text style={styles.headline}>Todos tus equipos, fallas y órdenes en un solo lugar.</Text>
          <Text style={styles.tagline}>
            Reportá una falla en segundos, seguí el mantenimiento preventivo y consultá el historial
            completo de cada equipo.
          </Text>
        </View>

        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: "#22a45d" }]} />
            <Text style={styles.legendText}>Funcionando</Text>
          </View>

          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: "#d9962a" }]} />
            <Text style={styles.legendText}>En espera</Text>
          </View>

          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: "#d24141" }]} />
            <Text style={styles.legendText}>En reparación</Text>
          </View>
        </View>
      </View>

      {form}
    </View>
  );
}

const styles = StyleSheet.create({
  wideContainer: { flex: 1, flexDirection: "row" },
  brandPanel: {
    flex: 1.05,
    backgroundColor: "#191c22",
    padding: 56,
    justifyContent: "space-between",
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  brandRowNarrow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 32 },
  logo: {
    width: 38,
    height: 38,
    borderRadius: 9,
    backgroundColor: "#2f53e0",
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: { color: "#fff", fontWeight: "700", fontSize: 20 },
  brandName: { color: "#edebe6", fontWeight: "600", fontSize: 20 },
  brandNameDark: { color: "#17191f", fontWeight: "600", fontSize: 20 },
  brandCopy: { maxWidth: 400 },
  eyebrow: {
    color: "#2f53e0",
    fontSize: 12,
    letterSpacing: 2,
    marginBottom: 18,
    fontWeight: "600",
  },
  headline: { color: "#edebe6", fontWeight: "600", fontSize: 40, lineHeight: 44 },
  tagline: { color: "#a6a9b1", fontSize: 15.5, lineHeight: 24, marginTop: 20 },
  legend: { flexDirection: "row", gap: 22 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendText: { color: "#8c8f98", fontSize: 13 },
  formPanel: {
    flex: 1,
    backgroundColor: "#f3f0ea",
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },
  formPanelNarrow: { width: "100%", alignItems: "center", marginTop: 48 },
  formInner: { width: "100%", maxWidth: 400 },
  narrowContainer: { flex: 1, backgroundColor: "#f3f0ea" },
  narrowContent: { flexGrow: 1, padding: 24 },
  title: { fontSize: 26, fontWeight: "600", color: "#17191f" },
  subtitle: { marginTop: 8, color: "#6c6f78", fontSize: 14.5 },
  fields: { marginTop: 26, gap: 14 },
  label: { fontSize: 12.5, fontWeight: "600", color: "#4b4e56", marginBottom: 6 },
  input: {
    height: 44,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#d8d3c9",
    borderRadius: 10,
    backgroundColor: "#fff",
    fontSize: 14.5,
    color: "#17191f",
  },
  error: { color: "#c0392b", marginTop: 12, fontSize: 13.5 },
  button: {
    height: 44,
    borderRadius: 10,
    backgroundColor: "#2f53e0",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
  },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 14.5 },
});
