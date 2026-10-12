import type { SerialTransport } from "@/serial";

/** In-memory {@link SerialTransport} for tests without hardware. */
export class FakeTransport implements SerialTransport {
  readonly label = "fake";
  readonly written: string[] = [];

  private buffer: string[] = [];
  private waiters: Array<(line: string | null) => void> = [];
  private closed = false;

  async open(): Promise<void> {
    // no-op
  }

  async close(): Promise<void> {
    this.closed = true;
    this.flush(null);
  }

  async writeLine(line: string): Promise<void> {
    this.written.push(line);
  }

  push(line: string): void {
    if (this.waiters.length > 0) this.waiters.shift()!(line);
    else this.buffer.push(line);
  }

  private flush(value: string | null): void {
    const waiters = this.waiters;
    this.waiters = [];
    for (const waiter of waiters) waiter(value);
  }

  private next(): Promise<string | null> {
    if (this.buffer.length > 0) return Promise.resolve(this.buffer.shift()!);
    if (this.closed) return Promise.resolve(null);
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  async *lines(): AsyncGenerator<string> {
    for (;;) {
      const line = await this.next();
      if (line === null) return;
      yield line;
    }
  }
}

/**
 * Deliver lines one macrotask apart so the client has registered a waiter for
 * each. Mirrors how a real board answers a command.
 */
export async function deliver(
  transport: FakeTransport,
  lines: string[],
  gapMs = 5,
): Promise<void> {
  for (const line of lines) {
    await new Promise((resolve) => setTimeout(resolve, gapMs));
    transport.push(line);
  }
}
