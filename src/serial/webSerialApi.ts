/**
 * Minimal types for the Web Serial API.
 *
 * TypeScript's DOM lib does not ship Web Serial types, and we avoid pulling in
 * `@types/w3c-web-serial` for a handful of interfaces. Web Serial is
 * Chromium-only; always feature-detect with {@link isWebSerialSupported}.
 *
 * See https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API
 */

export interface SerialPortInfo {
  usbVendorId?: number;
  usbProductId?: number;
}

export interface SerialOptions {
  baudRate: number;
  dataBits?: number;
  stopBits?: number;
  parity?: "none" | "even" | "odd";
  flowControl?: "none" | "hardware";
}

export interface SerialPort extends EventTarget {
  readonly readable: ReadableStream<Uint8Array> | null;
  readonly writable: WritableStream<Uint8Array> | null;
  open(options: SerialOptions): Promise<void>;
  close(): Promise<void>;
  getInfo(): SerialPortInfo;
  /** Revoke this site's permission for the port (Chromium 103+). */
  forget?(): Promise<void>;
}

export interface SerialPortFilter {
  usbVendorId?: number;
  usbProductId?: number;
}

export interface SerialPortRequestOptions {
  filters?: SerialPortFilter[];
}

export interface Serial extends EventTarget {
  getPorts(): Promise<SerialPort[]>;
  requestPort(options?: SerialPortRequestOptions): Promise<SerialPort>;
}

/** The Web Serial entry point, or `undefined` on unsupported browsers. */
export function getWebSerial(): Serial | undefined {
  if (typeof navigator === "undefined") return undefined;
  return (navigator as Navigator & { serial?: Serial }).serial;
}

/** True when the current browser exposes the Web Serial API (Chromium only). */
export function isWebSerialSupported(): boolean {
  return getWebSerial() !== undefined;
}

/**
 * USB ids the RRIV 0.4.2 board enumerates with (`UsbVidPid(0x0483, 0x29)`,
 * manufacturer "RRIV"). Used to filter the browser's port picker.
 */
export const RRIV_USB_FILTER: SerialPortFilter = {
  usbVendorId: 0x0483,
  usbProductId: 0x0029,
};

/** True when a port reports the RRIV board's USB ids. */
export function isRrivPort(port: SerialPort): boolean {
  const { usbVendorId, usbProductId } = port.getInfo();
  return (
    usbVendorId === RRIV_USB_FILTER.usbVendorId &&
    usbProductId === RRIV_USB_FILTER.usbProductId
  );
}

/** A short, stable label for a port, used in pickers and logs. */
export function describePort(port: SerialPort, index = 0): string {
  const { usbVendorId, usbProductId } = port.getInfo();
  if (usbVendorId === undefined && usbProductId === undefined) {
    return `Serial port ${index + 1}`;
  }
  if (isRrivPort(port)) return `RRIV board ${index + 1}`;
  const hex = (value?: number) =>
    value === undefined ? "????" : value.toString(16).padStart(4, "0");
  return `USB serial ${hex(usbVendorId)}:${hex(usbProductId)}`;
}

/**
 * Revoke every port this site was granted. Web Serial permissions belong to
 * the browser profile, not the signed-in account, so this runs on sign-out to
 * keep the next user from seeing (and one-click connecting to) the previous
 * user's boards. Best effort: never throws.
 */
export async function forgetGrantedPorts(): Promise<void> {
  const serial = getWebSerial();
  if (!serial) return;
  try {
    const ports = await serial.getPorts();
    await Promise.all(ports.map((port) => port.forget?.().catch(() => undefined)));
  } catch {
    // Permissions are a convenience; never block sign-out on them.
  }
}
