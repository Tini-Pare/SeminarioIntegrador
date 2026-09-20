import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { RadioGroup, type RadioOption } from "../../components/RadioGroup";

const options: RadioOption<string>[] = [
  { value: "user", label: "Usuario" },
  { value: "technician", label: "Técnico" },
  { value: "admin", label: "Admin" },
];

describe("RadioGroup", () => {
  it("renders all options with labels", async () => {
    const { getByText, getAllByRole } = await render(
      <RadioGroup value="user" onChange={() => {}} options={options} />,
    );

    expect(getByText("Usuario")).toBeTruthy();
    expect(getByText("Técnico")).toBeTruthy();
    expect(getByText("Admin")).toBeTruthy();

    const radios = getAllByRole("radio");
    expect(radios.length).toBe(3);
  });

  it("calls onChange when an option is pressed", async () => {
    const onChange = jest.fn();
    const { getByText } = await render(
      <RadioGroup value="user" onChange={onChange} options={options} />,
    );

    fireEvent.press(getByText("Técnico"));
    expect(onChange).toHaveBeenCalledWith("technician");
  });

  it("does not call onChange when disabled", async () => {
    const onChange = jest.fn();
    const { getByText } = await render(
      <RadioGroup value="user" onChange={onChange} options={options} disabled />,
    );

    fireEvent.press(getByText("Técnico"));
    expect(onChange).not.toHaveBeenCalled();
  });
});
