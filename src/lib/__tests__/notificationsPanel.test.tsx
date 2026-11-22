import React from "react";
import { render } from "@testing-library/react-native";
import { NotificationsPanel } from "../../components/NotificationsPanel";
import type { StockNotification } from "../queries/notifications";

function stockItem(overrides: Partial<StockNotification>): StockNotification {
  return {
    kind: "stock_minimo",
    id: "stock-1",
    notificationIds: [1],
    partId: 8,
    partName: "Aceite 15W40",
    eventType: "stock_bajo",
    quantity: 2,
    minimum: 5,
    unit: "litro",
    createdAt: "2026-10-26T12:00:00Z",
    isRead: true,
    title: "Stock mínimo alcanzado",
    subtitle: "Hace 10 min",
    ...overrides,
  };
}

async function renderPanel(item: StockNotification) {
  return render(
    <NotificationsPanel
      notifications={[item]}
      unreadCount={0}
      onMarkAllAsRead={jest.fn()}
      onMarkAsRead={jest.fn()}
      onSelectNotification={jest.fn()}
    />,
  );
}

describe("NotificationsPanel - stock notifications", () => {
  it("shows the stock left and the mínimo with the repuesto's unit", async () => {
    const { getByText } = await renderPanel(stockItem({}));

    expect(getByText("2 L")).toBeTruthy();
    expect(getByText(/\(mínimo 5 L\)/)).toBeTruthy();
  });

  it("shows the mínimo with its unit when the repuesto ran out", async () => {
    const { getByText } = await renderPanel(
      stockItem({ eventType: "sin_stock", quantity: 0, minimum: 3, unit: "kilogramo" }),
    );

    expect(getByText(/se quedó sin stock \(mínimo 3 kg\)/)).toBeTruthy();
  });

  it('falls back to "u" when the unit is unknown', async () => {
    const { getByText } = await renderPanel(stockItem({ quantity: 1, unit: null }));

    expect(getByText("1 u")).toBeTruthy();
  });
});
