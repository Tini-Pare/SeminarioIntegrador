import { Slot, router, usePathname } from "expo-router";
import { useEffect, useRef, useState, type ComponentType } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import { AccountMenu } from "../../components/AccountMenu";
import {
  ChevronDownIcon,
  EquipmentIcon,
  EquipmentTypeIcon,
  GeneralTaskIcon,
  HomeIcon,
  LocationIcon,
  PurchaseIcon,
  PurchaseOrderIcon,
  RequestsIcon,
  SparePartIcon,
  SupplierIcon,
  UsersIcon,
  WarningIcon,
  WorkOrderIcon,
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

// A collapsible sidebar section (admin only — their flat list had 13
// items). On narrow screens it's one bottom-bar tab instead, and its items
// show as a chip row under the top bar.
type NavGroup = {
  key: string;
  label: string;
  // Bottom bar only, where 5 tabs share a phone's width.
  shortLabel?: string;
  Icon: ComponentType<{ size?: number; color?: string }>;
  items: NavItem[];
};

type NavEntry = NavItem | NavGroup;

function isGroup(entry: NavEntry): entry is NavGroup {
  return "items" in entry;
}

function isActiveHref(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

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
  // Real on-screen y/height per nav row key, filled in as each row lays
  // out — driving the indicator off these avoids drift from assuming every
  // row is exactly the same height (bold active text measures differently).
  // A row inside a group measures relative to its group's container, so it
  // names that container as `parent` and absoluteY() adds the offsets up.
  const navLayouts = useRef<Record<string, { y: number; height: number; parent?: string }>>({});
  // Only one sidebar group open at a time, so the list stays short.
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  useEffect(() => {
    getProfile().then((p) => {
      if (p && !p.active) {
        signOut().then(() => router.replace("/login"));
        return;
      }
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

  let navEntries: NavEntry[] = [];
  if (role === "admin") {
    navEntries = [
      { key: "dashboard", label: "Inicio", href: "/dashboard", Icon: HomeIcon },
      { key: "users", label: "Usuarios", href: "/users", Icon: UsersIcon },
      {
        key: "equipment-group",
        // Not plain "Equipos": that's already the name of its first item.
        label: "Gestión de equipos",
        shortLabel: "Equipos",
        Icon: EquipmentIcon,
        items: [
          equipmentItem,
          {
            key: "equipment-types",
            label: "Tipos de equipo",
            href: "/equipment-types",
            Icon: EquipmentTypeIcon,
          },
          { key: "locations", label: "Ubicaciones", href: "/locations", Icon: LocationIcon },
        ],
      },
      {
        key: "maintenance-group",
        label: "Mantenimiento",
        shortLabel: "Trabajo",
        Icon: WorkOrderIcon,
        items: [
          { key: "requests", label: "Solicitudes", href: "/requests", Icon: RequestsIcon },
          {
            key: "work-orders",
            label: "Órdenes de trabajo",
            href: "/work-orders",
            Icon: WorkOrderIcon,
          },
          { key: "faults", label: "Fallas", href: "/faults", Icon: WarningIcon },
          { key: "tasks", label: "Tareas", href: "/tasks", Icon: GeneralTaskIcon },
        ],
      },
      {
        key: "inventory-group",
        label: "Inventario",
        Icon: SparePartIcon,
        items: [
          { key: "spare-parts", label: "Repuestos", href: "/spare-parts", Icon: SparePartIcon },
          { key: "suppliers", label: "Proveedores", href: "/suppliers", Icon: SupplierIcon },
          { key: "purchases", label: "Compras", href: "/purchases", Icon: PurchaseIcon },
          {
            key: "purchase-orders",
            label: "Pedidos de compra",
            href: "/purchase-orders",
            Icon: PurchaseOrderIcon,
          },
        ],
      },
    ];
  } else if (role === "technician") {
    navEntries = [
      equipmentItem,
      { key: "queue", label: "Cola de trabajo", href: "/queue", Icon: RequestsIcon },
      { key: "spare-parts", label: "Repuestos", href: "/spare-parts", Icon: SparePartIcon },
      {
        key: "purchase-orders",
        label: "Pedidos de compra",
        href: "/purchase-orders",
        Icon: PurchaseOrderIcon,
      },
    ];
  } else if (role === "user") {
    navEntries = [
      equipmentItem,
      { key: "requests", label: "Mis solicitudes", href: "/requests", Icon: RequestsIcon },
    ];
  }

  const activeItem = navEntries
    .flatMap((e) => (isGroup(e) ? e.items : [e]))
    .find((item) => isActiveHref(pathname, item.href));
  const activeGroup = navEntries.find(
    (e): e is NavGroup => isGroup(e) && !!activeItem && e.items.includes(activeItem),
  );
  // The indicator sits on the active screen's row, or on its group's header
  // while that group is collapsed.
  const indicatorKey = activeItem
    ? activeGroup && openGroup !== activeGroup.key
      ? activeGroup.key
      : activeItem.key
    : undefined;

  // Navigating into a group (from a link, the dashboard, a back) opens it.
  const activeGroupKey = activeGroup?.key;
  useEffect(() => {
    if (activeGroupKey) setOpenGroup(activeGroupKey);
  }, [activeGroupKey]);

  function absoluteY(key: string): number | null {
    const layout = navLayouts.current[key];
    if (!layout) return null;
    if (!layout.parent) return layout.y;
    const parentY = absoluteY(layout.parent);
    return parentY == null ? null : parentY + layout.y;
  }

  function syncIndicator(animate: boolean) {
    if (!indicatorKey) return;
    const layout = navLayouts.current[indicatorKey];
    const y = absoluteY(indicatorKey);
    if (layout && y != null) moveIndicatorTo(y, layout.height, animate);
  }

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

  // Opening/closing a group shifts every row below it, so any row's layout
  // change re-places the indicator (without animating, it's a reflow).
  function handleNavLayout(key: string, e: LayoutChangeEvent, parent?: string) {
    const { y, height } = e.nativeEvent.layout;
    navLayouts.current[key] = { y, height, parent };
    syncIndicator(false);
  }

  useEffect(() => {
    syncIndicator(true);
  }, [indicatorKey]);

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

  // One sidebar link; `parent` is the group container it sits in, if any.
  function renderNavRow(item: NavItem, parent?: string) {
    const active = item === activeItem;
    return (
      <Pressable
        key={item.key}
        style={[styles.navItem, !!parent && styles.navSubItem]}
        onLayout={(e) => handleNavLayout(item.key, e, parent)}
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

          <ScrollView
            style={styles.navScroll}
            contentContainerStyle={styles.navList}
            showsVerticalScrollIndicator={false}
          >
            {indicatorHeight != null && indicatorKey && (
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

            {navEntries.map((entry) => {
              if (!isGroup(entry)) return renderNavRow(entry);

              const open = openGroup === entry.key;
              const holdsActive = activeGroup?.key === entry.key;
              // Collapsed with the current screen inside: the header stands
              // in for it, so it gets the active look.
              const headerActive = holdsActive && !open;
              const wrapKey = `${entry.key}:wrap`;
              const itemsKey = `${entry.key}:items`;
              return (
                <View key={entry.key} onLayout={(e) => handleNavLayout(wrapKey, e)}>
                  <Pressable
                    style={styles.navItem}
                    onLayout={(e) => handleNavLayout(entry.key, e, wrapKey)}
                    onPress={() => setOpenGroup(open ? null : entry.key)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: open }}
                  >
                    <entry.Icon
                      size={17}
                      color={holdsActive ? colors.accent : colors.textNavInactive}
                    />

                    <Text
                      style={[
                        styles.navItemText,
                        styles.navGroupText,
                        { color: holdsActive ? colors.text : colors.textNavInactive },
                        headerActive && styles.navItemTextActive,
                      ]}
                    >
                      {entry.label}
                    </Text>

                    <View style={!open && styles.chevronCollapsed}>
                      <ChevronDownIcon size={14} color={colors.textNavInactive} />
                    </View>
                  </Pressable>

                  {open && (
                    <View
                      style={styles.navGroupItems}
                      onLayout={(e) => handleNavLayout(itemsKey, e, wrapKey)}
                    >
                      {entry.items.map((item) => renderNavRow(item, itemsKey))}
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>

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

      {/* The bottom bar only has room for the groups themselves; the
          screens inside the current one are picked here. */}
      {activeGroup && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[
            styles.subNav,
            { backgroundColor: colors.bgSidebar, borderBottomColor: colors.borderSidebar },
          ]}
          contentContainerStyle={styles.subNavList}
        >
          {activeGroup.items.map((item) => {
            const active = item === activeItem;
            return (
              <Pressable
                key={item.key}
                style={[
                  styles.subNavChip,
                  { borderColor: colors.border, backgroundColor: colors.bgCard },
                  active && { backgroundColor: colors.accent, borderColor: colors.accent },
                ]}
                onPressIn={() => prefetch(item.href)}
                onPress={() => router.push(item.href as never)}
              >
                <Text
                  style={[
                    styles.subNavText,
                    { color: colors.textLabel },
                    active && styles.subNavTextActive,
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

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
        {navEntries.map((entry) => {
          const group = isGroup(entry) ? entry : null;
          const active = group ? activeGroup?.key === entry.key : entry === activeItem;
          // A group's tab lands on its first screen; the rest are one tap
          // away in the chip row above the content.
          const href = group ? group.items[0].href : (entry as NavItem).href;
          return (
            <Pressable
              key={entry.key}
              style={styles.bottomItem}
              onPressIn={() => prefetch(href)}
              onPress={() => {
                if (!(group && active)) router.push(href as never);
              }}
            >
              <entry.Icon size={19} color={active ? colors.accent : colors.textMuted} />
              <Text
                style={[
                  styles.bottomItemText,
                  { color: colors.textMuted },
                  active && { color: colors.accent, fontWeight: "600" },
                ]}
                numberOfLines={1}
              >
                {group?.shortLabel ?? entry.label}
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
  navScroll: { flex: 1 },
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
  navGroupText: { flex: 1 },
  chevronCollapsed: { transform: [{ rotate: "-90deg" }] },
  navGroupItems: { gap: 3, marginTop: 3 },
  // Indented under the group header so it reads as part of it.
  navSubItem: { paddingLeft: 26 },
  subNav: { flexGrow: 0, borderBottomWidth: 1 },
  subNavList: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  subNavChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  subNavText: { fontSize: 12.5, fontWeight: "600" },
  subNavTextActive: { color: "#fff" },
  sidebarFooter: { paddingTop: 16, borderTopWidth: 1 },
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
