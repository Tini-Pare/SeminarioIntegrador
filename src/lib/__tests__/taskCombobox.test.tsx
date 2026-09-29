import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { TaskCombobox } from "../../components/TaskCombobox";
import { ThemeProvider } from "../ThemeContext";

describe("TaskCombobox", () => {
  const options = [
    { value: 1, label: "Limpieza de filtros" },
    { value: 2, label: "Revisión general" },
  ];

  it("renders with placeholder and triggers onChangeText on typing", async () => {
    const onChangeText = jest.fn();
    const { getByPlaceholderText } = await render(
      <ThemeProvider>
        <TaskCombobox
          value=""
          onChangeText={onChangeText}
          options={options}
          placeholder="Escribí o elegí una tarea"
        />
      </ThemeProvider>,
    );

    const input = getByPlaceholderText("Escribí o elegí una tarea");
    expect(input).toBeTruthy();

    fireEvent.changeText(input, "Cambio de capacitor");
    expect(onChangeText).toHaveBeenCalledWith("Cambio de capacitor");
  });

  it("shows options when open is true and calls onSelectOption on press", async () => {
    const onSelectOption = jest.fn();
    const onChangeText = jest.fn();
    const { getByText } = await render(
      <ThemeProvider>
        <TaskCombobox
          value=""
          onChangeText={onChangeText}
          options={options}
          onSelectOption={onSelectOption}
          open={true}
          placeholder="Escribí o elegí una tarea"
        />
      </ThemeProvider>,
    );

    const option = getByText("Limpieza de filtros");
    expect(option).toBeTruthy();

    fireEvent.press(option);
    expect(onChangeText).toHaveBeenCalledWith("Limpieza de filtros");
    expect(onSelectOption).toHaveBeenCalledWith({ value: 1, label: "Limpieza de filtros" });
  });

  it("shows manual task option when typed query does not match any catalog task", async () => {
    const { getByText } = await render(
      <ThemeProvider>
        <TaskCombobox
          value="Tarea manual especial"
          onChangeText={() => {}}
          options={options}
          open={true}
          placeholder="Escribí o elegí una tarea"
        />
      </ThemeProvider>,
    );

    expect(getByText("➕ Usar tarea manual:")).toBeTruthy();
    expect(getByText('"Tarea manual especial"')).toBeTruthy();
  });
});
