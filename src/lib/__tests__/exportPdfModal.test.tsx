import { fireEvent, render } from "@testing-library/react-native";
import { ExportPdfModal } from "../../components/statistics/ExportPdfModal";
import { exportScope } from "../statisticsPdf";

const BLOCKS = [
  { key: "kpis", label: "Indicadores" },
  { key: "plans", label: "Cumplimiento por plan preventivo" },
];
const PERIOD = { from: "2026-09-01", to: "2026-11-22" };

describe("exportScope", () => {
  it("formats the period like the PDF header, and the OT type only on tabs that use it", () => {
    expect(exportScope("orders", PERIOD, "preventivo")).toEqual({
      period: "01/09/2026 al 22/11/2026",
      type: "Preventivas",
    });
    expect(exportScope("parts", PERIOD, "preventivo")).toEqual({
      period: "01/09/2026 al 22/11/2026",
      type: null,
    });
  });
});

describe("ExportPdfModal", () => {
  function renderModal(typeLabel: string | null, onConfirm = jest.fn()) {
    return render(
      <ExportPdfModal
        visible
        tabLabel="Órdenes de trabajo"
        periodLabel="01/09/2026 al 22/11/2026"
        typeLabel={typeLabel}
        blocks={BLOCKS}
        onClose={jest.fn()}
        onConfirm={onConfirm}
      />,
    );
  }

  it("shows the section, the period and the OT type before exporting", async () => {
    const { getByText } = await renderModal("Preventivas");

    expect(getByText("Órdenes de trabajo")).toBeTruthy();
    expect(getByText("Período: 01/09/2026 al 22/11/2026 · Tipo de OT: Preventivas")).toBeTruthy();
    expect(getByText("Bloques de Órdenes de trabajo a incluir (2 de 2)")).toBeTruthy();
  });

  it("leaves the OT type out on tabs that don't use it", async () => {
    const { getByText, queryByText } = await renderModal(null);

    expect(getByText("Período: 01/09/2026 al 22/11/2026")).toBeTruthy();
    expect(queryByText(/Tipo de OT/)).toBeNull();
  });

  it("still exports only the ticked blocks", async () => {
    const onConfirm = jest.fn();
    const { getByText } = await renderModal(null, onConfirm);

    await fireEvent.press(getByText("Indicadores"));
    await fireEvent.press(getByText("Confirmar"));

    expect(onConfirm).toHaveBeenCalledWith(["plans"]);
  });
});
