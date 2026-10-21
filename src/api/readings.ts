import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "./client";

/**
 *
 * `values` keys are NOT uniform across boards — a row is a flat object of
 * whatever channels the device published, plus an ISO `timestamp` injected by
 * the API. Treat every other key as an opaque series name.
 */
export interface Reading {
  timestamp: string;
  [key: string]: unknown;
}

export interface ReadingsRange {
  start: Date;
  end?: Date;
}

export interface ReadingPoint {
  t: number;
  [key: string]: number | null;
}

/**
 * A device's readings in a time range. Access is enforced by rriv-api (own
 * ownership periods, time in a shared context, admins), so periods the user
 * may not see are simply absent. No `limit` is sent: rriv-api's default
 * returns the whole range, up to its cap.
 */
export function useReadings(
  deviceId: string | undefined,
  range: ReadingsRange | null,
  options: { enabled?: boolean } = {},
) {
  const api = useApiClient();
  return useQuery({
    queryKey: [
      "readings",
      deviceId ?? "",
      range?.start.toISOString() ?? null,
      range?.end?.toISOString() ?? null,
    ],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({
        rangeStart: range!.start.toISOString(),
        format: "json",
      });
      if (range!.end) params.set("rangeEnd", range!.end.toISOString());
      return api.get<Reading[]>(
        `/device/${encodeURIComponent(deviceId!)}/readings?${params.toString()}`,
        { signal },
      );
    },
    enabled: Boolean(deviceId && range) && (options.enabled ?? true),
  });
}

/** Keys that hold numeric data (numbers or numeric strings), excluding timestamp. */
export function numericSeriesKeys(readings: Reading[]): string[] {
  const keys = new Set<string>();
  for (const row of readings) {
    for (const [key, value] of Object.entries(row)) {
      if (key === "timestamp") continue;
      if (typeof value === "number" && Number.isFinite(value)) {
        keys.add(key);
      } else if (
        typeof value === "string" &&
        value.trim() !== "" &&
        Number.isFinite(Number(value))
      ) {
        keys.add(key);
      }
    }
  }
  return [...keys].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );
}

/** Normalise rows into chart points, sorted ascending by time, null for gaps. */
export function toChartData(
  readings: Reading[],
  keys: string[],
): ReadingPoint[] {
  return readings
    .map((row) => {
      const t = Date.parse(String(row.timestamp));
      const point: ReadingPoint = { t };
      for (const key of keys) {
        const value = row[key];
        const numeric =
          typeof value === "number" ? value : Number(value as unknown);
        point[key] = Number.isFinite(numeric) ? numeric : null;
      }
      return point;
    })
    .filter((point) => Number.isFinite(point.t))
    .sort((a, b) => a.t - b.t);
}
