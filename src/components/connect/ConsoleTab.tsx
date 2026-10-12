import { type FormEvent, useEffect, useRef, useState } from "react";
import { SectionCard } from "@/components/SectionCard";
import { type SerialClient, type TranscriptEntry, serialSend } from "@/serial";
import { parseJsonObject } from "./ConfigForm";
import { FeedbackCallout, button, input, label, primary, useTask } from "./ui";

/** Read-only commands worth one click. */
const QUICK_COMMANDS: Array<{ label: string; command: Record<string, unknown> }> = [
  { label: "device get", command: { object: "device", action: "get" } },
  { label: "board version", command: { object: "board", action: "get", parameter: "version" } },
  { label: "datalogger get", command: { object: "datalogger", action: "get" } },
  { label: "sensor list", command: { object: "sensor", action: "list" } },
  { label: "telemeter get", command: { object: "telemeter", action: "get" } },
  { label: "i2c list", command: { object: "board", action: "i2c", subcommand: "list" } },
  { label: "memory check", command: { object: "board", action: "memory", subcommand: "check" } },
];

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString();

export function ConsoleTab({
  client,
  transcript,
  onClear,
  locked,
}: {
  client: SerialClient;
  transcript: TranscriptEntry[];
  onClear: () => void;
  locked: boolean;
}) {
  const task = useTask();
  const [command, setCommand] = useState("");
  const [usart, setUsart] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const disabled = locked || task.busy !== null;

  useEffect(() => {
    const node = scroller.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [transcript.length]);

  const send = (payload: Record<string, unknown>) =>
    // The reply lands in the transcript; nothing else to report on success.
    task.run("send", async () => void (await client.sendRaw(payload)));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void task.run("send", async () => {
      await client.sendRaw(parseJsonObject(command));
      setCommand("");
    });
  };

  return (
    <>
      <SectionCard
        title="Serial console"
        subtitle="Everything sent to and received from the board this session."
        action={
          <button type="button" className={button} disabled={!transcript.length} onClick={onClear}>
            Clear
          </button>
        }
      >
        <div className="space-y-4">
          <div
            ref={scroller}
            className="h-72 overflow-auto rounded-lg border border-border bg-bg p-3 font-mono text-xs"
            aria-label="Serial transcript"
            role="log"
          >
            {transcript.length ? (
              transcript.map((entry) => (
                <div key={entry.id} className="flex gap-3 py-0.5">
                  <span className="shrink-0 text-fg-subtle">{timeOf(entry.at)}</span>
                  <span
                    className={`shrink-0 ${entry.direction === "tx" ? "text-accent" : "text-fg-subtle"}`}
                    aria-label={entry.direction === "tx" ? "sent" : "received"}
                  >
                    {entry.direction === "tx" ? "→" : "←"}
                  </span>
                  <span className="break-all text-fg">{entry.text}</span>
                </div>
              ))
            ) : (
              <p className="text-fg-subtle">Nothing yet.</p>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {QUICK_COMMANDS.map((quick) => (
              <button
                key={quick.label}
                type="button"
                className="rounded-full border border-border px-2.5 py-1 font-mono text-xs text-fg-muted transition hover:border-border-strong hover:text-fg disabled:opacity-50"
                disabled={disabled}
                onClick={() => void send(quick.command)}
              >
                {quick.label}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
            <input
              className={`${input} font-mono text-xs`}
              aria-label="JSON command"
              spellCheck={false}
              placeholder='{"object":"sensor","action":"get","id":"temp01"}'
              value={command}
              onChange={(event) => setCommand(event.target.value)}
            />
            <button type="submit" className={primary} disabled={disabled || !command.trim()}>
              {task.busy === "send" ? "Sending…" : "Send"}
            </button>
          </form>
          <FeedbackCallout feedback={task.feedback} />
        </div>
      </SectionCard>

      <SectionCard
        title="Serial out"
        subtitle="Forward a message out of the board's USART port. Prefix with 0x to send hex."
      >
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            void task.run("usart", async () => {
              await serialSend(client, usart);
              setUsart("");
              return { tone: "success", message: "Message sent." };
            });
          }}
        >
          <label className="block flex-1">
            <span className={label}>Message</span>
            <input
              className={`${input} mt-1 font-mono text-xs`}
              value={usart}
              onChange={(event) => setUsart(event.target.value)}
            />
          </label>
          <button type="submit" className={button} disabled={disabled || !usart}>
            {task.busy === "usart" ? "Sending…" : "Send"}
          </button>
        </form>
      </SectionCard>
    </>
  );
}
