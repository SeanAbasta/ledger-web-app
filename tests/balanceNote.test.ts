import { describe, expect, it } from "vitest";
import { balanceNote } from "../src/features/dashboard/balanceNote";

const TODAY = "2026-10-20";

describe("balanceNote", () => {
  it("says nothing on the current month without a filter", () => {
    expect(balanceNote("2026-10-01", TODAY)).toBeUndefined();
  });
  it("names another month and says the rest is today", () => {
    expect(balanceNote("2026-09-01", TODAY)).toBe("Showing Sep 2026. Cards, accounts and owed below show today.");
  });
  it("names a future month the same way", () => {
    expect(balanceNote("2026-11-01", TODAY)).toBe("Showing Nov 2026. Cards, accounts and owed below show today.");
  });
  it("keeps the filter note on the current month", () => {
    expect(balanceNote("2026-10-01", TODAY, "Card A")).toBe("Filtered to Card A. Cards, accounts and owed below show everything.");
  });
  it("names both the filter and the month", () => {
    expect(balanceNote("2026-09-01", TODAY, "Card A")).toBe("Filtered to Card A in Sep 2026. Cards, accounts and owed below show everything, as of today.");
  });
  it("uses the name it is given for No account or removed", () => {
    expect(balanceNote("2026-10-01", TODAY, "No account or removed")).toBe("Filtered to No account or removed. Cards, accounts and owed below show everything.");
  });
  it("treats a month in another year as another month", () => {
    expect(balanceNote("2025-10-01", TODAY)).toBe("Showing Oct 2025. Cards, accounts and owed below show today.");
  });
});
