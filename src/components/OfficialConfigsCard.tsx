import { type FormEvent, useState } from "react";
import { Link } from "react-router";
import { LIBRARY_KINDS, type LibraryKind, creatorName, useLibraryConfigs } from "@/api/library";
import { useSetLibraryOfficial } from "@/api/libraryManage";
import { Badge } from "@/components/Badge";
import { EmptyState } from "@/components/EmptyState";
import { QueryError } from "@/components/QueryError";
import { Skeleton } from "@/components/Skeleton";
import { SectionCard } from "@/components/SectionCard";

const KIND_LABELS: Record<LibraryKind, string> = {
  system: "Whole device",
  datalogger: "Datalogger",
  sensor: "Sensor",
};

/**
 * Admin-only: mark published library configs as official RRIV configs, or
 * unmark them. Marking keeps the config public.
 */
export function OfficialConfigsCard() {
  const [kind, setKind] = useState<LibraryKind>("system");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const list = useLibraryConfigs(kind, {
    isPublic: true,
    search: search || undefined,
    limit: 50,
    orderBy: "name",
    order: "asc",
  });
  const setOfficial = useSetLibraryOfficial();

  const onSearch = (event: FormEvent) => {
    event.preventDefault();
    const value = searchInput.trim();
    setSearch(value.length >= 3 ? value : "");
  };

  return (
    <SectionCard
      title="Official configs"
      subtitle="Mark published library configs as official RRIV configs. Official configs stay public."
    >
      <div className="space-y-4">
        <form className="flex flex-wrap gap-2" onSubmit={onSearch}>
          <select
            className="field sm:w-44"
            aria-label="Library kind"
            value={kind}
            onChange={(event) => setKind(event.target.value as LibraryKind)}
          >
            {LIBRARY_KINDS.map((option) => (
              <option key={option} value={option}>
                {KIND_LABELS[option]}
              </option>
            ))}
          </select>
          <input
            className="field sm:w-60"
            type="search"
            aria-label="Search published configs"
            placeholder="Search by name (min 3)"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
          <button type="submit" className="btn btn-ghost">
            Search
          </button>
        </form>

        {list.isError ? (
          <QueryError error={list.error} label="published configs" />
        ) : list.isPending ? (
          <Skeleton className="h-24 rounded-xl" />
        ) : !list.data.length ? (
          <EmptyState title="No published configs" description="Nothing public of this kind matches." />
        ) : (
          <ul className="divide-y divide-border" aria-label="Published configs">
            {list.data.map((entry) => {
              const busy = setOfficial.isPending && setOfficial.variables?.id === entry.id;
              return (
                <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <Link to={`/library/${kind}/${entry.id}`} className="text-sm text-fg hover:underline">
                      {entry.name}
                    </Link>
                    <p className="text-xs text-fg-subtle">{creatorName(entry)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {entry.isOfficial ? <Badge tone="brand">Official</Badge> : null}
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={busy}
                      aria-label={`${entry.isOfficial ? "Unmark" : "Mark"} ${entry.name} official`}
                      onClick={() =>
                        setOfficial.mutate({ kind, id: entry.id, isOfficial: !entry.isOfficial })
                      }
                    >
                      {entry.isOfficial ? "Unmark official" : "Mark official"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {setOfficial.isError ? <p className="text-xs text-red-500">{setOfficial.error.message}</p> : null}
      </div>
    </SectionCard>
  );
}
