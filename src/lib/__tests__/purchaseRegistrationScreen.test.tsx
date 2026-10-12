import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import RegisterPurchaseScreen from "../../app/(app)/purchases/register";
import { registrarCompra } from "../queries/purchases";
import { listSpareParts } from "../queries/spareParts";
import { listSuppliers } from "../queries/suppliers";

jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  router: { canGoBack: () => false, replace: jest.fn() },
  useLocalSearchParams: () => ({}),
}));
jest.mock("../queries/purchases", () => ({ registrarCompra: jest.fn() }));
jest.mock("../queries/spareParts", () => ({ listSpareParts: jest.fn() }));
jest.mock("../queries/suppliers", () => ({ listSuppliers: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  (listSuppliers as jest.Mock).mockResolvedValue([
    { prov_id_proveedor: 3, prov_nombre: "Industrial SRL", prov_cuit: "30-12345678-9" },
  ]);
  (listSpareParts as jest.Mock).mockResolvedValue([
    { rep_id: 7, rep_nombre: "Filtro", rep_estado: "activo" },
  ]);
  (registrarCompra as jest.Mock).mockResolvedValue(42);
});

it("shows one adaptable form without warranty, totals, or incoming units", async () => {
  const screen = await render(<RegisterPurchaseScreen />);
  await waitFor(() => expect(screen.getByText("Tipo de comprobante *")).toBeTruthy());

  expect(screen.getByText("Detalle del comprobante")).toBeTruthy();
  expect(screen.queryByText("Garantía (meses)")).toBeNull();
  expect(screen.queryByText("Total del comprobante:")).toBeNull();
  expect(screen.queryByText("Unidades a ingresar:")).toBeNull();

  await fireEvent.press(screen.getByText("Elegí un tipo"));
  await fireEvent.press(await screen.findByText("Factura"));
  expect(screen.getByText("Tipo de factura *")).toBeTruthy();
  expect(screen.getByText("Punto de venta *")).toBeTruthy();

  await fireEvent.press(screen.getByText("Factura"));
  await fireEvent.press(await screen.findByText("Remito"));
  expect(screen.queryByText("Tipo de factura *")).toBeNull();
  expect(screen.queryByText("Punto de venta *")).toBeNull();
  expect(screen.getByText("Nro. de remito *")).toBeTruthy();

  await fireEvent.press(screen.getByText("+ Agregar línea"));
  expect(screen.getAllByText("Elegí un repuesto")).toHaveLength(2);
});

it("persists the selected invoice letter and unit cost through the existing service", async () => {
  const screen = await render(<RegisterPurchaseScreen />);
  await waitFor(() => expect(screen.getByText("Tipo de comprobante *")).toBeTruthy());

  await fireEvent.press(screen.getByText("Elegí un tipo"));
  await fireEvent.press(await screen.findByText("Factura"));
  await fireEvent.press(screen.getByText("Elegí un proveedor"));
  await fireEvent.press(await screen.findByText("Industrial SRL"));
  expect(screen.getByText("30-12345678-9")).toBeTruthy();

  await fireEvent.press(screen.getByText("Elegí el tipo de factura"));
  await fireEvent.press(await screen.findByText("B"));
  await fireEvent.changeText(screen.getByPlaceholderText("Ej: 0002"), "0002");
  await fireEvent.changeText(screen.getByPlaceholderText("Ej: 00000111"), "00000111");
  await fireEvent.press(screen.getByText("Elegí un repuesto"));
  await fireEvent.press(await screen.findByText("Filtro"));
  await fireEvent.changeText(screen.getByPlaceholderText("0"), "2");
  await fireEvent.changeText(screen.getByPlaceholderText("Ej: 1500"), "1500");
  await fireEvent.press(screen.getByText("Confirmar"));

  await waitFor(() =>
    expect(registrarCompra).toHaveBeenCalledWith(
      expect.objectContaining({
        tipoComprobante: "factura",
        puntoVenta: "0002",
        nombre: "B-00000111",
        proveedorId: 3,
        garantia: null,
        lineas: [{ repId: 7, cantidad: 2, costoUnitario: 1500 }],
      }),
    ),
  );
});
