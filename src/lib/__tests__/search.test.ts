import { includesSearch, normalizeSearch, startsWithSearch } from "../search";

describe("normalizeSearch", () => {
  it("drops case and accents", () => {
    expect(normalizeSearch("Cámara FRIGORÍFICA")).toBe("camara frigorifica");
    expect(normalizeSearch("Reparación ñandú")).toBe("reparacion nandu");
  });
});

describe("startsWithSearch", () => {
  it("only matches at the start of the text", () => {
    expect(startsWithSearch("Aceite por L", "ace")).toBe(true);
    expect(startsWithSearch("Cable de acero para tracción 10mm", "ace")).toBe(false);
    expect(startsWithSearch("Cable de acero", "cable de ac")).toBe(true);
  });

  it("ignores accents and case in the text", () => {
    expect(startsWithSearch("Cámara frigorífica", normalizeSearch("CAMARA"))).toBe(true);
  });

  it("never matches a missing value", () => {
    expect(startsWithSearch(null, "a")).toBe(false);
    expect(startsWithSearch(undefined, "a")).toBe(false);
  });
});

describe("includesSearch", () => {
  it("matches anywhere in the text", () => {
    expect(includesSearch("AC-105", "105")).toBe(true);
    expect(includesSearch("El equipo pierde agua por la junta", "junta")).toBe(true);
    expect(includesSearch("OT-0027", "27")).toBe(true);
  });

  it("ignores accents and case in the text", () => {
    expect(includesSearch("Equipo en reparación", "reparacion")).toBe(true);
  });

  it("never matches a missing value", () => {
    expect(includesSearch(null, "a")).toBe(false);
    expect(includesSearch(undefined, "a")).toBe(false);
  });
});
