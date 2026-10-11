import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { SolicitudDetailModal } from "../../components/SolicitudDetailModal";
import { router } from "expo-router";
import * as profilesQuery from "../queries/profiles";

jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
  },
}));

jest.mock("../queries/profiles", () => ({
  listProfiles: jest.fn(),
}));

jest.mock("../queries/faults", () => ({
  closeSolicitud: jest.fn(),
  generateOrder: jest.fn(),
}));

describe("SolicitudDetailModal - Orden de trabajo section", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (profilesQuery.listProfiles as jest.Mock).mockResolvedValue([
      { id: "tech-1", name: "Carlos Gómez", role: "technician" },
      { id: "tech-2", name: "Ana Martínez", role: "technician" },
    ]);
  });

  const baseItem = {
    id: 10,
    equipment_id: 1,
    reported_by: "user-1",
    description: "Ruido extraño en compresor",
    status: "in_progress" as const,
    priority: "medium" as const,
    photo_url: null,
    photo_urls: [],
    created_at: "2026-10-09T14:30:00Z",
    motivo_rechazo: null,
    comentario_rechazo: null,
    order_id: 101,
    order_start_date: "2026-10-09",
    order_end_date: null,
    order_planned_end_date: null,
    fault_type_name: null,
    equipment: {
      code: "EX-104",
      name: "Isla de Congelados 2",
    },
    reporterName: "Mariano López",
    tasks: [
      {
        id: 1,
        taskId: 10,
        taskName: "Revisión de termostato",
        technicianId: "tech-1",
        startDate: "2026-10-09",
        endDate: null,
        consumedParts: [
          {
            repId: 1,
            nombre: "Burlete de goma EPDM para puerta vidriada",
            cantidad: 2,
          },
        ],
        diagnosis: null,
      },
      {
        id: 2,
        taskId: 11,
        taskName: "Cambio de filtro",
        technicianId: "tech-unknown",
        startDate: null,
        endDate: null,
        consumedParts: [],
        diagnosis: null,
      },
    ],
  };

  it("does not render Orden de trabajo section when order_id is null", async () => {
    const itemWithoutOrder = {
      ...baseItem,
      status: "new" as const,
      order_id: null,
      tasks: [],
    };

    const { queryByText } = await render(
      <SolicitudDetailModal
        solicitud={itemWithoutOrder}
        onClose={jest.fn()}
        onChanged={jest.fn()}
      />,
    );

    expect(queryByText("ORDEN DE TRABAJO")).toBeNull();
    expect(queryByText("FALLA GENÉRICA")).toBeNull();
    expect(queryByText("Ver orden de trabajo")).toBeNull();
  });

  it("renders redesigned Orden de trabajo section with pending fault and dates for in-progress request", async () => {
    const { getByText, getAllByText } = await render(
      <SolicitudDetailModal solicitud={baseItem} onClose={jest.fn()} onChanged={jest.fn()} />,
    );

    // Section header
    expect(getByText("ORDEN DE TRABAJO")).toBeTruthy();

    // Generic fault label and pending state
    expect(getByText("FALLA GENÉRICA")).toBeTruthy();
    expect(getByText("Sin diagnosticar")).toBeTruthy();

    // Dates
    expect(getByText("FECHA DE INICIO")).toBeTruthy();
    expect(getByText("09/10/2026")).toBeTruthy();
    expect(getByText("FECHA DE FINALIZACIÓN")).toBeTruthy();

    // Tasks header and count badge
    expect(getByText("TAREAS")).toBeTruthy();
    expect(getByText("2")).toBeTruthy();

    // Task 1
    expect(getByText("Revisión de termostato")).toBeTruthy();
    expect(getByText("En curso")).toBeTruthy();
    expect(getByText("REPUESTOS")).toBeTruthy();
    expect(getByText(/Burlete de goma EPDM para puerta vidriada/)).toBeTruthy();
    expect(getByText(/×2/)).toBeTruthy();

    // Task 2
    expect(getByText("Cambio de filtro")).toBeTruthy();
    expect(getByText("Técnico desconocido")).toBeTruthy();

    // Both the pending end date and Task 2 status badge display "Pendiente"
    const pendingElements = getAllByText("Pendiente");
    expect(pendingElements.length).toBe(2);

    // Full-width button
    expect(getByText("Ver orden de trabajo")).toBeTruthy();
  });

  it("renders generic fault name and completed end date when resolved", async () => {
    const resolvedItem = {
      ...baseItem,
      status: "resolved" as const,
      fault_type_name: "Falla eléctrica",
      order_end_date: "2026-10-10",
      tasks: [
        {
          id: 1,
          taskId: 10,
          taskName: "Revisión de termostato",
          technicianId: "tech-1",
          startDate: "2026-10-09",
          endDate: "2026-10-10",
          consumedParts: [],
          diagnosis: "Termostato descalibrado, se ajustó.",
        },
      ],
    };

    const { getByText } = await render(
      <SolicitudDetailModal solicitud={resolvedItem} onClose={jest.fn()} onChanged={jest.fn()} />,
    );

    expect(getByText("Falla eléctrica")).toBeTruthy();
    expect(getByText("10/10/2026")).toBeTruthy();
    expect(getByText("Finalizada")).toBeTruthy();
    expect(getByText("1")).toBeTruthy();
    expect(getByText("DIAGNÓSTICO")).toBeTruthy();
    expect(getByText("Termostato descalibrado, se ajustó.")).toBeTruthy();
  });

  it("navigates to work order screen and closes modal on button press", async () => {
    const onClose = jest.fn();

    const { getByText } = await render(
      <SolicitudDetailModal solicitud={baseItem} onClose={onClose} onChanged={jest.fn()} />,
    );

    const button = getByText("Ver orden de trabajo");
    fireEvent.press(button);

    expect(onClose).toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/work-orders/[id]",
      params: { id: "10" },
    });
  });
});
