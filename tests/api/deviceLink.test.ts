import { describe, expect, it } from "vitest";
import {
  bindErrorMessage,
  dataloggerConfigUpload,
  pickDriver,
  sensorConfigUpload,
} from "@/api/deviceLink";
import { ApiError } from "@/api/client";

const target = { deviceId: "d1", contextId: "c1", driverId: "drv" };

describe("deviceLink", () => {
  it("builds sensor uploads like the CLI", () => {
    const body = sensorConfigUpload({ id: "temp01", type: "ds18b20", wait: 5 }, target);
    expect(body).toMatchObject({
      name: "temp01",
      sensorDriverId: "drv",
      deviceId: "d1",
      contextId: "c1",
      singlePropertyChange: false,
      config: { object: "sensor", type: "ds18b20", wait: 5 },
    });
    expect(body.config).not.toHaveProperty("id");
  });

  it("prefers a driver id the board reported", () => {
    const body = sensorConfigUpload({ id: "t", sensorDriverId: "own" }, target);
    expect(body.sensorDriverId).toBe("own");
    expect(body.config).not.toHaveProperty("sensorDriverId");
  });

  it("builds datalogger uploads like the CLI", () => {
    expect(dataloggerConfigUpload({ site_name: "S" }, target)).toMatchObject({
      name: "datalogger",
      dataloggerDriverId: "drv",
      config: { object: "datalogger", site_name: "S" },
    });
  });

  it("uses the first driver, like rrivctl", () => {
    const drivers = [
      { id: "1", name: "generic" },
      { id: "2", name: "DS18B20" },
    ];
    expect(pickDriver(drivers)?.id).toBe("1");
    expect(pickDriver([])).toBeNull();
    expect(pickDriver(undefined)).toBeNull();
  });

  it("explains a board bound to someone else", () => {
    expect(bindErrorMessage(new ApiError(409, "device bound to another user"))).toMatch(
      /another RRIV account/,
    );
    expect(bindErrorMessage(new Error("nope"))).toBe("nope");
  });
});

describe("dataloggerConfigUpload", () => {
  it("uploads what the board reported, unchanged", () => {
    const reported = { site_name: "S", deployment_timestamp: 18, delay_between_bursts: 0 };
    const body = dataloggerConfigUpload(reported, {
      deviceId: "d1",
      contextId: "c1",
      driverId: "drv",
    });
    expect(body.config).toEqual({ ...reported, object: "datalogger" });
  });
});
