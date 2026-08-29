import { Slot, router, usePathname } from "expo-router";
import { useEffect, useRef, useState, type ComponentType } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import { AccountMenu } from "../../components/AccountMenu";
import {
  EquipmentIcon,
  EquipmentTypeIcon,
  GeneralTaskIcon,
  HomeIcon,
  LocationIcon,
  RequestsIcon,
  UsersIcon,
} from "../../components/icons";
import { BREAKPOINT } from "../../constants";
import { getProfile, signOut } from "../../lib/auth";
import { useTheme } from "../../lib/ThemeContext";
import type { Profile } from "../../types/database";

const ROLE_LABELS: Record<Profile["role"], string> = {
  admin: "Administrador",
  technician: "Técnico",
  user: "Usuario",
};

type NavItem = {
  key: string;
  label: string;
  href: string;
  Icon: ComponentType<{ size?: number; color?: string }>;
};

function BrandDot({ colors }: { colors: [string, string] }) {
  const [from, to] = colors;
  return (
    <Svg width={10} height={10} viewBox="0 0 10 10">
      <Defs>
        <LinearGradient id="brandDotGradient" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={to} />
          <Stop offset="1" stopColor={from} />
        </LinearGradient>
      </Defs>
      <Circle cx={5} cy={5} r={5} fill="url(#brandDotGradient)" />
    </Svg>
  );
}

function initials(name?: string | null) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function AppLayout() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [indicatorHeight, setIndicatorHeight] = useState<number | null>(null);
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const indicatorOffset = useRef(new Animated.Value(0)).current;
  // Real on-screen y/height per nav item key, filled in as each row lays
  // out — driving the indicator off these avoids drift from assuming every
  // row is exactly the same height (bold active text measures differently).
  const navItemLayouts = useRef<Record<string, { y: number; height: number }>>({});

  useEffect(() => {
    getProfile().then((p) => {
      setProfile(p);
      setLoading(false);
    });
  }, []);

  const role = profile?.role;
  const isWide = width >= BREAKPOINT.tablet;

  const equipmentItem: NavItem = {
    key: "equipment",
    label: "Equipos",
    href: "/equipment",
    Icon: EquipmentIcon,
  };

  let navItems: NavItem[] = [];
  if (role === "admin") {
    navItems = [
      { key: "dashboard", label: "Inicio", href: "/dashboard", Icon: HomeIcon },
      { key: "users", label: "Usuarios", href: "/users", Icon: UsersIcon },
      { key: "locations", label: "Ubicaciones", href: "/locations", Icon: LocationIcon },
      equipmentItem,
      {
        key: "equipment-types",
        label: "Tipos de equipo",
        href: "/equipment-types",
        Icon: EquipmentTypeIcon,
      },
      { key: "requests", label: "Solicitudes", href: "/requests", Icon: RequestsIcon },
      { key: "catalogs", label: "Catálogos", href: "/catalogs", Icon: GeneralTaskIcon },
    ];
  } else if (role === "technician") {
    navItems = [
      equipmentItem,
      { key: "queue", label: "Cola de trabajo", href: "/queue", Icon: RequestsIcon },
    ];
  } else if (role === "user") {
    navItems = [
      equipmentItem,
      { key: "requests", label: "Mis solicitudes", href: "/requests", Icon: RequestsIcon },
    ];
  }

  const activeNavIndex = navItems.findIndex(
    (item) => pathname === item.href || pathname.startsWith(item.href + "/"),
  );
  const activeNavKey = navItems[activeNavIndex]?.key;

  function moveIndicatorTo(y: number, height: number, animate: boolean) {
    setIndicatorHeight(height);
    if (animate) {
      Animated.timing(indicatorOffset, {
        toValue: y,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      indicatorOffset.setValue(y);
    }
  }

  function handleNavItemLayout(key: string, y: number, height: number) {
    navItemLayouts.current[key] = { y, height };
    if (key === activeNavKey) moveIndicatorTo(y, height, false);
  }

  useEffect(() => {
    if (!activeNavKey) return;
    const layout = navItemLayouts.current[activeNavKey];
    if (layout) moveIndicatorTo(layout.y, layout.height, true);
  }, [activeNavKey]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator />
      </View>
    );
  }

  function goToSettings() {
    setMenuOpen(false);
    router.push("/settings");
  }

  function handleLogout() {
    setMenuOpen(false);
    signOut();
  }

  function prefetch(href: string) {
    router.prefetch(href as never);
  }

  if (isWide) {
    return (
      <View style={styles.wideContainer}>
        <View
          style={[
            styles.sidebar,
            { backgroundColor: colors.bgSidebar },
            menuOpen && styles.elevated,
          ]}
        >
          <View style={styles.brandRow}>
            <BrandDot colors={colors.heroBlobColors} />
            <Text style={[styles.brandName, { color: colors.textSidebar }]}>Mantia</Text>
          </View>

          <View style={styles.navList}>
            {indicatorHeight != null && activeNavIndex !== -1 && (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.navIndicator,
                  {
                    height: indicatorHeight,
                    backgroundColor: colors.bgCard,
                    transform: [{ translateY: indicatorOffset }],
                  },
                ]}
              />
            )}

            {navItems.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Pressable
                  key={item.key}
                  style={styles.navItem}
                  onLayout={(e) => {
                    const { y, height } = e.nativeEvent.layout;
                    handleNavItemLayout(item.key, y, height);
                  }}
                  onPressIn={() => prefetch(item.href)}
                  onPress={() => router.push(item.href as never)}
                >
                  <item.Icon size={17} color={active ? colors.accent : colors.textNavInactive} />
                  <Text
                    style={[
                      styles.navItemText,
                      { color: colors.textNavInactive },
                      active && [styles.navItemTextActive, { color: colors.text }],
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={[styles.sidebarFooter, { borderTopColor: colors.borderSidebar }]}>
            <View style={{ position: "relative" }}>
              <Pressable style={styles.userRow} onPress={() => setMenuOpen((v) => !v)}>
                <View style={[styles.avatar, { backgroundColor: colors.avatarBg }]}>
                  <Text style={[styles.avatarText, { color: colors.avatarFg }]}>
                    {initials(profile?.name)}
                  </Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.userName, { color: colors.textSidebar }]} numberOfLines={1}>
                    {profile?.name}
                  </Text>
                  <Text style={[styles.userRole, { color: colors.textNavInactive }]}>
                    {role ? ROLE_LABELS[role] : ""}
                  </Text>
                </View>
              </Pressable>
              {menuOpen && (
                <View style={styles.menuAnchorUp}>
                  <AccountMenu onSettings={goToSettings} onLogout={handleLogout} />
                </View>
              )}
            </View>
          </View>
        </View>

        <View style={[styles.content, { backgroundColor: colors.bg }]}>
          <Slot />
        </View>

        {menuOpen && <Pressable style={styles.backdrop} onPress={() => setMenuOpen(false)} />}
      </View>
    );
  }

  return (
    <View style={styles.narrowContainer}>
      <View
        style={[
          styles.narrowTopBar,
          { paddingTop: insets.top + 10, backgroundColor: colors.bgSidebar },
          menuOpen && styles.elevated,
        ]}
      >
        <View style={styles.brandRow}>
          <BrandDot colors={colors.heroBlobColors} />
          <Text style={[styles.brandNameLight, { color: colors.textSidebar }]}>Mantia</Text>
        </View>

        <View style={{ position: "relative" }}>
          <Pressable style={styles.narrowUserRow} onPress={() => setMenuOpen((v) => !v)}>
            <View style={[styles.narrowAvatar, { backgroundColor: colors.avatarBg }]}>
              <Text style={[styles.narrowAvatarText, { color: colors.avatarFg }]}>
                {initials(profile?.name)}
              </Text>
            </View>
            <View style={{ flexShrink: 1, minWidth: 0 }}>
              <Text
                style={[styles.narrowUserName, { color: colors.textSidebar }]}
                numberOfLines={1}
              >
                {profile?.name}
              </Text>
              <Text style={[styles.narrowUserRole, { color: colors.textNavInactive }]}>
                {role ? ROLE_LABELS[role] : ""}
              </Text>
            </View>
          </Pressable>
          {menuOpen && (
            <View style={styles.menuAnchorDown}>
              <AccountMenu onSettings={goToSettings} onLogout={handleLogout} />
            </View>
          )}
        </View>
      </View>

      <View style={[{ flex: 1 }, { backgroundColor: colors.bg }]}>
        <Slot />
      </View>

      {menuOpen && <Pressable style={styles.backdrop} onPress={() => setMenuOpen(false)} />}

      <View
        style={[
          styles.bottomBar,
          {
            paddingBottom: insets.bottom,
            borderTopColor: colors.borderBottom,
            backgroundColor: colors.bgBottomBar,
          },
        ]}
      >
        {navItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Pressable
              key={item.key}
              style={styles.bottomItem}
              onPressIn={() => prefetch(item.href)}
              onPress={() => router.push(item.href as never)}
            >
              <item.Icon size={19} color={active ? colors.accent : colors.textMuted} />
              <Text
                style={[
                  styles.bottomItemText,
                  { color: colors.textMuted },
                  active && { color: colors.accent, fontWeight: "600" },
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  wideContainer: { flex: 1, flexDirection: "row", minHeight: 0 },
  sidebar: { width: 250, padding: 16, paddingTop: 20 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 8 },
  brandName: { fontWeight: "600", fontSize: 17 },
  navList: { gap: 3, paddingTop: 16, position: "relative" },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 9,
  },
  navIndicator: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    borderRadius: 9,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  navItemText: { fontSize: 14, fontWeight: "500" },
  navItemTextActive: { fontWeight: "700" },
  sidebarFooter: { marginTop: "auto", paddingTop: 16, borderTopWidth: 1 },
  userRow: { flexDirection: "row", alignItems: "center", gap: 11, padding: 8 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontWeight: "600", fontSize: 14 },
  userName: { fontSize: 13.5, fontWeight: "600" },
  userRole: { fontSize: 11.5 },
  content: { flex: 1, minHeight: 0 },
  narrowContainer: { flex: 1, minHeight: 0 },
  narrowTopBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  brandNameLight: { fontWeight: "600", fontSize: 15 },
  narrowUserRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    flexShrink: 1,
    minWidth: 0,
  },
  narrowAvatar: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  narrowAvatarText: { fontWeight: "700", fontSize: 11 },
  narrowUserName: { fontSize: 12.5, fontWeight: "600" },
  narrowUserRole: { fontSize: 10.5, marginTop: 1 },
  bottomBar: { flexDirection: "row", borderTopWidth: 1 },
  bottomItem: { flex: 1, alignItems: "center", gap: 3, paddingVertical: 12 },
  bottomItemText: { fontSize: 11.5, fontWeight: "500" },
  elevated: { zIndex: 50 },
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 40 },
  menuAnchorUp: { position: "absolute", bottom: "100%", left: 0, right: 0, marginBottom: 8 },
  menuAnchorDown: { position: "absolute", top: "100%", right: 0, marginTop: 8 },
});
