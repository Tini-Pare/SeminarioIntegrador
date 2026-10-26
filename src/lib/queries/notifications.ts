import { formatOrderNumber } from "../orderNumber";
import { supabase } from "../supabase";

export type RawPreventiveOrder = {
  id: number;
  equipmentId: number;
  equipmentCode: string;
  equipmentName: string;
  planId: number | null;
  planName: string;
  startDate: string;
  technicians: string[];
};

export type PreventiveNotification = {
  id: string;
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

export function groupPreventiveOrders(
  orders: RawPreventiveOrder[],
  readOrderIds: Set<number>,
  profileNamesById: Map<string, string>,
): PreventiveNotification[] {
  // Group by (planId, YYYY-MM-DD)
  const groups = new Map<string, RawPreventiveOrder[]>();

  for (const o of orders) {
    const day = o.startDate ? o.startDate.slice(0, 10) : "unknown";
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
    const allRead = orderIds.every((id) => readOrderIds.has(id));

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
        id: `ot-${o.id}`,
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
        createdAt: o.startDate,
        isRead: allRead,
        title: "Nueva OT preventiva",
        subtitle: `${formatNotificationTime(o.startDate)} · ${technicianLabel}`,
      });
    } else {
      notifications.push({
        id: `group-${key}`,
        orderIds,
        isGrouped: true,
        count: group.length,
        planId: mostRecent.planId,
        planName: mostRecent.planName,
        createdAt: mostRecent.startDate,
        isRead: allRead,
        title: "Nuevas OT preventivas",
        subtitle: formatNotificationTime(mostRecent.startDate),
      });
    }
  }

  // Sort by most recent createdAt descending
  notifications.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return notifications;
}

export async function listPreventiveNotifications(): Promise<{
  notifications: PreventiveNotification[];
  unreadCount: number;
}> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return { notifications: [], unreadCount: 0 };
  }

  // Fetch recent preventive orders
  const { data: ordersData, error: ordersError } = await supabase
    .from("orden_de_trabajo")
    .select(`
      ot_id_orden,
      eq_id_equipo,
      plan_id_manequipo,
      ot_tipo_orden,
      ot_fecha_inicio,
      plan_mantenimiento(pm_nombre_plan),
      equipo(eq_codigo, eq_nombre),
      tareas_realizadas_orden(p_id_tecnico)
    `)
    .eq("ot_tipo_orden", "preventivo")
    .order("ot_id_orden", { ascending: false })
    .limit(50);

  if (ordersError) {
    throw new Error(ordersError.message);
  }

  // Fetch read status for this user
  let readOrderIds = new Set<number>();
  try {
    const { data: readData, error: readError } = await supabase
      .from("notificacion_ot_leida")
      .select("ot_id_orden")
      .eq("user_id", session.user.id);

    if (!readError && readData) {
      readOrderIds = new Set(readData.map((r: { ot_id_orden: number }) => r.ot_id_orden));
    }
  } catch {
    // If table doesn't exist yet, proceed with empty read set
  }

  // Fetch technician profile names
  const { data: profilesData } = await supabase.from("profiles").select("id, name");
  const profileNamesById = new Map<string, string>(
    (profilesData ?? []).map((p: { id: string; name: string }) => [p.id, p.name]),
  );

  const rawOrders: RawPreventiveOrder[] = (ordersData ?? []).map((row: any) => {
    const equip = row.equipo;
    const plan = row.plan_mantenimiento;
    const tasks = row.tareas_realizadas_orden ?? [];
    const technicians: string[] = tasks
      .map((t: { p_id_tecnico: string | null }) => t.p_id_tecnico)
      .filter(Boolean);

    return {
      id: row.ot_id_orden,
      equipmentId: row.eq_id_equipo,
      equipmentCode: equip?.eq_codigo ?? "—",
      equipmentName: equip?.eq_nombre ?? "Equipo desconocido",
      planId: row.plan_id_manequipo ?? null,
      planName: plan?.pm_nombre_plan ?? "Plan preventivo",
      startDate: row.ot_fecha_inicio,
      technicians,
    };
  });

  const notifications = groupPreventiveOrders(rawOrders, readOrderIds, profileNamesById);
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return { notifications, unreadCount };
}

export async function markNotificationAsRead(orderIds: number[]): Promise<void> {
  if (orderIds.length === 0) return;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return;

  const rows = orderIds.map((id) => ({
    user_id: session.user.id,
    ot_id_orden: id,
  }));

  try {
    const { error } = await supabase
      .from("notificacion_ot_leida")
      .upsert(rows, { onConflict: "user_id,ot_id_orden" });

    if (error) {
      console.warn("Error marking notification as read:", error.message);
    }
  } catch (e) {
    console.warn("Failed to mark notifications as read:", e);
  }
}

export async function markAllNotificationsAsRead(allOrderIds: number[]): Promise<void> {
  await markNotificationAsRead(allOrderIds);
}
