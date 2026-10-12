import { afterEach, describe, expect, it, vi } from "vitest";
import {
  describePort,
  forgetGrantedPorts,
  getWebSerial,
  isWebSerialSupported,
  type SerialPort,
} from "@/serial";

const port = (info: object) =>
  ({ getInfo: () => info }) as unknown as SerialPort;

afterEach(() => {
  Reflect.deleteProperty(window.navigator, "serial");
});

describe("webSerialApi", () => {
  it("detects support", () => {
    expect(isWebSerialSupported()).toBe(false);
    expect(getWebSerial()).toBeUndefined();
    Object.defineProperty(window.navigator, "serial", {
      configurable: true,
      value: { getPorts: async () => [], requestPort: async () => port({}) },
    });
    expect(isWebSerialSupported()).toBe(true);
    expect(getWebSerial()).toBeDefined();
  });

  it("labels ports with their USB ids or an index", () => {
    expect(describePort(port({ usbVendorId: 0x0483, usbProductId: 0x0029 }), 1)).toBe(
      "RRIV board 2",
    );
    expect(describePort(port({ usbVendorId: 0x0483, usbProductId: 0x5740 }))).toBe(
      "USB serial 0483:5740",
    );
    expect(describePort(port({ usbVendorId: 0x0483 }))).toBe(
      "USB serial 0483:????",
    );
    expect(describePort(port({}), 2)).toBe("Serial port 3");
  });

  it("forgets every granted port, tolerating failures and old browsers", async () => {
    const forgotten = vi.fn(async () => {});
    const failing = vi.fn(async () => {
      throw new Error("nope");
    });
    Object.defineProperty(window.navigator, "serial", {
      configurable: true,
      value: {
        getPorts: async () => [
          { ...port({}), forget: forgotten },
          { ...port({}), forget: failing },
          port({}),
        ],
      },
    });
    await expect(forgetGrantedPorts()).resolves.toBeUndefined();
    expect(forgotten).toHaveBeenCalledOnce();
    expect(failing).toHaveBeenCalledOnce();
  });

  it("does nothing without Web Serial", async () => {
    await expect(forgetGrantedPorts()).resolves.toBeUndefined();
  });
});
