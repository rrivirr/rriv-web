import { SectionCard } from "@/components/SectionCard";
import type { SerialConnection } from "@/serial";
import { Callout, FeedbackCallout, Field, button, primary, useTask } from "./ui";

/**
 * The board answered as the bootloader (update mode). The app's tools don't
 * work here; the way out is to start the installed app.
 */
export function BootloaderPanel({ serial }: { serial: SerialConnection }) {
  const task = useTask();
  const info = serial.bootloader;
  const appValid = info?.appValid ?? false;

  return (
    <SectionCard
      title="Board is in update mode"
      subtitle="The bootloader is running instead of the app, so only bootloader commands work."
      action={
        <button type="button" className={button} onClick={() => void serial.disconnect()}>
          Disconnect
        </button>
      }
    >
      <div className="space-y-4">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Field label="Bootloader" value={info?.version} />
          <Field label="App" value={appValid ? "Installed" : "Not installed"} />
        </dl>
        {appValid ? (
          <div>
            <button
              type="button"
              className={primary}
              disabled={task.busy !== null}
              onClick={() => void task.run("start", () => serial.startApp())}
            >
              {task.busy === "start" ? "Starting…" : "Start the app"}
            </button>
            <p className="mt-2 text-xs text-fg-subtle">
              The board restarts into the app and reconnects automatically.
            </p>
          </div>
        ) : (
          <Callout tone="warning">
            No valid firmware is installed, so the board stays in update mode. Install the firmware
            to use it.
          </Callout>
        )}
        <FeedbackCallout feedback={task.feedback} />
      </div>
    </SectionCard>
  );
}
