import { SectionCard } from "@/components/SectionCard";
import type { BoardLink, ResetNotice } from "./useBoardLink";
import { Callout, ConfirmButton, FeedbackCallout, button, useTask } from "./ui";

/** Datalogger tab: `datalogger reset` (default settings, no sensors). */
export function ResetSettingsButton({ link, disabled }: { link: BoardLink; disabled: boolean }) {
  const task = useTask();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <ConfirmButton
          disabled={disabled || task.busy !== null}
          confirmLabel="Click again to reset"
          onConfirm={() => void task.run("reset", () => link.resetDatalogger())}
        >
          {task.busy === "reset" ? "Resetting…" : "Reset settings"}
        </ConfirmButton>
        <span className="text-xs text-fg-subtle">
          Default settings and no sensors; the serial number stays. The board restarts.
        </span>
      </div>
      <FeedbackCallout feedback={task.feedback} />
    </div>
  );
}

/** Overview tab, provisioners only: `device reset`. The device stays in rriv-api. */
export function FactoryResetCard({ link, locked }: { link: BoardLink; locked: boolean }) {
  const task = useTask();
  if (!link.canFactoryReset) return null;
  return (
    <SectionCard
      title="Factory reset"
      subtitle="Wipe the board back to how it left the factory."
    >
      <div className="space-y-3">
        <p className="text-sm text-fg-muted">
          Blanks the serial number, resets the settings to their defaults and removes every
          sensor. The board restarts unprovisioned. The device stays in RRIV on your account;
          provisioning the board again gives back the same serial number.
        </p>
        <ConfirmButton
          disabled={locked || task.busy !== null}
          confirmLabel="Click again to wipe the board"
          onConfirm={() => void task.run("factory", () => link.factoryReset())}
        >
          {task.busy === "factory" ? "Resetting…" : "Factory reset"}
        </ConfirmButton>
        <FeedbackCallout feedback={task.feedback} />
      </div>
    </SectionCard>
  );
}

function noticeText(notice: ResetNotice) {
  if (notice.kind === "factory") {
    return `Board wiped. Device ${notice.serialNumber} is still in RRIV; provision the board to give it back serial number ${notice.serialNumber}.`;
  }
  const outcome = notice.outcome;
  if (!outcome) return "Datalogger settings reset. Recording them in RRIV once the board is back…";
  if (outcome.kind === "synced") return "Datalogger settings reset to their defaults and recorded in RRIV.";
  if (outcome.kind === "skipped") return `Datalogger settings reset to their defaults. ${outcome.reason}`;
  return `Datalogger settings reset, but recording them in RRIV failed: ${outcome.error}`;
}

/** The result of a reset, kept on screen across the board's restart. */
export function ResetNoticeCard({ link }: { link: BoardLink }) {
  const task = useTask();
  const notice = link.resetNotice;
  if (!notice) return null;
  const outcome = notice.kind === "factory" ? { kind: "synced" as const } : notice.outcome;
  const failed = outcome?.kind === "failed";
  return (
    <Callout
      tone={failed ? "warning" : outcome ? "success" : "info"}
      action={
        <div className="flex gap-2">
          {failed ? (
            <button
              type="button"
              className={button}
              disabled={task.busy !== null}
              onClick={() => void task.run("retry", () => link.retryResetSync())}
            >
              {task.busy === "retry" ? "Retrying…" : "Retry"}
            </button>
          ) : null}
          {outcome ? (
            <button type="button" className={button} onClick={link.dismissResetNotice}>
              Dismiss
            </button>
          ) : null}
        </div>
      }
    >
      {noticeText(notice)}
    </Callout>
  );
}
