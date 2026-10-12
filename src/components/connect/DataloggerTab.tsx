import { useState } from "react";
import { pickDriver } from "@/api/deviceLink";
import { SectionCard } from "@/components/SectionCard";
import {
  type SerialConnection,
  type SerialRecord,
  changedProps,
  setDatalogger,
  setMode,
} from "@/serial";
import { ConfigForm } from "./ConfigForm";
import { reportApply, syncFeedback } from "./syncFeedback";
import type { BoardLink } from "./useBoardLink";
import { ConfirmButton, FeedbackCallout, button, useTask } from "./ui";

/** Mode is switched with its own control above the form. */
const DATALOGGER_READ_ONLY = ["mode"];

export function DataloggerTab({
  serial,
  link,
  locked,
}: {
  serial: SerialConnection;
  link: BoardLink;
  locked: boolean;
}) {
  const settings = useTask();
  const modeTask = useTask();
  const [applied, setApplied] = useState<SerialRecord | null>(null);
  const values = applied ?? serial.datalogger;
  const client = serial.client;
  const mode = typeof values?.mode === "string" ? values.mode : null;
  const driver = pickDriver(link.dataloggerDrivers.data);
  const disabled = locked || !client;

  const apply = (changes: SerialRecord) =>
    void settings.run("apply", async () => {
      // Only what differs from what the board reported is sent (the JSON view
      // hands over the whole object).
      const requested = changedProps(values ?? {}, changes);
      if (!Object.keys(requested).length) {
        return { tone: "info", message: "Nothing to apply: no setting differs from what the board reported." };
      }
      const next = await setDatalogger(client!, requested);
      setApplied(next);
      return reportApply(
        "Datalogger config",
        requested,
        next,
        () => link.syncDatalogger(next),
        settings.setFeedback,
      );
    });

  const switchMode = (next: string) =>
    void modeTask.run("mode", async () => {
      // Like any other setting: the board's reply is what's uploaded.
      const reply = await setMode(client!, next);
      setApplied(reply);
      const sync = () => link.syncDatalogger(reply);
      return syncFeedback(`Datalogger ${next} mode`, await sync(), sync, modeTask.setFeedback);
    });

  return (
    <>
      <SectionCard
        title="Mode"
        subtitle="Interactive keeps the board responsive to this page. Field mode starts logging on the deployment schedule."
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-fg">
              Currently <strong>{mode ?? "unknown"}</strong>
            </span>
            <span className="flex-1" />
            {mode !== "interactive" ? (
              <button
                type="button"
                className={button}
                disabled={disabled || modeTask.busy !== null}
                onClick={() => switchMode("interactive")}
              >
                Switch to interactive
              </button>
            ) : null}
            {mode !== "field" ? (
              <ConfirmButton
                disabled={disabled || modeTask.busy !== null}
                confirmLabel="Deploy now? The board may stop answering."
                onConfirm={() => switchMode("field")}
              >
                Deploy (field mode)
              </ConfirmButton>
            ) : null}
          </div>
          <FeedbackCallout feedback={modeTask.feedback} />
        </div>
      </SectionCard>

      <SectionCard
        title="Settings"
        action={
          <button
            type="button"
            className={button}
            aria-label="Read datalogger config"
            disabled={disabled || settings.busy !== null}
            onClick={() =>
              void settings.run("read", async () => setApplied(await serial.refreshDatalogger()))
            }
          >
            {settings.busy === "read" ? "Reading…" : "Refresh"}
          </button>
        }
      >
        <div className="space-y-4">
          <FeedbackCallout feedback={settings.feedback} />
          {values ? (
            <ConfigForm
              name="Datalogger"
              values={values}
              schema={driver?.validation}
              readOnly={DATALOGGER_READ_ONLY}
              disabled={disabled}
              busy={settings.busy === "apply"}
              onApply={apply}
            />
          ) : (
            <p className="text-sm text-fg-subtle">
              The board didn't report its datalogger settings. Try Refresh.
            </p>
          )}
        </div>
      </SectionCard>
    </>
  );
}
