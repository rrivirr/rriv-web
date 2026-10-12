import { Link } from "react-router";
import { Badge } from "@/components/Badge";
import type { SerialConnection } from "@/serial";
import type { BoardLink } from "./useBoardLink";
import { StatusDot, button } from "./ui";

/**
 * Compact identity + status bar for the connected board. Until the board is
 * confirmed as the user's, it shows nothing about the board itself.
 */
export function BoardHeader({ serial, link }: { serial: SerialConnection; link: BoardLink }) {
  const { owned, device, placement } = link;
  const name = owned
    ? (placement?.assignedDeviceName ?? device?.uniqueName ?? serial.info?.serialNumber ?? "New board")
    : "RRIV board connected";
  const mode =
    owned && typeof serial.datalogger?.mode === "string" ? serial.datalogger.mode : null;
  const facts = owned
    ? [
        serial.info?.serialNumber ? `SN ${serial.info.serialNumber}` : null,
        serial.boardVersion ? `Firmware ${serial.boardVersion}` : null,
      ].filter(Boolean)
    : [];

  return (
    <section className="surface flex flex-wrap items-center justify-between gap-4 px-5 py-4">
      <div className="flex min-w-0 items-center gap-3">
        <StatusDot tone={!owned ? "neutral" : serial.watching ? "brand" : "success"} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-fg">{name}</p>
          {owned ? (
            <p className="truncate text-xs text-fg-subtle">
              {facts.join(" · ")}
              {device && placement ? (
                <>
                  {facts.length ? " · " : null}
                  <Link to={`/devices/${device.id}`} className="text-accent hover:underline">
                    {placement.Context.name}
                  </Link>
                </>
              ) : null}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {serial.watching ? (
          <Badge tone="brand">Streaming</Badge>
        ) : mode ? (
          <Badge tone={mode === "interactive" ? "success" : "warning"}>{mode} mode</Badge>
        ) : null}
        <button type="button" className={button} onClick={() => void serial.disconnect()}>
          Disconnect
        </button>
      </div>
    </section>
  );
}
