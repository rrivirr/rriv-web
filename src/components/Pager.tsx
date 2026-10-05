export interface PagerProps {
  /** Zero-based offset of the first row on this page. */
  offset: number;
  pageSize: number;
  /** Rows returned on this page (after any client-side filtering). */
  count: number;
  /** Rows on this page before client-side filtering — drives "Next". */
  rawCount?: number;
  /** Total rows, when the API reports it. Enables a precise range label. */
  total?: number;
  /** Largest offset the API accepts, when capped. */
  maxOffset?: number;
  isFetching?: boolean;
  onPrev: () => void;
  onNext: () => void;
  noun?: string;
}

/**
 * Offset pagination controls for list endpoints. The API returns a bare first
 * page with no total for most lists, so "Next" is driven by whether the page
 * came back full; endpoints that report `total` get an exact range label.
 */
export function Pager({
  offset,
  pageSize,
  count,
  rawCount,
  total,
  maxOffset,
  isFetching,
  onPrev,
  onNext,
  noun = "result",
}: PagerProps) {
  const pageRows = rawCount ?? count;
  const canPrev = offset > 0;
  const canNext = total !== undefined
    ? offset + pageSize < total
    : pageRows === pageSize &&
      (maxOffset === undefined || offset + pageSize <= maxOffset);

  if (!canPrev && !canNext) return null;

  const label = total !== undefined
    ? `Showing ${offset + 1}–${offset + count} of ${total}`
    : `Showing ${count} ${noun}${count === 1 ? "" : "s"}`;

  return (
    <div className="flex items-center justify-between gap-4">
      <button
        type="button"
        className="btn btn-ghost"
        disabled={!canPrev || isFetching}
        onClick={onPrev}
      >
        Previous
      </button>
      <span className="text-xs text-fg-subtle">{label}</span>
      <button
        type="button"
        className="btn btn-ghost"
        disabled={!canNext || isFetching}
        onClick={onNext}
      >
        Next
      </button>
    </div>
  );
}
