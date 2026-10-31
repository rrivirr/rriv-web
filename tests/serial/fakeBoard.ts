// @ts-expect-error tests run on Node, but its types aren't part of this project
import { createHash } from "node:crypto";
import type { SerialPort } from "@/serial";

type Command = Record<string, unknown>;

/** A reply line (object → JSON, string → raw), or `null` for no reply. */
export type Responder = (command: Command) => Record<string, unknown> | string | null;

/**
 * A Web Serial port backed by a simulated board: it echoes each command (as
 * the firmware does), then answers on the next tick with `respond`.
 */
export function boardPort(
  respond: Responder,
  options: { failOpen?: boolean; info?: { usbVendorId?: number; usbProductId?: number } } = {},
) {
  const encoder = new TextEncoder();
  const written: Command[] = [];
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const readable = new ReadableStream<Uint8Array>({
    start(next) {
      controller = next;
    },
  });
  const safeEnqueue = (chunk: Uint8Array) => {
    try {
      controller.enqueue(chunk);
    } catch {
      // stream already cancelled (connection closed)
    }
  };
  const push = (line: string) => safeEnqueue(encoder.encode(`${line}\n`));
  const writable = new WritableStream<Uint8Array>({
    write(chunk) {
      const line = new TextDecoder().decode(chunk).trim();
      const command = JSON.parse(line) as Command;
      written.push(command);
      push(line);
      const response = respond(command);
      if (response === null) return;
      setTimeout(
        () => push(typeof response === "string" ? response : JSON.stringify(response)),
        0,
      );
    },
  });
  const port = {
    readable,
    writable,
    open: async () => {
      if (options.failOpen) throw new Error("boom");
    },
    close: async () => {},
    getInfo: () => options.info ?? {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  } as unknown as SerialPort;
  /** Simulate pulling the USB cable. */
  const unplug = () => controller.error(new Error("device lost"));
  return { port, push, written, unplug };
}

/** A board with a serial number, firmware, telemeter and datalogger. */
export const defaultBoard: Responder = (command) => {
  const { object, action } = command;
  if (object === "device") {
    return { serial_number: "SN-1", uid: "0123456789ABCDEF01234567", codes: [] };
  }
  if (object === "board" && action === "get") return { message: JSON.stringify({ fv: "1.0.0" }) };
  if (object === "board" && action === "set") return { message: "Epoch set" };
  if (object === "telemeter") return { dev_eui: "D", join_eui: "J" };
  if (object === "datalogger") return { site_name: "SITE-A", mode: "interactive" };
  return {};
};

/**
 * A board in update mode: the bootloader answers only its own commands,
 * including an install (`begin` / `write` / `finish`). `received` collects
 * the written bytes.
 */
export function bootloaderBoard(
  appValid = true,
  options: {
    /** Refuse the image at `finish` (after writing) with this error. */
    refuse?: string;
    /** Refuse its header (the first block), before anything is erased. */
    refuseHeader?: string;
    startupLoop?: Record<string, unknown>;
  } = {},
) {
  let next = 0;
  let size = 0;
  const received: number[] = [];
  const respond: Responder = (command) => {
    if (command.object !== "bootloader") {
      return { status: "error", message: "in bootloader mode", error: "unsupported command" };
    }
    if (command.action === "info") {
      const loop = options.startupLoop ? { startup_loop: options.startupLoop } : {};
      return appValid
        ? { bootloader: "rriv", version: "0.3.0", app_valid: true, app_version: "1.15.0", ...loop }
        : { bootloader: "rriv", version: "0.3.0", app_valid: false, app_error: "no_header" };
    }
    if (command.action === "boot") return { message: "booting" };
    if (command.action === "begin") {
      size = Number(command.size);
      next = 0;
      received.length = 0;
      return { message: "ready", block: 512 };
    }
    if (command.action === "write") {
      if (command.offset !== next) {
        return { status: "error", message: "unexpected offset", error: "", offset: next };
      }
      if (command.offset === 0 && options.refuseHeader) {
        return { status: "error", message: "image refused", error: options.refuseHeader };
      }
      const bytes = Uint8Array.from(atob(String(command.data)), (c) => c.charCodeAt(0));
      received.push(...bytes);
      next += bytes.length;
      return { message: "ok", offset: next };
    }
    if (command.action === "finish") {
      if (next !== size) return { status: "error", message: "image incomplete", error: "", offset: next };
      if (options.refuse) return { status: "error", message: "image refused", error: options.refuse };
      return { message: "installed", app_version: "2.0.0" };
    }
    return { status: "error", message: "unknown bootloader command", error: "" };
  };
  return Object.assign(respond, { received });
}

/** A signed-image file as `rriv_image sign` writes it (fake signature). */
export function signedImage(version: string, appSize: number): Uint8Array {
  const bytes = new Uint8Array(512 + appSize).fill(0xff);
  const view = new DataView(bytes.buffer);
  bytes.set([0x52, 0x52, 0x49, 0x56], 0);
  view.setUint16(4, 1, true);
  view.setUint16(6, 512, true);
  view.setUint32(8, appSize, true);
  view.setUint32(12, 0, true);
  bytes.fill(0, 16, 48);
  bytes.set([...version].map((c) => c.charCodeAt(0)), 16);
  for (let i = 512; i < bytes.length; i += 1) bytes[i] = i % 251;
  bytes.set(createHash("sha256").update(bytes.subarray(512)).digest(), 48);
  return bytes;
}

/** Install a fake `navigator.serial`. Returns a way to fire plug events. */
export function installSerial(ports: SerialPort[], requested?: SerialPort | (() => never)) {
  const listeners = new Map<string, Set<(event: Event) => void>>();
  const requestPort = async () => {
    if (typeof requested === "function") return requested();
    return requested ?? ports[0]!;
  };
  Object.defineProperty(window.navigator, "serial", {
    configurable: true,
    value: {
      getPorts: async () => ports,
      requestPort,
      addEventListener: (type: string, listener: (event: Event) => void) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(listener);
      },
      removeEventListener: (type: string, listener: (event: Event) => void) => {
        listeners.get(type)?.delete(listener);
      },
      dispatchEvent: () => false,
    },
  });
  const fire = (type: "connect" | "disconnect", port: SerialPort) => {
    for (const listener of listeners.get(type) ?? []) {
      listener({ type, target: port } as unknown as Event);
    }
  };
  return { fire };
}

export function uninstallSerial() {
  Reflect.deleteProperty(window.navigator, "serial");
}
