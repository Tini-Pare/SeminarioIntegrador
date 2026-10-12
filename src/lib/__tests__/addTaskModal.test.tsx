import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { AddTaskModal } from "../../components/AddTaskModal";
import { listActiveTaskCountsByTechnician } from "../queries/faults";
import { createGeneralTask, listGeneralTasks } from "../queries/generalTasks";
import { listProfiles } from "../queries/profiles";

jest.mock("../queries/faults", () => ({ listActiveTaskCountsByTechnician: jest.fn() }));
jest.mock("../queries/generalTasks", () => ({
  listGeneralTasks: jest.fn(),
  createGeneralTask: jest.fn(),
}));
jest.mock("../queries/profiles", () => ({ listProfiles: jest.fn() }));

const tasks = [
  { tag_id_tarea: 1, tag_nombre_tarea: "Limpieza de filtros", tag_estado: "activo" },
  { tag_id_tarea: 2, tag_nombre_tarea: "Revisión de drenaje", tag_estado: "activo" },
];

beforeEach(() => {
  jest.clearAllMocks();
  (listProfiles as jest.Mock).mockResolvedValue([
    { id: "tec1", name: "Joaquín", role: "technician", active: true },
    { id: "tec2", name: "Inactivo", role: "technician", active: false },
  ]);
  (listActiveTaskCountsByTechnician as jest.Mock).mockResolvedValue({ tec1: 2 });
  (listGeneralTasks as jest.Mock).mockResolvedValue(tasks);
});

async function selectTechnician(screen: Awaited<ReturnType<typeof render>>) {
  await waitFor(() => expect(screen.getByText("Elegí un técnico")).toBeTruthy());
  await fireEvent.press(screen.getByText("Elegí un técnico"));
  await fireEvent.press(screen.getByText("Joaquín · 2 tareas activas"));
}

it("requires a responsible person and at least one task, then submits multiple selections", async () => {
  const onConfirm = jest.fn().mockResolvedValue(undefined);
  const screen = await render(
    <AddTaskModal visible onClose={() => {}} onConfirm={onConfirm} equipmentLabel="AC-105" />,
  );

  await waitFor(() => expect(screen.getByText("Agregar tareas a la orden")).toBeTruthy());
  expect(screen.getByText("AC-105")).toBeTruthy();
  expect(screen.getByText("Confirmar").parent?.props.accessibilityState?.disabled).toBe(true);

  await selectTechnician(screen);
  expect(screen.getByText("Confirmar").parent?.props.accessibilityState?.disabled).toBe(true);

  await waitFor(() =>
    expect(screen.getByPlaceholderText("Buscar tarea…").props.editable).toBe(true),
  );
  await fireEvent(screen.getByPlaceholderText("Buscar tarea…"), "focus");
  await fireEvent.press(screen.getByText("Limpieza de filtros"));
  await fireEvent.press(screen.getByText("Revisión de drenaje"));

  expect(screen.getByText("2 tareas seleccionadas")).toBeTruthy();
  expect(screen.getByText("Confirmar").parent?.props.accessibilityState?.disabled).toBe(false);
  await fireEvent.press(screen.getByText("Confirmar"));

  await waitFor(() =>
    expect(onConfirm).toHaveBeenCalledWith({ taskIds: [1, 2], technicianId: "tec1" }),
  );
});

it("still submits a single task and keeps the modal open on a persistence error", async () => {
  const onConfirm = jest.fn().mockRejectedValue(new Error("No se pudo insertar"));
  const screen = await render(
    <AddTaskModal visible onClose={() => {}} onConfirm={onConfirm} equipmentLabel="AC-105" />,
  );

  await selectTechnician(screen);
  await waitFor(() =>
    expect(screen.getByPlaceholderText("Buscar tarea…").props.editable).toBe(true),
  );
  await fireEvent(screen.getByPlaceholderText("Buscar tarea…"), "focus");
  await fireEvent.press(screen.getByText("Limpieza de filtros"));
  await fireEvent.press(screen.getByText("Confirmar"));

  await waitFor(() => expect(screen.getByText("No se pudo insertar")).toBeTruthy());
  expect(screen.getByText("1 tarea seleccionada")).toBeTruthy();
  expect(onConfirm).toHaveBeenCalledWith({ taskIds: [1], technicianId: "tec1" });
});

it("shows a task loading failure and prevents confirmation", async () => {
  (listGeneralTasks as jest.Mock).mockRejectedValue(new Error("offline"));
  const screen = await render(
    <AddTaskModal visible onClose={() => {}} onConfirm={() => {}} equipmentLabel="AC-105" />,
  );

  await waitFor(() => expect(screen.getByText(/No se pudieron cargar las tareas/)).toBeTruthy());
  expect(screen.getByText("Confirmar").parent?.props.accessibilityState?.disabled).toBe(true);
});

it("preserves manual task entry in the multi-task flow", async () => {
  (createGeneralTask as jest.Mock).mockResolvedValue({
    tag_id_tarea: 3,
    tag_nombre_tarea: "Tarea especial",
    tag_estado: "activo",
  });
  const onConfirm = jest.fn().mockResolvedValue(undefined);
  const screen = await render(
    <AddTaskModal visible onClose={() => {}} onConfirm={onConfirm} equipmentLabel="AC-105" />,
  );

  await selectTechnician(screen);
  await waitFor(() =>
    expect(screen.getByPlaceholderText("Buscar tarea…").props.editable).toBe(true),
  );
  await fireEvent.changeText(screen.getByPlaceholderText("Buscar tarea…"), "Tarea especial");
  await fireEvent.press(screen.getByText("➕ Agregar tarea manual:"));
  expect(screen.getByText("1 tarea seleccionada")).toBeTruthy();
  await fireEvent.press(screen.getByText("Confirmar"));

  await waitFor(() =>
    expect(onConfirm).toHaveBeenCalledWith({ taskIds: [3], technicianId: "tec1" }),
  );
  expect(createGeneralTask).toHaveBeenCalledWith({
    name: "Tarea especial",
    description: null,
    estado: "activo",
  });
});
