import { SectionCard } from "@/components/SectionCard";
import { STARTUP_TRACE, type SerialConnection } from "@/serial";
import type { BoardLink } from "./useBoardLink";
import { Callout, FeedbackCallout, Field, button, useTask } from "./ui";

/** RCC reset causes, in words. */
const RESET_CAUSES: Record<string, string> = {
  power_on: "power on",
  watchdog: "watchdog (the board stopped responding)",
  software: "restart by the firmware",
  reset_pin: "reset button or probe",
  low_power: "low-power reset",
  window_watchdog: "window watchdog",
};

const resetCause = (cause: string) => RESET_CAUSES[cause] ?? cause;

/**
 * How the board's last start-ups went (`board get startup`), and a way to
 * watch the next one step by step (`board diagnostic`).
 */
export function StartupCard({
  serial,
  link,
  locked,
}: {
  serial: SerialConnection;
  link: BoardLink;
  locked: boolean;
}) {
  const task = useTask();
  /** `undefined` while reading; `null` on firmware without a start-up log. */
  const report = link.startupReport;
  const { client } = serial;

  const trace = () =>
    void task.run("trace", async () => {
      await serial.sendRestarting(
        STARTUP_TRACE,
        "Restarting with the start-up trace. Each step pauses for a second, so the board takes about a minute to come back.",
        { traced: true },
      );
    });

  return (
    <SectionCard
      title="Start-up"
      subtitle="Where the board's last start-ups got to, from its start-up log."
      action={
        <button
          type="button"
          className={button}
          disabled={locked || !client || task.busy !== null || !report}
          onClick={trace}
        >
          {task.busy === "trace" ? "Restarting…" : "Trace the next start-up"}
        </button>
      }
    >
      <div className="space-y-4">
        {report === undefined ? (
          <p className="text-sm text-fg-subtle">Reading the start-up log…</p>
        ) : report === null ? (
          <p className="text-sm text-fg-subtle">
            This firmware doesn't keep a start-up log. Update it to see how start-ups went.
          </p>
        ) : (
          <>
            {!report.previousCompleted ? (
              <Callout tone="warning">
                The last start-up didn't finish: it stopped at{" "}
                <span className="font-mono">{report.stoppedAt ?? "an unknown step"}</span> and the
                board was reset ({resetCause(report.resetCause)}).
                {report.failedStartups > 1
                  ? ` ${report.failedStartups} start-ups in a row didn't finish before this one.`
                  : ""}
              </Callout>
            ) : null}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
              <Field
                label="Previous start-up"
                value={report.previousCompleted ? "Finished" : "Didn't finish"}
              />
              <Field label="Last reset" value={resetCause(report.resetCause)} />
              <Field label="This start-up" value={report.traced ? "Traced" : "Normal"} />
            </dl>
            <p className="text-xs text-fg-subtle">
              The trace restarts the board with the watchdog off and pauses at each start-up step;
              the page shows the step while the board reconnects. Use it to find where a board
              hangs while starting.
            </p>
          </>
        )}
        <FeedbackCallout feedback={task.feedback} />
      </div>
    </SectionCard>
  );
}
