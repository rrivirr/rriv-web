import type { SerialPort } from "./webSerialApi";
import type { SerialTransport } from "./transport";

/** RRIV boards speak at a fixed 115200 8N1, no flow control. */
export const DEFAULT_BAUD_RATE = 115200;

/**
 * {@link SerialTransport} backed by the Web Serial API.
 *
 * The port is opened once and kept open for the lifetime of the connection;
 * reads are framed into lines on `\n`. Only a single consumer may iterate
 * {@link lines}.
 */
export class WebSerialTransport implements SerialTransport {
  readonly label: string;

  private readonly port: SerialPort;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private reader: ReadableStreamDefaultReader<string> | null = null;
  private opened = false;

  constructor(port: SerialPort, label = "RRIV device") {
    this.port = port;
    this.label = label;
  }

  async open(): Promise<void> {
    if (this.opened) return;
    await this.port.open({ baudRate: DEFAULT_BAUD_RATE });
    if (!this.port.writable) {
      await this.port.close().catch(() => undefined);
      throw new Error("Serial port has no writable stream.");
    }
    this.writer = this.port.writable.getWriter();
    this.opened = true;
  }

  async writeLine(line: string): Promise<void> {
    if (!this.writer) throw new Error("Serial port is not open.");
    await this.writer.write(new TextEncoder().encode(`${line}\n`));
  }

  async *lines(): AsyncGenerator<string> {
    if (!this.port.readable) throw new Error("Serial port has no readable stream.");
    const decoder = new TextDecoderStream();
    // The pipe settles when the port closes; we never await it during close()
    // (a torn-down source can leave it pending).
    void this.port.readable.pipeTo(decoder.writable).catch(() => undefined);
    const reader = decoder.readable.getReader();
    this.reader = reader;

    let buffer = "";
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        let index = buffer.indexOf("\n");
        while (index >= 0) {
          yield buffer.slice(0, index).replace(/\r$/, "");
          buffer = buffer.slice(index + 1);
          index = buffer.indexOf("\n");
        }
      }
    } finally {
      this.reader = null;
      try {
        reader.releaseLock();
      } catch {
        // already released by close()
      }
    }
  }

  async close(): Promise<void> {
    this.opened = false;
    try {
      await this.reader?.cancel();
    } catch {
      // reader may already be done
    }
    try {
      this.writer?.releaseLock();
    } catch {
      // writer may already be released
    }
    this.writer = null;
    try {
      await this.port.close();
    } catch {
      // port may already be closed
    }
  }
}
