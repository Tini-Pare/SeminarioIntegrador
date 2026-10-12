import { comprobanteRef, comprobanteTipoLabel } from "../comprobante";

describe("comprobanteTipoLabel", () => {
  it("adds the letra to a factura", () => {
    expect(comprobanteTipoLabel({ co_tipo_comprobante: "factura", co_letra: "A" })).toBe(
      "Factura A",
    );
    expect(comprobanteTipoLabel({ co_tipo_comprobante: "factura", co_letra: "C" })).toBe(
      "Factura C",
    );
  });

  it("leaves tique/remito without letra", () => {
    expect(comprobanteTipoLabel({ co_tipo_comprobante: "tique", co_letra: null })).toBe("Tique");
    expect(comprobanteTipoLabel({ co_tipo_comprobante: "remito", co_letra: null })).toBe("Remito");
  });

  it("falls back to plain 'Factura' when the letra is missing", () => {
    expect(comprobanteTipoLabel({ co_tipo_comprobante: "factura", co_letra: null })).toBe(
      "Factura",
    );
  });
});

describe("comprobanteRef", () => {
  it("joins punto de venta and número", () => {
    expect(comprobanteRef({ co_punto_venta: "0001", co_nombre: "00024352" })).toBe("0001-00024352");
  });

  it("uses just the número without punto de venta, and null without número", () => {
    expect(comprobanteRef({ co_punto_venta: null, co_nombre: "00024352" })).toBe("00024352");
    expect(comprobanteRef({ co_punto_venta: "0001", co_nombre: null })).toBeNull();
  });
});
