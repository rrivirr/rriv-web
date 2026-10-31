import type { BootloaderInfo, DeviceInfo, StartupReport } from "./commands";
import type { SerialConnection } from "./useSerialConnection";

/**
 * Everything the page knows about a board connection, in one file a user can
 * attach to a support request: what was sent and received, the errors shown,
 * and what the board reported about itself.
 */
export interface Diagnostics {
  createdAt: string;
  page: string;
  browser: string;
  connection: {
    status: SerialConnection["status"];
    error: string | null;
    port: string | null;
  };
  board: {
    info: DeviceInfo | null;
    firmware: string | null;
    datalogger: SerialConnection["datalogger"];
    bootloader: BootloaderInfo | null;
    startup: StartupReport | null;
    restart: SerialConnection["restart"];
  };
  firmwareInstall: SerialConnection["firmware"];
  cloud: Record<string, unknown>;
  errors: SerialConnection["errorHistory"];
  transcript: { at: string; direction: "tx" | "rx"; text: string }[];
}

export function buildDiagnostics(
  serial: SerialConnection,
  extra: { startup: StartupReport | null; cloud: Record<string, unknown>; port: string | null },
): Diagnostics {
  return {
    createdAt: new Date().toISOString(),
    page: typeof location === "undefined" ? "" : location.href,
    browser: typeof navigator === "undefined" ? "" : navigator.userAgent,
    connection: { status: serial.status, error: serial.error, port: extra.port },
    board: {
      info: serial.info,
      firmware: serial.boardVersion,
      datalogger: serial.datalogger,
      bootloader: serial.bootloader,
      startup: extra.startup,
      restart: serial.restart,
    },
    firmwareInstall: serial.firmware,
    cloud: extra.cloud,
    errors: serial.errorHistory,
    transcript: serial.transcript.map(({ at, direction, text }) => ({ at, direction, text })),
  };
}

/** `rriv-diagnostics-<serial or uid>-<timestamp>.json` */
export function diagnosticsFilename(serial: SerialConnection, at = new Date()) {
  const board = serial.info?.serialNumber || serial.info?.uid || "board";
  const stamp = at.toISOString().replace(/[:.]/g, "-");
  return `rriv-diagnostics-${board}-${stamp}.json`;
}
