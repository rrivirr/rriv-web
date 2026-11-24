import { describe, expect, it, vi } from "vitest";
import {
  type BoardConfig,
  MAX_COMMAND_BYTES,
  type SerialClient,
  SerialError,
  planApply,
  readBoardConfig,
  runApplyPlan,
} from "@/serial";

const board = (overrides: Partial<BoardConfig> = {}): BoardConfig => ({
  datalogger: {
    site_name: "SITE-A",
    logger_name: "L1",
    sleep_interval: 15,
    bursts_per_measurement_cycle: 1,
    delay_between_bursts: 0,
    mode: "interactive",
  },
  sensors: [
    { id: "temp01", type: "ds18b20", wait_time: 5 },
    { id: "ph01", type: "ph", wait_time: 1 },
  ],
  ...overrides,
});

describe("planApply", () => {
  it("sends only datalogger settings that differ, under the names set takes", () => {
    const plan = planApply(board(), {
      kind: "datalogger",
      datalogger: {
        object: "datalogger",
        site_name: "SITE-A",
        sleep_interval: 30,
        bursts_per_measurement_cycle: 3,
      },
    });
    expect(plan.problems).toEqual([]);
    expect(plan.steps).toEqual([
      {
        kind: "datalogger-set",
        changes: [
          { key: "sleep_interval", from: 15, to: 30 },
          { key: "bursts_per_measurement_cycle", from: 1, to: 3 },
        ],
        command: { object: "datalogger", action: "set", sleep_interval: 30, bursts_per_cycle: 3 },
        // Checked against the board's reply, which uses get's names.
        requested: { sleep_interval: 30, bursts_per_measurement_cycle: 3 },
      },
    ]);
  });

  it("doesn't send mode or settings the firmware can't set, and says why", () => {
    const plan = planApply(board(), {
      kind: "datalogger",
      datalogger: {
        mode: "field",
        delay_between_bursts: 10,
        deployment_timestamp: 1,
        sleep_interval: 15,
      },
    });
    expect(plan.steps).toEqual([]);
    expect(plan.skipped.map((entry) => entry.key)).toEqual([
      "mode",
      "delay_between_bursts",
      "deployment_timestamp",
    ]);
  });

  it("refuses text the board would truncate", () => {
    const plan = planApply(board(), {
      kind: "datalogger",
      datalogger: { site_name: "a-long-site", deployment_identifier: "0123456789abcdef" },
    });
    expect(plan.problems).toEqual([
      'Datalogger site_name "a-long-site" is 11 bytes; the board keeps at most 8.',
    ]);
  });

  it("replaces the whole board: removals first, then datalogger, then sensors", () => {
    const plan = planApply(board(), {
      kind: "system",
      datalogger: { site_name: "SITE-B" },
      sensors: [
        { id: "TEMP01", config: { object: "sensor", type: "ds18b20", wait_time: 9 } },
        { id: "co2", config: { type: "k30_co2", wait_time: 2 } },
      ],
    });
    expect(plan.problems).toEqual([]);
    expect(plan.steps.map((step) => [step.kind, "id" in step ? step.id : null])).toEqual([
      ["sensor-remove", "ph01"],
      ["datalogger-set", null],
      ["sensor-set", "temp01"],
      ["sensor-add", "co2"],
    ]);
    // Updates never resend the type (the firmware refuses it).
    expect(plan.steps[2]).toMatchObject({
      command: { object: "sensor", action: "set", id: "temp01", wait_time: 9 },
    });
    expect(plan.steps[3]).toMatchObject({
      command: { object: "sensor", action: "set", id: "co2", type: "k30_co2", wait_time: 2 },
    });
  });

  it("removes and re-adds a sensor whose type changes", () => {
    const plan = planApply(board(), {
      kind: "sensor",
      sensor: { id: "ph01", config: { type: "generic_analog", wait_time: 1 } },
    });
    expect(plan.steps).toEqual([
      { kind: "sensor-remove", id: "ph01", type: "ph", reason: "type-changed" },
      {
        kind: "sensor-add",
        id: "ph01",
        type: "generic_analog",
        command: { object: "sensor", action: "set", id: "ph01", type: "generic_analog", wait_time: 1 },
        requested: { wait_time: 1 },
      },
    ]);
  });

  it("leaves other sensors alone for a single-sensor config", () => {
    const plan = planApply(board(), {
      kind: "sensor",
      sensor: { id: "temp01", config: { type: "ds18b20", wait_time: 5 } },
    });
    expect(plan.steps).toEqual([]);
    expect(plan.problems).toEqual([]);
  });

  it("can't add a sensor without a type", () => {
    const plan = planApply(board(), {
      kind: "sensor",
      sensor: { id: "new1", config: { wait_time: 1 } },
    });
    expect(plan.problems).toEqual([
      "Sensor new1 has no type in the config, so it can't be added to the board.",
    ]);
  });

  it("checks ids and command size", () => {
    const plan = planApply(board({ sensors: [] }), {
      kind: "system",
      datalogger: null,
      sensors: [
        { id: "toolong1", config: { type: "ph" } },
        { id: "a", config: { type: "ph" } },
        { id: "A", config: { type: "ph" } },
        { id: "big", config: { type: "ph", note: "x".repeat(MAX_COMMAND_BYTES) } },
      ],
    });
    expect(plan.problems).toEqual([
      'Sensor id "toolong1" is longer than 6 characters.',
      'Sensor id "a" appears more than once in the config.',
      expect.stringMatching(/^Sensor big needs a \d+-byte command; the board accepts at most 499 bytes\.$/),
    ]);
  });
});

describe("readBoardConfig", () => {
  it("reads the datalogger and each sensor's full config", async () => {
    const send = vi.fn(async (command: Record<string, unknown>) => {
      if (command.object === "datalogger") return { site_name: "S" };
      if (command.action === "list") return { sensors: [{ id: "t1", type: "ds18b20" }] };
      return { id: command.id, type: "ds18b20", wait_time: 5 };
    });
    const config = await readBoardConfig({ send } as unknown as SerialClient);
    expect(config).toEqual({
      datalogger: { site_name: "S" },
      sensors: [{ id: "t1", type: "ds18b20", wait_time: 5 }],
    });
  });
});

describe("runApplyPlan", () => {
  const plan = planApply(board(), {
    kind: "system",
    datalogger: { site_name: "SITE-B" },
    sensors: [{ id: "temp01", config: { type: "ds18b20", wait_time: 9 } }],
  });

  it("sends each step and flags settings the reply doesn't reflect", async () => {
    const send = vi.fn(async (command: Record<string, unknown>) =>
      command.object === "datalogger" ? { site_name: "SITE-A" } : { ...command },
    );
    const progress = vi.fn();
    const results = await runApplyPlan({ send } as unknown as SerialClient, plan.steps, {
      onProgress: progress,
    });
    expect(send.mock.calls.map(([command]) => command)).toEqual([
      { object: "sensor", action: "remove", id: "ph01" },
      { object: "datalogger", action: "set", site_name: "SITE-B" },
      { object: "sensor", action: "set", id: "temp01", wait_time: 9 },
    ]);
    expect(results.map((result) => result.status)).toEqual(["done", "done", "done"]);
    expect(results[1]).toMatchObject({
      unapplied: [{ key: "site_name", requested: "SITE-B", kept: "SITE-A" }],
    });
    expect(progress).toHaveBeenCalledTimes(3);
  });

  it("stops at a failure, and a retry runs only the rest", async () => {
    let fail = true;
    const send = vi.fn(async (command: Record<string, unknown>) => {
      if (command.object === "datalogger" && fail) throw new SerialError("bad value");
      return { ...command };
    });
    const client = { send } as unknown as SerialClient;
    const first = await runApplyPlan(client, plan.steps);
    expect(first.map((result) => result.status)).toEqual(["done", "failed", "not-run"]);
    expect(first[1]).toEqual({ status: "failed", error: "bad value" });

    fail = false;
    send.mockClear();
    const retried = await runApplyPlan(client, plan.steps, { start: 1, previous: first });
    expect(send).toHaveBeenCalledTimes(2);
    expect(retried.map((result) => result.status)).toEqual(["done", "done", "done"]);
  });
});
