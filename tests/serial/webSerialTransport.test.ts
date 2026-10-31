import { describe, expect, it } from "vitest";
import { WebSerialTransport, type SerialPort } from "@/serial";

/**
 * A SerialPort whose readable is fed imperatively and whose writable records
 * chunks. Deliberately avoids TransformStream backpressure so tests stay
 * deterministic.
 */
function fakePort() {
  const written: Uint8Array[] = [];
  let push: ((chunk: Uint8Array) => void) | null = null;

  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      push = (chunk) => controller.enqueue(chunk);
    },
  });

  const writable = new WritableStream<Uint8Array>({
    write(chunk) {
      written.push(chunk);
    },
  });

  const port = {
    readable,
    writable,
    open: async () => {},
    close: async () => {},
    getInfo: () => ({ usbVendorId: 0x0483, usbProductId: 0x5740 }),
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  } as unknown as SerialPort;

  return {
    port,
    written,
    feed: (text: string) => push?.(new TextEncoder().encode(text)),
  };
}

async function collect(iterable: AsyncIterable<string>, count: number) {
  const lines: string[] = [];
  for await (const line of iterable) {
    lines.push(line);
    if (lines.length >= count) break;
  }
  return lines;
}

describe("WebSerialTransport", () => {
  it("writes newline-terminated lines and frames reads", async () => {
    const { port, feed, written } = fakePort();
    const transport = new WebSerialTransport(port, "test");
    expect(transport.label).toBe("test");
    await transport.open();

    const linesPromise = collect(transport.lines(), 2);
    await transport.writeLine("hello");
    expect(new TextDecoder().decode(written[0])).toBe("hello\n");

    feed("a\nb\r\n");
    await expect(linesPromise).resolves.toEqual(["a", "b"]);
    await transport.close();
  });

  it("requires open before writing", async () => {
    const { port } = fakePort();
    const transport = new WebSerialTransport(port);
    expect(transport.label).toBe("RRIV device");
    await expect(transport.writeLine("x")).rejects.toThrow(/not open/i);
  });

  it("closes the port for real, so it can be opened again", async () => {
    const port = browserLikePort();
    const transport = new WebSerialTransport(port);
    await transport.open();
    const lines = transport.lines();
    void lines.next();
    await transport.close();
    expect(port.isOpen()).toBe(false);

    const again = new WebSerialTransport(port);
    await expect(again.open()).resolves.toBeUndefined();
    await again.close();
  });

  it("reopens a port an earlier connection left open", async () => {
    const port = browserLikePort();
    await port.open({ baudRate: 115200 });
    const transport = new WebSerialTransport(port);
    await expect(transport.open()).resolves.toBeUndefined();
    expect(port.isOpen()).toBe(true);
    await transport.close();
  });
});

/**
 * A port that behaves like Chrome's: open() fails on an open port, and close()
 * fails while its streams are locked.
 */
function browserLikePort() {
  let open = false;
  let readable: ReadableStream<Uint8Array> | null = null;
  let writable: WritableStream<Uint8Array> | null = null;
  const port = {
    get readable() {
      return readable;
    },
    get writable() {
      return writable;
    },
    open: async () => {
      if (open) throw new DOMException("The port is already open.", "InvalidStateError");
      open = true;
      readable = new ReadableStream<Uint8Array>();
      writable = new WritableStream<Uint8Array>();
    },
    close: async () => {
      if (readable?.locked || writable?.locked) {
        throw new TypeError("Cannot cancel a locked stream");
      }
      open = false;
      readable = null;
      writable = null;
    },
    isOpen: () => open,
    getInfo: () => ({}),
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  };
  return port as unknown as SerialPort & { isOpen: () => boolean };
}
