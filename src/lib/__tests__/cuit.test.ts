import { cuitDigits, formatCuit, isValidCuit } from "../cuit";

describe("isValidCuit", () => {
  it("accepts real CUITs with or without separators", () => {
    expect(isValidCuit("20-22725470-0")).toBe(true);
    expect(isValidCuit("27418656293")).toBe(true);
    expect(isValidCuit(" 27 41865629 3 ")).toBe(true);
  });

  it("rejects a wrong check digit", () => {
    expect(isValidCuit("27-41865629-4")).toBe(false);
  });

  it("rejects anything that isn't 11 digits", () => {
    expect(isValidCuit("")).toBe(false);
    expect(isValidCuit("2741865629")).toBe(false);
    expect(isValidCuit("274186562931")).toBe(false);
  });
});

describe("formatCuit", () => {
  it("formats 11 digits as XX-XXXXXXXX-X", () => {
    expect(formatCuit("27418656293")).toBe("27-41865629-3");
    expect(formatCuit("20 22725470 0")).toBe("20-22725470-0");
  });

  it("leaves other input trimmed and untouched", () => {
    expect(formatCuit(" 1234 ")).toBe("1234");
  });
});

describe("cuitDigits", () => {
  it("strips everything but digits", () => {
    expect(cuitDigits("20-22725470-0")).toBe("20227254700");
  });
});
