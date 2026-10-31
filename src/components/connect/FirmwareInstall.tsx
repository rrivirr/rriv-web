import { type ChangeEvent, useState } from "react";
import { SectionCard } from "@/components/SectionCard";
import {
  type FirmwareImage,
  type FirmwareProgress,
  type SerialConnection,
  parseFirmwareImage,
} from "@/serial";
import { Callout, ConfirmButton, Field, button, input, label } from "./ui";
import type { FirmwareRecord } from "./useBoardLink";
import { useDownloadFirmware, useFirmwareReleases } from "@/api/firmware";

type FirmwareHistory = FirmwareRecord & { retry: () => Promise<void> };

const kib = (bytes: number) => `${Math.round(bytes / 1024)} KiB`;

/**
 * Install a release (served by rriv-api) or a signed image from disk on the
 * connected board.
 */
export function FirmwareInstall({
  serial,
  locked = false,
}: {
  serial: SerialConnection;
  locked?: boolean;
}) {
  const inBootloader = serial.status === "bootloader";
  // Only the bootloader reports its version; while the board runs its
  // firmware the requirement is checked once it's in update mode.
  const bootloaderVersion = inBootloader ? (serial.bootloader?.version ?? null) : null;
  const releases = useFirmwareReleases(bootloaderVersion);
  const download = useDownloadFirmware();
  const [chosen, setChosen] = useState<string | null>(null);
  const [fileImage, setFileImage] = useState<FirmwareImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const busy = isInstalling(serial.firmware) || downloading;
  const running = inBootloader ? (serial.bootloader?.appVersion ?? null) : serial.boardVersion;

  const list = releases.data ?? [];
  const installable = list.filter((r) => r.compatible !== false);
  const latest = installable.find((r) => !r.prerelease) ?? installable[0] ?? null;
  const release = fileImage ? null : (installable.find((r) => r.version === chosen) ?? latest);

  const pick = async (event: ChangeEvent<HTMLInputElement>) => {
    setFileImage(null);
    setError(null);
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setFileImage(parseFirmwareImage(new Uint8Array(await file.arrayBuffer())));
    } catch (cause) {
      setError(errorText(cause));
    }
  };

  const install = async () => {
    setError(null);
    if (fileImage) return serial.installFirmware(fileImage);
    if (!release) return;
    setDownloading(true);
    try {
      const image = parseFirmwareImage(await download(release.version));
      await serial.installFirmware({ ...image, minBootloader: release.minBootloader });
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setDownloading(false);
    }
  };

  const target = fileImage ?? release;
  const installLabel = downloading
    ? "Downloading…"
    : target
      ? `Install ${target.version || "firmware"}`
      : "Install firmware";

  return (
    <div className="space-y-4">
      <label className="block">
        <span className={label}>Release</span>
        {releases.isPending ? (
          <p className="mt-1 text-sm text-fg-subtle">Loading releases…</p>
        ) : releases.isError ? (
          <p className="mt-1 text-sm text-fg-subtle">
            Couldn't load the releases ({errorText(releases.error)}). Choose an image file below.
          </p>
        ) : list.length === 0 ? (
          <p className="mt-1 text-sm text-fg-subtle">No signed releases yet. Choose an image file below.</p>
        ) : (
          <select
            className={`${input} mt-1`}
            value={release?.version ?? ""}
            disabled={busy || locked || fileImage !== null}
            onChange={(event) => setChosen(event.target.value)}
          >
            {latest ? null : <option value="">No release fits this bootloader</option>}
            {list.map((r) => (
              <option key={r.version} value={r.version} disabled={r.compatible === false}>
                {r.version}
                {r === latest ? " (latest)" : r.prerelease ? " (pre-release)" : ""}
                {r.version === running ? " (installed)" : ""}
                {r.compatible === false ? ` (needs bootloader ${r.minBootloader})` : ""}
              </option>
            ))}
          </select>
        )}
      </label>
      {list.length > 0 && !latest ? (
        <Callout tone="warning">
          This board's bootloader ({bootloaderVersion}) is older than every release needs. Updating the bootloader
          needs a probe.
        </Callout>
      ) : null}
      {release ? (
        <dl className="grid grid-cols-2 gap-4">
          <Field label="Installed" value={running || "—"} />
          <Field label="Size" value={kib(release.size)} />
          {release.minBootloader ? (
            <Field label="Needs bootloader" value={`${release.minBootloader} or newer`} />
          ) : null}
        </dl>
      ) : null}

      <label className="block">
        <span className={label}>Or a signed image file (.bin)</span>
        <input
          type="file"
          accept=".bin,application/octet-stream"
          className={`${input} mt-1`}
          disabled={busy || locked}
          onChange={(event) => void pick(event)}
        />
      </label>
      {fileImage ? (
        <dl className="grid grid-cols-2 gap-4">
          <Field label="Version" value={fileImage.version || "—"} />
          <Field label="Size" value={kib(fileImage.appSize)} />
        </dl>
      ) : null}
      {error ? <Callout tone="danger">{error}</Callout> : null}

      <div className="flex flex-wrap items-center gap-3">
        <ConfirmButton
          disabled={!target || busy || locked || !serial.client}
          confirmLabel="Click again to install"
          onConfirm={() => void install()}
        >
          {installLabel}
        </ConfirmButton>
        <span className="text-xs text-fg-subtle">
          {inBootloader
            ? "The board is in update mode; the image is written straight away."
            : "The board restarts into update mode, installs the image, then restarts into it. Keep it plugged in."}
        </span>
      </div>
    </div>
  );
}

const errorText = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

const isInstalling = (progress: FirmwareProgress | null) =>
  progress !== null && progress.stage !== "done" && progress.stage !== "error";

const STAGE_TEXT: Record<FirmwareProgress["stage"], string> = {
  restarting: "Restarting into update mode…",
  writing: "Writing the firmware…",
  checking: "Checking the image's signature…",
  starting: "Starting the new firmware…",
  done: "Firmware installed.",
  error: "Firmware install failed.",
};

/**
 * Where an install is, shown above whatever the page shows while the board
 * restarts between modes.
 */
export function FirmwareProgressCard({
  serial,
  history = null,
}: {
  serial: SerialConnection;
  /** Recording a finished install in the device's history. */
  history?: FirmwareHistory | null;
}) {
  const progress = serial.firmware;
  if (!progress) return null;
  const percent =
    progress.stage === "writing"
      ? Math.floor((progress.written / progress.total) * 100)
      : progress.stage === "restarting"
        ? 0
        : 100;
  const finished = !isInstalling(progress);

  return (
    <SectionCard
      title={`Firmware ${progress.version || ""}`.trim()}
      subtitle={STAGE_TEXT[progress.stage]}
      action={
        finished ? (
          <button type="button" className={button} onClick={serial.dismissFirmware}>
            Dismiss
          </button>
        ) : null
      }
    >
      {progress.stage === "error" ? (
        <Callout tone="danger">
          {progress.message} If the board is in update mode, install the image again.
        </Callout>
      ) : progress.stage === "done" ? (
        <div className="space-y-3">
          <Callout tone="success">The board is running {progress.version}.</Callout>
          <HistoryNote history={history} />
        </div>
      ) : (
        <div
          role="progressbar"
          aria-label="Firmware install"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
        >
          <div className="h-full bg-accent transition-all" style={{ width: `${percent}%` }} />
        </div>
      )}
    </SectionCard>
  );
}

function HistoryNote({ history }: { history: FirmwareHistory | null }) {
  const outcome = history?.outcome ?? null;
  if (!history || !outcome) {
    return <p className="text-xs text-fg-subtle">Recording the install in the device's firmware history…</p>;
  }
  if (outcome.kind === "synced") {
    return <p className="text-xs text-fg-subtle">Recorded in the device's firmware history.</p>;
  }
  if (outcome.kind === "skipped") return <p className="text-xs text-fg-subtle">{outcome.reason}</p>;
  return (
    <Callout
      tone="warning"
      action={
        <button type="button" className={button} onClick={() => void history.retry()}>
          Retry
        </button>
      }
    >
      The install worked, but recording it in the device's firmware history failed: {outcome.error}
    </Callout>
  );
}

/** The workspace tab: install firmware on a board running the app. */
export function FirmwareTab({ serial, locked }: { serial: SerialConnection; locked: boolean }) {
  return (
    <SectionCard
      title="Update firmware"
      subtitle={`Running ${serial.boardVersion ?? "an unknown version"}. Installs over USB through the bootloader; no probe needed.`}
    >
      <FirmwareInstall serial={serial} locked={locked} />
    </SectionCard>
  );
}
