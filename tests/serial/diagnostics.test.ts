import { describe, expect, it } from "vitest";
import { type SerialConnection, buildDiagnostics, diagnosticsFilename } from "@/serial";

const serial = {
  status: "error",
  error: "Timed out talking to the device. Ensure it is plugged in.",
  info: { serialNumber: "00003", uid: "FF3205DC3737554657137228", codes: [] },
  boardVersion: "dev-209796e-tune",
  datalogger: { mode: "interactive" },
  bootloader: null,
  restart: null,
  firmware: null,
  errorHistory: [
    { at: "2026-10-23T10:00:00.000Z", status: "error", message: "Timed out talking to the device." },
  ],
  transcript: [
    { id: 1, at: "2026-10-23T09:59:58.000Z", direction: "tx", text: '{"object":"device","action":"get"}' },
  ],
} as unknown as SerialConnection;

describe("diagnostics", () => {
  it("collects the connection, the board's reports, errors and the transcript", () => {
    const startup = {
      previousCompleted: false,
      stoppedAt: "i2c2",
      failedStartups: 1,
      resetCause: "watchdog",
      traced: false,
    };
    const bundle = buildDiagnostics(serial, {
      startup,
      port: "RRIV 0483:0029",
      cloud: { stage: "ready", deviceId: "d1" },
    });
    expect(bundle.connection).toEqual({
      status: "error",
      error: "Timed out talking to the device. Ensure it is plugged in.",
      port: "RRIV 0483:0029",
    });
    expect(bundle.board).toMatchObject({ firmware: "dev-209796e-tune", startup });
    expect(bundle.cloud).toEqual({ stage: "ready", deviceId: "d1" });
    expect(bundle.errors).toHaveLength(1);
    // Transcript entries without the page's internal ids.
    expect(bundle.transcript).toEqual([
      { at: "2026-10-23T09:59:58.000Z", direction: "tx", text: '{"object":"device","action":"get"}' },
    ]);
  });

  it("names the file after the board", () => {
    expect(diagnosticsFilename(serial, new Date("2026-10-23T10:00:00.000Z"))).toBe(
      "rriv-diagnostics-00003-2026-10-23T10-00-00-000Z.json",
    );
  });
});
