import {
  getSupplierRubro,
  RUBROS_CATALOG,
} from "../../components/PurchaseModal";
import type { SupplierWithRubro } from "../queries/suppliers";

describe("RUBROS_CATALOG", () => {
  it("includes all 19 required standard rubros", () => {
    const expected = [
      "Aberturas y vidriería",
      "Ascensores y montacargas",
      "Autoelevadores y zorras",
      "Balanzas y pesaje",
      "Carros y cestas de compras",
      "Climatización / HVAC",
      "Electricidad",
      "Equipamiento gastronómico",
      "Estanterías y góndolas",
      "Ferretería industrial",
      "Grupos electrógenos",
      "Herrería y cerrajería",
      "Lubricantes y químicos",
      "Pintura y construcción en seco",
      "Plomería y sanitarios",
      "Puntos de venta/cajas",
      "Refrigeración",
      "Seguridad electrónica",
      "Sistemas contra incendios",
    ];

    expect(RUBROS_CATALOG).toHaveLength(19);
    for (const rubro of expected) {
      expect(RUBROS_CATALOG).toContain(rubro);
    }
  });
});

describe("getSupplierRubro", () => {
  it("returns the rubro name when present", () => {
    expect(getSupplierRubro({ rubro: "Electricidad" })).toBe("Electricidad");
    expect(getSupplierRubro({ rubro: " Refrigeración " })).toBe("Refrigeración");
  });

  it("returns 'Sin clasificar' as fallback when rubro is null or empty", () => {
    expect(getSupplierRubro({ rubro: null })).toBe("Sin clasificar");
    expect(getSupplierRubro({ rubro: "" })).toBe("Sin clasificar");
    expect(getSupplierRubro({ rubro: "   " })).toBe("Sin clasificar");
    expect(getSupplierRubro({})).toBe("Sin clasificar");
  });
});

describe("Cascading supplier filtering", () => {
  const suppliers: SupplierWithRubro[] = [
    {
      prov_id_proveedor: 1,
      prov_nombre: "Ferretería Central",
      prov_telefono: null,
      prov_correo: null,
      tp_id: 10,
      rubro: "Ferretería industrial",
    },
    {
      prov_id_proveedor: 2,
      prov_nombre: "Clima Express",
      prov_telefono: null,
      prov_correo: null,
      tp_id: 6,
      rubro: "Climatización / HVAC",
    },
    {
      prov_id_proveedor: 3,
      prov_nombre: "Proveedor Viejo",
      prov_telefono: null,
      prov_correo: null,
      tp_id: 0,
      rubro: null,
    },
  ];

  it("filters suppliers matching selected rubro", () => {
    const ferreteriaSuppliers = suppliers.filter(
      (s) => getSupplierRubro(s) === "Ferretería industrial",
    );
    expect(ferreteriaSuppliers).toHaveLength(1);
    expect(ferreteriaSuppliers[0].prov_nombre).toBe("Ferretería Central");
  });

  it("finds unclassified suppliers under 'Sin clasificar'", () => {
    const unclassifiedSuppliers = suppliers.filter(
      (s) => getSupplierRubro(s) === "Sin clasificar",
    );
    expect(unclassifiedSuppliers).toHaveLength(1);
    expect(unclassifiedSuppliers[0].prov_nombre).toBe("Proveedor Viejo");
  });

  it("returns empty list when no suppliers match chosen rubro", () => {
    const gasSuppliers = suppliers.filter(
      (s) => getSupplierRubro(s) === "Equipamiento gastronómico",
    );
    expect(gasSuppliers).toHaveLength(0);
  });
});
