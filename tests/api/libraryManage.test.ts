import { describe, expect, it } from "vitest";
import { publishBody } from "@/api/libraryManage";

const content = {
  datalogger: { site_name: "SITE-A", interval: 15 },
  sensors: [
    { name: "ph01", config: { type: "ph", wait_time: 1 } },
    { name: "temp01", config: { type: "ds18b20" } },
  ],
};

describe("publishBody", () => {
  it("publishes a whole device as a system config", () => {
    expect(
      publishBody({ kind: "system" }, content, { name: "station", firmwareVersion: "1.4.0" }, false),
    ).toEqual({
      name: "station",
      firmwareVersion: "1.4.0",
      datalogger: { site_name: "SITE-A", interval: 15 },
      sensors: [
        { type: "ph", wait_time: 1, name: "ph01" },
        { type: "ds18b20", name: "temp01" },
      ],
    });
  });

  it("publishes the datalogger or one sensor", () => {
    expect(publishBody({ kind: "datalogger" }, content, { name: "dl", description: "base" }, false)).toEqual({
      name: "dl",
      description: "base",
      config: { site_name: "SITE-A", interval: 15 },
    });
    expect(
      publishBody({ kind: "sensor", sensorName: "temp01" }, content, { name: "temp" }, false),
    ).toEqual({ name: "temp", sensorName: "temp01", config: { type: "ds18b20" } });
  });

  it("leaves the name out of a new version", () => {
    expect(
      publishBody({ kind: "datalogger" }, content, { name: "ignored", description: "v2 note" }, true),
    ).toEqual({ description: "v2 note", config: { site_name: "SITE-A", interval: 15 } });
  });

  it("is null when there's nothing of that kind", () => {
    const empty = { datalogger: null, sensors: [] };
    expect(publishBody({ kind: "datalogger" }, empty, {}, false)).toBeNull();
    expect(publishBody({ kind: "system" }, empty, {}, false)).toBeNull();
    expect(publishBody({ kind: "sensor", sensorName: "x" }, content, {}, false)).toBeNull();
  });
});
