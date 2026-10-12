import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { FinishTaskModal } from "../../components/FinishTaskModal";
import * as sparePartsQuery from "../queries/spareParts";

jest.mock("../queries/spareParts", () => ({
  listSpareParts: jest.fn(),
}));

const parts = [
  {
    rep_id: 1,
    rep_nombre: "Cable de acero para tracción 10mm",
    rep_cantidad_actual: 12,
    rep_stock_minimo: 0,
    rep_stock_maximo: null,
    rep_estado: "activo",
  },
  {
    rep_id: 2,
    rep_nombre: "Burlete de goma EPDM 2.0",
    rep_cantidad_actual: 24,
    rep_stock_minimo: 0,
    rep_stock_maximo: null,
    rep_estado: "activo",
  },
  {
    rep_id: 3,
    rep_nombre: "Cámara frigorífica (panel)",
    rep_cantidad_actual: 0,
    rep_stock_minimo: 0,
    rep_stock_maximo: null,
    rep_estado: "activo",
  },
  {
    rep_id: 4,
    rep_nombre: "Repuesto dado de baja",
    rep_cantidad_actual: 5,
    rep_stock_minimo: 0,
    rep_stock_maximo: null,
    rep_estado: "inactivo",
  },
];

async function renderModal(onConfirm = jest.fn()) {
  (sparePartsQuery.listSpareParts as jest.Mock).mockResolvedValue(parts);
  const utils = await render(
    <FinishTaskModal
      visible
      onClose={jest.fn()}
      onConfirm={onConfirm}
      taskName="Revisión de drenaje"
      equipmentLabel="AC-105 · Aire Acondicionado"
    />,
  );
  await waitFor(() => expect(sparePartsQuery.listSpareParts).toHaveBeenCalled());
  return { ...utils, onConfirm };
}

describe("FinishTaskModal", () => {
  beforeEach(() => jest.clearAllMocks());

  it("starts with an empty grid and doesn't list the catalog until + Repuesto", async () => {
    const { getByText, queryByText, queryByPlaceholderText } = await renderModal();

    expect(getByText("REPUESTO")).toBeTruthy();
    expect(getByText("EXISTENCIAS ACTUALES")).toBeTruthy();
    expect(getByText(/No se agregó ningún repuesto/)).toBeTruthy();
    expect(queryByPlaceholderText("Buscar repuesto…")).toBeNull();
    expect(queryByText("Cable de acero para tracción 10mm")).toBeNull();
  });

  it("finishes with no parts when none were added", async () => {
    const { getByText, onConfirm } = await renderModal();

    await fireEvent.press(getByText("Confirmar"));
    expect(onConfirm).toHaveBeenCalledWith([], "");
  });

  it("lists no parts until at least one letter is typed", async () => {
    const { getByText, queryByText, getByPlaceholderText } = await renderModal();

    await fireEvent.press(getByText("+ Repuesto"));
    expect(getByPlaceholderText("Buscar repuesto…")).toBeTruthy();
    expect(queryByText("Cable de acero para tracción 10mm")).toBeNull();
    expect(queryByText("Burlete de goma EPDM 2.0")).toBeNull();

    await fireEvent.changeText(getByPlaceholderText("Buscar repuesto…"), "c");
    expect(getByText("Cable de acero para tracción 10mm")).toBeTruthy();

    // Clearing the box hides the list again.
    await fireEvent.changeText(getByPlaceholderText("Buscar repuesto…"), "");
    expect(queryByText("Cable de acero para tracción 10mm")).toBeNull();
  });

  it("searches ignoring accents, hides inactive parts and blocks out-of-stock ones", async () => {
    const { getByText, queryByText, getByPlaceholderText } = await renderModal();

    await fireEvent.press(getByText("+ Repuesto"));
    await fireEvent.changeText(getByPlaceholderText("Buscar repuesto…"), "repuesto");
    expect(queryByText("Repuesto dado de baja")).toBeNull();

    await fireEvent.changeText(getByPlaceholderText("Buscar repuesto…"), "camara");
    expect(getByText("Cámara frigorífica (panel)")).toBeTruthy();
    expect(getByText("Sin stock")).toBeTruthy();
    expect(queryByText("Cable de acero para tracción 10mm")).toBeNull();

    // Out of stock: picking it does nothing.
    await fireEvent.press(getByText("Cámara frigorífica (panel)"));
    expect(getByPlaceholderText("Buscar repuesto…")).toBeTruthy();

    await fireEvent.changeText(getByPlaceholderText("Buscar repuesto…"), "zzz");
    expect(getByText("Ningún repuesto coincide con la búsqueda.")).toBeTruthy();
  });

  it("adds parts one at a time at the end of the grid and confirms their quantities", async () => {
    const { getByText, getByPlaceholderText, queryByPlaceholderText, getByLabelText, onConfirm } =
      await renderModal();

    await fireEvent.press(getByText("+ Repuesto"));
    await fireEvent.changeText(getByPlaceholderText("Buscar repuesto…"), "cable");
    await fireEvent.press(getByText("Cable de acero para tracción 10mm"));

    // The search closes after picking; the part is now a grid row.
    expect(queryByPlaceholderText("Buscar repuesto…")).toBeNull();
    expect(getByText("Cable de acero para tracción 10mm")).toBeTruthy();
    expect(getByText("12")).toBeTruthy();

    await fireEvent.press(getByText("+ Repuesto"));
    // Already added: no longer offered.
    await fireEvent.changeText(getByPlaceholderText("Buscar repuesto…"), "cable");
    expect(getByText("Ningún repuesto coincide con la búsqueda.")).toBeTruthy();
    await fireEvent.changeText(getByPlaceholderText("Buscar repuesto…"), "burlete");
    await fireEvent.press(getByText("Burlete de goma EPDM 2.0"));

    await fireEvent.changeText(
      getByLabelText("Cantidad usada de Cable de acero para tracción 10mm"),
      "6",
    );
    await fireEvent.changeText(getByLabelText("Cantidad usada de Burlete de goma EPDM 2.0"), "3");
    await fireEvent.press(getByText("Confirmar"));

    expect(onConfirm).toHaveBeenCalledWith(
      [
        { repId: 1, cantidad: 6 },
        { repId: 2, cantidad: 3 },
      ],
      "",
    );
  });

  it("sends the optional diagnóstico trimmed, up to 500 characters", async () => {
    const { getByText, getByLabelText, onConfirm } = await renderModal();

    expect(getByText("Diagnóstico / observaciones (opcional)")).toBeTruthy();
    const input = getByLabelText("Diagnóstico / observaciones");
    expect(input.props.maxLength).toBe(500);

    await fireEvent.changeText(input, "  Burlete gastado, se reemplazó.  ");
    expect(getByText("34/500")).toBeTruthy();
    await fireEvent.press(getByText("Confirmar"));

    expect(onConfirm).toHaveBeenCalledWith([], "Burlete gastado, se reemplazó.");
  });

  it("blocks Confirmar on an empty or over-stock quantity and lets the row be removed", async () => {
    const { getByText, queryByText, getByPlaceholderText, getByLabelText, onConfirm } =
      await renderModal();

    await fireEvent.press(getByText("+ Repuesto"));
    await fireEvent.changeText(getByPlaceholderText("Buscar repuesto…"), "cable");
    await fireEvent.press(getByText("Cable de acero para tracción 10mm"));

    await fireEvent.press(getByText("Confirmar"));
    expect(getByText("Ingresá una cantidad válida.")).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();

    await fireEvent.changeText(
      getByLabelText("Cantidad usada de Cable de acero para tracción 10mm"),
      "13",
    );
    await fireEvent.press(getByText("Confirmar"));
    expect(getByText("No hay stock suficiente (disponible: 12).")).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();

    await fireEvent.press(getByLabelText("Quitar repuesto"));
    expect(queryByText("Cable de acero para tracción 10mm")).toBeNull();
    await fireEvent.press(getByText("Confirmar"));
    expect(onConfirm).toHaveBeenCalledWith([], "");
  });
});
