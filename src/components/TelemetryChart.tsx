import { useEffect, useMemo, useRef, useState } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import type { TelemetryPoint } from "@/api/telemetry";

/**
 * Telemetry line chart on a canvas (uPlot), so tens of thousands of readings
 * stay smooth to hover. Every reading is drawn; the tooltip shows the exact
 * reading under the cursor. Drag to zoom into a time range, double-click to
 * reset.
 */

const SERIES_COLORS = [
  "#3fe3d1",
  "#60a5fa",
  "#f472b6",
  "#facc15",
  "#a78bfa",
  "#34d399",
  "#fb923c",
  "#f87171",
  "#22d3ee",
  "#c084fc",
];

export const seriesColor = (index: number) =>
  SERIES_COLORS[index % SERIES_COLORS.length];

export const MARKER_STYLES = {
  config: { color: "#3fe3d1", dash: [4, 4] },
  firmware: { color: "#f59e0b", dash: [2, 4] },
} as const;

export interface ChartMarker {
  kind: keyof typeof MARKER_STYLES;
  t: number;
}

/** uPlot's columnar data: the timestamps, then one column per series. */
export function toAlignedData(
  points: TelemetryPoint[],
  keys: string[],
): uPlot.AlignedData {
  return [
    points.map((point) => point.t),
    ...keys.map((key) => points.map((point) => point[key] ?? null)),
  ];
}

/** The reading at a data index: its time and each visible series' value. */
export function readingAt(
  points: TelemetryPoint[],
  keys: string[],
  hidden: Set<string>,
  index: number,
) {
  const point = points[index];
  if (!point) return null;
  return {
    t: point.t,
    values: keys
      .map((key, i) => ({ key, color: seriesColor(i), value: point[key] ?? null }))
      .filter(({ key }) => !hidden.has(key)),
  };
}

/** Canvas can't read CSS variables, so resolve the theme's colours. */
function themeColors() {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) =>
    style.getPropertyValue(name).trim() || fallback;
  return {
    grid: read("--color-border", "rgba(255,255,255,0.1)"),
    axis: read("--color-fg-subtle", "#6f8789"),
  };
}

function drawMarkers(u: uPlot, markers: ChartMarker[]) {
  const { ctx, bbox } = u;
  ctx.save();
  ctx.lineWidth = uPlot.pxRatio;
  for (const marker of markers) {
    const x = Math.round(u.valToPos(marker.t, "x", true));
    if (x < bbox.left || x > bbox.left + bbox.width) continue;
    const style = MARKER_STYLES[marker.kind];
    ctx.strokeStyle = style.color;
    ctx.setLineDash(style.dash.map((n) => n * uPlot.pxRatio));
    ctx.beginPath();
    ctx.moveTo(x, bbox.top);
    ctx.lineTo(x, bbox.top + bbox.height);
    ctx.stroke();
  }
  ctx.restore();
}

interface Tooltip {
  index: number;
  left: number;
  top: number;
  flip: boolean;
}

export function TelemetryChart({
  data,
  keys,
  hidden,
  markers,
  onSelectTime,
}: {
  data: TelemetryPoint[];
  keys: string[];
  hidden: Set<string>;
  markers: ChartMarker[];
  onSelectTime: (t: number) => void;
}) {
  // uPlot owns this element's children; React renders the tooltip beside it.
  const containerRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);
  // Read by uPlot's callbacks, which are created once per chart.
  const hiddenRef = useRef(hidden);
  const markersRef = useRef(markers);
  const onSelectRef = useRef(onSelectTime);
  hiddenRef.current = hidden;
  markersRef.current = markers;
  onSelectRef.current = onSelectTime;

  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const [theme, setTheme] = useState(() => document.documentElement.className);
  const aligned = useMemo(() => toAlignedData(data, keys), [data, keys]);

  // Redraw with the right colours when the light/dark theme changes.
  useEffect(() => {
    const observer = new MutationObserver(() =>
      setTheme(document.documentElement.className)
    );
    observer.observe(document.documentElement, { attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const { grid, axis } = themeColors();
    const { width, height } = container.getBoundingClientRect();
    const axisStyle = {
      stroke: axis,
      grid: { stroke: grid, width: 1 },
      ticks: { stroke: grid, width: 1 },
      font: "11px system-ui, sans-serif",
    };

    const plot = new uPlot(
      {
        width: Math.max(width, 100),
        height: Math.max(height, 100),
        ms: 1,
        legend: { show: false },
        cursor: { drag: { x: true, y: false }, points: { size: 6 } },
        scales: { x: { time: true } },
        axes: [axisStyle, { ...axisStyle, size: 52 }],
        series: [
          {},
          ...keys.map((key, index) => ({
            label: key,
            stroke: seriesColor(index),
            width: 1.5,
            show: !hiddenRef.current.has(key),
            spanGaps: false,
            points: { show: false },
          })),
        ],
        hooks: {
          setCursor: [
            (u) => {
              const index = u.cursor.idx;
              const left = u.cursor.left ?? -1;
              if (index == null || left < 0) {
                setTooltip(null);
                return;
              }
              setTooltip({
                index,
                left: left + u.over.offsetLeft,
                top: (u.cursor.top ?? 0) + u.over.offsetTop,
                flip: left > u.over.clientWidth / 2,
              });
            },
          ],
          draw: [(u) => drawMarkers(u, markersRef.current)],
        },
      },
      aligned,
      container,
    );
    plotRef.current = plot;

    // A click (not the end of a drag-to-zoom) selects that moment.
    let down: { x: number; y: number } | null = null;
    const onMouseDown = (event: MouseEvent) => {
      down = { x: event.clientX, y: event.clientY };
    };
    const onClick = (event: MouseEvent) => {
      if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) > 4) {
        return;
      }
      const index = plot.cursor.idx;
      if (index != null) onSelectRef.current(plot.data[0][index]);
    };
    const onLeave = () => setTooltip(null);
    plot.over.addEventListener("mousedown", onMouseDown);
    plot.over.addEventListener("click", onClick);
    plot.over.addEventListener("mouseleave", onLeave);

    const resize = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) plot.setSize({ width, height });
    });
    resize.observe(container);

    return () => {
      resize.disconnect();
      plot.over.removeEventListener("mousedown", onMouseDown);
      plot.over.removeEventListener("click", onClick);
      plot.over.removeEventListener("mouseleave", onLeave);
      plot.destroy();
      plotRef.current = null;
      setTooltip(null);
    };
  }, [aligned, keys, theme]);

  // Toggling a series or a new set of markers doesn't rebuild the chart.
  useEffect(() => {
    const plot = plotRef.current;
    if (!plot) return;
    keys.forEach((key, index) => {
      const show = !hidden.has(key);
      if (plot.series[index + 1]?.show !== show) plot.setSeries(index + 1, { show });
    });
  }, [hidden, keys]);

  useEffect(() => {
    plotRef.current?.redraw(false, false);
  }, [markers]);

  const reading = tooltip ? readingAt(data, keys, hidden, tooltip.index) : null;

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div ref={containerRef} className="h-full w-full" />
      {tooltip && reading && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-10 min-w-40 rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-lg"
          style={{
            left: tooltip.left,
            top: tooltip.top,
            transform: `translate(${tooltip.flip ? "calc(-100% - 12px)" : "12px"}, -50%)`,
          }}
        >
          <p className="mb-1 font-medium text-fg">
            {new Date(reading.t).toLocaleString()}
          </p>
          {reading.values.map(({ key, color, value }) => (
            <p key={key} className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 text-fg-muted">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                {key}
              </span>
              <span className="font-mono text-fg">{value ?? "—"}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
