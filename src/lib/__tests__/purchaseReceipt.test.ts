import {
  lineReceiptState,
  lineRemaining,
  purchaseReceiptState,
  receivedQuantities,
} from "../purchaseReceipt";
import type { PurchaseWithDetail } from "../queries/purchases";

function purchase(overrides: Partial<PurchaseWithDetail>): PurchaseWithDetail {
  return {
    co_id_compra: 1,
    prov_id_proveedor: 1,
    co_garantia: null,
    co_nombre: null,
    co_fecha_compra: null,
    co_costo_total: null,
    co_p_id_registrador: null,
    co_tipo_comprobante: "factura",
    co_punto_venta: null,
    proveedores: null,
    linea_compra: [],
    remitos: [],
    ...overrides,
  };
}

function linea(repId: number, cantidad: number) {
  return {
    co_id_compra: 1,
    rep_id: repId,
    lc_nro_linea: 1,
    lc_cantidad: cantidad,
    lc_costo_unitario: null,
    repuesto: null,
  };
}

function remito(rcId: number, lineas: { rep_id: number; rcl_cantidad: number }[]) {
  return {
    rc_id: rcId,
    co_id_compra: 1,
    rc_fecha: "2026-09-01",
    rc_p_id_registrador: null,
    rc_creado_en: "2026-09-01T00:00:00Z",
    lineas: lineas.map((l) => ({ rc_id: rcId, co_id_compra: 1, ...l })),
  };
}

describe("lineReceiptState", () => {
  it("is pendiente when nothing arrived yet", () => {
    expect(lineReceiptState(5, 0)).toBe("pendiente");
  });

  it("is parcial when some but not all arrived", () => {
    expect(lineReceiptState(5, 2)).toBe("parcial");
  });

  it("is completa when everything arrived", () => {
    expect(lineReceiptState(5, 5)).toBe("completa");
  });

  it("treats overshoot as completa (shouldn't happen given the RPC's cap, but don't crash)", () => {
    expect(lineReceiptState(5, 6)).toBe("completa");
  });
});

describe("lineRemaining", () => {
  it("returns the gap between facturado and recibido", () => {
    expect(lineRemaining(5, 2)).toBe(3);
  });

  it("never goes negative", () => {
    expect(lineRemaining(5, 8)).toBe(0);
  });
});

describe("receivedQuantities", () => {
  it("sums every remito's lines per repuesto across remitos", () => {
    const p = purchase({
      remitos: [
        remito(1, [{ rep_id: 7, rcl_cantidad: 2 }]),
        remito(2, [{ rep_id: 7, rcl_cantidad: 1 }]),
      ],
    });

    expect(receivedQuantities(p).get(7)).toBe(3);
  });
});

describe("purchaseReceiptState", () => {
  it("is always completa for remito/tique purchases (their stock moves in full at registration)", () => {
    const p = purchase({ co_tipo_comprobante: "remito", linea_compra: [linea(7, 5)], remitos: [] });
    expect(purchaseReceiptState(p)).toBe("completa");
  });

  it("is pendiente for a factura with no remitos loaded", () => {
    const p = purchase({ linea_compra: [linea(7, 5)] });
    expect(purchaseReceiptState(p)).toBe("pendiente");
  });

  it("is parcial when at least one line has something received but not everything is complete", () => {
    const p = purchase({
      linea_compra: [linea(7, 5), linea(8, 3)],
      remitos: [remito(1, [{ rep_id: 7, rcl_cantidad: 2 }])],
    });
    expect(purchaseReceiptState(p)).toBe("parcial");
  });

  it("is parcial when one line is fully complete but another is still pendiente", () => {
    const p = purchase({
      linea_compra: [linea(7, 5), linea(8, 3)],
      remitos: [remito(1, [{ rep_id: 7, rcl_cantidad: 5 }])],
    });
    expect(purchaseReceiptState(p)).toBe("parcial");
  });

  it("is completa only when every line is fully received", () => {
    const p = purchase({
      linea_compra: [linea(7, 5), linea(8, 3)],
      remitos: [
        remito(1, [
          { rep_id: 7, rcl_cantidad: 5 },
          { rep_id: 8, rcl_cantidad: 3 },
        ]),
      ],
    });
    expect(purchaseReceiptState(p)).toBe("completa");
  });
});
