import {
  isDateOnOrAfter,
  isDateWithinMax,
  isValidDateString,
  parseDateString,
  toDbDate,
} from "../../components/CustomDatePicker";

describe("CustomDatePicker helpers", () => {
  describe("isValidDateString", () => {
    it("returns true for valid dd/mm/aaaa dates", () => {
      expect(isValidDateString("15/01/2026")).toBe(true);
      expect(isValidDateString("29/02/2024")).toBe(true); // leap year
    });

    it("returns false for invalid date strings", () => {
      expect(isValidDateString("")).toBe(false);
      expect(isValidDateString("32/01/2026")).toBe(false);
      expect(isValidDateString("29/02/2025")).toBe(false); // not a leap year
      expect(isValidDateString("15-01-2026")).toBe(false);
      expect(isValidDateString("abc")).toBe(false);
    });
  });

  describe("toDbDate", () => {
    it("converts dd/mm/aaaa to yyyy-mm-dd", () => {
      expect(toDbDate("15/01/2026")).toBe("2026-01-15");
    });
  });

  describe("parseDateString", () => {
    it("parses valid dd/mm/aaaa to Date at 00:00:00", () => {
      const date = parseDateString("15/01/2026");
      expect(date).not.toBeNull();
      expect(date?.getFullYear()).toBe(2026);
      expect(date?.getMonth()).toBe(0);
      expect(date?.getDate()).toBe(15);
    });

    it("returns null for invalid string", () => {
      expect(parseDateString("invalid")).toBeNull();
    });
  });

  describe("isDateWithinMax", () => {
    it("returns true when date is before or equal to maxDate", () => {
      const max = new Date(2026, 0, 15);
      expect(isDateWithinMax("14/01/2026", max)).toBe(true);
      expect(isDateWithinMax("15/01/2026", max)).toBe(true);
    });

    it("returns false when date is after maxDate", () => {
      const max = new Date(2026, 0, 15);
      expect(isDateWithinMax("16/01/2026", max)).toBe(false);
    });
  });

  describe("isDateOnOrAfter", () => {
    it("returns true when date is equal to minDate", () => {
      expect(isDateOnOrAfter("15/01/2026", "15/01/2026")).toBe(true);
    });

    it("returns true when date is after minDate", () => {
      expect(isDateOnOrAfter("16/01/2026", "15/01/2026")).toBe(true);
      expect(isDateOnOrAfter("15/01/2028", "15/01/2026")).toBe(true);
    });

    it("returns false when date is before minDate", () => {
      expect(isDateOnOrAfter("14/01/2026", "15/01/2026")).toBe(false);
      expect(isDateOnOrAfter("01/01/2025", "15/01/2026")).toBe(false);
    });

    it("returns false when either date is invalid", () => {
      expect(isDateOnOrAfter("invalid", "15/01/2026")).toBe(false);
      expect(isDateOnOrAfter("15/01/2026", "invalid")).toBe(false);
    });
  });
});
