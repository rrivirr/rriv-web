import { describe, expect, it, vi } from "vitest";
import {
  applyInitSettings,
  calibrateCommand,
  changedProps,
  coerceValue,
  unappliedChanges,
  getCommand,
  getDatalogger,
  getSensor,
  isValidUid,
  listSensors,
  parseCalibrationList,
  removeAllSensors,
  setDatalogger,
  readBoardVersion,
  readDevice,
  serialSend,
  readTelemeter,
  setCommand,
  type SerialClient,
} from "@/serial";

function stub(response: Record<string, unknown>) {
  const send = vi.fn(async () => response);
  return { client: { send } as unknown as SerialClient, send };
}

describe("command builders", () => {
  it("builds board gets with a parameter", () => {
    expect(getCommand("board", "version")).toEqual({
      object: "board",
      action: "get",
      parameter: "version",
    });
  });

  it("lower-cases sensor ids and keeps other ids verbatim", () => {
    expect(getCommand("sensor", "TEMP01")).toEqual({
      object: "sensor",
      action: "get",
      id: "temp01",
    });
    expect(getCommand("datalogger", "LOGGER")).toMatchObject({ id: "LOGGER" });
  });

  it("requires a sensor id when setting", () => {
    expect(() => setCommand("sensor", {})).toThrow(/required/i);
  });

  it("rejects over-long sensor ids", () => {
    expect(() => setCommand("sensor", { id: "toolong1" })).toThrow(
      /6 characters/,
    );
  });

  it("merges props with the object for other targets", () => {
    expect(setCommand("datalogger", { site_name: "S" })).toEqual({
      object: "datalogger",
      site_name: "S",
    });
  });
});

describe("response parsing", () => {
  it("maps the device response", async () => {
    const { client } = stub({
      serial_number: "S",
      uid: "U",
      codes: [1, "b"],
    });
    await expect(readDevice(client)).resolves.toEqual({
      serialNumber: "S",
      uid: "U",
      codes: ["1", "b"],
    });
  });

  it("parses the board version message", async () => {
    const { client } = stub({ message: JSON.stringify({ fv: "1.2.3" }) });
    await expect(readBoardVersion(client)).resolves.toBe("1.2.3");
  });

  it("tolerates a non-JSON board version message", async () => {
    const { client } = stub({ message: "nope" });
    await expect(readBoardVersion(client)).resolves.toBeNull();
  });

  it("maps the telemeter EUIs", async () => {
    const { client } = stub({ dev_eui: "D", join_eui: "J" });
    await expect(readTelemeter(client)).resolves.toMatchObject({
      devEui: "D",
      joinEui: "J",
    });
  });

  it("sets epoch and switches to interactive mode", async () => {
    const { client, send } = stub({});
    await applyInitSettings(client, true);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith({
      object: "datalogger",
      action: "set",
      mode: "interactive",
    });
  });

  it("sets only the epoch when not switching mode", async () => {
    const { client, send } = stub({});
    await applyInitSettings(client, false);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("treats an empty serial number as unprovisioned", async () => {
    const { client } = stub({ serial_number: "", uid: "U" });
    await expect(readDevice(client)).resolves.toMatchObject({ serialNumber: null });
  });

  it("asks the telemeter again when it is not ready", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ message: "not joined" })
      .mockResolvedValueOnce({ dev_eui: "D", join_eui: "J" });
    const client = { send } as unknown as SerialClient;
    await expect(readTelemeter(client)).resolves.toMatchObject({ devEui: "D", message: null });
    expect(send).toHaveBeenCalledTimes(2);
  });
});

describe("sensors", () => {
  it("parses the sensor list", async () => {
    const { client } = stub({ sensors: [{ id: "t1", type: "ds18b20" }, { bad: true }] });
    await expect(listSensors(client)).resolves.toEqual([{ id: "t1", type: "ds18b20" }]);
  });

  it("rejects a missing sensor", async () => {
    const { client } = stub({ message: "didn't find the sensor" });
    await expect(getSensor(client, "nope")).rejects.toThrow(/didn't find/);
  });

  it("removes every listed sensor", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ sensors: [{ id: "a", type: "x" }, { id: "b", type: "y" }] })
      .mockResolvedValue({ message: "sensor removed" });
    const client = { send } as unknown as SerialClient;
    await expect(removeAllSensors(client)).resolves.toEqual(["a", "b"]);
    expect(send).toHaveBeenLastCalledWith({ object: "sensor", action: "remove", id: "b" });
  });
});

describe("calibration and serial", () => {
  it("builds calibrate payloads like the CLI", () => {
    expect(calibrateCommand("t1", "point", 4.5)).toEqual({
      object: "sensor",
      action: "calibrate",
      id: "t1",
      subcommand: "point",
      point: 4.5,
    });
    expect(calibrateCommand("t1", "fit")).not.toHaveProperty("point");
    expect(() => calibrateCommand("t1", "point")).toThrow(/point value/);
  });

  it("parses the firmware's non-JSON calibration list", () => {
    expect(
      parseCalibrationList("{ pairs: [{'point': 1.5, 'values': [10,11] },{'point': 7, 'values': [70] }]}"),
    ).toEqual([
      { point: 1.5, values: [10, 11] },
      { point: 7, values: [70] },
    ]);
    expect(parseCalibrationList("{ pairs: []}")).toEqual([]);
    expect(parseCalibrationList("garbage")).toEqual([]);
  });

  it("strips the 0x prefix from hex serial messages", async () => {
    const { client, send } = stub({});
    await serialSend(client, "0xBEEF");
    expect(send).toHaveBeenCalledWith({ object: "serial", action: "send", message: "BEEF" });
  });

  it("coerces CLI-style values", () => {
    expect(coerceValue("true")).toBe(true);
    expect(coerceValue("12")).toBe(12);
    expect(coerceValue("site")).toBe("site");
  });

  it("validates board uids", () => {
    expect(isValidUid("0123456789ABCDEF01234567")).toBe(true);
    expect(isValidUid("xyz")).toBe(false);
  });
});

describe("datalogger pass-through", () => {
  it("sends exactly the given settings and returns the board's reply untouched", async () => {
    const reply = { site_name: "N", bursts_per_measurement_cycle: 1 };
    const { client, send } = stub(reply);
    await expect(
      setDatalogger(client, { site_name: "N", bursts_per_measurement_cycle: 3 }),
    ).resolves.toBe(reply);
    expect(send).toHaveBeenCalledWith({
      object: "datalogger",
      action: "set",
      site_name: "N",
      bursts_per_measurement_cycle: 3,
    });
    const { client: reader } = stub(reply);
    await expect(getDatalogger(reader)).resolves.toBe(reply);
  });
});

describe("change tracking", () => {
  it("lists requested changes the reply doesn't reflect", () => {
    expect(
      unappliedChanges(
        { site_name: "averylongname", sleep_interval: 30, missing: 1 },
        { site_name: "averylon", sleep_interval: 30 },
      ),
    ).toEqual([{ key: "site_name", requested: "averylongname", kept: "averylon" }]);
  });

  it("keeps only properties that differ", () => {
    expect(changedProps({ a: 1, b: "x", c: true }, { a: 1, b: "y", c: true, d: null })).toEqual({
      b: "y",
      d: null,
    });
  });
});
