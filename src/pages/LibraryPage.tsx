import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router";
import { IconLayers, IconSearch } from "@/assets/Icons";
import { ApiError } from "@/api/client";
import {
  LIBRARY_KINDS,
  creatorName,
  useLibraryConfigs,
} from "@/api/library";
import type { LibraryFilters, LibraryKind } from "@/api/library";
import type { LibraryConfigSummary } from "@/api/types";
import { Badge } from "@/components/Badge";
import { EmptyState } from "@/components/EmptyState";
import { Pager } from "@/components/Pager";
import { SectionCard } from "@/components/SectionCard";
import { Skeleton } from "@/components/Skeleton";
import { formatRelative } from "@/lib/format";

const PAGE_SIZE = 24;
/** The API caps `offset` at 100. */
const MAX_OFFSET = 100;
const MIN_SEARCH = 3;

const KIND_LABELS: Record<LibraryKind, string> = {
  sensor: "Sensors",
  datalogger: "Dataloggers",
  system: "Systems",
};

const KIND_HINTS: Record<LibraryKind, string> = {
  sensor: "Reusable sensor measurement configurations.",
  datalogger: "Reusable datalogger and board configurations.",
  system: "Complete deployments: a datalogger plus its sensors.",
};

type Scope = "mine" | "public";

const SCOPE_LABELS: Record<Scope, string> = {
  mine: "My configs",
  public: "Published",
};

type SortKey = "createdAt:desc" | "createdAt:asc" | "name:asc" | "name:desc";

const SORT_LABELS: Record<SortKey, string> = {
  "createdAt:desc": "Newest first",
  "createdAt:asc": "Oldest first",
  "name:asc": "Name A–Z",
  "name:desc": "Name Z–A",
};

function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

export function LibraryPage() {
  const [kind, setKind] = useState<LibraryKind>("sensor");
  const [scope, setScope] = useState<Scope>("public");
  const [sort, setSort] = useState<SortKey>("createdAt:desc");
  const [offset, setOffset] = useState(0);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [authorInput, setAuthorInput] = useState("");
  const [author, setAuthor] = useState("");

  const filters = useMemo<LibraryFilters>(() => {
    const [orderBy, order] = sort.split(":") as [
      "createdAt" | "name",
      "asc" | "desc",
    ];
    return {
      search: search || undefined,
      isPublic: scope === "public" ? true : undefined,
      // Author filtering only applies to published (someone else's) configs.
      author: scope === "public" ? author || undefined : undefined,
      orderBy,
      order,
      limit: PAGE_SIZE,
      offset,
    };
  }, [sort, scope, search, author, offset]);

  const query = useLibraryConfigs(kind, filters);
  const entries = query.data ?? [];
  const unauthorized = isUnauthorized(query.error);

  function resetTo(next: Partial<{ offset: number }> = {}) {
    setOffset(next.offset ?? 0);
  }

  function changeKind(next: LibraryKind) {
    setKind(next);
    resetTo();
  }

  function changeScope(next: Scope) {
    setScope(next);
    if (next === "mine") setAuthor("");
    resetTo();
  }

  function changeSort(next: SortKey) {
    setSort(next);
    resetTo();
  }

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = searchInput.trim();
    setSearch(trimmed.length >= MIN_SEARCH ? trimmed : "");
    if (scope === "public") {
      const nextAuthor = authorInput.trim();
      setAuthor(nextAuthor.length >= MIN_SEARCH ? nextAuthor : "");
    }
    resetTo();
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">
            Library
          </h1>
          <p className="mt-1 text-sm text-fg-muted">
            Look up published configurations and inspect their versions,
            creators and payloads.
          </p>
        </div>
        <Badge tone="brand">{KIND_LABELS[kind]}</Badge>
      </header>

      {/* ------------------------------------------------------------ Tabs */}
      <div className="flex flex-wrap gap-1.5">
        {LIBRARY_KINDS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => changeKind(option)}
            className={[
              "rounded-lg px-3 py-1.5 text-sm transition",
              option === kind
                ? "bg-surface-2 text-fg"
                : "text-fg-muted hover:text-fg",
            ].join(" ")}
          >
            {KIND_LABELS[option]}
          </button>
        ))}
      </div>

      {/* --------------------------------------------------------- Controls */}
      <SectionCard
        title="Find a configuration"
        subtitle={KIND_HINTS[kind]}
        action={<Badge tone="neutral">{SCOPE_LABELS[scope]}</Badge>}
      >
        <form
          className={[
            "grid gap-3",
            scope === "public"
              ? "sm:grid-cols-[1fr_auto_auto_1fr_auto]"
              : "sm:grid-cols-[1fr_auto_auto_auto]",
          ].join(" ")}
          onSubmit={onSearch}
        >
          <div className="relative">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search by name (min 3 characters)"
              className="field pl-9"
              aria-label="Search configurations by name"
            />
          </div>

          <select
            value={scope}
            onChange={(event) => changeScope(event.target.value as Scope)}
            className="field sm:w-40"
            aria-label="Scope"
          >
            {(Object.keys(SCOPE_LABELS) as Scope[]).map((option) => (
              <option key={option} value={option}>
                {SCOPE_LABELS[option]}
              </option>
            ))}
          </select>

          <select
            value={sort}
            onChange={(event) => changeSort(event.target.value as SortKey)}
            className="field sm:w-40"
            aria-label="Sort order"
          >
            {(Object.keys(SORT_LABELS) as SortKey[]).map((option) => (
              <option key={option} value={option}>
                {SORT_LABELS[option]}
              </option>
            ))}
          </select>

          {scope === "public" ? (
            <div className="relative">
              <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
              <input
                type="search"
                value={authorInput}
                onChange={(event) => setAuthorInput(event.target.value)}
                placeholder="Filter by author (optional)"
                className="field pl-9"
                aria-label="Filter by author"
              />
            </div>
          ) : null}

          <button type="submit" className="btn btn-primary">
            Search
          </button>
        </form>

        <p className="mt-3 text-xs text-fg-subtle">
          {scope === "mine"
            ? "Showing configurations created by your account."
            : "Showing configurations published to the shared library. Optionally filter by an author's name."}
        </p>
      </SectionCard>

      {/* ---------------------------------------------------------- Results */}
      {unauthorized ? (
        <div className="surface border-amber-500/30 p-4 text-sm text-amber-600 dark:text-amber-200">
          Your account is not linked to the RRIV API yet, so the library is
          unavailable. Visit the overview to finish onboarding.
        </div>
      ) : query.isError ? (
        <div className="surface border-red-500/30 p-4 text-sm text-red-600 dark:text-red-300">
          Could not load the library: {query.error.message}
        </div>
      ) : query.isPending ? (
        <ResultsSkeleton />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={<IconLayers className="h-5 w-5" />}
          title="No configurations found"
          description={
            scope === "mine"
              ? "You have not published any configurations here yet."
              : "Try a different search or author."
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((entry) => (
            <LibraryEntryCard key={entry.id} kind={kind} entry={entry} />
          ))}
        </div>
      )}

      {!query.isError ? (
        <Pager
          offset={offset}
          pageSize={PAGE_SIZE}
          count={entries.length}
          maxOffset={MAX_OFFSET}
          isFetching={query.isFetching}
          onPrev={() =>
            setOffset((current) => Math.max(0, current - PAGE_SIZE))}
          onNext={() =>
            setOffset((current) => Math.min(MAX_OFFSET, current + PAGE_SIZE))}
          noun="config"
        />
      ) : null}
    </div>
  );
}

function LibraryEntryCard({
  kind,
  entry,
}: {
  kind: LibraryKind;
  entry: LibraryConfigSummary;
}) {
  return (
    <Link
      to={`/library/${kind}/${entry.id}`}
      className="surface surface-interactive block p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="truncate text-sm font-medium text-fg">{entry.name}</p>
        <Badge tone={entry.isPublic ? "brand" : "neutral"}>
          {entry.isPublic ? "Public" : "Private"}
        </Badge>
      </div>

      {entry.description ? (
        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-fg-muted">
          {entry.description}
        </p>
      ) : null}

      <p className="mt-4 truncate text-xs text-fg-subtle">
        {creatorName(entry)} · {formatRelative(entry.createdAt)}
      </p>
    </Link>
  );
}

function ResultsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="surface space-y-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-3 w-3/5" />
        </div>
      ))}
    </div>
  );
}
