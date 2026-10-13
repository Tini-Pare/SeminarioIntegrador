import React from "react";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import { SuspendTaskModal } from "../../components/SuspendTaskModal";

describe("SuspendTaskModal", () => {
  function renderModal(onConfirm = jest.fn()) {
    return render(
      <SuspendTaskModal
        visible={true}
        onClose={jest.fn()}
        onConfirm={onConfirm}
        taskName="Cambio de gas"
        equipmentLabel="EX-104 · Isla de Congelados 2"
      />,
    );
  }

  it("renders the reasons with nothing selected and 'Confirmar' disabled", async () => {
    const onConfirm = jest.fn();
    const { getByText, getAllByRole } = await renderModal(onConfirm);

    expect(getByText("Suspender tarea")).toBeTruthy();
    expect(getByText("Cambio de gas · EX-104 · Isla de Congelados 2")).toBeTruthy();
    expect(getByText("Motivo de la suspensión *")).toBeTruthy();

    const radios = getAllByRole("radio");
    expect(radios.length).toBe(5);
    expect(radios.every((r) => !r.props.accessibilityState.checked)).toBe(true);

    const confirmBtn = getByText("Confirmar");
    expect(confirmBtn.parent?.props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(confirmBtn);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("confirms a predefined reason without comment", async () => {
    const onConfirm = jest.fn();
    const { getByText, getAllByRole } = await renderModal(onConfirm);

    await act(async () => {
      fireEvent.press(getAllByRole("radio")[0]); // Falta de repuestos
    });
    await act(async () => {
      fireEvent.press(getByText("Confirmar"));
    });

    expect(onConfirm).toHaveBeenCalledWith({ reason: "Falta de repuestos", comment: undefined });
  });

  it("requires the detail for 'Otro' and sends it trimmed", async () => {
    const onConfirm = jest.fn();
    const { getByText, getAllByRole, getByPlaceholderText } = await renderModal(onConfirm);

    await act(async () => {
      fireEvent.press(getAllByRole("radio")[4]); // Otro
    });

    const confirmBtn = getByText("Confirmar");
    await waitFor(() => {
      expect(getByText("Detalle del motivo *")).toBeTruthy();
      expect(confirmBtn.parent?.props.accessibilityState?.disabled).toBe(true);
    });

    await act(async () => {
      fireEvent.changeText(
        getByPlaceholderText("Explicá brevemente por qué se suspende"),
        "  Falta la llave  ",
      );
    });
    await waitFor(() => {
      expect(confirmBtn.parent?.props.accessibilityState?.disabled).toBe(false);
    });

    await act(async () => {
      fireEvent.press(confirmBtn);
    });
    expect(onConfirm).toHaveBeenCalledWith({ reason: "Otro", comment: "Falta la llave" });
  });

  it("shows the error and stays open when onConfirm fails", async () => {
    const onConfirm = jest.fn().mockRejectedValue(new Error("Esta tarea ya está suspendida."));
    const { getByText, getAllByRole } = await renderModal(onConfirm);

    await act(async () => {
      fireEvent.press(getAllByRole("radio")[1]);
    });
    await act(async () => {
      fireEvent.press(getByText("Confirmar"));
    });

    await waitFor(() => {
      expect(getByText("Esta tarea ya está suspendida.")).toBeTruthy();
    });
  });
});
