import { type ReactNode, useEffect, useState } from "react";
import { BoardHeader } from "@/components/connect/BoardHeader";
import { ConnectPanel } from "@/components/connect/ConnectPanel";
import { ConsoleTab } from "@/components/connect/ConsoleTab";
import { DataloggerTab } from "@/components/connect/DataloggerTab";
import { LiveTab } from "@/components/connect/LiveTab";
import { OverviewTab } from "@/components/connect/OverviewTab";
import { SensorsTab } from "@/components/connect/SensorsTab";
import { SetupStep } from "@/components/connect/SetupStep";
import {
  Callout,
  type Feedback,
  FeedbackCallout,
  StatusDot,
  TabPanel,
  Tabs,
} from "@/components/connect/ui";
import { useBoardLink } from "@/components/connect/useBoardLink";
import { EmptyState } from "@/components/EmptyState";
import { isWebSerialSupported, useSerialConnection } from "@/serial";

type Tab = "overview" | "sensors" | "datalogger" | "live" | "console";

export function DeviceConnectionPage() {
  if (!isWebSerialSupported()) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
        <EmptyState
          title="Connect a board"
          description="This browser does not support Web Serial. Use Chrome, Edge or another Chromium-based browser to connect a board."
        />
      </div>
    );
  }
  return <DeviceConnection />;
}

/**
 * Connect → (provision → bind → place in a context) → board workspace.
 *
 * Connecting reads the board and binds it to the account like
 * `rrivctl connect`. The workspace (the serial tools that don't need probe-rs)
 * only opens once the board is confirmed as the user's; until then the setup
 * step explains what's needed.
 */
function DeviceConnection() {
  const serial = useSerialConnection();
  const link = useBoardLink(serial);
  const [tab, setTab] = useState<Tab>("overview");
  const [skippedSetup, setSkippedSetup] = useState(false);
  const [setupResult, setSetupResult] = useState<Feedback | null>(null);

  const serialNumber = serial.info?.serialNumber ?? null;
  // A different board (or a fresh connection) starts setup over.
  useEffect(() => {
    setSkippedSetup(false);
    setSetupResult(null);
    setTab("overview");
  }, [serialNumber, serial.activePort]);

  const client = serial.client;
  if (serial.status !== "connected" || !client) {
    return (
      <Page>
        <ConnectPanel serial={serial} />
      </Page>
    );
  }

  // Only an owned board without a context may be used before setup finishes.
  const showWorkspace = link.stage === "ready" || (link.stage === "no-context" && skippedSetup);
  // Streaming mode floods the line; keep request/response tools out of its way.
  const locked = serial.watching;

  const tabs = [
    { id: "overview" as const, label: "Overview" },
    { id: "sensors" as const, label: "Sensors" },
    { id: "datalogger" as const, label: "Datalogger" },
    {
      id: "live" as const,
      label: "Live data",
      badge: serial.watching ? <StatusDot tone="brand" /> : undefined,
    },
    { id: "console" as const, label: "Console" },
  ];

  return (
    <Page>
      <BoardHeader serial={serial} link={link} />

      {serial.restart ? (
        <Callout
          tone={serial.restart.kind === "crash" ? "warning" : "info"}
          action={
            <button
              type="button"
              className="text-xs text-accent hover:underline"
              onClick={serial.dismissRestart}
            >
              Dismiss
            </button>
          }
        >
          {serial.restart.kind === "crash"
            ? `The board crashed${serial.restart.message ? ` (${serial.restart.message})` : ""} and restarted. It's reconnected and its details were re-read.`
            : "The board restarted. Its details were re-read and its clock re-synced."}
        </Callout>
      ) : null}

      {!showWorkspace ? (
        <SetupStep
          serial={serial}
          link={link}
          onSkip={() => setSkippedSetup(true)}
          onComplete={setSetupResult}
        />
      ) : (
        <>
          <FeedbackCallout feedback={setupResult} />
          {link.stage === "no-context" ? (
            <Callout
              tone="info"
              action={
                <button
                  type="button"
                  className="text-xs text-accent hover:underline"
                  onClick={() => setSkippedSetup(false)}
                >
                  Finish setup
                </button>
              }
            >
              Not in a context yet. Changes are applied to the board but not synced to the cloud.
            </Callout>
          ) : null}
          {locked && tab !== "live" ? (
            <Callout tone="info">Stop live data to read or change the board's config.</Callout>
          ) : null}

          <Tabs tabs={tabs} value={tab} onChange={setTab} />
          <TabPanel id={tab}>
            {tab === "overview" ? <OverviewTab serial={serial} link={link} locked={locked} /> : null}
            {tab === "sensors" ? <SensorsTab client={client} link={link} locked={locked} /> : null}
            {tab === "datalogger" ? <DataloggerTab serial={serial} link={link} locked={locked} /> : null}
            {tab === "live" ? <LiveTab serial={serial} /> : null}
            {tab === "console" ? (
              <ConsoleTab
                client={client}
                transcript={serial.transcript}
                onClear={serial.clearTranscript}
                locked={locked}
              />
            ) : null}
          </TabPanel>
        </>
      )}
    </Page>
  );
}

function Page({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 px-4 py-8 sm:px-6">
      <header>
        <h1 className="text-lg font-semibold text-fg">Connect a board</h1>
        <p className="mt-1 text-sm text-fg-subtle">
          Set up, configure and watch a RRIV board over USB, right from the browser.
        </p>
      </header>
      {children}
    </div>
  );
}
