/**
 * Lossless JSON for device data.
 *
 * The board reports `u64` values (e.g. 18446744073709551615) that a JS number
 * can't hold: plain `JSON.parse` rounds them. Integers beyond 2^53 are kept
 * as `JSON.rawJSON` values instead, which `JSON.stringify` writes back out
 * verbatim. So what the board said is what the page shows and uploads.
 *
 * Needs `JSON.rawJSON` and the reviver's `context.source` (Chromium 114+,
 * Node 21+). Without them this falls back to plain `JSON.parse`.
 */

/** A number kept exactly as the device wrote it. */
export interface RawNumber {
  readonly rawJSON: string;
}

const json = JSON as JSON & {
  rawJSON?: (text: string) => RawNumber;
  isRawJSON?: (value: unknown) => boolean;
};

const INTEGER = /^-?\d+$/;

export const isRawNumber = (value: unknown): value is RawNumber =>
  Boolean(json.isRawJSON?.(value));

/** Parse JSON from (or for) the device without rounding big integers. */
export function parseDeviceJson(text: string): unknown {
  if (!json.rawJSON) return JSON.parse(text);
  const raw = json.rawJSON;
  return JSON.parse(text, (_key: string, value: unknown, context?: { source?: string }) =>
    typeof value === "number" &&
    !Number.isSafeInteger(value) &&
    context?.source &&
    INTEGER.test(context.source)
      ? raw(context.source)
      : value,
  );
}

/** A number typed by the user, kept exact if it's an integer beyond 2^53. */
export function deviceNumber(text: string): number | RawNumber {
  const value = Number(text);
  const trimmed = text.trim();
  return json.rawJSON && INTEGER.test(trimmed) && !Number.isSafeInteger(value)
    ? json.rawJSON(trimmed)
    : value;
}
