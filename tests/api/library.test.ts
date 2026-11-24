import { describe, expect, it } from "vitest";
import {
  LIBRARY_KINDS,
  applyLink,
  applySourceFromSnapshot,
  applySourceFromVersion,
  creatorName,
  libraryBase,
  libraryVersions,
  parseApplyParam,
  savedApplyLink,
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

describe("apply links", () => {
  it("round-trips a library version through the /connect link", () => {
    const link = applyLink("system", "lib1", 2);
    expect(link).toBe("/connect?apply=system%3Alib1%3A2");
    const param = new URLSearchParams(link.split("?")[1]).get("apply");
    expect(parseApplyParam(param)).toEqual({ kind: "system", id: "lib1", version: 2 });
  });

  it("round-trips a saved snapshot, which has no version", () => {
    const link = savedApplyLink("snap1");
    expect(link).toBe("/connect?apply=saved%3Asnap1");
    const param = new URLSearchParams(link.split("?")[1]).get("apply");
    expect(parseApplyParam(param)).toEqual({ kind: "saved", id: "snap1", version: null });
  });

  it("ignores anything that isn't a kind, id and version", () => {
    for (const value of [
      null,
      "",
      "bogus:lib1:2",
      "system:lib1",
      "system:lib1:0",
      "system::2",
      "sensor:x:1.5",
      "saved:",
      "saved:snap1:2",
    ]) {
      expect(parseApplyParam(value)).toBeNull();
    }
  });
});

describe("applySourceFromSnapshot", () => {
  it("applies a saved snapshot as a whole board", () => {
    expect(
      applySourceFromSnapshot({
        DataloggerConfig: [{ id: "d", config: { site_name: "A" } }],
        SensorConfig: [{ id: "s", name: "ph01", config: { type: "ph" } }],
      }),
    ).toEqual({
      kind: "system",
      datalogger: { site_name: "A" },
      sensors: [{ id: "ph01", config: { type: "ph" } }],
    });
  });
});

describe("applySourceFromVersion", () => {
  it("takes a system snapshot's datalogger and sensors, named by their ids", () => {
    expect(
      applySourceFromVersion("system", {
        version: 1,
        ConfigSnapshot: {
          id: "s",
          name: "n",
          DataloggerConfig: [{ id: "d", config: { site_name: "A" } }],
          SensorConfig: [{ id: "c", name: "temp01", config: { type: "ds18b20" } }],
        },
      }),
    ).toEqual({
      kind: "system",
      datalogger: { site_name: "A" },
      sensors: [{ id: "temp01", config: { type: "ds18b20" } }],
    });
  });

  it("uses the saved name as a sensor's id unless another is given", () => {
    const version = {
      version: 1,
      SensorConfig: { id: "c", name: "ph01", config: { type: "ph" } },
    };
    expect(applySourceFromVersion("sensor", version)).toEqual({
      kind: "sensor",
      sensor: { id: "ph01", config: { type: "ph" } },
    });
    expect(applySourceFromVersion("sensor", version, "ph02")).toMatchObject({
      sensor: { id: "ph02" },
    });
  });

  it("is null when the version has no payload", () => {
    expect(applySourceFromVersion("datalogger", { version: 1 })).toBeNull();
    expect(applySourceFromVersion("system", { version: 1 })).toBeNull();
  });
});
