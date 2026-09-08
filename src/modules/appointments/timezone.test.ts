import { describe, expect, it } from "vitest";

import { clinicDayRange, clinicToday, localDateTimeToInstant } from "./timezone";

describe("clinic timezone handling", () => {
  it("maps clinic-local midnight boundaries to UTC across DST", () => {
    const range = clinicDayRange("2026-03-08", "America/New_York");
    expect(range.start.toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-03-09T04:00:00.000Z");
    expect(range.end.getTime() - range.start.getTime()).toBe(23 * 60 * 60 * 1000);
  });

  it("keeps a 00:30 appointment on the clinic-local date independently of server timezone", () => {
    const instant = localDateTimeToInstant("2026-09-10", "00:30", "Africa/Casablanca");
    expect(clinicToday(instant, "Africa/Casablanca")).toBe("2026-09-10");
  });

  it("derives clinic-local follow-up dates near UTC midnight", () => {
    const instant = new Date("2026-09-09T23:30:00.000Z");
    expect(clinicToday(instant, "Africa/Casablanca")).toBe("2026-09-10");
    expect(clinicToday(instant, "America/New_York")).toBe("2026-09-09");
  });

  it("rejects a nonexistent DST local time", () => {
    expect(() => localDateTimeToInstant("2026-03-08", "02:30", "America/New_York")).toThrow(
      /does not exist/,
    );
  });
});
