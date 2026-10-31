import { SectionCard } from "@/components/SectionCard";
import type { SerialConnection } from "@/serial";
import { DiagnosticsButton } from "./DiagnosticsButton";
import { FirmwareInstall } from "./FirmwareInstall";
import { Callout, FeedbackCallout, Field, button, primary, useTask } from "./ui";

/** The bootloader's reasons for refusing an app, in words. */
const APP_ERRORS: Record<string, string> = {
  no_header: "no firmware",
  unsupported_header: "unknown image format",
  bad_size: "image size is wrong",
  hash_mismatch: "image is damaged",
  bad_signature: "not signed by RRIV",
  bad_vectors: "not built for the bootloader",
};

/**
 * The board answered as the bootloader (update mode). The app's tools don't
 * work here; the way out is to start the installed app.
 */
export function BootloaderPanel({ serial }: { serial: SerialConnection }) {
  const task = useTask();
  const info = serial.bootloader;
  const appValid = info?.appValid ?? false;
  const looping = info?.startupLoop ?? null;
  const appStatus = appValid
    ? `Installed${info?.appVersion ? ` (${info.appVersion})` : ""}`
    : `Not installed${info?.appError ? ` (${APP_ERRORS[info.appError] ?? info.appError})` : ""}`;

  return (
    <SectionCard
      title="Board is in update mode"
      subtitle="The bootloader is running instead of the app, so only bootloader commands work."
      action={
        <div className="flex gap-2">
          <DiagnosticsButton serial={serial} />
          <button type="button" className={button} onClick={() => void serial.disconnect()}>
            Disconnect
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Field label="Bootloader" value={info?.version} />
          <Field label="App" value={appStatus} />
        </dl>
        {looping ? (
          <Callout tone="warning">
            The app's start-up keeps stopping at <span className="font-mono">{looping.stoppedAt}</span>{" "}
            ({looping.unfinished} start-ups in a row didn't finish), so the bootloader stopped
            starting it. Check what's connected to the board, or install other firmware below.
          </Callout>
        ) : null}
        {appValid ? (
          <div>
            <button
              type="button"
              className={primary}
              disabled={task.busy !== null}
              onClick={() => void task.run("start", () => serial.startApp())}
            >
              {task.busy === "start" ? "Starting…" : looping ? "Start the app anyway" : "Start the app"}
            </button>
            <p className="mt-2 text-xs text-fg-subtle">
              The board restarts into the app and reconnects automatically.
              {looping ? " If its start-up stops again, it comes back to update mode." : ""}
            </p>
          </div>
        ) : (
          <Callout tone="warning">
            No valid firmware is installed, so the board stays in update mode. Install a signed
            image below to use it.
          </Callout>
        )}
        <FeedbackCallout feedback={task.feedback} />
        <div className="border-t border-border pt-4">
          <h3 className="mb-3 text-xs font-semibold text-fg">Install firmware</h3>
          <FirmwareInstall serial={serial} />
        </div>
      </div>
    </SectionCard>
  );
}
