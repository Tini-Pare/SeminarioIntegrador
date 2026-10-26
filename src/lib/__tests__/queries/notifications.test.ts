import {
  formatNotificationTime,
  groupPreventiveOrders,
  type RawPreventiveOrder,
} from "../../queries/notifications";

function makeOrder(overrides: Partial<RawPreventiveOrder>): RawPreventiveOrder {
  return {
    id: 1,
    equipmentId: 10,
    equipmentCode: "EX-110",
    equipmentName: "Heladera Exhibidora Vertical",
    planId: 100,
    planName: "Limpieza de condensador",
    startDate: "2026-10-26T12:00:00Z",
    technicians: [],
    ...overrides,
  };
}

describe("formatNotificationTime", () => {
  it("formats recent relative minutes", () => {
    const now = new Date();
    const tenMinAgo = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
    expect(formatNotificationTime(tenMinAgo)).toBe("Hace 10 min");
  });

  it("formats less than a minute ago", () => {
    const now = new Date();
    const justNow = new Date(now.getTime() - 20 * 1000).toISOString();
    expect(formatNotificationTime(justNow)).toBe("Hace un momento");
  });
});

describe("groupPreventiveOrders", () => {
  const profileNames = new Map<string, string>([
    ["tech-1", "Juan Pérez"],
    ["tech-2", "María Gómez"],
  ]);

  it("creates a single notification for a lone OT with assigned technician", () => {
    const orders = [
      makeOrder({
        id: 28,
        planName: "Limpieza de condensador",
        equipmentName: "Heladera Exhibidora Vertical",
        equipmentCode: "EX-110",
        startDate: "2026-10-26T14:30:00Z",
        technicians: ["tech-1"],
      }),
    ];

    const result = groupPreventiveOrders(orders, new Set(), profileNames);

    expect(result).toHaveLength(1);
    expect(result[0].isGrouped).toBe(false);
    expect(result[0].orderNumber).toBe("OT-0028");
    expect(result[0].title).toBe("Nueva OT preventiva");
    expect(result[0].technicianLabel).toBe("Juan Pérez");
    expect(result[0].isRead).toBe(false);
  });

  it("shows 'Sin técnico asignado' when there are no technicians", () => {
    const orders = [
      makeOrder({
        id: 28,
        technicians: [],
      }),
    ];

    const result = groupPreventiveOrders(orders, new Set(), profileNames);

    expect(result[0].technicianLabel).toBe("Sin técnico asignado");
    expect(result[0].subtitle).toContain("Sin técnico asignado");
  });

  it("groups multiple OTs of the same plan on the same day", () => {
    const orders = [
      makeOrder({
        id: 28,
        planId: 100,
        planName: "Limpieza de condensador",
        startDate: "2026-10-26T10:00:00Z",
      }),
      makeOrder({
        id: 29,
        planId: 100,
        planName: "Limpieza de condensador",
        startDate: "2026-10-26T11:00:00Z",
      }),
      makeOrder({
        id: 30,
        planId: 100,
        planName: "Limpieza de condensador",
        startDate: "2026-10-26T12:00:00Z",
      }),
    ];

    const result = groupPreventiveOrders(orders, new Set([28, 29]), profileNames);

    expect(result).toHaveLength(1);
    expect(result[0].isGrouped).toBe(true);
    expect(result[0].count).toBe(3);
    expect(result[0].title).toBe("Nuevas OT preventivas");
    // Not all are read (30 is unread), so the group is unread
    expect(result[0].isRead).toBe(false);
  });

  it("marks group as read when all order IDs are in read set", () => {
    const orders = [
      makeOrder({ id: 28, planId: 100, startDate: "2026-10-26T10:00:00Z" }),
      makeOrder({ id: 29, planId: 100, startDate: "2026-10-26T11:00:00Z" }),
    ];

    const result = groupPreventiveOrders(orders, new Set([28, 29]), profileNames);

    expect(result[0].isRead).toBe(true);
  });

  it("does not group OTs from different plans or different dates", () => {
    const orders = [
      makeOrder({ id: 26, planId: 101, startDate: "2026-10-25T08:00:00Z" }),
      makeOrder({ id: 27, planId: 100, startDate: "2026-10-26T09:00:00Z" }),
      makeOrder({ id: 28, planId: 100, startDate: "2026-10-26T10:00:00Z" }),
    ];

    const result = groupPreventiveOrders(orders, new Set(), profileNames);

    // 2 notifications: 1 grouped (27 and 28) and 1 single (26)
    expect(result).toHaveLength(2);
  });
});
