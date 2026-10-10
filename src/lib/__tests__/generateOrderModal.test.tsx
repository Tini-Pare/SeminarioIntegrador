import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { GenerateOrderModal } from "../../components/GenerateOrderModal";

describe("GenerateOrderModal", () => {
  it("renders with shorter description, required priority label, and disabled confirm button initially", async () => {
    const onConfirm = jest.fn();
    const onClose = jest.fn();

    const { getByText, getAllByRole } = await render(
      <GenerateOrderModal
        visible={true}
        onClose={onClose}
        onConfirm={onConfirm}
        equipmentLabel="AC-105 · Aire Acondicionado"
      />,
    );

    expect(getByText("Generar Orden de Trabajo")).toBeTruthy();
    expect(getByText("AC-105 · Aire Acondicionado")).toBeTruthy();
    expect(
      getByText(
        "Al confirmar, se abre la orden para cargar tareas, técnicos y falla genérica.",
      ),
    ).toBeTruthy();
    expect(getByText("Prioridad *")).toBeTruthy();

    const radios = getAllByRole("radio");
    expect(radios.length).toBe(3);
    expect(radios[0].props.accessibilityState.checked).toBe(false);
    expect(radios[1].props.accessibilityState.checked).toBe(false);
    expect(radios[2].props.accessibilityState.checked).toBe(false);

    // Confirm button is disabled initially
    const confirmBtn = getByText("Confirmar");
    fireEvent.press(confirmBtn);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("enables Confirmar when a priority is selected and submits on confirm", async () => {
    const onConfirm = jest.fn();
    const onClose = jest.fn();

    const { getByText, getAllByRole } = await render(
      <GenerateOrderModal
        visible={true}
        onClose={onClose}
        onConfirm={onConfirm}
        equipmentLabel="AC-105 · Aire Acondicionado"
      />,
    );

    // Select "Media"
    fireEvent.press(getByText("Media"));

    await waitFor(() => {
      const radios = getAllByRole("radio");
      expect(radios[1].props.accessibilityState.checked).toBe(true);
    });

    // Now click confirm
    fireEvent.press(getByText("Confirmar"));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith({ priority: "medium" });
    });
  });

  it("resets selected priority when modal is reopened", async () => {
    const onConfirm = jest.fn();
    const onClose = jest.fn();

    const { getByText, getAllByRole, rerender } = await render(
      <GenerateOrderModal
        visible={true}
        onClose={onClose}
        onConfirm={onConfirm}
        equipmentLabel="AC-105 · Aire Acondicionado"
      />,
    );

    fireEvent.press(getByText("Alta"));

    await waitFor(() => {
      const radios = getAllByRole("radio");
      expect(radios[2].props.accessibilityState.checked).toBe(true);
    });

    // Close and reopen modal
    await rerender(
      <GenerateOrderModal
        visible={false}
        onClose={onClose}
        onConfirm={onConfirm}
        equipmentLabel="AC-105 · Aire Acondicionado"
      />,
    );

    await rerender(
      <GenerateOrderModal
        visible={true}
        onClose={onClose}
        onConfirm={onConfirm}
        equipmentLabel="AC-105 · Aire Acondicionado"
      />,
    );

    await waitFor(() => {
      const radios = getAllByRole("radio");
      expect(radios[0].props.accessibilityState.checked).toBe(false);
      expect(radios[1].props.accessibilityState.checked).toBe(false);
      expect(radios[2].props.accessibilityState.checked).toBe(false);
    });
  });
});
