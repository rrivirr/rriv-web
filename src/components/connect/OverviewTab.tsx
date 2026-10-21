import { useState } from "react";
import { Link } from "react-router";
import { Badge } from "@/components/Badge";
import { SectionCard } from "@/components/SectionCard";
import { formatRelative } from "@/lib/format";
import { type SerialConnection, serialSend, setMode } from "@/serial";
import type { BoardLink } from "./useBoardLink";
import { syncFeedback } from "./syncFeedback";
import { Field, FeedbackCallout, button, input, label, useTask } from "./ui";

export function OverviewTab({
  serial,
  link,
  locked,
}: {
  serial: SerialConnection;
  link: BoardLink;
  locked: boolean;
}) {
  const board = useTask();
  const cloud = useTask();
  const usartTask = useTask();
  const [application, setApplication] = useState("");
  const [usart, setUsart] = useState("");
  const { device, placement } = link;
  const mode = typeof serial.datalogger?.mode === "string" ? serial.datalogger.mode : null;
  // What the cloud has on record; the board itself is only asked on Register.
  const registeredEuis = device?.DeviceEuis?.map((entry) => entry.eui) ?? [];
  const disabled = locked || board.busy !== null;

  return (
    <>
      <SectionCard
        title="Board"
        subtitle="Read from the board over USB."
        action={
          <button
            type="button"
            className={button}
            disabled={disabled}
            onClick={() => void board.run("refresh", () => serial.refreshInfo())}
          >
            {board.busy === "refresh" ? "Reading…" : "Refresh"}
          </button>
        }
      >
        <div className="space-y-5">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
            <Field label="Serial number" value={serial.info?.serialNumber} />
            <Field label="Board uid" value={serial.info?.uid} />
            <Field label="Firmware" value={serial.boardVersion} />
            <Field label="Mode" value={mode} />
          </dl>
          {serial.info?.codes.length ? (
            <Badge tone="warning">Device codes: {serial.info.codes.join(", ")}</Badge>
          ) : null}
          <FeedbackCallout feedback={board.feedback} />
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <button
              type="button"
              className={button}
              disabled={disabled}
              onClick={() =>
                void board.run("clock", async () => {
                  await serial.syncClock();
                  return { tone: "success", message: "Board clock set to this computer's time." };
                })
              }
            >
              {board.busy === "clock" ? "Setting…" : "Sync clock"}
            </button>
            {mode && mode !== "interactive" ? (
              <button
                type="button"
                className={button}
                disabled={disabled || !serial.client}
                onClick={() =>
                  void board.run("mode", async () => {
                    const reply = await setMode(serial.client!, "interactive");
                    await serial.refreshDatalogger();
                    const sync = () => link.syncDatalogger(reply);
                    return syncFeedback(
                      "Datalogger interactive mode",
                      await sync(),
                      sync,
                      board.setFeedback,
                    );
                  })
                }
              >
                {board.busy === "mode" ? "Switching…" : "Switch to interactive"}
              </button>
            ) : null}
            <span className="text-xs text-fg-subtle">
              {serial.clockSetAt
                ? `Clock synced ${formatRelative(serial.clockSetAt)}`
                : "Clock not synced from this browser"}
            </span>
          </div>
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
            void usartTask.run("usart", async () => {
              await serialSend(serial.client!, usart);
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
          <button
            type="submit"
            className={button}
            disabled={locked || usartTask.busy !== null || !serial.client || !usart}
          >
            {usartTask.busy === "usart" ? "Sending…" : "Send"}
          </button>
        </form>
        <div className="mt-3">
          <FeedbackCallout feedback={usartTask.feedback} />
        </div>
      </SectionCard>

      <SectionCard
        title="Cloud"
        subtitle="How this board appears in RRIV."
        action={
          device ? (
            <Link to={`/devices/${device.id}`} className={button}>
              Open device
            </Link>
          ) : null
        }
      >
        {device ? (
          <div className="space-y-5">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
              <Field label="Device" value={device.uniqueName} />
              <Field label="Name in context" value={placement?.assignedDeviceName} />
              <Field label="Context" value={placement?.Context.name} />
            </dl>
            <div className="border-t border-border pt-4">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-semibold text-fg">LoRaWAN</h3>
                {registeredEuis.length ? <Badge tone="success">EUI registered</Badge> : null}
              </div>
              <p className="mt-1 text-xs text-fg-subtle">
                Reads the board's LoRaWAN EUIs and registers them with the network server so
                its uplinks reach RRIV.
              </p>
              {registeredEuis.length ? (
                <p className="mt-1 font-mono text-xs text-fg-muted">
                  Registered: {registeredEuis.join(", ")}
                </p>
              ) : null}
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                <label className="block sm:w-64">
                  <span className={label}>Application (optional)</span>
                  <input
                    className={`${input} mt-1`}
                    value={application}
                    onChange={(event) => setApplication(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className={button}
                  disabled={locked || cloud.busy !== null || !serial.client}
                  onClick={() =>
                    void cloud.run("eui", async () => {
                      const { devEui, joinEui } = await link.registerTelemeter(
                        application.trim() || undefined,
                      );
                      return {
                        tone: "success",
                        message: `Registered Dev EUI ${devEui} (Join EUI ${joinEui}).`,
                      };
                    })
                  }
                >
                  {cloud.busy === "eui" ? "Reading the board…" : "Register EUI"}
                </button>
              </div>
              <div className="mt-3">
                <FeedbackCallout feedback={cloud.feedback} />
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-fg-subtle">Loading this board's cloud record…</p>
        )}
      </SectionCard>
    </>
  );
}
