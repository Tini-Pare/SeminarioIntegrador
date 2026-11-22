import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { GenerateOrderModal } from "../../components/GenerateOrderModal";
import { fromDbDate, getTodayDbDate } from "../../components/CustomDatePicker";
import { listClosedCorrectiveDurations } from "../queries/faults";
import { addDays } from "../statistics";

jest.mock("../queries/faults", () => ({
  listClosedCorrectiveDurations: jest.fn(),
}));

// Three past correctivas de prioridad Media: 2, 4 and 10 days → median 4.
const PAST = [
  { priority: "medium", start: "2026-10-01", end: "2026-10-03" },
  { priority: "medium", start: "2026-10-01", end: "2026-10-05" },
  { priority: "medium", start: "2026-10-01", end: "2026-10-11" },
];

function renderModal(onConfirm = jest.fn()) {
  return render(
    <GenerateOrderModal
      visible={true}
      onClose={jest.fn()}
      onConfirm={onConfirm}
      equipmentLabel="AC-105 · Aire Acondicionado"
    />,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  (listClosedCorrectiveDurations as jest.Mock).mockResolvedValue(PAST);
});

describe("GenerateOrderModal", () => {
  it("asks for the priority and the fecha requerida de cierre, and starts with Confirmar disabled", async () => {
    const onConfirm = jest.fn();
    const { getByText, getAllByRole } = await renderModal(onConfirm);

    expect(getByText("Generar Orden de Trabajo")).toBeTruthy();
    expect(getByText("AC-105 · Aire Acondicionado")).toBeTruthy();
    expect(
      getByText("Al confirmar, se abre la orden para cargar tareas, técnicos y falla genérica."),
    ).toBeTruthy();
    expect(getByText("Prioridad *")).toBeTruthy();
    expect(getByText("Fecha requerida de cierre *")).toBeTruthy();
    expect(getByText("Elegí la prioridad para ver una fecha de referencia.")).toBeTruthy();

    const radios = getAllByRole("radio");
    expect(radios.length).toBe(3);
    expect(radios.every((r) => r.props.accessibilityState.checked === false)).toBe(true);

    await fireEvent.press(getByText("Confirmar"));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("shows the median close time of past OTs with that priority and suggests a date from it", async () => {
    const onConfirm = jest.fn();
    const { getByText } = await renderModal(onConfirm);

    await fireEvent.press(getByText("Media"));

    await waitFor(() =>
      expect(
        getByText(
          "Como referencia: las OT correctivas de prioridad Media se cerraron en una mediana de 4 días (3 cerradas).",
        ),
      ).toBeTruthy(),
    );

    await fireEvent.press(getByText("Confirmar"));

    await waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith({
        priority: "medium",
        requiredCloseDate: addDays(getTodayDbDate(), 4),
      }),
    );
  });

  it("says so when there is no reference, and leaves the date for the admin to pick", async () => {
    const onConfirm = jest.fn();
    const { getByText, getByDisplayValue, queryByDisplayValue } = await renderModal(onConfirm);

    await fireEvent.press(getByText("Alta"));

    await waitFor(() =>
      expect(
        getByText(
          "Todavía no hay OT correctivas cerradas con prioridad Alta para tomar de referencia.",
        ),
      ).toBeTruthy(),
    );
    expect(queryByDisplayValue(fromDbDate(addDays(getTodayDbDate(), 4)))).toBeNull();

    await fireEvent.press(getByText("Confirmar"));
    expect(onConfirm).not.toHaveBeenCalled();

    // Sanity check that the date input is there to fill in by hand.
    expect(getByDisplayValue("")).toBeTruthy();
  });

  it("resets priority and date when the modal is reopened", async () => {
    const onConfirm = jest.fn();
    const { getByText, getAllByRole, rerender } = await renderModal(onConfirm);

    await fireEvent.press(getByText("Alta"));
    await waitFor(() =>
      expect(getAllByRole("radio")[2].props.accessibilityState.checked).toBe(true),
    );

    await rerender(
      <GenerateOrderModal
        visible={false}
        onClose={jest.fn()}
        onConfirm={onConfirm}
        equipmentLabel="AC-105 · Aire Acondicionado"
      />,
    );
    await rerender(
      <GenerateOrderModal
        visible={true}
        onClose={jest.fn()}
        onConfirm={onConfirm}
        equipmentLabel="AC-105 · Aire Acondicionado"
      />,
    );

    await waitFor(() =>
      expect(getAllByRole("radio").every((r) => r.props.accessibilityState.checked === false)).toBe(
        true,
      ),
    );
    expect(getByText("Elegí la prioridad para ver una fecha de referencia.")).toBeTruthy();
  });
});
