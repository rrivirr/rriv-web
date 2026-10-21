import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  readingAt,
  seriesColor,
  ReadingsChart,
  toAlignedData,
} from "@/components/ReadingsChart";
import type { ReadingPoint } from "@/api/readings";

const points: ReadingPoint[] = [
  { t: 1000, temperature: 4, ph: 7 },
  { t: 2000, temperature: null, ph: 7.1 },
  { t: 3000, temperature: 5, ph: null },
];
const keys = ["ph", "temperature"];

describe("toAlignedData", () => {
  it("builds uPlot columns: timestamps, then one column per series, nulls kept", () => {
    expect(toAlignedData(points, keys)).toEqual([
      [1000, 2000, 3000],
      [7, 7.1, null],
      [4, null, 5],
    ]);
  });
});

describe("readingAt", () => {
  it("returns the exact reading at an index, visible series only", () => {
    expect(readingAt(points, keys, new Set(["ph"]), 1)).toEqual({
      t: 2000,
      values: [{ key: "temperature", color: seriesColor(1), value: null }],
    });
    expect(readingAt(points, keys, new Set(), 9)).toBeNull();
  });
});

describe("ReadingsChart", () => {
  it("draws on a canvas and cleans up on unmount", () => {
    const { container, unmount } = render(
      <ReadingsChart
        data={points}
        keys={keys}
        hidden={new Set()}
        markers={[{ kind: "config", t: 2000 }]}
        onSelectTime={vi.fn()}
      />,
    );
    // Strict mode mounts twice: still exactly one chart.
    expect(container.querySelectorAll(".uplot")).toHaveLength(1);
    expect(container.querySelector("canvas")).not.toBeNull();
    expect(container.querySelector('[role="tooltip"]')).toBeNull();

    unmount();
    expect(container.querySelector(".uplot")).toBeNull();
  });

  it("toggling a series doesn't rebuild the chart", () => {
    const props = {
      data: points,
      keys,
      markers: [],
      onSelectTime: vi.fn(),
    };
    const { container, rerender } = render(
      <ReadingsChart {...props} hidden={new Set()} />,
    );
    const chart = container.querySelector(".uplot");
    rerender(<ReadingsChart {...props} hidden={new Set(["ph"])} />);
    expect(container.querySelector(".uplot")).toBe(chart);
  });
});
