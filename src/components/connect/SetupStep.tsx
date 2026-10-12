import { type FormEvent, type ReactNode, useState } from "react";
import { useContexts } from "@/api/contexts";
import { useCreateContext } from "@/api/mutations";
import { SectionCard } from "@/components/SectionCard";
import { Spinner } from "@/components/Spinner";
import type { SerialConnection } from "@/serial";
import type { BoardLink, SyncOutcome } from "./useBoardLink";
import { Callout, type Feedback, FeedbackCallout, button, input, label, primary, useTask } from "./ui";

const NEW_CONTEXT = "__new__";

/** What happened to the post-link datalogger upload, as a sentence. */
function pulledMessage(outcome: SyncOutcome) {
  if (outcome.kind === "synced") return "Its datalogger config was uploaded to the cloud.";
  if (outcome.kind === "failed") return `Uploading its datalogger config failed: ${outcome.error}`;
  return outcome.reason;
}

/** A setup stage that stops here: the board tools stay locked. */
function Blocked({ title, children }: { title: string; children: ReactNode }) {
  return (
    <SectionCard title={title}>
      <div className="space-y-2 text-sm text-fg-muted">{children}</div>
    </SectionCard>
  );
}

/**
 * The guided part of the page, shown until the board is confirmed as the
 * user's. Connecting binds the board like `rrivctl connect`; anything that
 * isn't the user's board (or can't be checked) stops here.
 */
export function SetupStep({
  serial,
  link,
  onSkip,
  onComplete,
}: {
  serial: SerialConnection;
  link: BoardLink;
  onSkip: () => void;
  /** Setup finished; this card unmounts, so the page shows the result. */
  onComplete: (feedback: Feedback) => void;
}) {
  const task = useTask();

  switch (link.stage) {
    case "reading":
    case "ready":
      return null;

    case "checking":
      return (
        <section className="surface px-5 py-4">
          <Spinner label="Checking this board with RRIV…" />
        </section>
      );

    case "cloud-error":
      return (
        <Callout
          tone="danger"
          action={
            <button type="button" className={button} onClick={link.retry}>
              Retry
            </button>
          }
        >
          <p>Couldn't confirm this board with the RRIV cloud, so its tools stay locked.</p>
          {link.cloudError ? <p className="mt-1 text-xs opacity-80">{link.cloudError}</p> : null}
        </Callout>
      );

    case "foreign":
      return (
        <Blocked title="This board belongs to another account">
          <p>It's linked to a different RRIV account, so you can't view or configure it here.</p>
          <p>Ask its owner to unlink it, or connect a board you own.</p>
        </Blocked>
      );

    case "unregistered":
      return (
        <Blocked title="RRIV doesn't recognise this board">
          <p>
            Its serial number isn't registered here. It may have been provisioned in another RRIV
            environment.
          </p>
          <p>Ask a RRIV admin or provisioner to check it.</p>
        </Blocked>
      );

    case "needs-provisioner":
      return (
        <Blocked title="This board hasn't been provisioned">
          <p>
            It has no serial number yet, so it can't be linked to an account. Provisioning is done
            by RRIV admins and provisioners.
          </p>
          <p>
            Ask one to provision it, quoting the board uid{" "}
            <span className="break-all font-mono">{serial.info?.uid ?? "—"}</span>.
          </p>
        </Blocked>
      );

    case "unprovisioned":
      return (
        <SectionCard
          title="Provision this board"
          subtitle="This board has no serial number yet. Provisioning registers it with RRIV and writes the new serial number to the board."
        >
          <div className="space-y-4">
            <dl>
              <dt className={label}>Board uid</dt>
              <dd className="mt-0.5 break-all font-mono text-sm text-fg">
                {serial.info?.uid ?? "—"}
              </dd>
            </dl>
            <FeedbackCallout feedback={task.feedback} />
            <button
              type="button"
              className={primary}
              disabled={task.busy !== null}
              onClick={() =>
                void task.run("provision", async () => {
                  const created = await link.provision();
                  return { tone: "success", message: `Provisioned as ${created.serialNumber}.` };
                })
              }
            >
              {task.busy ? "Provisioning…" : "Provision board"}
            </button>
          </div>
        </SectionCard>
      );

    case "no-context":
      return (
        <SectionCard
          title="Choose a context for this board"
          subtitle="The board is on your account. Put it in a context so its config changes sync to the cloud."
        >
          <ContextChooser
            busy={task.busy !== null}
            feedback={task.feedback}
            footer={
              <button
                type="button"
                className="text-xs text-fg-subtle underline-offset-2 hover:text-fg hover:underline"
                onClick={onSkip}
              >
                Skip for now
              </button>
            }
            onSubmit={(contextId) =>
              void task.run("assign", async () => {
                const { device, pulled } = await link.assignContext(contextId);
                onComplete({
                  tone: pulled?.kind === "failed" ? "warning" : "success",
                  message: [
                    `${device.uniqueName} is ready.`,
                    pulled ? pulledMessage(pulled) : null,
                  ]
                    .filter(Boolean)
                    .join(" "),
                });
              })
            }
          />
        </SectionCard>
      );
  }
}

function ContextChooser({
  busy,
  feedback,
  footer,
  onSubmit,
}: {
  busy: boolean;
  feedback: Feedback | null;
  footer: ReactNode;
  onSubmit: (contextId: string) => void;
}) {
  const contexts = useContexts({});
  const createContext = useCreateContext();
  const [choice, setChoice] = useState("");
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const creating = choice === NEW_CONTEXT;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!creating) return onSubmit(choice);
    try {
      const created = await createContext.mutateAsync({ name: newName.trim() });
      setChoice(created.id);
      onSubmit(created.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const ready = creating ? newName.trim().length > 0 : Boolean(choice);
  const pending = busy || createContext.isPending;

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={label}>Context</span>
          <select
            className={`${input} mt-1`}
            aria-label="Context"
            value={choice}
            onChange={(event) => setChoice(event.target.value)}
          >
            <option value="">{contexts.isPending ? "Loading contexts…" : "Choose a context…"}</option>
            {contexts.data?.map((context) => (
              <option key={context.id} value={context.id}>
                {context.name}
              </option>
            ))}
            <option value={NEW_CONTEXT}>+ New context…</option>
          </select>
        </label>
        {creating ? (
          <label className="block">
            <span className={label}>New context name</span>
            <input
              className={`${input} mt-1`}
              autoFocus
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="e.g. well-a"
            />
          </label>
        ) : null}
      </div>
      <FeedbackCallout feedback={error ? { tone: "danger", message: error } : feedback} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="submit" className={primary} disabled={!ready || pending}>
          {pending ? "Working…" : "Add to context"}
        </button>
        {footer}
      </div>
    </form>
  );
}
