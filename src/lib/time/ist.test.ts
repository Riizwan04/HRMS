import { describe, expect, it } from "vitest";
import {
  addDays, addMonths, daysOfMonth, diffDays, formatDate, formatDateTimeIST, formatMonth, formatTimeIST,
  formatRange, isoWeekday, istInstant, istTimeOfDay, isValidDate, monthEnd, monthStart, todayIST, toISTDate, weekdayShort,
} from "./ist";

// These run under several process time zones (npm test); IST results must never depend on them.
describe("IST day boundaries (AR-1)", () => {
  it("23:50 IST is still the same IST day", () => {
    expect(toISTDate("2026-10-16T23:50:00+05:30")).toBe("2026-10-16");
  });
  it("00:05 IST is the next IST day, even though it is still the previous day in UTC", () => {
    expect(toISTDate("2026-10-17T00:05:00+05:30")).toBe("2026-10-17");
    expect(new Date("2026-10-17T00:05:00+05:30").toISOString()).toBe("2026-10-16T18:35:00.000Z");
  });
  it("UTC midnight is 05:30 IST on the same date", () => {
    expect(toISTDate("2026-10-17T00:00:00Z")).toBe("2026-10-17");
    expect(istTimeOfDay("2026-10-17T00:00:00Z")).toBe("05:30:00");
  });
  it("18:29:59 UTC is the last second of the IST day, 18:30:00 UTC starts the next", () => {
    expect(toISTDate("2026-10-08T18:29:59Z")).toBe("2026-10-08");
    expect(toISTDate("2026-10-08T18:30:00Z")).toBe("2026-10-09");
  });
  it("todayIST uses the given instant", () => {
    expect(todayIST(new Date("2026-12-31T19:00:00Z"))).toBe("2027-01-01");
  });
});

describe("Late rule boundary helpers (AR-6)", () => {
  it("time of day keeps seconds so 10:15:00 and 10:15:01 can be told apart", () => {
    expect(istTimeOfDay("2026-10-13T10:15:00+05:30")).toBe("10:15:00");
    expect(istTimeOfDay("2026-10-13T10:15:01+05:30")).toBe("10:15:01");
    expect(istTimeOfDay("2026-10-13T10:15:01+05:30") > "10:15:00").toBe(true);
    expect(istTimeOfDay("2026-10-13T10:15:00+05:30") > "10:15:00").toBe(false);
  });
});

describe("istInstant", () => {
  it("builds an exact instant from an IST wall-clock time", () => {
    expect(istInstant("2026-10-14", "09:55")).toBe("2026-10-14T04:25:00.000Z");
    expect(istInstant("2026-10-14", "18:00:30")).toBe("2026-10-14T12:30:30.000Z");
  });
  it("rejects bad input", () => {
    expect(() => istInstant("2026-13-01", "09:00")).toThrow();
    expect(() => istInstant("2026-10-14", "9am")).toThrow();
  });
});

describe("calendar arithmetic on date strings", () => {
  it("adds days across month, year and leap boundaries", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-10-16", -30)).toBe("2026-09-16");
  });
  it("counts days between dates", () => {
    expect(diffDays("2026-09-16", "2026-10-16")).toBe(30);
    expect(diffDays("2026-10-16", "2026-10-16")).toBe(0);
  });
  it("gives ISO weekdays (Mon=1 .. Sun=7)", () => {
    expect(isoWeekday("2026-10-16")).toBe(5);
    expect(isoWeekday("2026-10-17")).toBe(6);
    expect(isoWeekday("2026-10-18")).toBe(7);
    expect(weekdayShort("2026-10-19")).toBe("Mon");
  });
  it("finds month edges", () => {
    expect(monthStart("2026-10-16")).toBe("2026-10-01");
    expect(monthEnd("2026-10-16")).toBe("2026-10-31");
    expect(monthEnd("2028-02-10")).toBe("2028-02-29");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-01");
    expect(daysOfMonth("2026-09-10")).toHaveLength(30);
  });
  it("validates dates", () => {
    expect(isValidDate("2026-02-29")).toBe(false);
    expect(isValidDate("2028-02-29")).toBe(true);
    expect(isValidDate("16-10-2026")).toBe(false);
  });
});

describe("display formats (always IST)", () => {
  it("formats dates and months", () => {
    expect(formatDate("2026-10-16")).toBe("16 Oct 2026");
    expect(formatMonth("2026-10-16")).toBe("October 2026");
  });
  it("formats times in IST regardless of process zone", () => {
    expect(formatTimeIST("2026-10-16T04:52:00Z")).toBe("10:22 am");
    expect(formatTimeIST("2026-10-16T12:30:00Z")).toBe("6:00 pm");
    expect(formatTimeIST("2026-10-16T18:30:00Z")).toBe("12:00 am");
    expect(formatDateTimeIST("2026-10-16T04:52:00Z")).toBe("Fri 16 Oct 2026, 10:22 am IST");
  });
});

describe("formatRange", () => {
  it("collapses same-day and same-month ranges", () => {
    expect(formatRange("2026-07-10", "2026-07-10")).toBe("10 Jul 2026");
    expect(formatRange("2026-10-22", "2026-10-23")).toBe("22\u201323 Oct 2026");
    expect(formatRange("2026-12-28", "2027-01-02")).toBe("28 Dec 2026 \u2013 2 Jan 2027");
  });
});
