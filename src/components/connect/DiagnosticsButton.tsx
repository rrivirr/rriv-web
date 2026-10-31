import {
  type SerialConnection,
  buildDiagnostics,
  describePort,
  diagnosticsFilename,
  downloadText,
} from "@/serial";
import type { BoardLink } from "./useBoardLink";
import { button } from "./ui";

/**
 * Save what the page knows about this connection (transcript, errors, what
 * the board reported, the cloud record) as a file to attach to a support
 * request.
 */
export function DiagnosticsButton({
  serial,
  link,
}: {
  serial: SerialConnection;
  link?: BoardLink;
}) {
  const download = () => {
    const bundle = buildDiagnostics(serial, {
      startup: link?.startupReport ?? null,
      port: serial.activePort ? describePort(serial.activePort) : null,
      cloud: link
        ? {
            stage: link.stage,
            deviceId: link.device?.id ?? null,
            contextId: link.placement?.Context.id ?? null,
            cloudError: link.cloudError,
          }
        : {},
    });
    downloadText(diagnosticsFilename(serial), JSON.stringify(bundle, null, 2), "application/json");
  };
  return (
    <button type="button" className={button} onClick={download}>
      Download diagnostics
    </button>
  );
}
