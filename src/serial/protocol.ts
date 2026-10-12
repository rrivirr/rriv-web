import { parseDeviceJson } from "./json";
import type { SerialTransport } from "./transport";

/** A decoded device response (arbitrary JSON object). */
export type SerialRecord = Record<string, unknown>;

export interface SerialClientOptions {
  /** How long to wait for each response line before failing. Default 5000ms. */
  timeoutMs?: number;
  /** How long to wait after a reboot before retrying. Default 1500ms. */
  retryDelayMs?: number;
  /** Total attempts for a command across reboots. Default 3. */
  maxAttempts?: number;
  /**
   * Quiet period before the next command after a timeout, so a reply that
   * arrives late is not mistaken for the next command's. Default 500ms.
   */
  resyncMs?: number;
  /** Called for every line received from the device. */
  onLine?: (line: string) => void;
  /** Called for every line written to the device. */
  onWrite?: (line: string) => void;
}

export class SerialError extends Error {
  readonly response?: SerialRecord;

  constructor(message: string, response?: SerialRecord) {
    super(message);
    this.name = "SerialError";
    this.response = response;
  }
}

export class SerialTimeoutError extends SerialError {
  constructor() {
    super("Timed out talking to the device. Ensure it is plugged in.");
    this.name = "SerialTimeoutError";
  }
}

/**
 * The board crashed (`{"status":"panic",…}`). The firmware then hangs until
 * its watchdog resets it, which drops the USB connection.
 */
export class SerialCrashError extends SerialError {
  constructor(readonly crashMessage: string, response?: SerialRecord) {
    super(
      `The board crashed${crashMessage ? ` (${crashMessage})` : ""} and is restarting. It will reconnect automatically.`,
      response,
    );
    this.name = "SerialCrashError";
  }
}

/** The board rebooted (`datalogger-ready`) mid-command. */
class SerialRestartError extends SerialError {}

export type BoardStatus = { kind: "ready" } | { kind: "panic"; message: string };

/**
 * Recognise the board's unsolicited status lines: `{"status":"datalogger-ready"}`
 * at the end of boot, and `{"status":"panic","message":…}` from the panic handler.
 */
export function parseBoardStatus(line: string): BoardStatus | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{") || !trimmed.includes("status")) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!isRecord(parsed)) return null;
    if (parsed.status === "datalogger-ready") return { kind: "ready" };
    if (typeof parsed.status === "string" && parsed.status.includes("panic")) {
      return {
        kind: "panic",
        message: typeof parsed.message === "string" ? parsed.message : "",
      };
    }
  } catch {
    // The panic handler writes byte by byte; a torn line is just noise.
  }
  return null;
}

interface Waiter {
  resolve: (line: string) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isRecord = (value: unknown): value is SerialRecord =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * The device echoes every command it receives, and that echo contains the
 * `action` key. Skipping lines that mention `action` drops the echo without
 * touching real responses.
 */
const isEcho = (line: string) => line.includes("action");

/**
 * Error text for a failed response. The board reports failures as
 * `{"status":"error","message":"…","error":"…"}` (often with an empty `error`).
 */
function describeFailure(response: SerialRecord, status: unknown): string {
  if (response.status === "error") {
    const message = typeof response.message === "string" ? response.message : "";
    const detail = typeof response.error === "string" ? response.error : "";
    return [message || "Device reported an error", detail].filter(Boolean).join(": ");
  }
  return String(status);
}

/**
 * JSON-lines request/response client for a RRIV board.
 *
 * Faithful to `rriv-ctl-tmp`'s `sendCommands`: one command at a time, echo
 * lines skipped, 5s timeout, `error || status` treated as failure, automatic
 * retry when the board reboots mid-command (`datalogger-ready`), and no retry
 * after a crash (`panic`).
 *
 * Lines are buffered while a command is in flight, so a reply that arrives
 * in the same chunk as its echo is never lost.
 */
export class SerialClient {
  /** Settles when the read loop ends (port closed or device unplugged). */
  readonly closed: Promise<void>;

  private readonly transport: SerialTransport;
  private readonly timeoutMs: number;
  private readonly retryDelayMs: number;
  private readonly maxAttempts: number;
  private readonly resyncMs: number;
  private readonly onLine?: (line: string) => void;
  private readonly onWrite?: (line: string) => void;

  private pending: string[] = [];
  private watchers = new Set<(line: string) => void>();
  private collecting = false;
  private needsResync = false;
  private waiter: Waiter | null = null;
  private loop: Promise<void> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private stopped = false;
  private markClosed!: () => void;

  constructor(transport: SerialTransport, options: SerialClientOptions = {}) {
    this.transport = transport;
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.retryDelayMs = options.retryDelayMs ?? 1500;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.resyncMs = options.resyncMs ?? 500;
    this.onLine = options.onLine;
    this.onWrite = options.onWrite;
    this.closed = new Promise((resolve) => {
      this.markClosed = resolve;
    });
  }

  /** Begin consuming the transport. Idempotent. */
  start(): void {
    if (!this.loop) this.loop = this.readLoop();
  }

  private async readLoop(): Promise<void> {
    try {
      for await (const line of this.transport.lines()) {
        this.onLine?.(line);
        for (const watcher of [...this.watchers]) watcher(line);
        if (!this.collecting) continue;
        if (this.waiter) {
          const waiter = this.waiter;
          this.waiter = null;
          clearTimeout(waiter.timer);
          waiter.resolve(line);
        } else {
          this.pending.push(line);
        }
      }
    } catch {
      // Transport failure: fail the pending request below.
    } finally {
      this.stopped = true;
      this.failWaiter(new SerialError("Serial connection closed."));
      this.markClosed();
    }
  }

  private failWaiter(error: Error): void {
    if (!this.waiter) return;
    const waiter = this.waiter;
    this.waiter = null;
    clearTimeout(waiter.timer);
    waiter.reject(error);
  }

  private nextLine(): Promise<string> {
    const queued = this.pending.shift();
    if (queued !== undefined) return Promise.resolve(queued);
    if (this.stopped) {
      return Promise.reject(new SerialError("Serial connection closed."));
    }
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiter = null;
        reject(new SerialTimeoutError());
      }, this.timeoutMs);
      this.waiter = { resolve, reject, timer };
    });
  }

  /**
   * Resolve `true` when a received line matches `predicate`, or `false` after
   * `timeoutMs` (or when the connection closes). Doesn't consume the line.
   */
  waitForLine(predicate: (line: string) => boolean, timeoutMs: number): Promise<boolean> {
    if (this.stopped) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      const finish = (matched: boolean) => {
        clearTimeout(timer);
        this.watchers.delete(watcher);
        resolve(matched);
      };
      const watcher = (line: string) => {
        if (predicate(line)) finish(true);
      };
      const timer = setTimeout(() => finish(false), timeoutMs);
      this.watchers.add(watcher);
      void this.closed.then(() => finish(false));
    });
  }

  /** Run tasks one at a time, in call order. */
  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task, task);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async writeLine(line: string): Promise<void> {
    this.onWrite?.(line);
    await this.transport.writeLine(line);
  }

  /** Send one command and resolve with its parsed response. Serialized. */
  send(command: SerialRecord): Promise<SerialRecord> {
    return this.exclusive(() => this.request(command, false)) as Promise<SerialRecord>;
  }

  /**
   * Send one command and resolve with the first non-echo line, unparsed and
   * unchecked. For replies that are not valid JSON (e.g. calibration lists)
   * and for the free-form console.
   */
  sendRaw(command: SerialRecord): Promise<string> {
    return this.exclusive(() => this.request(command, true)) as Promise<string>;
  }

  /**
   * Write a command without waiting for a response. Used by streaming modes
   * (e.g. `watch`) that switch the board to a mode where it emits data frames
   * instead of JSON replies.
   */
  write(command: SerialRecord): Promise<void> {
    return this.exclusive(() => this.writeLine(JSON.stringify(command)));
  }

  private async request(
    command: SerialRecord,
    raw: boolean,
  ): Promise<SerialRecord | string> {
    if (this.needsResync) {
      this.needsResync = false;
      await delay(this.resyncMs);
    }
    for (let attempt = 1; ; attempt += 1) {
      this.pending = [];
      this.collecting = true;
      try {
        await this.writeLine(JSON.stringify(command));
        return await this.readReply(raw);
      } catch (error) {
        if (error instanceof SerialRestartError && attempt < this.maxAttempts) {
          await delay(this.retryDelayMs);
          continue;
        }
        if (error instanceof SerialRestartError) {
          throw new SerialError(
            `Device restarted repeatedly (${error.message}).`,
            error.response,
          );
        }
        if (error instanceof SerialTimeoutError) this.needsResync = true;
        throw error;
      } finally {
        this.collecting = false;
        this.pending = [];
      }
    }
  }

  private async readReply(raw: boolean): Promise<SerialRecord | string> {
    for (;;) {
      const trimmed = (await this.nextLine()).trim();
      if (!trimmed || isEcho(trimmed)) continue;
      if (raw) {
        const boardStatus = parseBoardStatus(trimmed);
        if (boardStatus?.kind === "panic") throw new SerialCrashError(boardStatus.message);
        return trimmed;
      }

      let response: unknown;
      try {
        response = parseDeviceJson(trimmed);
      } catch {
        // Non-JSON output (e.g. a watch overflow frame); keep waiting.
        continue;
      }
      if (!isRecord(response)) continue;

      const status = response.error || response.status;
      if (String(status).includes("panic")) {
        // Like rrivctl: never resend after a crash. The command may have been
        // partly applied, and resending could trigger the same crash.
        throw new SerialCrashError(
          typeof response.message === "string" ? response.message : "",
          response,
        );
      }
      if (status === "datalogger-ready") {
        throw new SerialRestartError(String(status), response);
      }
      if (status) {
        throw new SerialError(describeFailure(response, status), response);
      }
      return response;
    }
  }

  /** Stop consuming and close the transport. */
  async stop(): Promise<void> {
    this.stopped = true;
    this.failWaiter(new SerialError("Serial client stopped."));
    try {
      await this.transport.close();
    } finally {
      try {
        await this.loop;
      } catch {
        // read loop already settled
      }
    }
  }
}
