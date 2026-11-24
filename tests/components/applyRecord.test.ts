import { describe, expect, it } from "vitest";
import type { ActiveConfig } from "@/api/types";
import { alreadyRecorded, coveredObjects } from "@/components/connect/applyRecord";

const v2 = { kind: "system" as const, versionId: "v2" };
const info = (versionId: string) => ({
  kind: "system" as const,
  versionId,
  version: 2,
  libraryConfigId: "lib",
  name: "station",
  latestVersion: 2,
  updateAvailable: false,
  changedSettings: 0,
});
const active = (datalogger: string | null, sensors: [string, string | null][]): ActiveConfig => ({
  dataloggerConfig: { config: { site_name: "A" }, source: datalogger ? info(datalogger) : null },
  sensorConfig: sensors.map(([name, version]) => ({
    id: name,
    name,
    config: { type: "ph" },
    source: version ? info(version) : null,
  })),
});

describe("coveredObjects", () => {
  it("lists what each kind of config sets", () => {
    expect(
      coveredObjects({
        kind: "system",
        datalogger: { site_name: "A" },
        sensors: [{ id: "PH01", config: {} }],
      }),
    ).toEqual({ datalogger: true, sensorIds: ["ph01"] });
    expect(coveredObjects({ kind: "datalogger", datalogger: {} })).toEqual({ datalogger: true, sensorIds: [] });
    expect(coveredObjects({ kind: "sensor", sensor: { id: "t1", config: {} } })).toEqual({
      datalogger: false,
      sensorIds: ["t1"],
    });
  });
});

describe("alreadyRecorded", () => {
  const covered = { datalogger: true, sensorIds: ["ph01", "temp01"] };

  it("is true only when every covered object records that version", () => {
    expect(alreadyRecorded(active("v2", [["ph01", "v2"], ["temp01", "v2"]]), covered, v2)).toBe(true);
    expect(alreadyRecorded(active("v1", [["ph01", "v2"], ["temp01", "v2"]]), covered, v2)).toBe(false);
    expect(alreadyRecorded(active("v2", [["ph01", "v2"], ["temp01", null]]), covered, v2)).toBe(false);
    // A covered sensor the cloud doesn't have.
    expect(alreadyRecorded(active("v2", [["ph01", "v2"]]), covered, v2)).toBe(false);
  });

  it("ignores objects the config doesn't cover", () => {
    expect(
      alreadyRecorded(active("v1", [["ph01", "v2"]]), { datalogger: false, sensorIds: ["ph01"] }, v2),
    ).toBe(true);
  });

  it("treats a saved snapshot as recorded when nothing has a library source", () => {
    expect(alreadyRecorded(active(null, [["ph01", null], ["temp01", null]]), covered, null)).toBe(true);
    expect(alreadyRecorded(active("v2", [["ph01", null], ["temp01", null]]), covered, null)).toBe(false);
  });
});
