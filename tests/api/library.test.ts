import { describe, expect, it } from "vitest";
import {
  LIBRARY_KINDS,
  creatorName,
  libraryBase,
  libraryVersions,
} from "@/api/library";

describe("libraryBase", () => {
  it("maps each kind to its API base", () => {
    expect(LIBRARY_KINDS).toEqual(["sensor", "datalogger", "system"]);
    expect(libraryBase("sensor")).toBe("/sensor/libraryConfig");
    expect(libraryBase("datalogger")).toBe("/datalogger/libraryConfig");
    expect(libraryBase("system")).toBe("/configSnapshot/libraryConfig");
  });
});

describe("creatorName", () => {
  it("prefers Creator, then creator", () => {
    expect(creatorName({ Creator: { firstName: "Ada", lastName: "L" } })).toBe(
      "Ada L",
    );
    expect(
      creatorName({ creator: { firstName: "Grace", lastName: "Hopper" } }),
    ).toBe("Grace Hopper");
  });

  it("falls back when missing or blank", () => {
    expect(creatorName({})).toBe("Unknown");
    expect(creatorName({}, "—")).toBe("—");
    expect(creatorName({ Creator: { firstName: "", lastName: "" } })).toBe(
      "Unknown",
    );
    expect(creatorName({ Creator: { firstName: "Ada", lastName: "" } })).toBe(
      "Ada",
    );
  });
});

describe("libraryVersions", () => {
  const version = { version: 1 };
  const base = { id: "1", name: "cfg", createdAt: "2026-01-01T00:00:00Z" };

  it("returns whichever kind-specific list is present", () => {
    expect(
      libraryVersions({ ...base, SensorLibraryConfigVersion: [version] }),
    ).toEqual([version]);
    expect(
      libraryVersions({ ...base, DataloggerLibraryConfigVersion: [version] }),
    ).toEqual([version]);
    expect(
      libraryVersions({ ...base, SystemLibraryConfigVersion: [version] }),
    ).toEqual([version]);
  });

  it("returns an empty list when none are present", () => {
    expect(libraryVersions(base)).toEqual([]);
  });
});
