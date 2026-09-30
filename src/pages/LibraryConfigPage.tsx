import { Link, useParams } from "react-router";
import { IconAlert, IconArrowLeft, IconLayers } from "@/assets/Icons";
import { ApiError } from "@/api/client";
import {
  LIBRARY_KINDS,
  creatorName,
  libraryVersions,
  useLibraryConfig,
} from "@/api/library";
import type { LibraryKind } from "@/api/library";
import type { LibraryConfigVersion } from "@/api/types";
import { Badge } from "@/components/Badge";
import { EmptyState } from "@/components/EmptyState";
import { JsonBlock } from "@/components/JsonBlock";
import { SectionCard } from "@/components/SectionCard";
import { Skeleton } from "@/components/Skeleton";
import { formatDate } from "@/lib/format";

const KIND_LABELS: Record<LibraryKind, string> = {
  sensor: "Sensor config",
  datalogger: "Datalogger config",
  system: "System config",
};

function parseKind(value: string | undefined): LibraryKind | null {
  return (LIBRARY_KINDS as readonly string[]).includes(value ?? "")
    ? (value as LibraryKind)
    : null;
}

export function LibraryConfigPage() {
  const { kind: rawKind, id } = useParams<{ kind: string; id: string }>();
  const kind = parseKind(rawKind);
  const query = useLibraryConfig(kind ?? "sensor", kind ? id : undefined);

  const backLink = (
    <Link
      to="/library"
      className="inline-flex items-center gap-1.5 text-sm text-fg-muted transition hover:text-fg"
    >
      <IconArrowLeft className="h-4 w-4" />
      Back to library
    </Link>
  );

  if (!kind) {
    return (
      <div className="space-y-6">
        {backLink}
        <EmptyState
          icon={<IconAlert className="h-5 w-5" />}
          title="Unknown library"
          description="This configuration belongs to a library that does not exist."
        />
      </div>
    );
  }

  const detail = query.data;
  const versions = detail ? libraryVersions(detail) : [];
  const notFound = query.error instanceof ApiError && query.error.status === 404;

  return (
    <div className="space-y-6">
      {backLink}

      {query.isPending ? (
        <DetailSkeleton />
      ) : notFound ? (
        <EmptyState
          icon={<IconLayers className="h-5 w-5" />}
          title="Configuration not available"
          description="It may be private, archived, or removed from the library."
        />
      ) : query.isError ? (
        <div className="surface border-red-500/30 p-4 text-sm text-red-600 dark:text-red-300">
          Could not load this configuration: {query.error.message}
        </div>
      ) : detail ? (
        <>
          {/* ------------------------------------------------------ Header */}
          <header className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight text-fg">
                {detail.name}
              </h1>
              <Badge tone={detail.isPublic ? "brand" : "neutral"}>
                {detail.isPublic ? "Public" : "Private"}
              </Badge>
              <Badge tone="neutral">{KIND_LABELS[kind]}</Badge>
            </div>

            {detail.description ? (
              <p className="max-w-3xl text-sm leading-relaxed text-fg-muted">
                {detail.description}
              </p>
            ) : null}

            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <MetaCell label="Creator" value={creatorName(detail)} />
              <MetaCell label="Created" value={formatDate(detail.createdAt)} />
              <MetaCell
                label="Versions"
                value={String(versions.length)}
              />
            </dl>
          </header>

          {/* ---------------------------------------------------- Versions */}
          <SectionCard
            title="Versions"
            subtitle="Newest first — each version is an immutable published config"
            action={<Badge tone="neutral">{versions.length} total</Badge>}
          >
            {versions.length === 0 ? (
              <EmptyState
                icon={<IconLayers className="h-5 w-5" />}
                title="No versions published"
                description="This library entry has no published versions yet."
              />
            ) : (
              <div className="space-y-3">
                {versions.map((version, index) => (
                  <VersionItem
                    key={version.version}
                    version={version}
                    kind={kind}
                    defaultOpen={index === 0}
                  />
                ))}
              </div>
            )}
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2/40 px-3 py-2.5">
      <dt className="text-xs uppercase tracking-wider text-fg-subtle">
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-sm text-fg">{value}</dd>
    </div>
  );
}

function VersionItem({
  version,
  kind,
  defaultOpen,
}: {
  version: LibraryConfigVersion;
  kind: LibraryKind;
  defaultOpen: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className="rounded-xl border border-border bg-surface-2/30"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <span className="flex min-w-0 items-center gap-3">
          <Badge tone="brand">v{version.version}</Badge>
          <span className="truncate text-sm text-fg">
            {version.description || "No description"}
          </span>
        </span>
        <span className="shrink-0 text-xs text-fg-subtle">
          {creatorName(version)}
        </span>
      </summary>

      <div className="border-t border-border px-4 py-4">
        <VersionBody version={version} kind={kind} />
      </div>
    </details>
  );
}

function VersionBody({
  version,
  kind,
}: {
  version: LibraryConfigVersion;
  kind: LibraryKind;
}) {
  if (kind === "system") {
    const snapshot = version.ConfigSnapshot;
    if (!snapshot) return <PayloadMissing />;
    return (
      <div className="space-y-4">
        {snapshot.DataloggerConfig?.[0] ? (
          <JsonBlock
            label="Datalogger config"
            value={snapshot.DataloggerConfig[0].config}
          />
        ) : null}
        {snapshot.SensorConfig?.length ? (
          <div className="space-y-3">
            <p className="text-xs font-medium text-fg-muted">
              Sensor configs ({snapshot.SensorConfig.length})
            </p>
            {snapshot.SensorConfig.map((sensor) => (
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

  const config =
    kind === "sensor" ? version.SensorConfig : version.DataloggerConfig;
  if (!config) return <PayloadMissing />;

  const driverId = config.sensorDriverId ?? config.dataloggerDriverId;

  return (
    <div className="space-y-2">
      <JsonBlock label={config.name} value={config.config} />
      {driverId ? (
        <p className="truncate font-mono text-[11px] text-fg-subtle">
          driver {driverId}
        </p>
      ) : null}
    </div>
  );
}

function PayloadMissing() {
  return (
    <p className="text-xs text-fg-subtle">
      No config payload was returned for this version.
    </p>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Skeleton className="h-7 w-1/3" />
        <Skeleton className="h-4 w-2/3" />
        <div className="grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-14 rounded-xl" />
          <Skeleton className="h-14 rounded-xl" />
          <Skeleton className="h-14 rounded-xl" />
        </div>
      </div>
      <div className="surface space-y-3 p-5">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-12 rounded-xl" />
      </div>
    </div>
  );
}
