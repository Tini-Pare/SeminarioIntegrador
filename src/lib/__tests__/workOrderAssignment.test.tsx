import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import WorkOrderDetail from "../../app/(app)/work-orders/[id]";
import { getEquipmentById } from "../queries/equipment";
import { addTasksToOrder, getSolicitudById } from "../queries/faults";
import { listFaultTypes } from "../queries/faultTypes";
import { listProfiles } from "../queries/profiles";

jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  router: { back: jest.fn() },
  useLocalSearchParams: () => ({ id: "5" }),
}));
jest.mock("../../components/AddTaskModal", () => ({
  AddTaskModal: ({ visible, onConfirm }: any) => {
    const { Pressable, Text } = require("react-native");
    return visible ? (
      <Pressable onPress={() => onConfirm({ taskIds: [1, 2], technicianId: "tec1" })}>
        <Text>Confirmar tareas del modal</Text>
      </Pressable>
    ) : null;
  },
}));
jest.mock("../queries/equipment", () => ({ getEquipmentById: jest.fn() }));
jest.mock("../queries/faults", () => ({
  getSolicitudById: jest.fn(),
  addTasksToOrder: jest.fn(),
  reassignTaskTechnician: jest.fn(),
  updateOrderFaultType: jest.fn(),
  updateOrderPlannedEndDate: jest.fn(),
  updateOrderPriority: jest.fn(),
  updateOrderStartDate: jest.fn(),
}));
jest.mock("../queries/faultTypes", () => ({ listFaultTypes: jest.fn() }));
jest.mock("../queries/profiles", () => ({ listProfiles: jest.fn() }));
jest.mock("../supabase", () => {
  const channel = { on: jest.fn(), subscribe: jest.fn() };
  channel.on.mockReturnValue(channel);
  return { supabase: { channel: () => channel, removeChannel: jest.fn() } };
});

const order = {
  id: 5,
  equipment_id: 10,
  reported_by: "admin1",
  description: "No enfría",
  status: "assigned",
  priority: "medium",
  order_id: 7,
  order_start_date: "2026-10-12",
  order_end_date: null,
  order_planned_end_date: null,
  fault_type_name: null,
  photo_urls: [],
  created_at: "2026-10-12T00:00:00Z",
};

it("opens the existing task action and refreshes the grid after batch assignment", async () => {
  jest.clearAllMocks();
  (getSolicitudById as jest.Mock).mockResolvedValueOnce({ ...order, tasks: [] }).mockResolvedValue({
    ...order,
    tasks: [
      {
        id: 11,
        taskId: 1,
        taskName: "Limpieza de filtros",
        technicianId: "tec1",
        startDate: null,
        endDate: null,
        consumedParts: [],
        diagnosis: null,
      },
      {
        id: 12,
        taskId: 2,
        taskName: "Revisión de drenaje",
        technicianId: "tec1",
        startDate: null,
        endDate: null,
        consumedParts: [],
        diagnosis: null,
      },
    ],
  });
  (getEquipmentById as jest.Mock).mockResolvedValue({
    id: 10,
    code: "AC-105",
    name: "Aire Acondicionado",
    location: "Sala",
  });
  (listProfiles as jest.Mock).mockResolvedValue([
    { id: "tec1", name: "Joaquín", role: "technician", active: true },
    { id: "admin1", name: "Admin", role: "admin", active: true },
  ]);
  (listFaultTypes as jest.Mock).mockResolvedValue([]);
  (addTasksToOrder as jest.Mock).mockResolvedValue({ historyWarning: false });

  const screen = await render(<WorkOrderDetail />);
  await waitFor(() => expect(screen.getByText("+ Agregar tareas")).toBeTruthy());
  await fireEvent.press(screen.getByText("+ Agregar tareas"));
  await fireEvent.press(screen.getByText("Confirmar tareas del modal"));

  await waitFor(() => expect(screen.getByText("Limpieza de filtros")).toBeTruthy());
  expect(screen.getByText("Revisión de drenaje")).toBeTruthy();
  expect(screen.getAllByText("Joaquín")).toHaveLength(1);
  expect(screen.getByText("2 tareas")).toBeTruthy();
  expect(screen.getByText("2 tareas agregadas a la orden.")).toBeTruthy();
  expect(addTasksToOrder).toHaveBeenCalledWith(5, { taskIds: [1, 2], technicianId: "tec1" });
  expect(getSolicitudById).toHaveBeenCalledTimes(2);
});
