import {
  buildStockNotifications,
  formatNotificationTime,
  groupPreventiveOrders,
  mergeNotifications,
  notificationRowIds,
  type RawPreventiveOrder,
  type RawStockNotification,
} from "../../queries/notifications";

// notificationId defaults to the OT id so each order gets its own row.
function makeOrder(overrides: Partial<RawPreventiveOrder>): RawPreventiveOrder {
  const id = overrides.id ?? 1;
  return {
    notificationId: 1000 + id,
    isRead: false,
    id,
    equipmentId: 10,
    equipmentCode: "EX-110",
    equipmentName: "Heladera Exhibidora Vertical",
    planId: 100,
    planName: "Limpieza de condensador",
    createdAt: "2026-10-26T12:00:00Z",
    technicians: [],
    ...overrides,
  };
}

function makeStockRow(overrides: Partial<RawStockNotification>): RawStockNotification {
  return {
    notificationId: 1,
    isRead: false,
    partId: 5,
    partName: "Filtro de aire",
    type: "stock_bajo",
    quantity: 3,
    minimum: 4,
    createdAt: "2026-10-26T12:00:00Z",
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
        createdAt: "2026-10-26T14:30:00Z",
        technicians: ["tech-1"],
      }),
    ];

    const result = groupPreventiveOrders(orders, profileNames);

    expect(result).toHaveLength(1);
    expect(result[0].isGrouped).toBe(false);
    expect(result[0].orderNumber).toBe("OT-0028");
    expect(result[0].title).toBe("Nueva OT preventiva");
    expect(result[0].technicianLabel).toBe("Juan Pérez");
    expect(result[0].isRead).toBe(false);
    expect(result[0].notificationIds).toEqual([1028]);
  });

  it("shows 'Sin técnico asignado' when there are no technicians", () => {
    const orders = [
      makeOrder({
        id: 28,
        technicians: [],
      }),
    ];

    const result = groupPreventiveOrders(orders, profileNames);

    expect(result[0].technicianLabel).toBe("Sin técnico asignado");
    expect(result[0].subtitle).toContain("Sin técnico asignado");
  });

  it("groups multiple OTs of the same plan on the same day", () => {
    const orders = [
      makeOrder({
        id: 28,
        isRead: true,
        planId: 100,
        planName: "Limpieza de condensador",
        createdAt: "2026-10-26T10:00:00Z",
      }),
      makeOrder({
        id: 29,
        isRead: true,
        planId: 100,
        planName: "Limpieza de condensador",
        createdAt: "2026-10-26T11:00:00Z",
      }),
      makeOrder({
        id: 30,
        planId: 100,
        planName: "Limpieza de condensador",
        createdAt: "2026-10-26T12:00:00Z",
      }),
    ];

    const result = groupPreventiveOrders(orders, profileNames);

    expect(result).toHaveLength(1);
    expect(result[0].isGrouped).toBe(true);
    expect(result[0].count).toBe(3);
    expect(result[0].title).toBe("Nuevas OT preventivas");
    expect(result[0].notificationIds).toEqual([1030, 1029, 1028]);
    // Not all are read (30 is unread), so the group is unread
    expect(result[0].isRead).toBe(false);
  });

  it("marks group as read when all its rows are read", () => {
    const orders = [
      makeOrder({ id: 28, isRead: true, planId: 100, createdAt: "2026-10-26T10:00:00Z" }),
      makeOrder({ id: 29, isRead: true, planId: 100, createdAt: "2026-10-26T11:00:00Z" }),
    ];

    const result = groupPreventiveOrders(orders, profileNames);

    expect(result[0].isRead).toBe(true);
  });

  it("does not group OTs from different plans or different dates", () => {
    const orders = [
      makeOrder({ id: 26, planId: 101, createdAt: "2026-10-25T08:00:00Z" }),
      makeOrder({ id: 27, planId: 100, createdAt: "2026-10-26T09:00:00Z" }),
      makeOrder({ id: 28, planId: 100, createdAt: "2026-10-26T10:00:00Z" }),
    ];

    const result = groupPreventiveOrders(orders, profileNames);

    // 2 notifications: 1 grouped (27 and 28) and 1 single (26)
    expect(result).toHaveLength(2);
  });

  // Built from local times so it holds in any time zone: in Argentina,
  // 22:00 and 23:30 already fall on the next day in UTC.
  it("groups by the local day, not the UTC one", () => {
    const local = (day: number, h: number, m: number) => new Date(2026, 9, day, h, m).toISOString();

    const sameNight = groupPreventiveOrders(
      [
        makeOrder({ id: 40, planId: 100, createdAt: local(26, 22, 0) }),
        makeOrder({ id: 41, planId: 100, createdAt: local(26, 23, 30) }),
      ],
      profileNames,
    );
    expect(sameNight).toHaveLength(1);
    expect(sameNight[0].count).toBe(2);

    const aroundMidnight = groupPreventiveOrders(
      [
        makeOrder({ id: 42, planId: 100, createdAt: local(25, 23, 30) }),
        makeOrder({ id: 43, planId: 100, createdAt: local(26, 0, 30) }),
      ],
      profileNames,
    );
    expect(aroundMidnight).toHaveLength(2);
  });
});

describe("buildStockNotifications", () => {
  it("titles low-stock and out-of-stock rows, one notification each", () => {
    const result = buildStockNotifications([
      makeStockRow({ notificationId: 1, type: "stock_bajo" }),
      makeStockRow({ notificationId: 2, type: "sin_stock", isRead: true }),
    ]);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      kind: "stock_minimo",
      id: "stock-1",
      notificationIds: [1],
      partName: "Filtro de aire",
      title: "Stock mínimo alcanzado",
      isRead: false,
    });
    expect(result[1].title).toBe("Repuesto sin stock");
    expect(result[1].isRead).toBe(true);
  });
});

describe("mergeNotifications", () => {
  it("puts both kinds in one list, newest first", () => {
    const preventive = groupPreventiveOrders(
      [makeOrder({ id: 30, createdAt: "2026-10-26T10:00:00Z" })],
      new Map(),
    );
    const stock = buildStockNotifications([
      makeStockRow({ notificationId: 1, isRead: true, createdAt: "2026-10-26T09:00:00Z" }),
      makeStockRow({ notificationId: 2, createdAt: "2026-10-26T11:00:00Z" }),
    ]);

    const result = mergeNotifications(preventive, stock);

    expect(result.map((n) => n.id)).toEqual(["stock-2", "ot-30", "stock-1"]);
    expect(result.filter((n) => !n.isRead)).toHaveLength(2);
  });
});

describe("notificationRowIds", () => {
  it("collects every row behind a preventive group and a stock item", () => {
    const [group] = groupPreventiveOrders(
      [
        makeOrder({ id: 28, createdAt: "2026-10-26T10:00:00Z" }),
        makeOrder({ id: 29, createdAt: "2026-10-26T11:00:00Z" }),
      ],
      new Map(),
    );
    const [stock] = buildStockNotifications([makeStockRow({ notificationId: 7 })]);

    expect(notificationRowIds([group, stock])).toEqual([1029, 1028, 7]);
  });
});
