import { useQuery } from "@tanstack/react-query";
import { ApiError } from "./client";
import { config } from "@/config";

/**
 * A telemetry row from `GET {data-api}/readings/:eui`.
 *
 * `values` keys are NOT uniform across boards — a row is a flat object of
 * whatever channels the device published, plus an ISO `timestamp` injected by
 * the API. Treat every other key as an opaque series name.
 */
export interface Reading {
  timestamp: string;
  [key: string]: unknown;
}

export interface TelemetryRange {
  start: Date;
  end?: Date;
}

export interface TelemetryPoint {
  t: number;
  [key: string]: number | null;
}

const MAX_LIMIT = 100_000; // data-api caps at 100000

async function fetchReadings(
  eui: string,
  range: TelemetryRange,
  signal: AbortSignal,
): Promise<Reading[]> {
  const params = new URLSearchParams({
    rangeStart: range.start.toISOString(),
    format: "json",
    limit: String(MAX_LIMIT),
  });
  if (range.end) params.set("rangeEnd", range.end.toISOString());

  const response = await fetch(
    `${config.dataApiBaseUrl}/readings/${encodeURIComponent(eui)}?${params.toString()}`,
    { signal, headers: { Accept: "application/json" } },
  );

  if (!response.ok) {
    throw new ApiError(
      response.status,
      `Telemetry API responded with ${response.status}`,
    );
  }

  const payload: unknown = await response.json();
  return Array.isArray(payload) ? (payload as Reading[]) : [];
}

/**
 * data-api matches the EUI exactly, but the stored casing varies (device_eui vs
 * the ingest), so try the given value then its lower/upper variants.
 */
async function fetchWithFallback(
  eui: string,
  range: TelemetryRange,
  signal: AbortSignal,
): Promise<{ eui: string; readings: Reading[] }> {
  const variants = Array.from(
    new Set([eui, eui.toLowerCase(), eui.toUpperCase()]),
  );
  for (const variant of variants) {
    const readings = await fetchReadings(variant, range, signal);
    if (readings.length > 0) return { eui: variant, readings };
  }
  return { eui, readings: [] };
}

export function useReadings(
  eui: string | undefined,
  range: TelemetryRange | null,
) {
  return useQuery({
    queryKey: [
      "telemetry",
      eui ?? "",
      range?.start.toISOString() ?? null,
      range?.end?.toISOString() ?? null,
    ],
    queryFn: ({ signal }) => fetchWithFallback(eui!, range!, signal),
    enabled: Boolean(eui && range),
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
  return [...keys].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/** Normalise rows into chart points, sorted ascending by time, null for gaps. */
export function toChartData(
  readings: Reading[],
  keys: string[],
): TelemetryPoint[] {
  return readings
    .map((row) => {
      const t = Date.parse(String(row.timestamp));
      const point: TelemetryPoint = { t };
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
