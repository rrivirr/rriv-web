import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import {
  IconActivity,
  IconAlert,
  IconArrowLeft,
  IconLayers,
  IconMapPin,
  IconWaves,
} from "@/assets/Icons";
import {
  useActiveConfig,
  useConfigHistory,
  useDeviceLogs,
  useFirmwareHistory,
} from "@/api/configs";
import { useDevice } from "@/api/devices";
import type { ConfigHistoryItem } from "@/api/types";
import { Badge } from "@/components/Badge";
import { ConfigHistoryList } from "@/components/ConfigHistoryList";
import {
  AddDeviceLogForm,
  DeviceCommandForm,
  DeviceDangerZone,
  SaveSnapshotForm,
} from "@/components/DeviceControls";
import { EmptyState } from "@/components/EmptyState";
import { JsonBlock } from "@/components/JsonBlock";
import { Pager } from "@/components/Pager";
import { QueryError } from "@/components/QueryError";
import { SectionCard } from "@/components/SectionCard";
import { Skeleton } from "@/components/Skeleton";
import { formatDate, formatRelative } from "@/lib/format";

const PAGE_SIZE = 10;

/** Recharts is heavy; load the telemetry panel only when the device page needs it. */
const DeviceTelemetry = lazy(() =>
  import("@/components/DeviceTelemetry").then((module) => ({
    default: module.DeviceTelemetry,
  })),
);

export function DeviceDetailPage() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const [showConfig, setShowConfig] = useState(false);
  const [historyPage, setHistoryPage] = useState(0);
  const [firmwarePage, setFirmwarePage] = useState(0);
  const [logsPage, setLogsPage] = useState(0);

  const deviceQuery = useDevice(deviceId);
  const device = deviceQuery.data;
  const placement = device?.DeviceContext?.[0];
  const contextId = placement?.Context.id;

  // Reset pagination when navigating between devices.
  useEffect(() => {
    setHistoryPage(0);
    setFirmwarePage(0);
    setLogsPage(0);
  }, [deviceId]);

  const activeConfig = useActiveConfig(
    device?.id,
    contextId,
    showConfig && Boolean(device?.id) && Boolean(contextId),
  );
  const history = useConfigHistory(device?.serialNumber, {
    limit: PAGE_SIZE,
    offset: historyPage,
  });
  const firmware = useFirmwareHistory(
    device ? { deviceId: device.id } : {},
    { limit: PAGE_SIZE, offset: firmwarePage },
  );
  const logs = useDeviceLogs(device?.serialNumber, {
    limit: PAGE_SIZE,
    offset: logsPage,
  });

  const timeline = useMemo<ConfigHistoryItem[]>(() => {
    const data = history.data;
    if (!data) return [];
    return [
      ...data.dataloggerConfigs,
      ...data.sensorConfigs,
    ].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [history.data]);

  const backLink = (
    <Link
      to="/devices"
      className="inline-flex items-center gap-1.5 text-sm text-fg-muted transition hover:text-fg"
    >
      <IconArrowLeft className="h-4 w-4" />
      Back to devices
    </Link>
  );

  if (deviceQuery.isError) {
    return (
      <div className="space-y-6">
        {backLink}
        <QueryError error={deviceQuery.error} label="this device" />
      </div>
    );
  }

  if (deviceQuery.isSuccess && !device) {
    return (
      <div className="space-y-6">
        {backLink}
        <EmptyState
          icon={<IconAlert className="h-5 w-5" />}
          title="Device not found"
          description="It may have been unbound or deleted."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {backLink}

      {/* ---------------------------------------------------------- Header */}
      {device ? (
        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-fg">
              {device.uniqueName}
            </h1>
            <Badge tone="neutral">{device.type ?? "device"}</Badge>
            {placement ? null : <Badge tone="warning">unassigned</Badge>}
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-4">
            <MetaCell label="Serial" value={device.serialNumber} mono />
            <MetaCell label="UID" value={device.uid ?? "—"} mono />
            <MetaCell
              label="EUI"
              value={device.DeviceEuis?.[0]?.eui ?? "—"}
              mono
            />
            <MetaCell label="Created" value={formatDate(device.createdAt)} />
          </dl>
        </header>
      ) : (
        <Skeleton className="h-7 w-1/3" />
      )}

      {/* ------------------------------------------------------- Placement */}
      <SectionCard
        title="Placement"
        subtitle="The context this device is assigned to"
      >
        {deviceQuery.isPending ? (
          <Skeleton className="h-12 rounded-xl" />
        ) : placement ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-fg">
              <IconMapPin className="h-4 w-4 text-fg-subtle" />
              <Link
                to={`/contexts/${placement.Context.id}`}
                className="font-medium text-accent transition hover:underline"
              >
                {placement.Context.name}
              </Link>
              <span className="text-fg-subtle">
                · assigned as {placement.assignedDeviceName}
              </span>
            </div>
            <Badge tone="success">active</Badge>
          </div>
        ) : (
          <EmptyState
            icon={<IconMapPin className="h-5 w-5" />}
            title="Not in a context"
            description="Assign this device to a context in the RRIV app or CLI to apply configurations and read telemetry."
          />
        )}
      </SectionCard>

      {/* -------------------------------------------------- Current config */}
      <SectionCard
        title="Current applied config"
        subtitle="The config currently applied to this device in its context"
      >
        {!placement ? (
          <p className="text-sm text-fg-subtle">
            Available once the device is assigned to a context.
          </p>
        ) : !showConfig ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-fg-subtle">
              Reading this touches the API&rsquo;s active config snapshot.
            </p>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setShowConfig(true)}
            >
              <IconLayers className="h-4 w-4" />
              View config
            </button>
          </div>
        ) : activeConfig.isError ? (
          <QueryError error={activeConfig.error} label="the current config" />
        ) : activeConfig.isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-12 rounded-xl" />
            <Skeleton className="h-12 rounded-xl" />
          </div>
        ) : activeConfig.data ? (
          <ActiveConfigView data={activeConfig.data} />
        ) : null}
      </SectionCard>

      {/* -------------------------------------------------- Config history */}
      <SectionCard
        title="Config history"
        subtitle="Applied configurations over time"
        action={<Badge tone="neutral">{timeline.length}</Badge>}
      >
        {history.isError ? (
          <QueryError error={history.error} label="config history" />
        ) : history.isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-10 rounded-xl" />
            <Skeleton className="h-10 rounded-xl" />
          </div>
        ) : (
          <>
            <ConfigHistoryList items={timeline} />
            <Pager
              offset={historyPage}
              pageSize={PAGE_SIZE}
              count={timeline.length}
              isFetching={history.isFetching}
              onPrev={() =>
                setHistoryPage((page) => Math.max(0, page - PAGE_SIZE))}
              onNext={() => setHistoryPage((page) => page + PAGE_SIZE)}
              noun="change"
            />
          </>
        )}
      </SectionCard>

      {/* ------------------------------------------------------ Firmware */}
      <SectionCard
        title="Firmware history"
        subtitle="Versions installed on this device over time"
      >
        {firmware.isError ? (
          <QueryError error={firmware.error} label="firmware history" />
        ) : firmware.isPending ? (
          <Skeleton className="h-10 rounded-xl" />
        ) : (firmware.data ?? []).length === 0 ? (
          <EmptyState
            icon={<IconActivity className="h-5 w-5" />}
            title="No firmware history"
            description="Firmware installations recorded by the CLI appear here."
          />
        ) : (
          <ul className="max-h-72 divide-y divide-border overflow-y-auto pr-1">
            {(firmware.data ?? []).map((entry, index) => (
              <li
                key={`${entry.version}-${entry.installedAt}-${index}`}
                className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-fg">
                    v{entry.version}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-fg-subtle">
                    {entry.contextName ?? "—"} ·{" "}
                    {formatDate(entry.installedAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}

        {!firmware.isError && !firmware.isPending &&
        (firmware.data ?? []).length > 0 ? (
          <Pager
            offset={firmwarePage}
            pageSize={PAGE_SIZE}
            count={(firmware.data ?? []).length}
            isFetching={firmware.isFetching}
            onPrev={() =>
              setFirmwarePage((page) => Math.max(0, page - PAGE_SIZE))}
            onNext={() => setFirmwarePage((page) => page + PAGE_SIZE)}
            noun="version"
          />
        ) : null}
      </SectionCard>

      {/* ---------------------------------------------------------- Logs */}
      <SectionCard
        title="Logs"
        subtitle="Notes recorded against this device"
      >
        {logs.isError ? (
          <QueryError error={logs.error} label="logs" />
        ) : logs.isPending ? (
          <Skeleton className="h-10 rounded-xl" />
        ) : (logs.data ?? []).length === 0 ? (
          <EmptyState
            icon={<IconWaves className="h-5 w-5" />}
            title="No logs"
            description="Device logs added from the CLI or web appear here."
          />
        ) : (
          <ul className="max-h-72 divide-y divide-border overflow-y-auto pr-1">
            {(logs.data ?? []).map((entry, index) => (
              <li
                key={`${entry.createdAt}-${index}`}
                className="py-3 first:pt-0 last:pb-0"
              >
                <p className="text-sm text-fg">{entry.log}</p>
                <p className="mt-0.5 text-xs text-fg-subtle">
                  {entry.Creator
                    ? `${entry.Creator.firstName} ${entry.Creator.lastName} · `
                    : ""}
                  {formatRelative(entry.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}

        {!logs.isError && !logs.isPending && (logs.data ?? []).length > 0 ? (
          <Pager
            offset={logsPage}
            pageSize={PAGE_SIZE}
            count={(logs.data ?? []).length}
            isFetching={logs.isFetching}
            onPrev={() => setLogsPage((page) => Math.max(0, page - PAGE_SIZE))}
            onNext={() => setLogsPage((page) => page + PAGE_SIZE)}
            noun="log"
          />
        ) : null}
      </SectionCard>

      {/* -------------------------------------------------------- Actions */}
      <SectionCard
        title="Actions"
        subtitle="Send commands and record notes (no board required)"
      >
        {device ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <DeviceCommandForm identifier={device.serialNumber} />
            <AddDeviceLogForm identifier={device.serialNumber} />
          </div>
        ) : null}
      </SectionCard>

      {device && placement && contextId ? (
        <SectionCard
          title="Snapshots"
          subtitle="Bookmark the current cloud config"
        >
          <SaveSnapshotForm deviceId={device.id} contextId={contextId} />
        </SectionCard>
      ) : null}

      {/* ------------------------------------------------------ Telemetry */}
      <SectionCard
        title="Telemetry"
        subtitle="Readings from the data API, correlated with config and firmware"
      >
        {deviceQuery.isPending ? (
          <Skeleton className="h-80 rounded-xl" />
        ) : device ? (
          <Suspense fallback={<Skeleton className="h-80 rounded-xl" />}>
            <DeviceTelemetry device={device} />
          </Suspense>
        ) : null}
      </SectionCard>

      {/* ----------------------------------------------------- Danger zone */}
      {device ? (
        <SectionCard
          title="Danger zone"
          subtitle="Detach or remove this device"
        >
          <DeviceDangerZone device={device} />
        </SectionCard>
      ) : null}
    </div>
  );
}

function ActiveConfigView({
  data,
}: {
  data: {
    dataloggerConfig: { config?: Record<string, unknown> } | null;
    sensorConfig: {
      id: string;
      name: string;
      config: Record<string, unknown>;
    }[];
  };
}) {
  const hasDatalogger = data.dataloggerConfig?.config !== undefined;
  const hasSensors = data.sensorConfig.length > 0;

  if (!hasDatalogger && !hasSensors) {
    return (
      <p className="text-sm text-fg-subtle">
        No config has been applied to this device yet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {hasDatalogger ? (
        <JsonBlock
          label="Datalogger"
          value={data.dataloggerConfig?.config}
        />
      ) : null}
      {hasSensors ? (
        <div className="space-y-3">
          <p className="text-xs font-medium text-fg-muted">
            Sensors ({data.sensorConfig.length})
          </p>
          {data.sensorConfig.map((sensor) => (
            <JsonBlock
              key={sensor.id}
              label={sensor.name}
              value={sensor.config}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MetaCell({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-2/40 px-3 py-2.5">
      <dt className="text-xs uppercase tracking-wider text-fg-subtle">
        {label}
      </dt>
      <dd
        className={[
          "mt-0.5 truncate text-sm text-fg",
          mono ? "font-mono text-xs" : "",
        ].join(" ")}
      >
        {value}
      </dd>
    </div>
  );
}
