import { Slot, router, usePathname } from "expo-router";
import { useEffect, useState, type ComponentType } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AccountMenu } from "../../components/AccountMenu";
import { EquipmentIcon, LocationIcon, RequestsIcon, UsersIcon } from "../../components/icons";
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
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  useEffect(() => {
    getProfile().then((p) => {
      setProfile(p);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator />
      </View>
    );
  }

  const role = profile?.role;
  const isWide = width >= BREAKPOINT.tablet;

  const navItems: NavItem[] = [
    ...(role === "admin"
      ? [
          { key: "users", label: "Usuarios", href: "/users", Icon: UsersIcon },
          { key: "locations", label: "Ubicaciones", href: "/locations", Icon: LocationIcon },
        ]
      : []),
    { key: "equipment", label: "Equipos", href: "/equipment", Icon: EquipmentIcon },
    ...(role === "admin" || role === "user"
      ? [
          {
            key: "requests",
            label: role === "admin" ? "Solicitudes" : "Mis solicitudes",
            href: "/requests",
            Icon: RequestsIcon,
          },
        ]
      : []),
    ...(role === "technician"
      ? [{ key: "queue", label: "Cola de trabajo", href: "/queue", Icon: RequestsIcon }]
      : []),
  ];

  function goToSettings() {
    setMenuOpen(false);
    router.push("/settings");
  }

  function handleLogout() {
    setMenuOpen(false);
    signOut();
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
            <View style={[styles.logo, { backgroundColor: colors.accent }]}>
              <Text style={styles.logoText}>M</Text>
            </View>
            <Text style={[styles.brandName, { color: colors.textSidebar }]}>Mantia</Text>
          </View>

          <View style={styles.navList}>
            {navItems.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Pressable
                  key={item.key}
                  style={[
                    styles.navItem,
                    active && { backgroundColor: colors.bgNavActive },
                  ]}
                  onPress={() => router.push(item.href as never)}
                >
                  <item.Icon size={17} color={active ? "#fff" : colors.textNavInactive} />
                  <Text
                    style={[
                      styles.navItemText,
                      { color: colors.textNavInactive },
                      active && styles.navItemTextActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View
            style={[
              styles.sidebarFooter,
              { borderTopColor: colors.borderSidebar },
            ]}
          >
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
                  <Text style={styles.userRole}>{role ? ROLE_LABELS[role] : ""}</Text>
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
          <View style={[styles.logo, { backgroundColor: colors.accent }]}>
            <Text style={styles.logoText}>M</Text>
          </View>
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
              <Text style={[styles.narrowUserName, { color: colors.textSidebar }]} numberOfLines={1}>
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
          { paddingBottom: insets.bottom, borderTopColor: colors.borderBottom, backgroundColor: colors.bgBottomBar },
        ]}
      >
        {navItems.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Pressable
              key={item.key}
              style={styles.bottomItem}
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
  wideContainer: { flex: 1, flexDirection: "row" },
  sidebar: { width: 250, padding: 16, paddingTop: 20 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 8 },
  logo: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  logoText: { color: "#fff", fontWeight: "700", fontSize: 17 },
  brandName: { fontWeight: "600", fontSize: 17 },
  navList: { gap: 3, paddingTop: 16 },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 9,
  },
  navItemText: { fontSize: 14, fontWeight: "500" },
  navItemTextActive: { color: "#fff" },
  sidebarFooter: { marginTop: "auto", paddingTop: 16, borderTopWidth: 1 },
  userRow: { flexDirection: "row", alignItems: "center", gap: 11, padding: 8 },
  avatar: { width: 36, height: 36, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  avatarText: { fontWeight: "600", fontSize: 14 },
  userName: { fontSize: 13.5, fontWeight: "600" },
  userRole: { color: "#7c808b", fontSize: 11.5 },
  content: { flex: 1 },
  narrowContainer: { flex: 1 },
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
  narrowAvatar: { width: 26, height: 26, borderRadius: 7, alignItems: "center", justifyContent: "center" },
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
