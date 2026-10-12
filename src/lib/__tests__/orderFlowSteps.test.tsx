import React from "react";
import { render } from "@testing-library/react-native";
import { OrderFlowSteps } from "../../components/OrderFlowSteps";

describe("OrderFlowSteps", () => {
  it("marks earlier steps done, this one current and later ones pending", async () => {
    const { getByLabelText } = await render(<OrderFlowSteps stage="orden" />);

    expect(getByLabelText("Paso 1: Solicitud (completo)")).toBeTruthy();
    expect(getByLabelText("Paso 2: Orden de trabajo (actual)")).toBeTruthy();
    expect(getByLabelText("Paso 3: Tareas")).toBeTruthy();
  });

  it("starts at the solicitud with nothing done", async () => {
    const { getByLabelText } = await render(<OrderFlowSteps stage="solicitud" />);

    expect(getByLabelText("Paso 1: Solicitud (actual)")).toBeTruthy();
    expect(getByLabelText("Paso 2: Orden de trabajo")).toBeTruthy();
  });

  it("reaches tareas with both previous steps done", async () => {
    const { getByLabelText } = await render(<OrderFlowSteps stage="tareas" />);

    expect(getByLabelText("Paso 2: Orden de trabajo (completo)")).toBeTruthy();
    expect(getByLabelText("Paso 3: Tareas (actual)")).toBeTruthy();
  });
});
