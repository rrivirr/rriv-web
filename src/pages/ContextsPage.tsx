import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router";
import { IconArrowRight, IconSearch, IconWaves } from "@/assets/Icons";
import { useContexts } from "@/api/contexts";
import { useCreateContext } from "@/api/mutations";
import type { Context } from "@/api/types";
import { useAuth } from "@/auth/useAuth";
import { Badge } from "@/components/Badge";
import { EmptyState } from "@/components/EmptyState";
import { Pager } from "@/components/Pager";
import { QueryError } from "@/components/QueryError";
import { Skeleton } from "@/components/Skeleton";
import { Spinner } from "@/components/Spinner";
import { formatRelative } from "@/lib/format";

const PAGE_SIZE = 24;

type Ownership = "all" | "owned" | "shared";
type Status = "active" | "ended" | "all";

const OWNERSHIP_LABELS: Record<Ownership, string> = {
  all: "All",
  owned: "Owned by me",
  shared: "Shared with me",
};

const STATUS_LABELS: Record<Status, string> = {
  active: "Active",
  ended: "Ended",
  all: "Any status",
};

export function ContextsPage() {
  const { user } = useAuth();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [ownership, setOwnership] = useState<Ownership>("all");
  const [status, setStatus] = useState<Status>("active");
  const [offset, setOffset] = useState(0);

  const query = useContexts({
    search: search || undefined,
    ended: status === "all" ? undefined : status === "ended",
    limit: PAGE_SIZE,
    offset,
  });
  const createContext = useCreateContext();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const subjectId = user?.profile?.sub;
  const raw = query.data ?? [];
  const contexts = raw.filter((context) => {
    const owned = context.Account?.id === subjectId;
    if (ownership === "owned") return owned;
    if (ownership === "shared") return !owned;
    return true;
  });

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearch(searchInput.trim());
    setOffset(0);
  }

  function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = newName.trim();
    if (value.length < 3 || value.length > 20) return;
    createContext.mutate(
      { name: value },
      {
        onSuccess: () => {
          setNewName("");
          setCreating(false);
        },
      },
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">
            Contexts
          </h1>
          <p className="mt-1 text-sm text-fg-muted">
            Deployment periods that group devices. Open one to see its devices.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setCreating((open) => !open)}
        >
          New context
        </button>
      </header>

      {creating ? (
        <form
          className="surface flex flex-wrap items-end gap-3 p-4"
          onSubmit={onCreate}
        >
          <div className="min-w-0 flex-1">
            <label
              htmlFor="new-context-name"
              className="mb-1.5 block text-xs font-medium text-fg-muted"
            >
              Context name (3–20)
            </label>
            <input
              id="new-context-name"
              className="field"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="spring-2026"
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={
              createContext.isPending ||
              newName.trim().length < 3 ||
              newName.trim().length > 20
            }
          >
            {createContext.isPending ? <Spinner /> : "Create"}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setCreating(false)}
          >
            Cancel
          </button>
          {createContext.isError ? (
            <p className="w-full text-xs text-red-500">
              {createContext.error instanceof Error
                ? createContext.error.message
                : "Could not create the context."}
            </p>
          ) : null}
        </form>
      ) : null}

      <form
        className="grid gap-3 sm:grid-cols-[1fr_auto_auto]"
        onSubmit={onSearch}
      >
        <div className="relative">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search contexts"
            className="field pl-9"
            aria-label="Search contexts"
          />
        </div>
        <select
          value={ownership}
          onChange={(event) => {
            setOwnership(event.target.value as Ownership);
            setOffset(0);
          }}
          className="field sm:w-44"
          aria-label="Ownership"
        >
          {(Object.keys(OWNERSHIP_LABELS) as Ownership[]).map((option) => (
            <option key={option} value={option}>
              {OWNERSHIP_LABELS[option]}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as Status);
            setOffset(0);
          }}
          className="field sm:w-40"
          aria-label="Status"
        >
          {(Object.keys(STATUS_LABELS) as Status[]).map((option) => (
            <option key={option} value={option}>
              {STATUS_LABELS[option]}
            </option>
          ))}
        </select>
        <button type="submit" className="btn btn-primary sm:col-span-1">
          Search
        </button>
      </form>

      {query.isError ? (
        <QueryError error={query.error} label="contexts" />
      ) : query.isPending ? (
        <ListSkeleton />
      ) : raw.length === 0 ? (
        <EmptyState
          icon={<IconWaves className="h-5 w-5" />}
          title="No contexts found"
          description="Create a context in the RRIV app or CLI to group devices over a deployment period."
        />
      ) : (
        <>
          {contexts.length === 0 ? (
            <p className="text-sm text-fg-subtle">
              No {OWNERSHIP_LABELS[ownership].toLowerCase()} contexts on this
              page — try the next page.
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {contexts.map((context) => (
                <ContextRow
                  key={context.id}
                  context={context}
                  owned={context.Account?.id === subjectId}
                />
              ))}
            </ul>
          )}
          <Pager
            offset={offset}
            pageSize={PAGE_SIZE}
            count={contexts.length}
            rawCount={raw.length}
            isFetching={query.isFetching}
            onPrev={() => setOffset((page) => Math.max(0, page - PAGE_SIZE))}
            onNext={() => setOffset((page) => page + PAGE_SIZE)}
            noun="context"
          />
        </>
      )}
    </div>
  );
}

function ContextRow({ context, owned }: { context: Context; owned: boolean }) {
  return (
    <li>
      <Link
        to={`/contexts/${context.id}`}
        className="surface surface-interactive flex items-center justify-between gap-4 p-4"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-fg">
              {context.name}
            </p>
            {!owned ? <Badge tone="brand">shared</Badge> : null}
          </div>
          <p className="mt-1 truncate text-xs text-fg-subtle">
            {context.Account?.email ?? "Unknown owner"} · started{" "}
            {formatRelative(context.startedAt)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Badge tone={context.endedAt ? "neutral" : "success"}>
            {context.endedAt ? "ended" : "active"}
          </Badge>
          <IconArrowRight className="h-4 w-4 text-fg-subtle" />
        </div>
      </Link>
    </li>
  );
}

function ListSkeleton() {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {Array.from({ length: 6 }).map((_, index) => (
        <li key={index} className="surface space-y-3 p-4">
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-3 w-3/5" />
        </li>
      ))}
    </ul>
  );
}
