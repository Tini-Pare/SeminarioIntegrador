import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { SparePartModal } from "../../components/SparePartModal";
import { createSparePart, updateSparePart } from "../queries/spareParts";
import type { Repuesto } from "../../types/database";

jest.mock("../queries/spareParts", () => ({
  createSparePart: jest.fn(),
  updateSparePart: jest.fn(),
}));

const existing: Repuesto = {
  rep_id: 7,
  rep_nombre: "Cable unipolar 2,5 mm",
  rep_cantidad_actual: 40,
  rep_stock_minimo: 10,
  rep_stock_maximo: null,
  rep_estado: "activo",
  rep_unidad: "metro",
};

async function renderModal(sparePart: Repuesto | null = null) {
  const onSaved = jest.fn();
  const utils = await render(
    <SparePartModal visible onClose={jest.fn()} onSaved={onSaved} sparePart={sparePart} />,
  );
  return { ...utils, onSaved };
}

beforeEach(() => {
  jest.clearAllMocks();
  (createSparePart as jest.Mock).mockResolvedValue({ rep_id: 1 });
  (updateSparePart as jest.Mock).mockResolvedValue(undefined);
});

describe("SparePartModal unit", () => {
  it("offers the four units and defaults a new repuesto to unidad", async () => {
    const { getByText, getByPlaceholderText } = await renderModal();

    for (const label of ["Unidad (u)", "Litro (L)", "Kilogramo (kg)", "Metro (m)"]) {
      expect(getByText(label)).toBeTruthy();
    }

    await fireEvent.changeText(getByPlaceholderText("Ej: Filtro de aire 20x25x1"), "Correa A42");
    await fireEvent.changeText(getByPlaceholderText("Ej: 5"), "2");
    await fireEvent.press(getByText("Confirmar"));

    await waitFor(() => expect(createSparePart).toHaveBeenCalled());
    expect((createSparePart as jest.Mock).mock.calls[0][0]).toMatchObject({ unidad: "unidad" });
  });

  it("saves the unit picked for a new repuesto", async () => {
    const { getByText, getByPlaceholderText } = await renderModal();

    await fireEvent.changeText(getByPlaceholderText("Ej: Filtro de aire 20x25x1"), "Aceite 15W40");
    await fireEvent.changeText(getByPlaceholderText("Ej: 5"), "4");
    await fireEvent.press(getByText("Litro (L)"));
    await fireEvent.press(getByText("Confirmar"));

    await waitFor(() => expect(createSparePart).toHaveBeenCalled());
    expect((createSparePart as jest.Mock).mock.calls[0][0]).toEqual({
      name: "Aceite 15W40",
      stockMin: 4,
      stockMax: null,
      estado: "activo",
      unidad: "litro",
    });
  });

  it("shows the unit next to the stock labels", async () => {
    const { getByText } = await renderModal();

    await fireEvent.press(getByText("Kilogramo (kg)"));

    expect(getByText("Stock mínimo (kg)")).toBeTruthy();
    expect(getByText("Stock máximo (kg)")).toBeTruthy();
  });

  it("keeps an existing repuesto's unit when editing", async () => {
    const { getByText } = await renderModal(existing);

    await fireEvent.press(getByText("Confirmar"));

    await waitFor(() => expect(updateSparePart).toHaveBeenCalled());
    expect(updateSparePart).toHaveBeenCalledWith(7, {
      name: "Cable unipolar 2,5 mm",
      stockMin: 10,
      stockMax: null,
      estado: "activo",
      unidad: "metro",
    });
  });
});
