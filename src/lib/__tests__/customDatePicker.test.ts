import {
  formatAndValidateDateInput,
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

  describe("formatAndValidateDateInput", () => {
    it("allows single digit day 0-3", () => {
      expect(formatAndValidateDateInput("0", "")).toBe("0");
      expect(formatAndValidateDateInput("1", "")).toBe("1");
      expect(formatAndValidateDateInput("2", "")).toBe("2");
      expect(formatAndValidateDateInput("3", "")).toBe("3");
    });

    it("auto-formats day >= 4 with 0 prefix and slash", () => {
      expect(formatAndValidateDateInput("5", "")).toBe("05/");
      expect(formatAndValidateDateInput("9", "")).toBe("09/");
    });

    it("restricts days to 01..31", () => {
      expect(formatAndValidateDateInput("05", "0")).toBe("05/");
      expect(formatAndValidateDateInput("31", "3")).toBe("31/");
      expect(formatAndValidateDateInput("32", "3")).toBeNull();
      expect(formatAndValidateDateInput("00", "0")).toBeNull();
    });

    it("restricts months to 01..12", () => {
      expect(formatAndValidateDateInput("15/0", "15/")).toBe("15/0");
      expect(formatAndValidateDateInput("15/1", "15/")).toBe("15/1");
      expect(formatAndValidateDateInput("15/08", "15/0")).toBe("15/08/");
      expect(formatAndValidateDateInput("15/12", "15/1")).toBe("15/12/");
      expect(formatAndValidateDateInput("15/13", "15/1")).toBeNull();
      expect(formatAndValidateDateInput("15/00", "15/0")).toBeNull();
    });

    it("auto-formats month >= 2 with 0 prefix and slash", () => {
      expect(formatAndValidateDateInput("15/5", "15/")).toBe("15/05/");
    });

    it("rejects invalid calendar dates when full date is entered", () => {
      expect(formatAndValidateDateInput("31/04/2026", "31/04/202")).toBeNull();
      expect(formatAndValidateDateInput("29/02/2025", "29/02/202")).toBeNull();
      expect(formatAndValidateDateInput("29/02/2024", "29/02/202")).toBe("29/02/2024");
    });

    it("enforces minDate (cannot type a date earlier than minDate)", () => {
      const minDate = new Date(2026, 4, 15); // 15/05/2026
      expect(formatAndValidateDateInput("14/05/2026", "14/05/202", minDate)).toBeNull();
      expect(formatAndValidateDateInput("01/01/2025", "01/01/202", minDate)).toBeNull();
      expect(formatAndValidateDateInput("15/05/2026", "15/05/202", minDate)).toBe("15/05/2026");
      expect(formatAndValidateDateInput("20/05/2026", "20/05/202", minDate)).toBe("20/05/2026");
    });

    it("enforces maxDate (cannot type a date later than maxDate)", () => {
      const maxDate = new Date(2026, 4, 15); // 15/05/2026
      expect(formatAndValidateDateInput("16/05/2026", "16/05/202", undefined, maxDate)).toBeNull();
      expect(formatAndValidateDateInput("15/05/2026", "15/05/202", undefined, maxDate)).toBe("15/05/2026");
      expect(formatAndValidateDateInput("10/05/2026", "10/05/202", undefined, maxDate)).toBe("10/05/2026");
    });

    it("allows deletion (backspace)", () => {
      expect(formatAndValidateDateInput("15/0", "15/05")).toBe("15/0");
      expect(formatAndValidateDateInput("15", "15/")).toBe("15");
      expect(formatAndValidateDateInput("", "1")).toBe("");
    });
  });
});
