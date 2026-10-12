/**
 * A bidirectional, newline-delimited byte link to a board.
 *
 * The protocol layer ({@link ./protocol}) is written against this interface so
 * it can be unit-tested with an in-memory fake instead of real hardware.
 */
export interface SerialTransport {
  /** Human-readable label for diagnostics (never parsed). */
  readonly label: string;

  /** Open the underlying link. Must be called before read/write. */
  open(): Promise<void>;

  /** Write a single line; a trailing `\n` is appended. */
  writeLine(line: string): Promise<void>;

  /** Yield complete lines (without the trailing newline) until closed. */
  lines(): AsyncIterable<string>;

  /** Release the link. Safe to call more than once. */
  close(): Promise<void>;
}
