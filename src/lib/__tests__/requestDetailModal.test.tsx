import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { RequestDetailModal } from "../../components/RequestDetailModal";
import type { RequestListItem } from "../../components/RequestList";

const item: RequestListItem = {
  id: 31,
  equipment_id: 10,
  reported_by: "user-1",
  description: "No mantiene la temperatura configurada",
  urgency: "high",
  status: "in_progress",
  technician_id: "technician-1",
  photo_url: "https://example.test/evidencia.webp",
  created_at: "2026-09-27T15:30:00Z",
  equipment: {
    code: "CF-001",
    name: "Central de Frío Positivo",
    location: "Salón de Máquinas",
    type: "Central de Frío",
    model: "Bitzer EcoLine 4NES",
    installDate: "2023-01-15",
    warrantyDate: "2027-01-15",
  },
  reporterName: "Ana Personal",
  technicianName: "Tomás Técnico",
};

describe("RequestDetailModal", () => {
  it("shows persisted request and equipment data in a read-only detail", async () => {
    const onClose = jest.fn();
    const screen = await render(<RequestDetailModal item={item} onClose={onClose} />);

    expect(screen.getByText("Solicitud #31")).toBeTruthy();
    expect(screen.getByText("En curso")).toBeTruthy();
    expect(screen.getByText("Atendida · trabajo en curso")).toBeTruthy();
    expect(screen.getByText("CF-001")).toBeTruthy();
    expect(screen.getByText("Central de Frío Positivo")).toBeTruthy();
    expect(screen.getByText("Salón de Máquinas")).toBeTruthy();
    expect(screen.getByText("No mantiene la temperatura configurada")).toBeTruthy();
    expect(screen.getByText("Urgencia Alta")).toBeTruthy();
    expect(screen.getByText("Tomás Técnico")).toBeTruthy();
    expect(screen.getByLabelText("Evidencia adjunta").props.source).toEqual({
      uri: "https://example.test/evidencia.webp",
    });
    expect(screen.queryByText("Guardar")).toBeNull();
    expect(screen.queryByText("Cambiar estado")).toBeNull();

    await fireEvent.press(screen.getByText("Cerrar"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
