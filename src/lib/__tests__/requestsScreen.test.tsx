import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import RequestsScreen from "../../app/(app)/requests";
import { getProfile } from "../auth";
import { listEquipment } from "../queries/equipment";
import { createFault, listAllRequests, listMyRequests } from "../queries/faults";
import { listProfiles } from "../queries/profiles";
import type { Equipo, Profile } from "../../types/database";

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
      const channel = {
        on: jest.fn(),
        subscribe: jest.fn(),
      };
      channel.on.mockReturnValue(channel);
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
});
