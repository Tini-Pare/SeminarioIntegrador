import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { FormFooter } from "../../components/FormFooter";

describe("FormFooter", () => {
  it("shows Cancelar / Confirmar and calls each handler", async () => {
    const onCancel = jest.fn();
    const onConfirm = jest.fn();
    const { getByText } = await render(<FormFooter onCancel={onCancel} onConfirm={onConfirm} />);

    await fireEvent.press(getByText("Cancelar"));
    await fireEvent.press(getByText("Confirmar"));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("while busy, shows the busy label and blocks both buttons", async () => {
    const onCancel = jest.fn();
    const onConfirm = jest.fn();
    const { getByText, queryByText } = await render(
      <FormFooter onCancel={onCancel} onConfirm={onConfirm} busy busyLabel="Enviando…" />,
    );

    expect(queryByText("Confirmar")).toBeNull();
    await fireEvent.press(getByText("Enviando…"));
    await fireEvent.press(getByText("Cancelar"));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("disabled blocks only Confirmar, cancelDisabled only Cancelar", async () => {
    const onCancel = jest.fn();
    const onConfirm = jest.fn();
    const { getByText, rerender } = await render(
      <FormFooter onCancel={onCancel} onConfirm={onConfirm} disabled />,
    );

    await fireEvent.press(getByText("Confirmar"));
    await fireEvent.press(getByText("Cancelar"));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);

    await rerender(<FormFooter onCancel={onCancel} onConfirm={onConfirm} cancelDisabled />);
    await fireEvent.press(getByText("Cancelar"));
    await fireEvent.press(getByText("Confirmar"));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
