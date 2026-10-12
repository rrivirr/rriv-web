/**
 * Live telemetry over serial.
 *
 * Ports `rriv-ctl-tmp`'s `readSerialUntilQuit`: the board is switched to
 * `watch` mode and then streams newline-delimited data frames. JSON lines are
 * echoes/acks and are skipped; everything else is a frame. The CLI logs each
 * frame as `<ISO timestamp>,<data>` — log files written here keep that shape.
 */

export interface WatchFrame {
  /** ISO-8601 timestamp taken when the frame arrived. */
  receivedAt: string;
  /** The raw frame exactly as received. */
  raw: string;
}

/** Cap the in-memory buffer so a long watch can't exhaust the tab. */
export const MAX_WATCH_FRAMES = 5000;

/** Human-readable label for a frame, mirroring the CLI's `<time>,<data>` log. */
export function frameToLogLine(frame: WatchFrame): string {
  return `${frame.receivedAt},${frame.raw}`;
}

/** Frames in the CLI's log-file format (one `<time>,<data>` line each). */
export function framesToLog(frames: WatchFrame[]): string {
  return frames.map((frame) => `${frameToLogLine(frame)}\n`).join("");
}

const csvCell = (value: string): string =>
  /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

/** Serialise frames to CSV (header + one row per frame). */
export function framesToCsv(frames: WatchFrame[]): string {
  const rows = frames.map(
    (frame) => `${csvCell(frame.receivedAt)},${csvCell(frame.raw)}`,
  );
  return ["received_at,data", ...rows].join("\n") + "\n";
}

/** Trigger a client-side download of a text file. */
export function downloadText(filename: string, text: string, type = "text/plain"): void {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Trigger a client-side download of the CSV. */
export function downloadCsv(filename: string, csv: string): void {
  downloadText(filename, csv, "text/csv");
}

/** The CLI's default watch file name: `<project>_<YYYY-MM-DDTHH:mm>_watch.txt`. */
export function watchFilename(project = "rriv", now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}-${pad(now.getMinutes())}`;
  return `${project}_${stamp}_watch.txt`;
}

/** Where a watch session's frames are persisted as they arrive. */
export interface WatchSink {
  readonly name: string;
  write(frame: WatchFrame): Promise<void>;
  close(): Promise<void>;
}

interface FileHandle {
  name: string;
  createWritable(): Promise<{
    write(data: string): Promise<void>;
    close(): Promise<void>;
  }>;
}

type SaveFilePicker = (options?: {
  suggestedName?: string;
  types?: Array<{ description: string; accept: Record<string, string[]> }>;
}) => Promise<FileHandle>;

const getSaveFilePicker = (): SaveFilePicker | undefined =>
  typeof window === "undefined"
    ? undefined
    : (window as Window & { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;

/** True when the browser can stream a watch straight to a file on disk. */
export function isFileSinkSupported(): boolean {
  return getSaveFilePicker() !== undefined;
}

/**
 * Ask the user where to save, then return a sink that appends each frame in
 * the CLI's log format. Resolves `null` if the user cancels the picker.
 */
export async function openFileSink(suggestedName = watchFilename()): Promise<WatchSink | null> {
  const picker = getSaveFilePicker();
  if (!picker) throw new Error("This browser cannot save directly to a file.");
  let handle: FileHandle;
  try {
    handle = await picker({
      suggestedName,
      types: [{ description: "Watch log", accept: { "text/plain": [".txt", ".csv"] } }],
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") return null;
    throw cause;
  }
  const writable = await handle.createWritable();
  // Writes are chained so frames land in order even when they arrive quickly.
  let chain: Promise<void> = Promise.resolve();
  return {
    name: handle.name,
    write(frame) {
      chain = chain.then(() => writable.write(`${frameToLogLine(frame)}\n`));
      return chain;
    },
    async close() {
      await chain.catch(() => undefined);
      await writable.close();
    },
  };
}
