import { useState } from "react";
import { IconActivity } from "@/assets/Icons";
import { Spinner } from "@/components/Spinner";
import type { SerialConnection } from "@/serial";
import { DiagnosticsButton } from "./DiagnosticsButton";
import type { BoardLink } from "./useBoardLink";
import { Callout, button, primary } from "./ui";

/** The not-connected states: first connect, reconnecting, failures, lost board. */
export function ConnectPanel({ serial, link }: { serial: SerialConnection; link?: BoardLink }) {
  const [pickerError, setPickerError] = useState<string | null>(null);
  const connecting = serial.status === "connecting";
  /**
   * Only offer diagnostics after something went wrong: mid-connect (a traced
   * start-up, a restart) the page is still catching up, so a bundle saved then
   * would describe a half-read board.
   */
  const failed =
    !connecting && (serial.status === "error" || serial.status === "lost" || pickerError !== null);

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
      {serial.status === "error" && serial.error ? <ConnectError message={serial.error} /> : null}
      {pickerError ? <ConnectError message={pickerError} /> : null}

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
                serial.startupStep
                  ? `Tracing the start-up: ${serial.startupStep}…`
                  : serial.waitingForBoot
                    ? "Waiting for the board to finish starting…"
                    : "Reading the board…"
              }
            />
          ) : (
            <button type="button" className="btn btn-primary" onClick={connectNew}>
              Connect board
            </button>
          )}
        </div>
      </div>

      {failed ? (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-xs text-fg-subtle">
          <span>Something not working? Save what this page saw for RRIV support.</span>
          <DiagnosticsButton serial={serial} link={link} />
        </div>
      ) : null}

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

/**
 * A failed connect. The browser can keep a port it has lost track of open
 * (after a timeout, say) until the page reloads, so offer a refresh.
 */
function ConnectError({ message }: { message: string }) {
  return (
    <div className="mb-6">
      <Callout
        tone="danger"
        action={
          <button type="button" className={button} onClick={() => window.location.reload()}>
            Refresh page
          </button>
        }
      >
        {message} If connecting keeps failing, refresh the page and connect again.
      </Callout>
    </div>
  );
}
