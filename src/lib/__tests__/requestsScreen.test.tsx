import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import RequestsScreen from "../../app/(app)/requests";
import { getProfile } from "../auth";
import { listEquipment } from "../queries/equipment";
import { createFault, listAllRequests, listMyRequests } from "../queries/faults";
import { listProfiles } from "../queries/profiles";
import type { Equipo, Profile, Solicitud } from "../../types/database";

const mockRealtimeCallbacks: (() => void)[] = [];

jest.mock("../auth", () => ({ getProfile: jest.fn() }));
jest.mock("../queries/equipment", () => ({ listEquipment: jest.fn() }));
jest.mock("../queries/faults", () => ({
  createFault: jest.fn(),
  listAllRequests: jest.fn(),
  listMyRequests: jest.fn(),
}));
jest.mock("../queries/profiles", () => ({ listProfiles: jest.fn() }));
jest.mock("../faultPhoto", () => ({
  compressToWebp: jest.fn(),
  pickFaultPhoto: jest.fn(),
  takeFaultPhoto: jest.fn(),
  uploadFaultPhoto: jest.fn(),
}));
jest.mock("../supabase", () => ({
  supabase: {
    channel: jest.fn(() => {
      const channel: { on: jest.Mock; subscribe: jest.Mock } = {
        on: jest.fn((_event, _filter, callback: () => void) => {
          mockRealtimeCallbacks.push(callback);
          return channel;
        }),
        subscribe: jest.fn(),
      };
      channel.subscribe.mockReturnValue(channel);
      return channel;
    }),
    removeChannel: jest.fn(),
  },
}));

const equipment: Equipo = {
  id: 10,
  code: "CF-001",
  name: "Central de Frío Positivo",
  type: "Central de Frío",
  typeId: 2,
  location: "Salón de Máquinas",
  locationId: 3,
  status: "waiting",
  model: "Bitzer EcoLine 4NES",
  installDate: "2023-01-15",
  warrantyDate: "2027-01-15",
};

const request: Solicitud = {
  id: 31,
  equipment_id: 10,
  reported_by: "user-1",
  description: "No mantiene la temperatura configurada",
  urgency: "high",
  status: "new",
  technician_id: null,
  photo_url: null,
  created_at: "2026-09-27T12:00:00Z",
};

function profile(role: Profile["role"]): Profile {
  return {
    id: `${role}-1`,
    name: role === "user" ? "Ana Personal" : "Ada Admin",
    email: `${role}@example.com`,
    legajo: role === "user" ? "USR-1" : "ADM-1",
    role,
    active: true,
    created_at: "2026-01-01T00:00:00Z",
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRealtimeCallbacks.length = 0;
  (listEquipment as jest.Mock).mockResolvedValue([equipment]);
  (listProfiles as jest.Mock).mockResolvedValue([]);
  (listAllRequests as jest.Mock).mockResolvedValue([]);
  (listMyRequests as jest.Mock).mockResolvedValue([]);
  (createFault as jest.Mock).mockResolvedValue({});
});

describe("RequestsScreen role-aware behavior", () => {
  it("lets store staff open the shared creation flow and select real equipment", async () => {
    (getProfile as jest.Mock).mockResolvedValue(profile("user"));
    const screen = await render(<RequestsScreen />);

    await waitFor(() => expect(screen.getByText("Mis solicitudes")).toBeTruthy());
    expect(listMyRequests).toHaveBeenCalled();
    expect(listAllRequests).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText("+ Nuevo"));

    await waitFor(() => expect(screen.getByText("Nueva solicitud")).toBeTruthy());
    expect(screen.getByText("Ana Personal")).toBeTruthy();

    await fireEvent.press(screen.getByText("Elegí un equipo"));
    await fireEvent.changeText(screen.getByPlaceholderText("Buscar…"), "CF-001");
    await fireEvent.press(screen.getByText("CF-001 — Central de Frío Positivo"));

    expect(screen.getByText("Salón de Máquinas")).toBeTruthy();
    expect(screen.getByText("Central de Frío")).toBeTruthy();
    expect(screen.getByText("Bitzer EcoLine 4NES")).toBeTruthy();

    await fireEvent.changeText(
      screen.getByPlaceholderText("¿Qué está pasando?"),
      "  No enfría correctamente  ",
    );
    await fireEvent.press(screen.getByText("Alta"));
    await fireEvent.press(screen.getByText("Reportar solicitud"));

    await waitFor(() =>
      expect(createFault).toHaveBeenCalledWith({
        equipmentId: 10,
        description: "No enfría correctamente",
        urgency: "high",
        photoUrl: undefined,
      }),
    );
    await waitFor(() => expect(screen.getByText("Solicitud registrada con éxito")).toBeTruthy());
    expect(screen.queryByText("Nueva solicitud")).toBeNull();
    expect(listMyRequests).toHaveBeenCalledTimes(2);
  });

  it("shows a useful empty state when store staff has no requests", async () => {
    (getProfile as jest.Mock).mockResolvedValue(profile("user"));
    const screen = await render(<RequestsScreen />);

    await waitFor(() =>
      expect(
        screen.getByText("No hay solicitudes todavía. Reportá una falla con el botón de arriba."),
      ).toBeTruthy(),
    );
  });

  it("preserves the Admin list while hiding the store-staff creation flow", async () => {
    (getProfile as jest.Mock).mockResolvedValue(profile("admin"));
    const screen = await render(<RequestsScreen />);

    await waitFor(() => expect(screen.getByText("Solicitudes")).toBeTruthy());
    expect(listAllRequests).toHaveBeenCalled();
    expect(listMyRequests).not.toHaveBeenCalled();
    expect(screen.queryByText("+ Nuevo")).toBeNull();
    expect(screen.queryByText("Nueva solicitud")).toBeNull();
    expect(screen.getByText("No hay solicitudes registradas todavía.")).toBeTruthy();
  });

  it("shows the current status and opens a read-only detail for store staff", async () => {
    (getProfile as jest.Mock).mockResolvedValue(profile("user"));
    (listMyRequests as jest.Mock).mockResolvedValue([
      { ...request, status: "in_progress", technician_id: "technician-1" },
    ]);
    (listProfiles as jest.Mock).mockResolvedValue([
      profile("user"),
      { ...profile("technician"), id: "technician-1", name: "Tomás Técnico" },
    ]);
    const screen = await render(<RequestsScreen />);

    await waitFor(() => expect(screen.getByText("En curso")).toBeTruthy());
    expect(screen.getByText("Atendida · trabajo en curso")).toBeTruthy();
    expect(screen.getByText("Urgencia · Alta")).toBeTruthy();
    expect(screen.getByText("Ubicación · Salón de Máquinas")).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("Ver detalle de la solicitud 31"));

    await waitFor(() => expect(screen.getByText("Detalle de solicitud")).toBeTruthy());
    expect(screen.getAllByText("Solicitud #31")).toHaveLength(2);
    expect(screen.getByText("Tomás Técnico")).toBeTruthy();
    expect(screen.queryByText("Cambiar estado")).toBeNull();
    expect(screen.queryByText("Asignar técnico")).toBeNull();
    expect(screen.queryByText("Guardar")).toBeNull();
  });

  it("filters the user's persisted requests by search, status and urgency", async () => {
    (getProfile as jest.Mock).mockResolvedValue(profile("user"));
    (listMyRequests as jest.Mock).mockResolvedValue([
      request,
      {
        ...request,
        id: 32,
        description: "Pérdida de agua",
        urgency: "low",
        status: "resolved",
      },
    ]);
    const screen = await render(<RequestsScreen />);

    await waitFor(() => expect(screen.getByText("Solicitud #31")).toBeTruthy());
    expect(screen.getByText("Solicitud #32")).toBeTruthy();

    await fireEvent.changeText(
      screen.getByPlaceholderText("Buscar por solicitud, equipo o descripción…"),
      "Pérdida de agua",
    );
    await waitFor(() => expect(screen.queryByText("Solicitud #31")).toBeNull());
    expect(screen.getByText("Solicitud #32")).toBeTruthy();

    await fireEvent.changeText(
      screen.getByPlaceholderText("Buscar por solicitud, equipo o descripción…"),
      "",
    );
    await fireEvent.press(screen.getByText("Filtros"));
    await fireEvent.press(screen.getAllByText("Resuelta")[0]);
    await fireEvent.press(screen.getByText("Baja"));
    await waitFor(() => expect(screen.queryByText("Solicitud #31")).toBeNull());
    expect(screen.getByText("Solicitud #32")).toBeTruthy();
  });

  it("reloads the persisted status when a realtime request change arrives", async () => {
    (getProfile as jest.Mock).mockResolvedValue(profile("user"));
    (listMyRequests as jest.Mock)
      .mockResolvedValueOnce([request])
      .mockResolvedValue([{ ...request, status: "resolved" }]);
    const screen = await render(<RequestsScreen />);

    await waitFor(() => expect(screen.getByText("Pendiente de atención")).toBeTruthy());
    expect(mockRealtimeCallbacks).not.toHaveLength(0);

    await act(async () => {
      await mockRealtimeCallbacks[0]();
    });

    await waitFor(() => expect(screen.getByText("Atendida · solicitud resuelta")).toBeTruthy());
    expect(listMyRequests).toHaveBeenCalledTimes(2);
  });

  it("shows a friendly retrieval error without exposing backend details", async () => {
    (getProfile as jest.Mock).mockResolvedValue(profile("user"));
    (listMyRequests as jest.Mock).mockRejectedValue(
      new Error("new row violates row-level security policy"),
    );
    const screen = await render(<RequestsScreen />);

    await waitFor(() =>
      expect(
        screen.getByText("No pudimos cargar las solicitudes. Intentá nuevamente."),
      ).toBeTruthy(),
    );
    expect(screen.queryByText("new row violates row-level security policy")).toBeNull();
    expect(screen.getByText("Reintentar")).toBeTruthy();
  });
});
