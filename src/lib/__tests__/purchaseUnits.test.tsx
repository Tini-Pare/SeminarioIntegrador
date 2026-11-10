import { fireEvent, render } from "@testing-library/react-native";
import { PurchaseDetailModal } from "../../components/PurchaseDetailModal";
import { PurchaseOrderDetailModal } from "../../components/PurchaseOrderDetailModal";
import { PurchaseOrderModal } from "../../components/PurchaseOrderModal";
import { RemitoCompraModal } from "../../components/RemitoCompraModal";
import type { PurchaseOrderWithLines } from "../queries/purchaseOrders";
import type { PurchaseWithDetail } from "../queries/purchases";
import type { Repuesto } from "../../types/database";

jest.mock("../queries/purchases", () => ({
  registrarRemitoCompra: jest.fn(),
  editarRemitoCompra: jest.fn(),
}));

jest.mock("../queries/purchaseOrders", () => ({
  createPurchaseOrder: jest.fn(),
  resolvePurchaseOrder: jest.fn(),
}));

jest.mock("../auth", () => ({
  getProfile: jest.fn().mockResolvedValue({ name: "Ana" }),
}));

// A factura with one liquid line (12 L billed, 5 L already received) and one
// line counted in units, so each display shows both symbols.
const purchase = {
  co_id_compra: 1,
  co_tipo_comprobante: "factura",
  co_fecha_compra: "2026-11-01",
  co_costo_total: 0,
  proveedores: { prov_nombre: "ACME", prov_cuit: null },
  linea_compra: [
    {
      co_id_compra: 1,
      rep_id: 7,
      lc_cantidad: 12,
      lc_costo_unitario: null,
      repuesto: { rep_nombre: "Aceite 15W40", rep_unidad: "litro" },
    },
    {
      co_id_compra: 1,
      rep_id: 8,
      lc_cantidad: 3,
      lc_costo_unitario: null,
      repuesto: { rep_nombre: "Correa A42", rep_unidad: "unidad" },
    },
  ],
  remitos: [
    {
      rc_id: 5,
      co_id_compra: 1,
      rc_fecha: "2026-11-02",
      lineas: [{ rc_id: 5, co_id_compra: 1, rep_id: 7, rcl_cantidad: 5 }],
    },
  ],
} as unknown as PurchaseWithDetail;

const order = {
  ped_id_ped_compra: 3,
  ped_estado: "pendiente",
  ped_fecha_solicitud: "2026-11-01",
  ped_observacion: null,
  ped_motivo_rechazo: null,
  linea_pedido: [
    {
      ped_id_ped_compra: 3,
      rep_id: 9,
      lp_cantidad: 25,
      repuesto: { rep_nombre: "Cable unipolar", rep_unidad: "metro" },
    },
  ],
} as unknown as PurchaseOrderWithLines;

const aceite: Repuesto = {
  rep_id: 7,
  rep_nombre: "Aceite 15W40",
  rep_cantidad_actual: 10,
  rep_stock_minimo: 2,
  rep_stock_maximo: null,
  rep_estado: "activo",
  rep_unidad: "litro",
};

describe("purchase flow quantity units", () => {
  it("RemitoCompraModal shows the unit on the pending quantity and next to the input", async () => {
    const { getByText, getAllByText } = await render(
      <RemitoCompraModal visible onClose={jest.fn()} onSaved={jest.fn()} purchase={purchase} />,
    );

    expect(getByText("Pendiente: 7 L")).toBeTruthy();
    expect(getByText("Pendiente: 3 u")).toBeTruthy();
    // Input suffixes: one per pending row.
    expect(getAllByText("L")).toHaveLength(1);
    expect(getAllByText("u")).toHaveLength(1);
  });

  it("PurchaseDetailModal shows the unit next to each line's quantity", async () => {
    const { getByText } = await render(
      <PurchaseDetailModal visible onClose={jest.fn()} purchase={purchase} />,
    );

    expect(getByText("12 L")).toBeTruthy();
    expect(getByText("3 u")).toBeTruthy();
  });

  it("PurchaseOrderDetailModal shows the unit next to each line's quantity", async () => {
    const { getByText } = await render(
      <PurchaseOrderDetailModal
        visible
        onClose={jest.fn()}
        order={order}
        isAdmin={false}
        onChanged={jest.fn()}
        onReject={jest.fn()}
      />,
    );

    expect(getByText("25 m")).toBeTruthy();
  });

  it("PurchaseOrderModal shows the unit next to the quantity only once a repuesto is picked", async () => {
    const { getByText, queryByText } = await render(
      <PurchaseOrderModal
        visible
        onClose={jest.fn()}
        onSaved={jest.fn()}
        spareParts={[aceite]}
        techName="Ana"
      />,
    );

    expect(queryByText("L")).toBeNull();

    await fireEvent.press(getByText("Elegí un repuesto"));
    await fireEvent.press(getByText("Aceite 15W40"));

    expect(getByText("L")).toBeTruthy();
  });
});
