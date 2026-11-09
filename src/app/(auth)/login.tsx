import { router } from "expo-router";
import { useRef, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, G, Mask, Path, Pattern, RadialGradient, Rect, Stop } from "react-native-svg";
import { BrandMark } from "../../components/BrandMark";
import { BREAKPOINT } from "../../constants";
import { getProfile, signIn } from "../../lib/auth";
import type { ThemeColors } from "../../lib/theme";
import { useTheme } from "../../lib/ThemeContext";

const HEX_LIGHT_PATH = "M31.18 0L62.35 18V54L31.18 72 0 54V18Z";
const HEX_DARK_PATH = "M0 54L31.18 72V108L0 126-31.18 108V72Z";
const HEX_STROKE_PATH =
  "M0 18L31.18 0 62.35 18M0 18V54M62.35 18V54M0 54L31.18 72 62.35 54M31.18 72V108";

function ShellPatternBackground() {
  return (
    <View
      style={stylesStatic.patternLayer}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      {...(Platform.OS === "web" ? ({ "aria-hidden": true } as object) : {})}
    >
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <Pattern id="shell-pattern" width={62.35} height={108} patternUnits="userSpaceOnUse">
            <Path d={HEX_LIGHT_PATH} fill="#e6ebd8" fillOpacity={0.7} />

            {/* Dark hex opacity kept at 0.30 so paragraph text maintains >= 4.5:1 contrast. */}
            <G fill="#c4cdac" fillOpacity={0.3}>
              <Path d={HEX_DARK_PATH} />

              <Path d={HEX_DARK_PATH} transform="translate(62.35, 0)" />

              <Path d={HEX_DARK_PATH} transform="translate(0, -108)" />

              <Path d={HEX_DARK_PATH} transform="translate(62.35, -108)" />
            </G>

            <Path
              d={HEX_STROKE_PATH}
              transform="translate(1.3, 1.3)"
              fill="none"
              stroke="#f1f4e6"
              strokeWidth={1.4}
              strokeLinejoin="round"
            />

            <Path
              d={HEX_STROKE_PATH}
              fill="none"
              stroke="#a9b58d"
              strokeWidth={1.5}
              strokeLinejoin="round"
            />
          </Pattern>

          <RadialGradient id="shell-fade" cx="85%" cy="85%" r="105%">
            <Stop offset="0" stopColor="#ffffff" stopOpacity={1} />

            <Stop offset="0.5" stopColor="#ffffff" stopOpacity={0.8} />

            <Stop offset="1" stopColor="#ffffff" stopOpacity={0.3} />
          </RadialGradient>

          <Mask id="shell-mask">
            <Rect width="100%" height="100%" fill="url(#shell-fade)" />
          </Mask>
        </Defs>

        <Rect width="100%" height="100%" fill="url(#shell-pattern)" mask="url(#shell-mask)" />
      </Svg>
    </View>
  );
}

const stylesStatic = StyleSheet.create({
  patternLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
});

export default function Login() {
  const [legajo, setLegajo] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { width, height } = useWindowDimensions();
  const isTablet = width >= BREAKPOINT.tablet;
  const insets = useSafeAreaInsets();
  const passwordRef = useRef<TextInput>(null);
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  // Responsive dimensions anchored to the 1280x720 reference viewport:
  // 150px logo (max 220px), 92px wordmark (max 130px), 44px horizontal and 40px vertical padding.
  const markSize = Math.min(220, Math.max(110, Math.round((width / 1280) * 150)));
  const brandFontSize = Math.min(130, Math.max(68, Math.round((width / 1280) * 92)));
  const panelPadX = Math.min(64, Math.max(36, Math.round((width / 1280) * 44)));
  const panelPadY = Math.min(56, Math.max(32, Math.round((height / 720) * 40)));

  async function handleSubmit() {
    setError(null);

    // Required-field guard: don't hit the auth endpoint with a blank legajo or
    // password — treat it as a validation error, not a failed login attempt.
    if (!legajo.trim() || !password) {
      setError("Completá el legajo y la contraseña para ingresar.");
      return;
    }

    setLoading(true);
    const { error } = await signIn(legajo.trim(), password);
    setLoading(false);
    if (error) {
      setError(error);
      return;
    }
    const profile = await getProfile();
    router.replace((profile?.role === "admin" ? "/dashboard" : "/equipment") as never);
  }

  const form = (
    <View style={isTablet ? styles.formPanel : styles.formPanelNarrow}>
      <View style={styles.formInner}>
        <Text style={styles.title}>Ingresar</Text>
        <Text style={styles.subtitle}>Iniciá sesión para ver el estado de tus equipos.</Text>

        <View style={styles.fields}>
          <View>
            <Text style={styles.label}>Legajo</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej: 1234"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              returnKeyType="next"
              value={legajo}
              onChangeText={setLegajo}
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
              placeholderTextColor={colors.textMuted}
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
          <BrandMark size={44} />
          <Text style={styles.brandNameDark}>Mantia</Text>
        </View>

        {form}
      </ScrollView>
    );
  }

  return (
    <View style={styles.wideContainer}>
      <View
        style={[
          styles.brandPanel,
          { paddingHorizontal: panelPadX, paddingVertical: panelPadY },
        ]}
      >
        <ShellPatternBackground />

        <View style={styles.brandRow}>
          <BrandMark size={markSize} />

          <Text
            style={[
              styles.brandName,
              { fontSize: brandFontSize, lineHeight: brandFontSize },
            ]}
          >
            Mantia
          </Text>
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
            <View style={[styles.legendDot, { backgroundColor: colors.eqOperational.dot }]} />

            <Text style={styles.legendText}>Funcionando</Text>
          </View>

          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.eqWaiting.dot }]} />

            <Text style={styles.legendText}>En espera</Text>
          </View>

          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.eqRepair.dot }]} />

            <Text style={styles.legendText}>En reparación</Text>
          </View>
        </View>
      </View>

      {form}
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    wideContainer: { flex: 1, flexDirection: "row" },
    brandPanel: {
      flex: 1.05,
      position: "relative",
      overflow: "hidden",
      backgroundColor: "#d6dcc4",
      justifyContent: "space-between",
      gap: 24,
    },
    brandRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 22,
      zIndex: 1,
    },
    brandRowNarrow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 32 },
    brandName: {
      color: "#222a22",
      fontWeight: "600",
      letterSpacing: -2,
    },
    brandNameDark: { color: c.text, fontWeight: "600", fontSize: 20 },
    brandCopy: {
      maxWidth: 440,
      zIndex: 1,
    },
    eyebrow: {
      color: c.accent,
      fontSize: 12,
      letterSpacing: 2,
      marginBottom: 18,
      fontWeight: "600",
    },
    headline: { color: c.textSidebar, fontWeight: "600", fontSize: 40, lineHeight: 44 },
    tagline: { color: c.textNavInactive, fontSize: 15.5, lineHeight: 24, marginTop: 20 },
    legend: { flexDirection: "row", gap: 22, zIndex: 1 },
    legendItem: { flexDirection: "row", alignItems: "center", gap: 8 },
    legendDot: { width: 9, height: 9, borderRadius: 5 },
    legendText: { color: c.textNavInactive, fontSize: 13 },
    formPanel: {
      flex: 1,
      backgroundColor: c.bgLoginPanel,
      alignItems: "center",
      justifyContent: "center",
      padding: 40,
    },
    formPanelNarrow: { width: "100%", alignItems: "center", marginTop: 48 },
    formInner: { width: "100%", maxWidth: 400 },
    narrowContainer: { flex: 1, backgroundColor: c.bgLoginPanel },
    narrowContent: { flexGrow: 1, padding: 24 },
    title: { fontSize: 26, fontWeight: "600", color: c.text },
    subtitle: { marginTop: 8, color: c.textSecondary, fontSize: 14.5 },
    fields: { marginTop: 26, gap: 14 },
    label: { fontSize: 12.5, fontWeight: "600", color: c.textLabel, marginBottom: 6 },
    input: {
      height: 44,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: c.borderInput,
      borderRadius: 10,
      backgroundColor: c.bgInput,
      fontSize: 14.5,
      color: c.text,
    },
    error: { color: c.destructive, marginTop: 12, fontSize: 13.5 },
    button: {
      height: 44,
      borderRadius: 10,
      backgroundColor: c.accent,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 24,
    },
    buttonText: { color: "#fff", fontWeight: "600", fontSize: 14.5 },
  });
}
