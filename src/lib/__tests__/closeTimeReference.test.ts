import { closeTimeReference, referenceCloseDate } from "../statistics";

const rows = [
  { priority: "medium" as const, start: "2026-10-01", end: "2026-10-03" }, // 2 days
  { priority: "medium" as const, start: "2026-10-01", end: "2026-10-05" }, // 4 days
  { priority: "medium" as const, start: "2026-10-01", end: "2026-10-11" }, // 10 days
  { priority: "high" as const, start: "2026-10-01", end: "2026-10-02" }, // 1 day
];

describe("closeTimeReference", () => {
  it("takes the median days to close of past OTs with the same priority", () => {
    expect(closeTimeReference(rows, "medium")).toEqual({ medianDays: 4, closed: 3 });
    expect(closeTimeReference(rows, "high")).toEqual({ medianDays: 1, closed: 1 });
  });

  it("has no reference when no OT with that priority was closed", () => {
    expect(closeTimeReference(rows, "low")).toEqual({ medianDays: null, closed: 0 });
  });

  it("never counts a negative duration", () => {
    const bad = [{ priority: "low" as const, start: "2026-10-05", end: "2026-10-01" }];
    expect(closeTimeReference(bad, "low")).toEqual({ medianDays: 0, closed: 1 });
  });
});

describe("referenceCloseDate", () => {
  it("adds the median, rounded up to whole days, to today", () => {
    expect(referenceCloseDate("2026-11-22", 4)).toBe("2026-11-26");
    expect(referenceCloseDate("2026-11-22", 2.5)).toBe("2026-11-25");
    expect(referenceCloseDate("2026-11-22", 0)).toBe("2026-11-22");
  });

  it("is empty when there is no reference", () => {
    expect(referenceCloseDate("2026-11-22", null)).toBeNull();
  });
});
