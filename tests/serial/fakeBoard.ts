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

/** A board in update mode: the bootloader answers only its own commands. */
export function bootloaderBoard(appValid = true): Responder {
  return (command) => {
    if (command.object !== "bootloader") {
      return { status: "error", message: "in bootloader mode", error: "unsupported command" };
    }
    if (command.action === "info") {
      return { bootloader: "rriv", version: "0.1.0", app_valid: appValid };
    }
    if (command.action === "boot") return { message: "booting" };
    return { status: "error", message: "unknown bootloader command", error: "" };
  };
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
