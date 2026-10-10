import React from "react";
import { Platform, Text } from "react-native";
import { render, fireEvent } from "@testing-library/react-native";
import { Sigla, withSiglas } from "../../components/Sigla";

describe("Sigla", () => {
  const originalOS = Platform.OS;
  afterEach(() => {
    Platform.OS = originalOS;
  });

  it("on web, shows the meaning from the dictionary on hover and hides it on leave", async () => {
    Platform.OS = "web";
    const { getByText, queryByText } = await render(
      <Text>
        Generar <Sigla>OT</Sigla>
      </Text>,
    );

    // Kept before hovering: while the tooltip shows, its text is nested in
    // the same element, so getByText("OT") no longer matches it exactly.
    const sigla = getByText("OT");
    expect(queryByText("Orden de trabajo")).toBeNull();
    await fireEvent(sigla, "mouseEnter");
    expect(getByText("Orden de trabajo")).toBeTruthy();
    await fireEvent(sigla, "mouseLeave");
    expect(queryByText("Orden de trabajo")).toBeNull();
  });

  it("renders plain text with no hover handlers outside web", async () => {
    Platform.OS = "ios";
    const { getByText } = await render(<Sigla>OT</Sigla>);

    expect(getByText("OT").props.onMouseEnter).toBeUndefined();
  });
});

describe("withSiglas", () => {
  it("wraps known siglas found in free text", () => {
    const parts = withSiglas("Se resolvió sin OT (ajuste menor)");

    expect(Array.isArray(parts)).toBe(true);
    const nodes = parts as React.ReactNode[];
    expect(nodes[0]).toBe("Se resolvió sin ");
    expect(React.isValidElement(nodes[1]) && nodes[1].type).toBe(Sigla);
    expect(nodes[2]).toBe(" (ajuste menor)");
  });

  it("returns the text untouched when there's no sigla, or only as part of a word", () => {
    expect(withSiglas("Duplicada")).toBe("Duplicada");
    expect(withSiglas("OTRO motivo")).toBe("OTRO motivo");
  });
});
