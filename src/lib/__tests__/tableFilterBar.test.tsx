import React from "react";
import { StyleSheet } from "react-native";
import { render, fireEvent } from "@testing-library/react-native";
import { TableFilterBar, type FilterDef } from "../../components/TableFilterBar";

function filter(value: string): FilterDef {
  return {
    key: "estado",
    label: "Estado",
    value,
    onChange: jest.fn(),
    options: [
      { value: "", label: "Todos" },
      { value: "pending", label: "Pendiente" },
    ],
  };
}

function textColor(node: { props: Record<string, any> }) {
  return StyleSheet.flatten(node.props.style).color;
}

describe("TableFilterBar", () => {
  it("keeps the button text dark while closed and with no filter applied", async () => {
    const { getByText } = await render(<TableFilterBar filters={[filter("")]} />);

    expect(textColor(getByText("Filtros"))).not.toBe("#fff");
  });

  // Regression: the button turned green on open but its text stayed dark.
  it("turns the button text white as soon as the panel opens", async () => {
    const { getByText } = await render(<TableFilterBar filters={[filter("")]} />);

    await fireEvent.press(getByText("Filtros"));
    expect(textColor(getByText("Filtros"))).toBe("#fff");
  });

  it("keeps the text white with a filter applied and the panel closed", async () => {
    const { getByText } = await render(<TableFilterBar filters={[filter("pending")]} />);

    expect(textColor(getByText("Filtros (1)"))).toBe("#fff");
  });
});
