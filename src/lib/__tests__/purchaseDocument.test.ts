import { purchaseDocumentReference } from "../purchaseDocument";

it("shows the selected invoice letter before the point of sale and number", () => {
  expect(
    purchaseDocumentReference({
      co_tipo_comprobante: "factura",
      co_punto_venta: "0002",
      co_nombre: "B-00000111",
    }),
  ).toBe("B-0002-00000111");
});

it("preserves references for older invoices and other document types", () => {
  expect(
    purchaseDocumentReference({
      co_tipo_comprobante: "factura",
      co_punto_venta: "0002",
      co_nombre: "00000111",
    }),
  ).toBe("0002-00000111");
  expect(
    purchaseDocumentReference({
      co_tipo_comprobante: "remito",
      co_punto_venta: null,
      co_nombre: "00000452",
    }),
  ).toBe("00000452");
});
