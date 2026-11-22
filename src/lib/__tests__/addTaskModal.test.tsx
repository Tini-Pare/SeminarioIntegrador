import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { AddTaskModal } from "../../components/AddTaskModal";
import { ThemeProvider } from "../ThemeContext";

jest.mock("../queries/faults", () => ({
  listActiveTaskCountsByTechnician: jest.fn().mockResolvedValue({}),
}));
jest.mock("../queries/profiles", () => ({
  listProfiles: jest.fn().mockResolvedValue([]),
}));
jest.mock("../queries/generalTasks", () => ({
  createGeneralTask: jest.fn(),
  listGeneralTasks: jest.fn().mockResolvedValue([
    {
      tag_id_tarea: 1,
      tag_nombre_tarea: "Limpieza de filtros",
      tag_estado: "activo",
      tag_codigo_sistema: null,
    },
    {
      tag_id_tarea: 2,
      tag_nombre_tarea: "Instalación",
      tag_estado: "activo",
      tag_codigo_sistema: "instalacion",
    },
    {
      tag_id_tarea: 3,
      tag_nombre_tarea: "Tarea vieja",
      tag_estado: "inactivo",
      tag_codigo_sistema: null,
    },
  ]),
}));

describe("AddTaskModal", () => {
  it("only offers active catalog tareas, never the system installation one", async () => {
    const { getByPlaceholderText, findByText, queryByText } = await render(
      <ThemeProvider>
        <AddTaskModal visible onClose={jest.fn()} onConfirm={jest.fn()} equipmentLabel="EX-110" />
      </ThemeProvider>,
    );

    fireEvent(getByPlaceholderText("Escribí o elegí una tarea"), "pressIn");

    expect(await findByText("Limpieza de filtros")).toBeTruthy();
    await waitFor(() => {
      expect(queryByText("Instalación")).toBeNull();
      expect(queryByText("Tarea vieja")).toBeNull();
    });
  });
});
