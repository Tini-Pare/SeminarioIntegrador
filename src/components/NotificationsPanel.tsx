import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CheckIcon, RefreshCwIcon, SparePartIcon } from "./icons";
import { Tooltip } from "./Tooltip";
import type { AppNotification } from "../lib/queries/notifications";
import type { ThemeColors } from "../lib/theme";
import { useTheme } from "../lib/ThemeContext";

type NotificationsPanelProps = {
  notifications: AppNotification[];
  unreadCount: number;
  onMarkAllAsRead: () => void;
  // Just marks it read, without leaving the panel.
  onMarkAsRead: (item: AppNotification) => void;
  // Marks it read and goes to the screen it's about.
  onSelectNotification: (item: AppNotification) => void;
};

export function NotificationsPanel({
  notifications,
  unreadCount,
  onMarkAllAsRead,
  onMarkAsRead,
  onSelectNotification,
}: NotificationsPanelProps) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>Notificaciones</Text>

          {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>
                {unreadCount} {unreadCount === 1 ? "nueva" : "nuevas"}
              </Text>
            </View>
          )}
        </View>

        {unreadCount > 0 && (
          <Pressable
            onPress={onMarkAllAsRead}
            accessibilityRole="button"
            style={styles.markAllButton}
          >
            <Text style={styles.markAllText}>Marcar todas como leídas</Text>
          </Pressable>
        )}
      </View>

      {/* Notifications list */}
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {notifications.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No hay notificaciones.</Text>
          </View>
        ) : (
          notifications.map((item) => {
            const isUnread = !item.isRead;
            const isStock = item.kind === "stock_minimo";

            return (
              <Pressable
                key={item.id}
                style={[styles.itemRow, isUnread ? styles.itemUnread : styles.itemRead]}
                onPress={() => onSelectNotification(item)}
              >
                <View style={[styles.iconCircle, isStock && styles.iconCircleStock]}>
                  {isStock ? (
                    <SparePartIcon size={15} color="#9a4a0f" />
                  ) : (
                    <RefreshCwIcon size={14} color="#2d4a7a" />
                  )}
                </View>

                <View style={styles.contentWrap}>
                  <View style={styles.itemTitleRow}>
                    <Text style={styles.itemTitle}>{item.title}</Text>

                    {isUnread && <View style={styles.redDot} />}
                  </View>

                  <NotificationBody item={item} styles={styles} />

                  <Text style={styles.itemSubtitle}>{item.subtitle}</Text>
                </View>

                {isUnread && (
                  <Tooltip text="Marcar como leída">
                    <Pressable
                      style={styles.markOneButton}
                      onPress={() => onMarkAsRead(item)}
                      accessibilityRole="button"
                      accessibilityLabel="Marcar como leída"
                    >
                      <CheckIcon size={15} color={colors.accent} />
                    </Pressable>
                  </Tooltip>
                )}
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

function NotificationBody({
  item,
  styles,
}: {
  item: AppNotification;
  styles: ReturnType<typeof makeStyles>;
}) {
  if (item.kind === "stock_minimo") {
    const units = `${item.quantity} ${item.quantity === 1 ? "unidad" : "unidades"}`;
    return item.eventType === "sin_stock" ? (
      <Text style={styles.itemBody}>
        <Text style={styles.boldText}>«{item.partName}»</Text> se quedó sin stock (mínimo{" "}
        {item.minimum}).
      </Text>
    ) : (
      <Text style={styles.itemBody}>
        <Text style={styles.boldText}>«{item.partName}»</Text> quedó en{" "}
        <Text style={styles.boldText}>{units}</Text> (mínimo {item.minimum}).
      </Text>
    );
  }

  return item.isGrouped ? (
    <Text style={styles.itemBody}>
      Se generaron <Text style={styles.boldText}>{item.count} OT preventivas</Text> del plan{" "}
      <Text style={styles.boldText}>«{item.planName}»</Text>.
    </Text>
  ) : (
    <Text style={styles.itemBody}>
      Se generó la <Text style={styles.boldText}>{item.orderNumber}</Text> del plan{" "}
      <Text style={styles.boldText}>{item.planName}</Text> para {item.equipmentName} (
      {item.equipmentCode}).
    </Text>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    card: {
      width: 380,
      maxWidth: "100%",
      backgroundColor: "#ffffff",
      borderRadius: 16,
      borderWidth: 1,
      borderColor: "rgba(0, 0, 0, 0.08)",
      overflow: "hidden",
      ...Platform.select({
        web: {
          boxShadow: "0 14px 38px -6px rgba(0, 0, 0, 0.16), 0 8px 16px -4px rgba(0, 0, 0, 0.08)",
        },
        default: {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.14,
          shadowRadius: 16,
          elevation: 10,
        },
      }),
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: "rgba(0, 0, 0, 0.06)",
      backgroundColor: "#ffffff",
    },
    headerLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    title: {
      fontSize: 15,
      fontWeight: "700",
      color: c.text,
    },
    unreadBadge: {
      backgroundColor: "#fee2e2",
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 12,
    },
    unreadBadgeText: {
      color: "#dc2626",
      fontSize: 11.5,
      fontWeight: "600",
    },
    markAllButton: {
      ...Platform.select({
        web: { cursor: "pointer" },
      }),
    },
    markAllText: {
      fontSize: 12.5,
      fontWeight: "600",
      color: c.accent,
    },
    scroll: {
      maxHeight: 380,
    },
    emptyContainer: {
      padding: 28,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyText: {
      fontSize: 13,
      color: c.textMuted,
      textAlign: "center",
    },
    itemRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      paddingHorizontal: 16,
      paddingVertical: 13,
      gap: 12,
      borderBottomWidth: 1,
      borderBottomColor: "rgba(0, 0, 0, 0.05)",
      ...Platform.select({
        web: { cursor: "pointer" },
      }),
    },
    itemUnread: {
      backgroundColor: "#edf5ea",
    },
    itemRead: {
      backgroundColor: "#ffffff",
    },
    iconCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: "#dbeafe",
      alignItems: "center",
      justifyContent: "center",
      marginTop: 2,
      flexShrink: 0,
    },
    iconCircleStock: {
      backgroundColor: "#fbe3cc",
    },
    contentWrap: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    itemTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    itemTitle: {
      fontSize: 13.5,
      fontWeight: "700",
      color: c.text,
    },
    redDot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
      backgroundColor: "#ef4444",
    },
    itemBody: {
      fontSize: 13,
      color: c.text,
      lineHeight: 18,
    },
    boldText: {
      fontWeight: "700",
    },
    itemSubtitle: {
      fontSize: 12,
      color: c.textMuted,
      marginTop: 2,
    },
    markOneButton: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: "rgba(0, 0, 0, 0.1)",
      backgroundColor: "#ffffff",
      flexShrink: 0,
      ...Platform.select({
        web: { cursor: "pointer" },
      }),
    },
  });
}
