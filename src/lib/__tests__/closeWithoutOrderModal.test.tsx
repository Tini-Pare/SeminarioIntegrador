import React from "react";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import { CloseWithoutOrderModal } from "../../components/CloseWithoutOrderModal";

describe("CloseWithoutOrderModal", () => {
  const equipmentLabel = "EX-104 · Isla de Congelados 2";

  it("renders with title, subtitle, group label, 4 options, and disabled confirm button initially", async () => {
    const onConfirm = jest.fn();
    const onClose = jest.fn();

    const { getByText, getAllByRole, queryByPlaceholderText } = await render(
      <CloseWithoutOrderModal
        visible={true}
        onClose={onClose}
        onConfirm={onConfirm}
        equipmentLabel={equipmentLabel}
      />,
    );

    expect(getByText("Cerrar solicitud sin OT")).toBeTruthy();
    expect(getByText("EX-104 · Isla de Congelados 2")).toBeTruthy();
    expect(getByText("Motivo del cierre *")).toBeTruthy();

    const radios = getAllByRole("radio");
    expect(radios.length).toBe(4);
    expect(radios.every((r) => !r.props.accessibilityState.checked)).toBe(true);

    // Comment textarea is not visible initially
    expect(queryByPlaceholderText("Explicá brevemente el motivo")).toBeNull();

    // Confirm button is disabled initially
    const confirmBtn = getByText("Confirmar");
    expect(confirmBtn.parent?.props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(confirmBtn);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("enables 'Confirmar' for standard reasons and requires comment for 'Otro'", async () => {
    const onConfirm = jest.fn();
    const onClose = jest.fn();

    const { getByText, queryByText, getAllByRole, getByPlaceholderText, queryByPlaceholderText } =
      await render(
        <CloseWithoutOrderModal
          visible={true}
          onClose={onClose}
          onConfirm={onConfirm}
          equipmentLabel={equipmentLabel}
        />,
      );

    // Select "Otro"
    await act(async () => {
      fireEvent.press(getAllByRole("radio")[3]);
    });

    await waitFor(() => {
      expect(getAllByRole("radio")[3].props.accessibilityState.checked).toBe(true);
      expect(getByText("Detalle del motivo *")).toBeTruthy();
      expect(getByPlaceholderText("Explicá brevemente el motivo")).toBeTruthy();
      // Not before the técnico has had a chance to write it.
      expect(queryByText("Escribí el motivo para continuar.")).toBeNull();
    });

    // Confirm button remains disabled with empty comment
    const confirmBtn = getByText("Confirmar");
    expect(confirmBtn.parent?.props.accessibilityState?.disabled).toBe(true);

    // Whitespace only is not valid; the warning shows once the field is left
    const input = getByPlaceholderText("Explicá brevemente el motivo");
    await act(async () => {
      fireEvent.changeText(input, "   ");
      fireEvent(input, "blur");
    });
    expect(getByText("Escribí el motivo para continuar.")).toBeTruthy();
    expect(confirmBtn.parent?.props.accessibilityState?.disabled).toBe(true);

    // Valid text enables button
    await act(async () => {
      fireEvent.changeText(input, "Se resolvió internamente");
    });
    await waitFor(() => {
      expect(confirmBtn.parent?.props.accessibilityState?.disabled).toBe(false);
    });

    // Switch to "Falsa alarma": textarea hides, comment discarded, button stays enabled
    await act(async () => {
      fireEvent.press(getAllByRole("radio")[1]);
    });

    await waitFor(() => {
      expect(queryByPlaceholderText("Explicá brevemente el motivo")).toBeNull();
      expect(getAllByRole("radio")[1].props.accessibilityState.checked).toBe(true);
      expect(confirmBtn.parent?.props.accessibilityState?.disabled).toBe(false);
    });
  });

  it("resets state each time the modal is reopened", async () => {
    const onConfirm = jest.fn();
    const onClose = jest.fn();

    const { getAllByRole, rerender, queryByPlaceholderText } = await render(
      <CloseWithoutOrderModal
        visible={true}
        onClose={onClose}
        onConfirm={onConfirm}
        equipmentLabel={equipmentLabel}
      />,
    );

    await act(async () => {
      fireEvent.press(getAllByRole("radio")[3]); // Otro
    });

    await waitFor(() => {
      expect(getAllByRole("radio")[3].props.accessibilityState.checked).toBe(true);
    });

    // Close and reopen modal
    await rerender(
      <CloseWithoutOrderModal
        visible={false}
        onClose={onClose}
        onConfirm={onConfirm}
        equipmentLabel={equipmentLabel}
      />,
    );

    await rerender(
      <CloseWithoutOrderModal
        visible={true}
        onClose={onClose}
        onConfirm={onConfirm}
        equipmentLabel={equipmentLabel}
      />,
    );

    await waitFor(() => {
      const reopenedRadios = getAllByRole("radio");
      expect(reopenedRadios.every((r) => !r.props.accessibilityState.checked)).toBe(true);
      expect(queryByPlaceholderText("Explicá brevemente el motivo")).toBeNull();
    });
  });
});
