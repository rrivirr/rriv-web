import { useState } from "react";
import { IconActivity } from "@/assets/Icons";
import { Spinner } from "@/components/Spinner";
import type { SerialConnection } from "@/serial";
import { Callout, button, primary } from "./ui";

/** The not-connected states: first connect, reconnecting, failures, lost board. */
export function ConnectPanel({ serial }: { serial: SerialConnection }) {
  const [pickerError, setPickerError] = useState<string | null>(null);
  const connecting = serial.status === "connecting";

  const connectNew = () => {
    setPickerError(null);
    serial.connectNew().catch((cause: unknown) => {
      setPickerError(cause instanceof Error ? cause.message : String(cause));
    });
  };

  return (
    <section className="surface p-6 sm:p-8">
      {serial.status === "lost" ? (
        <div className="mb-6">
          <Callout
            tone="warning"
            action={
              <button type="button" className={button} onClick={() => void serial.reconnect()}>
                Reconnect
              </button>
            }
          >
            {serial.error ??
              "The board disconnected. Plug it back in. It reconnects automatically when it reappears."}
          </Callout>
        </div>
      ) : null}
      {serial.status === "error" && serial.error ? (
        <div className="mb-6">
          <Callout tone="danger">{serial.error}</Callout>
        </div>
      ) : null}
      {pickerError ? (
        <div className="mb-6">
          <Callout tone="danger">{pickerError}</Callout>
        </div>
      ) : null}

      <div className="flex flex-col items-center text-center">
        <span className="mb-4 grid h-12 w-12 place-items-center rounded-xl border border-accent/20 bg-accent/10 text-accent">
          <IconActivity className="h-6 w-6" />
        </span>
        <h2 className="text-base font-semibold text-fg">Connect a RRIV board</h2>
        <p className="mt-1 max-w-md text-sm text-fg-subtle">
          Plug the board into this computer over USB, then pick it in the browser prompt.
        </p>
        <div className="mt-5">
          {connecting ? (
            <Spinner
              label={
                serial.waitingForBoot ? "Waiting for the board to finish starting…" : "Reading the board…"
              }
            />
          ) : (
            <button type="button" className="btn btn-primary" onClick={connectNew}>
              Connect board
            </button>
          )}
        </div>
      </div>

      {serial.ports.length && !connecting ? (
        <div className="mt-8 border-t border-border pt-5">
          <h3 className="text-xs font-semibold text-fg">Boards this browser can use</h3>
          <p className="mt-1 text-xs text-fg-subtle">
            Allowed earlier in this browser. Access is cleared when you sign out.
          </p>
          <ul className="mt-3 space-y-2">
            {serial.ports.map(({ port, label }) => (
              <li
                key={label}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-2/40 px-3 py-2"
              >
                <span className="text-sm text-fg">{label}</span>
                <button
                  type="button"
                  className={primary}
                  aria-label={`Connect ${label}`}
                  onClick={() => void serial.connect(port)}
                >
                  Connect
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

    </section>
  );
}
