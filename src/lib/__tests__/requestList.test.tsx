import React from "react";
import { render } from "@testing-library/react-native";
import { RequestList } from "../../components/RequestList";
import type { Equipo, Solicitud } from "../../types/database";

type RequestItem = Solicitud & {
  equipment: Pick<Equipo, "code" | "name">;
  reporterName: string;
  technicianName: string | null;
};

const baseItem: RequestItem = {
  id: 1,
  equipment_id: 10,
  reported_by: "user-1",
  description: "No enfría",
  urgency: "medium",
  status: "new",
  technician_id: null,
  photo_url: null,
  created_at: "2026-09-27T12:00:00Z",
  equipment: { code: "CF-001", name: "Central de Frío" },
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
    expect(screen.getByText("Nueva")).toBeTruthy();
  });
});
