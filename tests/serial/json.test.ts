import { describe, expect, it } from "vitest";
import { deviceNumber, isRawNumber, parseDeviceJson } from "@/serial";

describe("device JSON", () => {
  it("keeps integers beyond 2^53 exactly as the device wrote them", () => {
    const parsed = parseDeviceJson('{"deployment_timestamp":18446744073709551615,"n":15}') as Record<
      string,
      unknown
    >;
    expect(isRawNumber(parsed.deployment_timestamp)).toBe(true);
    expect(parsed.n).toBe(15);
    // Round-trips byte for byte, so uploads carry the device's value.
    expect(JSON.stringify(parsed)).toBe('{"deployment_timestamp":18446744073709551615,"n":15}');
  });

  it("leaves floats and safe integers as numbers", () => {
    expect(parseDeviceJson("[1.5, -3, 1e3]")).toEqual([1.5, -3, 1000]);
  });

  it("keeps big integers typed by the user exact", () => {
    expect(JSON.stringify({ t: deviceNumber("18446744073709551615") })).toBe(
      '{"t":18446744073709551615}',
    );
    expect(deviceNumber("42")).toBe(42);
    expect(deviceNumber("2.5")).toBe(2.5);
  });
});
