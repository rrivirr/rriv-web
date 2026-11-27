import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { IconAlert, IconArrowLeft, IconLayers } from "@/assets/Icons";
import { ApiError } from "@/api/client";
import {
  LIBRARY_KINDS,
  applyLink,
  creatorName,
  libraryVersions,
  useLibraryConfig,
} from "@/api/library";
import type { LibraryKind } from "@/api/library";
import { useArchiveLibraryConfig, useUpdateLibraryConfig } from "@/api/libraryManage";
import type { LibraryConfigDetail, LibraryConfigVersion } from "@/api/types";
import { Badge } from "@/components/Badge";
import { EmptyState } from "@/components/EmptyState";
import { JsonBlock } from "@/components/JsonBlock";
import { SectionCard } from "@/components/SectionCard";
import { Skeleton } from "@/components/Skeleton";
import { formatDate } from "@/lib/format";
import { nameProblem } from "@/lib/validation";

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
              {detail.isOfficial ? <Badge tone="brand">Official RRIV</Badge> : null}
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

          {detail.isMine ? <OwnerControls kind={kind} detail={detail} /> : null}

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
                    configId={detail.id}
                    isMine={Boolean(detail.isMine)}
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
  configId,
  isMine,
  defaultOpen,
}: {
  version: LibraryConfigVersion;
  kind: LibraryKind;
  configId: string;
  isMine: boolean;
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
          {version.firmwareVersion ? (
            <span className="shrink-0 text-xs text-fg-subtle">firmware {version.firmwareVersion}</span>
          ) : null}
        </span>
        <span className="shrink-0 text-xs text-fg-subtle">
          {creatorName(version)}
        </span>
      </summary>

      <div className="space-y-4 border-t border-border px-4 py-4">
        <VersionBody version={version} kind={kind} />
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
          <Link
            to={applyLink(kind, configId, version.version)}
            className="btn btn-ghost px-3 py-1.5"
            aria-label={`Apply v${version.version} to a device`}
          >
            Apply to a device
          </Link>
          <Link
            to={`/library/new?copy=${kind}:${configId}:${version.version}`}
            className="btn btn-ghost px-3 py-1.5"
            aria-label={`Copy v${version.version} to a new config`}
          >
            Copy to a new config
          </Link>
          {isMine ? (
            <Link
              to={`/library/new?edit=${kind}:${configId}:${version.version}`}
              className="btn btn-ghost px-3 py-1.5"
              aria-label={`Edit v${version.version} as a new version`}
            >
              Edit as new version
            </Link>
          ) : null}
        </div>
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

/** The owner's controls: rename, describe, public/private, archive. */
function OwnerControls({ kind, detail }: { kind: LibraryKind; detail: LibraryConfigDetail }) {
  const navigate = useNavigate();
  const update = useUpdateLibraryConfig();
  const archive = useArchiveLibraryConfig();
  const [editing, setEditing] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [name, setName] = useState(detail.name);
  const [description, setDescription] = useState(detail.description ?? "");
  const error = update.error ?? archive.error;
  const editProblems = [nameProblem(name, "Name"), nameProblem(description, "Description", true)].filter(
    (problem): problem is string => problem !== null,
  );

  return (
    <SectionCard
      title="Manage"
      subtitle="Only you can change this config. Add versions with “Edit as new version”, or publish from a device's page or a saved config."
    >
      <div className="space-y-3">
        {editing ? (
          <form
            className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              update.mutate(
                {
                  kind,
                  id: detail.id,
                  changes: { name: name.trim(), description: description.trim() || null },
                },
                { onSuccess: () => setEditing(false) },
              );
            }}
          >
            <input
              className="field"
              aria-label="Name"
              value={name}
              maxLength={20}
              onChange={(event) => setName(event.target.value)}
            />
            <input
              className="field"
              aria-label="Description"
              placeholder="Description (optional)"
              value={description}
              maxLength={20}
              onChange={(event) => setDescription(event.target.value)}
            />
            <button type="submit" className="btn btn-primary" disabled={update.isPending || editProblems.length > 0}>
              Save
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>
              Cancel
            </button>
            {editProblems.map((problem) => (
              <p key={problem} className="text-xs text-amber-600 sm:col-span-4">
                {problem}
              </p>
            ))}
          </form>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(true)}>
              Edit name and description
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={update.isPending || (detail.isOfficial && detail.isPublic)}
              title={detail.isOfficial ? "Official configs stay public; an admin can unmark it." : undefined}
              onClick={() => update.mutate({ kind, id: detail.id, changes: { isPublic: !detail.isPublic } })}
            >
              {detail.isPublic ? "Make private" : "Make public"}
            </button>
            {confirmArchive ? (
              <>
                <button
                  type="button"
                  className="btn btn-ghost text-red-500"
                  disabled={archive.isPending}
                  onClick={() =>
                    archive.mutate({ kind, id: detail.id }, { onSuccess: () => navigate("/library") })
                  }
                >
                  Archive it
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setConfirmArchive(false)}>
                  Keep
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-ghost text-red-500" onClick={() => setConfirmArchive(true)}>
                Archive
              </button>
            )}
          </div>
        )}
        {confirmArchive ? (
          <p className="text-xs text-fg-subtle">
            Archived configs are hidden from the library. Devices set from it keep their settings.
          </p>
        ) : null}
        {detail.isOfficial ? (
          <p className="text-xs text-fg-subtle">This is an official RRIV config, so it stays public.</p>
        ) : null}
        {error ? <p className="text-xs text-red-500">{error.message}</p> : null}
      </div>
    </SectionCard>
  );
}
