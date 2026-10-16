import { useEffect, useMemo, useState } from "react";
import {
  IconActivity,
  IconAlert,
  IconClose,
  IconExpand,
  IconRefresh,
} from "@/assets/Icons";
import { numericSeriesKeys, toChartData, useReadings } from "@/api/telemetry";
import { useConfigHistory, useFirmwareHistory } from "@/api/configs";
import type { Device } from "@/api/types";
import { Badge } from "@/components/Badge";
import { EmptyState } from "@/components/EmptyState";
import { JsonBlock } from "@/components/JsonBlock";
import { QueryError } from "@/components/QueryError";
import { Skeleton } from "@/components/Skeleton";
import {
  MARKER_STYLES,
  TelemetryChart,
  seriesColor,
} from "@/components/TelemetryChart";
import { formatDate, formatRelative } from "@/lib/format";

const PRESETS = [
  { id: "1h", label: "1h", hours: 1 },
  { id: "6h", label: "6h", hours: 6 },
  { id: "24h", label: "24h", hours: 24 },
  { id: "7d", label: "7d", hours: 24 * 7 },
  { id: "30d", label: "30d", hours: 24 * 30 },
] as const;
type PresetId = (typeof PRESETS)[number]["id"];

/** A Date as a `datetime-local` input value (local time, to the minute). */
function toLocalInput(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function DeviceTelemetry({ device }: { device: Device }) {
  const eui = device.DeviceEuis?.[0]?.eui;
  const [preset, setPreset] = useState<PresetId | "custom">("24h");
  // The applied custom range, and the inputs being edited before Apply.
  const [customRange, setCustomRange] = useState<{ start: Date; end: Date } | null>(null);
  const [draft, setDraft] = useState({ from: "", to: "" });
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [selectedTime, setSelectedTime] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setExpanded(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [expanded]);

  const range = useMemo<{ start: Date; end?: Date }>(() => {
    if (preset === "custom" && customRange) return customRange;
    const hours = PRESETS.find((item) => item.id === preset)?.hours ?? 24;
    return { start: new Date(Date.now() - hours * 3_600_000) };
  }, [preset, customRange]);

  const draftFrom = draft.from ? new Date(draft.from) : null;
  const draftTo = draft.to ? new Date(draft.to) : null;
  const draftValid = Boolean(draftFrom && draftTo && draftFrom < draftTo);

  function openCustom() {
    // Keep showing the current range until new dates are applied.
    const current = { start: range.start, end: range.end ?? new Date() };
    setCustomRange(current);
    setDraft({ from: toLocalInput(current.start), to: toLocalInput(current.end) });
    setPreset("custom");
  }

  const query = useReadings(device.id, range, { enabled: Boolean(eui) });
  const rows = useMemo(() => query.data ?? [], [query.data]);
  const keys = useMemo(() => numericSeriesKeys(rows), [rows]);
  const chartData = useMemo(() => toChartData(rows, keys), [rows, keys]);

  // Markers are scoped to the visible chart window, not the whole history, so
  // they stay aligned with the chart and aren't clipped by the API's page cap.
  const markerWindow = {
    from: range.start.toISOString(),
    to: range.end?.toISOString(),
  };
  const markersConfigQuery = useConfigHistory(
    device.serialNumber,
    markerWindow,
    { enabled: Boolean(eui) },
  );
  const markersFirmwareQuery = useFirmwareHistory(
    { deviceId: device.id },
    markerWindow,
    { enabled: Boolean(eui) },
  );

  const history = useMemo(() => {
    const data = markersConfigQuery.data;
    if (!data) return [];
    return [...data.dataloggerConfigs, ...data.sensorConfigs];
  }, [markersConfigQuery.data]);
  const firmware = useMemo(
    () => markersFirmwareQuery.data ?? [],
    [markersFirmwareQuery.data],
  );

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

  // Point-in-time state is resolved server-side (`asAt`), so it stays correct
  // even when the applied-config history exceeds one page.
  const asAtIso = selectedTime == null
    ? undefined
    : new Date(selectedTime).toISOString();
  const asAtConfigQuery = useConfigHistory(
    device.serialNumber,
    { asAt: asAtIso },
    { enabled: selectedTime != null },
  );
  const asAtFirmwareQuery = useFirmwareHistory(
    { deviceId: device.id },
    { asAt: asAtIso },
    { enabled: selectedTime != null },
  );
  const asAtConfig = [
    ...(asAtConfigQuery.data?.sensorConfigs ?? []),
    ...(asAtConfigQuery.data?.dataloggerConfigs ?? []),
  ];
  const asAtFirmware = asAtFirmwareQuery.data?.[0] ?? null;
  const asAtLoading = asAtConfigQuery.isLoading ||
    asAtFirmwareQuery.isLoading;
  const asAtError = asAtConfigQuery.isError || asAtFirmwareQuery.isError;

  function toggleSeries(key: string) {
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
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

  // Shared by the page and the enlarged overlay (same state, same handlers).
  const seriesToggles = (
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
                backgroundColor: seriesColor(index),
                opacity: off ? 0.3 : 1,
              }}
            />
            {key}
          </button>
        );
      })}
    </div>
  );

  const chart = (
    <TelemetryChart
      data={chartData}
      keys={keys}
      hidden={hidden}
      markers={markers}
      onSelectTime={setSelectedTime}
    />
  );

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
          <button
            type="button"
            onClick={openCustom}
            className={[
              "rounded-lg px-3 py-1.5 text-xs transition",
              preset === "custom"
                ? "bg-surface-2 text-fg"
                : "text-fg-muted hover:text-fg",
            ].join(" ")}
          >
            Custom
          </button>
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

      {preset === "custom" && (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (draftValid) setCustomRange({ start: draftFrom!, end: draftTo! });
          }}
        >
          <label className="space-y-1 text-xs text-fg-muted">
            <span>From</span>
            <input
              type="datetime-local"
              className="field py-1.5 text-xs"
              value={draft.from}
              max={draft.to || undefined}
              onChange={(event) => setDraft({ ...draft, from: event.target.value })}
              aria-invalid={Boolean(draft.from && draft.to) && !draftValid}
            />
          </label>
          <label className="space-y-1 text-xs text-fg-muted">
            <span>To</span>
            <input
              type="datetime-local"
              className="field py-1.5 text-xs"
              value={draft.to}
              min={draft.from || undefined}
              onChange={(event) => setDraft({ ...draft, to: event.target.value })}
              aria-invalid={Boolean(draft.from && draft.to) && !draftValid}
            />
          </label>
          <button
            type="submit"
            className="btn btn-primary px-3 py-1.5 text-xs"
            disabled={!draftValid}
          >
            Apply
          </button>
          {Boolean(draft.from && draft.to) && !draftValid && (
            <p className="text-xs text-red-500">From must be before To.</p>
          )}
        </form>
      )}

      {query.isError ? (
        <QueryError error={query.error} label="telemetry" />
      ) : query.isPending ? (
        <Skeleton className="h-80 rounded-xl" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<IconActivity className="h-5 w-5" />}
          title="No readings in this window"
          description={`No telemetry for ${eui} in the selected range. Try a wider window.`}
        />
      ) : (
        <>
          {/* Series toggles */}
          {seriesToggles}

          {/* Chart */}
          <div className="relative h-80 w-full">
            {chart}
            <button
              type="button"
              className="btn btn-ghost absolute right-2 top-0 px-2 py-1"
              onClick={() => setExpanded(true)}
              aria-label="Enlarge chart"
              title="Enlarge chart"
            >
              <IconExpand className="h-3.5 w-3.5" />
            </button>
          </div>

          {expanded && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
              onClick={() => setExpanded(false)}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-label={`Telemetry · ${device.uniqueName}`}
                className="surface flex h-[90vh] w-full max-w-6xl flex-col gap-3 p-4"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-medium text-fg">
                    Telemetry · {device.uniqueName}
                  </h2>
                  <button
                    type="button"
                    className="btn btn-ghost px-2 py-1"
                    onClick={() => setExpanded(false)}
                    aria-label="Close enlarged chart"
                  >
                    <IconClose className="h-4 w-4" />
                  </button>
                </div>
                {seriesToggles}
                <div className="min-h-0 flex-1">{chart}</div>
              </div>
            </div>
          )}

          <p className="flex flex-wrap items-center gap-4 text-xs text-fg-subtle">
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-0.5 w-4 rounded"
                style={{ backgroundColor: MARKER_STYLES.config.color }}
              />{" "}
              config change
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-0.5 w-4 rounded"
                style={{ backgroundColor: MARKER_STYLES.firmware.color }}
              />{" "}
              firmware change
            </span>
            <span>
              Click the chart or a marker to see the state in effect. Drag to
              zoom; double-click to reset.
            </span>
          </p>

          {/* As-at state */}
          {selectedTime != null ? (
            <div className="rounded-xl border border-border bg-surface-2/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-fg">
                  In effect at{" "}
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
                {asAtError ? (
                  <p className="text-xs text-fg-subtle">
                    Could not load the state at this time.
                  </p>
                ) : asAtLoading ? (
                  <p className="text-xs text-fg-subtle">Loading…</p>
                ) : (
                  <>
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

                    <p className="rounded-lg border border-border bg-surface-2/40 px-3 py-2 text-xs">
                      <span className="text-fg-subtle">Firmware: </span>
                      {asAtFirmware ? (
                        <>
                          <span className="font-mono text-fg">
                            v{asAtFirmware.version}
                          </span>
                          <span className="text-fg-subtle">
                            {" "}· installed{" "}
                            {formatDate(asAtFirmware.installedAt)}
                          </span>
                        </>
                      ) : (
                        <span className="text-fg-subtle">
                          none recorded before this time
                        </span>
                      )}
                    </p>
                  </>
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
