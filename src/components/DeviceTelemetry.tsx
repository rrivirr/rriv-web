import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { IconActivity, IconAlert, IconRefresh } from "@/assets/Icons";
import { numericSeriesKeys, toChartData, useReadings } from "@/api/telemetry";
import type {
  ConfigHistoryItem,
  Device,
  FirmwareHistoryItem,
} from "@/api/types";
import { Badge } from "@/components/Badge";
import { EmptyState } from "@/components/EmptyState";
import { JsonBlock } from "@/components/JsonBlock";
import { QueryError } from "@/components/QueryError";
import { Skeleton } from "@/components/Skeleton";
import { formatRelative } from "@/lib/format";

const PRESETS = [
  { id: "1h", label: "1h", hours: 1 },
  { id: "6h", label: "6h", hours: 6 },
  { id: "24h", label: "24h", hours: 24 },
  { id: "7d", label: "7d", hours: 24 * 7 },
  { id: "30d", label: "30d", hours: 24 * 30 },
] as const;
type PresetId = (typeof PRESETS)[number]["id"];

const SERIES_COLORS = [
  "#3fe3d1",
  "#60a5fa",
  "#f472b6",
  "#facc15",
  "#a78bfa",
  "#34d399",
  "#fb923c",
  "#f87171",
  "#22d3ee",
  "#c084fc",
];

/** The config rows in effect at time `t`: latest row per name at or before `t`. */
function configAt(history: ConfigHistoryItem[], t: number): ConfigHistoryItem[] {
  const byName = new Map<string, ConfigHistoryItem>();
  for (const item of history) {
    const createdAt = Date.parse(item.createdAt);
    if (!Number.isFinite(createdAt) || createdAt > t) continue;
    const existing = byName.get(item.name);
    if (!existing || createdAt > Date.parse(existing.createdAt)) {
      byName.set(item.name, item);
    }
  }
  return [...byName.values()];
}

export function DeviceTelemetry({
  device,
  history,
  firmware,
}: {
  device: Device;
  history: ConfigHistoryItem[];
  firmware: FirmwareHistoryItem[];
}) {
  const eui = device.DeviceEuis?.[0]?.eui;
  const [preset, setPreset] = useState<PresetId>("24h");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [selectedTime, setSelectedTime] = useState<number | null>(null);

  const range = useMemo(() => {
    const hours = PRESETS.find((item) => item.id === preset)?.hours ?? 24;
    return { start: new Date(Date.now() - hours * 3_600_000) };
  }, [preset]);

  const query = useReadings(eui, range);
  const rows = useMemo(() => query.data?.readings ?? [], [query.data]);
  const keys = useMemo(() => numericSeriesKeys(rows), [rows]);
  const chartData = useMemo(() => toChartData(rows, keys), [rows, keys]);
  const matchedEui = query.data?.eui ?? eui;

  const markers = useMemo(() => {
    const config = history.map((item) => ({
      kind: "config" as const,
      t: Date.parse(item.createdAt),
      label: item.name,
      sub: item.sensorDriverId ? "sensor" : "datalogger",
    }));
    const firmwareMarkers = firmware.map((item) => ({
      kind: "firmware" as const,
      t: Date.parse(item.installedAt),
      label: `firmware v${item.version}`,
      sub: "firmware",
    }));
    return [...config, ...firmwareMarkers]
      .filter((marker) => Number.isFinite(marker.t))
      .sort((a, b) => b.t - a.t);
  }, [history, firmware]);

  const asAtConfig = useMemo(
    () => (selectedTime == null ? [] : configAt(history, selectedTime)),
    [history, selectedTime],
  );

  function toggleSeries(key: string) {
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleChartClick(state: unknown) {
    const label = (state as { activeLabel?: number | string } | null)
      ?.activeLabel;
    if (label !== undefined && label !== null && Number.isFinite(Number(label))) {
      setSelectedTime(Number(label));
    }
  }

  if (!eui) {
    return (
      <EmptyState
        icon={<IconActivity className="h-5 w-5" />}
        title="No EUI registered"
        description="Telemetry is keyed by LoRaWAN EUI. Register an EUI for this device to see its readings."
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setPreset(option.id)}
              className={[
                "rounded-lg px-3 py-1.5 text-xs transition",
                option.id === preset
                  ? "bg-surface-2 text-fg"
                  : "text-fg-muted hover:text-fg",
              ].join(" ")}
            >
              {option.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-ghost px-3 py-1.5 text-xs"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
        >
          <IconRefresh className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {query.isError ? (
        <QueryError error={query.error} label="telemetry" />
      ) : query.isPending ? (
        <Skeleton className="h-80 rounded-xl" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<IconActivity className="h-5 w-5" />}
          title="No readings in this window"
          description={`No telemetry for ${matchedEui} in the selected range. Try a wider window.`}
        />
      ) : (
        <>
          {/* Series toggles */}
          <div className="flex flex-wrap gap-1.5">
            {keys.map((key, index) => {
              const off = hidden.has(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleSeries(key)}
                  className={[
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] transition",
                    off
                      ? "border-border text-fg-subtle line-through"
                      : "border-border bg-surface-2/70 text-fg-muted",
                  ].join(" ")}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{
                      backgroundColor: SERIES_COLORS[index % SERIES_COLORS.length],
                      opacity: off ? 0.3 : 1,
                    }}
                  />
                  {key}
                </button>
              );
            })}
          </div>

          {/* Chart */}
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                onClick={handleChartClick}
                margin={{ top: 8, right: 16, bottom: 4, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="t"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  scale="time"
                  tick={{ fontSize: 11 }}
                  stroke="var(--color-fg-subtle)"
                  tickFormatter={(value: number) =>
                    new Date(value).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  }
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  stroke="var(--color-fg-subtle)"
                  width={48}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  labelFormatter={(value) =>
                    new Date(Number(value)).toLocaleString()
                  }
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {keys
                  .filter((key) => !hidden.has(key))
                  .map((key) => (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      dot={false}
                      strokeWidth={1.5}
                      connectNulls={false}
                      isAnimationActive={false}
                      stroke={
                        SERIES_COLORS[keys.indexOf(key) % SERIES_COLORS.length]
                      }
                    />
                  ))}
                {markers
                  .filter((marker) => marker.kind === "config")
                  .map((marker, index) => (
                    <ReferenceLine
                      key={`config-${index}`}
                      x={marker.t}
                      stroke="#3fe3d1"
                      strokeDasharray="4 4"
                    />
                  ))}
                {markers
                  .filter((marker) => marker.kind === "firmware")
                  .map((marker, index) => (
                    <ReferenceLine
                      key={`firmware-${index}`}
                      x={marker.t}
                      stroke="#f59e0b"
                      strokeDasharray="2 4"
                    />
                  ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <p className="flex flex-wrap items-center gap-4 text-xs text-fg-subtle">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded bg-[#3fe3d1]" /> config change
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded bg-[#f59e0b]" /> firmware change
            </span>
            <span>Click the chart or a marker to see the config in effect.</span>
          </p>

          {/* As-at config */}
          {selectedTime != null ? (
            <div className="rounded-xl border border-border bg-surface-2/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-fg">
                  Config in effect at{" "}
                  <span className="font-medium">
                    {new Date(selectedTime).toLocaleString()}
                  </span>
                </p>
                <button
                  type="button"
                  className="text-xs text-fg-muted transition hover:text-fg"
                  onClick={() => setSelectedTime(null)}
                >
                  Clear
                </button>
              </div>
              <div className="mt-3 space-y-3">
                {asAtConfig.length === 0 ? (
                  <p className="text-xs text-fg-subtle">
                    No config was recorded before this time.
                  </p>
                ) : (
                  asAtConfig.map((item) => (
                    <JsonBlock
                      key={item.id}
                      label={`${item.name} · ${
                        item.sensorDriverId ? "sensor" : "datalogger"
                      }`}
                      value={item.config}
                    />
                  ))
                )}
              </div>
            </div>
          ) : null}
        </>
      )}

      {/* Marker list */}
      {markers.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-fg-subtle">
            Change markers
          </p>
          <ul className="max-h-72 divide-y divide-border overflow-y-auto pr-1">
            {markers.map((marker) => (
              <li key={`${marker.kind}-${marker.t}-${marker.label}`}>
                <button
                  type="button"
                  onClick={() => setSelectedTime(marker.t)}
                  className="-mx-2 flex w-full items-center justify-between gap-4 rounded-lg px-2 py-2 text-left transition hover:bg-surface-2/60"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <Badge
                      tone={marker.kind === "firmware" ? "warning" : "brand"}
                    >
                      {marker.sub}
                    </Badge>
                    <span className="truncate text-sm text-fg">
                      {marker.label}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-fg-subtle">
                    {formatRelative(new Date(marker.t).toISOString())}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-xs text-fg-subtle">
          <IconAlert className="h-3.5 w-3.5" />
          No config or firmware changes recorded for this device yet.
        </p>
      )}
    </div>
  );
}
