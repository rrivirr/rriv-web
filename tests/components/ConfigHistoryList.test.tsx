import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConfigHistoryList } from "@/components/ConfigHistoryList";
import type { ConfigHistoryItem } from "@/api/types";

const item: ConfigHistoryItem = {
  id: "h1",
  name: "ph-sensor",
  config: { ph: 7.2 },
  active: true,
  createdAt: "2026-01-01T00:00:00Z",
  deactivatedAt: null,
  sensorDriverId: "driver-1",
  Creator: { firstName: "Ada", lastName: "L" },
  changesMade: { ph: "7.0 → 7.2", gain: "1 → 2" },
  ConfigSnapshot: { DeviceContext: { Context: { name: "well-a" } } },
};

describe("ConfigHistoryList", () => {
  it("shows an empty state without items", () => {
    render(<ConfigHistoryList items={[]} />);
    expect(screen.getByText("No config history")).toBeInTheDocument();
  });

  it("renders a sensor row with changes and metadata", () => {
    render(<ConfigHistoryList items={[item]} />);

    expect(screen.getByText("sensor")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
    expect(screen.getByText("ph-sensor")).toBeInTheDocument();
    expect(screen.getAllByText("Ada L")).toHaveLength(2);
    expect(screen.getByText("2 change(s)")).toBeInTheDocument();
    expect(screen.getByText("ph")).toBeInTheDocument();
    expect(screen.getByText(/7\.0 → 7\.2/)).toBeInTheDocument();
    expect(screen.getByText("well-a")).toBeInTheDocument();
    expect(screen.getByText(/"ph": 7.2/)).toBeInTheDocument();
  });

  it("renders a datalogger row with no prior config", () => {
    render(
      <ConfigHistoryList
        items={[
          {
            id: "h2",
            name: "board",
            config: {},
            active: false,
            createdAt: "2026-01-02T00:00:00Z",
            deactivatedAt: "2026-01-03T00:00:00Z",
          },
        ]}
      />,
    );

    expect(screen.getByText("datalogger")).toBeInTheDocument();
    expect(screen.getByText("initial")).toBeInTheDocument();
    expect(
      screen.getByText("Initial version — no prior config of this name."),
    ).toBeInTheDocument();
  });
});
