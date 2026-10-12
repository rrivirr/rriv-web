import { type SerialRecord, unappliedChanges } from "@/serial";
import type { SyncOutcome } from "./useBoardLink";
import { type Feedback, button } from "./ui";

/**
 * Report a board write and its cloud sync as separate outcomes, so a failed
 * upload never reads as a failed write. A failed sync offers a retry, since
 * the board has already changed.
 */
export function syncFeedback(
  what: string,
  outcome: SyncOutcome,
  retry: () => Promise<SyncOutcome>,
  show: (feedback: Feedback) => void,
): Feedback {
  if (outcome.kind === "synced") {
    return { tone: "success", message: `${what} applied to the board and synced to the cloud.` };
  }
  if (outcome.kind === "skipped") {
    return { tone: "success", message: `${what} applied to the board. ${outcome.reason}` };
  }
  return {
    tone: "warning",
    message: `${what} applied to the board, but the cloud sync failed: ${outcome.error}`,
    action: (
      <button
        type="button"
        className={button}
        onClick={() =>
          void retry().then((next) => show(syncFeedback(what, next, retry, show)))
        }
      >
        Retry sync
      </button>
    ),
  };
}

const describeValue = (value: unknown) => JSON.stringify(value);

/**
 * After a board write: sync the board's reply to the cloud (always: the board
 * is the source of truth), and point out any requested change the reply
 * doesn't reflect, so a setting the board ignored doesn't read as applied.
 */
export async function reportApply(
  what: string,
  requested: SerialRecord,
  reply: SerialRecord,
  sync: () => Promise<SyncOutcome>,
  showFeedback: (feedback: Feedback) => void,
): Promise<Feedback> {
  const synced = syncFeedback(what, await sync(), sync, showFeedback);
  const ignored = unappliedChanges(requested, reply);
  if (!ignored.length) return synced;
  const detail = ignored
    .map(
      (change) =>
        `${change.key} is ${describeValue(change.kept)} (sent ${describeValue(change.requested)})`,
    )
    .join("; ");
  return {
    ...synced,
    tone: "warning",
    message: `${synced.message} The board's reply doesn't reflect every change: ${detail}.`,
  };
}
