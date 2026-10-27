import { formatOrderNumber } from "../orderNumber";
import { supabase } from "../supabase";

// Every notification is a row of notificacion (0040), written by triggers
// one per admin; read state is the row's own no_leida.

// An ot_preventiva row joined with its OT.
export type RawPreventiveOrder = {
  notificationId: number;
  isRead: boolean;
  id: number;
  equipmentId: number;
  equipmentCode: string;
  equipmentName: string;
  planId: number | null;
  planName: string;
  createdAt: string;
  technicians: string[];
};

export type PreventiveNotification = {
  kind: "ot_preventiva";
  id: string;
  // The notificacion rows it stands for (a group has several).
  notificationIds: number[];
  orderIds: number[];
  isGrouped: boolean;
  count: number;
  planId: number | null;
  planName: string;
  orderId?: number;
  orderNumber?: string;
  equipmentName?: string;
  equipmentCode?: string;
  technicianLabel?: string;
  createdAt: string;
  isRead: boolean;
  title: string;
  subtitle: string;
};

// A stock_bajo / sin_stock row joined with its repuesto.
export type RawStockNotification = {
  notificationId: number;
  isRead: boolean;
  partId: number;
  partName: string;
  type: "stock_bajo" | "sin_stock";
  // Stock and mínimo when it happened, not now.
  quantity: number;
  minimum: number;
  createdAt: string;
};

export type StockNotification = {
  kind: "stock_minimo";
  id: string;
  notificationIds: number[];
  partId: number;
  partName: string;
  eventType: "stock_bajo" | "sin_stock";
  quantity: number;
  minimum: number;
  createdAt: string;
  isRead: boolean;
  title: string;
  subtitle: string;
};

// Everything the admin's bell shows.
export type AppNotification = PreventiveNotification | StockNotification;

export function formatNotificationTime(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));

  if (diffMins < 1) return "Hace un momento";
  if (diffMins < 60) return `Hace ${diffMins} min`;

  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}`;

  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();

  if (isToday) {
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 6) return `Hace ${diffHours} h`;
    return `Hoy, ${timeStr}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear();

  if (isYesterday) {
    return `Ayer, ${timeStr}`;
  }

  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}, ${timeStr}`;
}

// YYYY-MM-DD of the viewer's own day, not UTC's: an OT created at 22:00 in
// Argentina is already the next day in UTC.
function localDayKey(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "unknown";
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function groupPreventiveOrders(
  orders: RawPreventiveOrder[],
  profileNamesById: Map<string, string>,
): PreventiveNotification[] {
  // Group by (planId, YYYY-MM-DD)
  const groups = new Map<string, RawPreventiveOrder[]>();

  for (const o of orders) {
    const day = localDayKey(o.createdAt);
    const key = `${o.planId ?? 0}_${day}`;
    const list = groups.get(key) ?? [];
    list.push(o);
    groups.set(key, list);
  }

  const notifications: PreventiveNotification[] = [];

  for (const [key, group] of groups.entries()) {
    // Sort most recent first
    group.sort((a, b) => b.id - a.id);
    const mostRecent = group[0];
    const orderIds = group.map((g) => g.id);
    const notificationIds = group.map((g) => g.notificationId);
    const allRead = group.every((g) => g.isRead);

    if (group.length === 1) {
      const o = mostRecent;
      const techNames = o.technicians
        .map((id) => profileNamesById.get(id))
        .filter(Boolean) as string[];
      const uniqueTechs = [...new Set(techNames)];

      let technicianLabel = "Sin técnico asignado";
      if (uniqueTechs.length === 1) {
        technicianLabel = uniqueTechs[0];
      } else if (uniqueTechs.length > 1) {
        technicianLabel = `${uniqueTechs.length} técnicos`;
      }

      notifications.push({
        kind: "ot_preventiva",
        id: `ot-${o.id}`,
        notificationIds,
        orderIds: [o.id],
        isGrouped: false,
        count: 1,
        planId: o.planId,
        planName: o.planName,
        orderId: o.id,
        orderNumber: formatOrderNumber(o.id),
        equipmentName: o.equipmentName,
        equipmentCode: o.equipmentCode,
        technicianLabel,
        createdAt: o.createdAt,
        isRead: allRead,
        title: "Nueva OT preventiva",
        subtitle: `${formatNotificationTime(o.createdAt)} · ${technicianLabel}`,
      });
    } else {
      notifications.push({
        kind: "ot_preventiva",
        id: `group-${key}`,
        notificationIds,
        orderIds,
        isGrouped: true,
        count: group.length,
        planId: mostRecent.planId,
        planName: mostRecent.planName,
        createdAt: mostRecent.createdAt,
        isRead: allRead,
        title: "Nuevas OT preventivas",
        subtitle: formatNotificationTime(mostRecent.createdAt),
      });
    }
  }

  // Sort by most recent createdAt descending
  notifications.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return notifications;
}

// Never grouped: each row is a separate crossing of the mínimo.
export function buildStockNotifications(rows: RawStockNotification[]): StockNotification[] {
  return rows.map((e) => ({
    kind: "stock_minimo",
    id: `stock-${e.notificationId}`,
    notificationIds: [e.notificationId],
    partId: e.partId,
    partName: e.partName,
    eventType: e.type,
    quantity: e.quantity,
    minimum: e.minimum,
    createdAt: e.createdAt,
    isRead: e.isRead,
    title: e.type === "sin_stock" ? "Repuesto sin stock" : "Stock mínimo alcanzado",
    subtitle: formatNotificationTime(e.createdAt),
  }));
}

// Every kind in one list, newest first.
export function mergeNotifications(...lists: AppNotification[][]): AppNotification[] {
  return lists
    .flat()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function listNotifications(): Promise<{
  notifications: AppNotification[];
  unreadCount: number;
}> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return { notifications: [], unreadCount: 0 };
  }

  const { data, error } = await supabase
    .from("notificacion")
    .select(
      `
      no_id,
      no_tipo,
      no_cantidad,
      no_minimo,
      no_leida,
      no_creada_en,
      rep_id,
      repuestos(rep_nombre),
      orden_de_trabajo(
        ot_id_orden,
        eq_id_equipo,
        plan_id_manequipo,
        plan_mantenimiento(pm_nombre_plan),
        equipo(eq_codigo, eq_nombre),
        tareas_realizadas_orden(p_id_tecnico)
      )
    `,
    )
    .eq("user_id", session.user.id)
    .order("no_creada_en", { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(error.message);
  }

  const rawOrders: RawPreventiveOrder[] = [];
  const rawStock: RawStockNotification[] = [];

  for (const row of (data ?? []) as any[]) {
    if (row.no_tipo === "ot_preventiva") {
      const ot = row.orden_de_trabajo;
      if (!ot) continue;
      const technicians: string[] = (ot.tareas_realizadas_orden ?? [])
        .map((t: { p_id_tecnico: string | null }) => t.p_id_tecnico)
        .filter(Boolean);
      rawOrders.push({
        notificationId: row.no_id,
        isRead: row.no_leida,
        id: ot.ot_id_orden,
        equipmentId: ot.eq_id_equipo,
        equipmentCode: ot.equipo?.eq_codigo ?? "—",
        equipmentName: ot.equipo?.eq_nombre ?? "Equipo desconocido",
        planId: ot.plan_id_manequipo ?? null,
        planName: ot.plan_mantenimiento?.pm_nombre_plan ?? "Plan preventivo",
        createdAt: row.no_creada_en,
        technicians,
      });
    } else {
      rawStock.push({
        notificationId: row.no_id,
        isRead: row.no_leida,
        partId: row.rep_id,
        partName: row.repuestos?.rep_nombre ?? "Repuesto",
        type: row.no_tipo,
        quantity: row.no_cantidad ?? 0,
        minimum: row.no_minimo ?? 0,
        createdAt: row.no_creada_en,
      });
    }
  }

  // Only the técnicos these OTs' tareas are assigned to.
  const technicianIds = [...new Set(rawOrders.flatMap((o) => o.technicians))];
  const profileNamesById = new Map<string, string>();
  if (technicianIds.length > 0) {
    const { data: profilesData } = await supabase
      .from("profiles")
      .select("id, name")
      .in("id", technicianIds);
    for (const p of (profilesData ?? []) as { id: string; name: string }[]) {
      profileNamesById.set(p.id, p.name);
    }
  }

  const notifications = mergeNotifications(
    groupPreventiveOrders(rawOrders, profileNamesById),
    buildStockNotifications(rawStock),
  );
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return { notifications, unreadCount };
}

// The notificacion rows behind these items (a preventive group has several).
export function notificationRowIds(items: AppNotification[]): number[] {
  return items.flatMap((n) => n.notificationIds);
}

export async function markNotificationsAsRead(items: AppNotification[]): Promise<void> {
  const ids = notificationRowIds(items);
  if (ids.length === 0) return;

  const { error } = await supabase.from("notificacion").update({ no_leida: true }).in("no_id", ids);
  if (error) {
    console.warn("Error marking notifications as read:", error.message);
  }
}
