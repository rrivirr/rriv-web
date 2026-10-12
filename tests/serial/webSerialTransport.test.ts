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
});
