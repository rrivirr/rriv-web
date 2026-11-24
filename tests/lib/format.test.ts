import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatRelative,
  initials,
} from "@/lib/format";

describe("formatDate", () => {
  it("formats a date and guards empties/invalids", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate("")).toBe("—");
    expect(formatDate("not-a-date")).toBe("—");
    expect(formatDate("2026-01-01T00:00:00.000Z")).toMatch(/2026/);
  });
});

describe("formatRelative", () => {
  it("describes the very recent past as 'now'", () => {
    expect(formatRelative(new Date().toISOString())).toMatch(/now/i);
  });

  it("guards empties/invalids", () => {
    expect(formatRelative(null)).toBe("—");
    expect(formatRelative("nope")).toBe("—");
  });
});

describe("initials", () => {
  it("takes up to two initials", () => {
    expect(initials("Ada Lovelace")).toBe("AL");
    expect(initials("Prince")).toBe("P");
    expect(initials("ada b lovelace")).toBe("AB");
  });

  it("falls back for empty input", () => {
    expect(initials(null)).toBe("?");
    // Whitespace truthy => splits to no parts => empty string.
    expect(initials("   ")).toBe("");
  });
});
