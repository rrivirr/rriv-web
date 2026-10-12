import { useState } from "react";
import { SectionCard } from "@/components/SectionCard";
import {
  MAX_WATCH_FRAMES,
  type SerialConnection,
  downloadText,
  framesToLog,
  isFileSinkSupported,
  openFileSink,
  watchFilename,
} from "@/serial";
import { Callout, FeedbackCallout, StatusDot, button, primary, useTask } from "./ui";

/** Frames shown in the table; the full buffer stays available for download. */
const VISIBLE_FRAMES = 100;

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString();

export function LiveTab({ serial }: { serial: SerialConnection }) {
  const task = useTask();
  const canSaveToFile = isFileSinkSupported();
  const [toFile, setToFile] = useState(canSaveToFile);
  const [debug, setDebug] = useState(false);
  const { frames, frameCount, watching } = serial;
  const latest = frames.at(-1);
  const visible = frames.slice(-VISIBLE_FRAMES).reverse();
  const truncated = frameCount > frames.length;

  const start = () =>
    void task.run("start", async () => {
      let sink = null;
      if (toFile) {
        sink = await openFileSink(watchFilename());
        // The user closed the save dialog.
        if (!sink) return;
      }
      await serial.startWatch({ debug, sink });
    });

  return (
    <SectionCard
      title="Live data"
      subtitle="Stream readings from the board (watch mode)."
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          {watching ? (
            <button
              type="button"
              className={button}
              disabled={task.busy !== null}
              onClick={() => void task.run("stop", () => serial.stopWatch())}
            >
              {task.busy === "stop" ? "Stopping…" : "Stop watch"}
            </button>
          ) : (
            <button type="button" className={primary} disabled={task.busy !== null} onClick={start}>
              {task.busy === "start" ? "Starting…" : "Start watch"}
            </button>
          )}
          <label className="flex items-center gap-2 text-sm text-fg-muted">
            <input
              type="checkbox"
              checked={debug}
              disabled={watching}
              onChange={(event) => setDebug(event.target.checked)}
            />
            Debug output
          </label>
          {canSaveToFile ? (
            <label className="flex items-center gap-2 text-sm text-fg-muted">
              <input
                type="checkbox"
                checked={toFile}
                disabled={watching}
                onChange={(event) => setToFile(event.target.checked)}
              />
              Save to a file as it streams
            </label>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-subtle">
          <span className="inline-flex items-center gap-2">
            <StatusDot tone={watching ? "brand" : "neutral"} />
            {watching ? "Streaming" : "Stopped"}
          </span>
          <span>{frameCount} frames</span>
          {serial.sinkName ? <span>Writing to {serial.sinkName}</span> : null}
        </div>

        <FeedbackCallout feedback={task.feedback} />
        {truncated && !serial.sinkName ? (
          <Callout tone="warning">
            Only the latest {MAX_WATCH_FRAMES.toLocaleString()} of {frameCount.toLocaleString()} frames
            are kept in memory.
            {canSaveToFile ? " Turn on “Save to a file” to keep a full log." : ""}
          </Callout>
        ) : null}

        {latest ? (
          <div className="rounded-xl border border-border bg-surface-2/40 px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-fg-subtle">
              Latest · {timeOf(latest.receivedAt)}
            </p>
            <p className="mt-1 break-all font-mono text-sm text-fg">{latest.raw}</p>
          </div>
        ) : null}

        {visible.length ? (
          <div className="max-h-72 overflow-auto rounded-lg border border-border">
            <table className="w-full text-left font-mono text-xs">
              <thead className="sticky top-0 bg-surface-2 text-fg-muted">
                <tr>
                  <th className="px-2 py-1 font-normal">received</th>
                  <th className="px-2 py-1 font-normal">data</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((frame, index) => (
                  <tr key={frameCount - index} className="border-t border-border">
                    <td className="whitespace-nowrap px-2 py-1 text-fg-muted">{timeOf(frame.receivedAt)}</td>
                    <td className="break-all px-2 py-1 text-fg">{frame.raw}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-fg-subtle">No frames yet. Start watch to see live data.</p>
        )}

        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <button
            type="button"
            className={button}
            disabled={!frames.length}
            onClick={() => downloadText(watchFilename(), framesToLog(frames))}
          >
            Download log
          </button>
          <button
            type="button"
            className={button}
            disabled={!frames.length || watching}
            onClick={serial.clearFrames}
          >
            Clear
          </button>
        </div>
      </div>
    </SectionCard>
  );
}
