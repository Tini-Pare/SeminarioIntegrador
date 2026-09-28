import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { RequestList, type RequestListItem } from "../../components/RequestList";

const baseItem: RequestListItem = {
  id: 1,
  equipment_id: 10,
  reported_by: "user-1",
  description: "No enfría",
  urgency: "medium",
  status: "new",
  technician_id: null,
  photo_url: null,
  created_at: "2026-09-27T12:00:00Z",
  equipment: {
    code: "CF-001",
    name: "Central de Frío",
    location: "Salón de Máquinas",
    type: "Central de Frío",
    model: "Bitzer EcoLine",
    installDate: "2023-01-15",
    warrantyDate: "2027-01-15",
  },
  reporterName: "Ana Personal",
  technicianName: null,
};

describe("RequestList", () => {
  it("renders historical requests with missing urgency without crashing", async () => {
    const screen = await render(
      <RequestList items={[{ ...baseItem, urgency: undefined as never }]} />,
    );

    expect(screen.getByText("Central de Frío")).toBeTruthy();
    expect(screen.getByText("No enfría")).toBeTruthy();
    expect(screen.getByText("Pendiente")).toBeTruthy();
    expect(screen.getByText("Pendiente de atención")).toBeTruthy();
  });

  it("shows the real request statuses and their attended meaning without management actions", async () => {
    const screen = await render(
      <RequestList
        items={[
          baseItem,
          { ...baseItem, id: 2, status: "assigned" },
          { ...baseItem, id: 3, status: "in_progress" },
          { ...baseItem, id: 4, status: "resolved" },
        ]}
      />,
    );

    expect(screen.getByText("Pendiente")).toBeTruthy();
    expect(screen.getByText("Asignada")).toBeTruthy();
    expect(screen.getByText("En curso")).toBeTruthy();
    expect(screen.getByText("Resuelta")).toBeTruthy();
    expect(screen.getByText("Atendida · técnico asignado")).toBeTruthy();
    expect(screen.getByText("Atendida · trabajo en curso")).toBeTruthy();
    expect(screen.getByText("Atendida · solicitud resuelta")).toBeTruthy();
    expect(screen.queryByText("Cambiar estado")).toBeNull();
    expect(screen.queryByText("Asignar técnico")).toBeNull();
  });

  it("limits long descriptions and opens the selected read-only detail", async () => {
    const onOpen = jest.fn();
    const longDescription = "La cámara no mantiene la temperatura ".repeat(20);
    const screen = await render(
      <RequestList items={[{ ...baseItem, description: longDescription }]} onOpen={onOpen} />,
    );

    expect(screen.getByText(longDescription).props.numberOfLines).toBe(2);
    fireEvent.press(screen.getByLabelText("Ver detalle de la solicitud 1"));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
  });
});
