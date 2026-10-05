import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { DeviceTelemetry } from "@/components/DeviceTelemetry";
import type { ConfigHistoryItem, Device, FirmwareHistoryItem } from "@/api/types";
import { renderWithProviders } from "../helpers/render";
import { server } from "../helpers/server";

const device: Device = {
  id: "d1",
  serialNumber: "S1",
  uniqueName: "logger-a",
  createdAt: "2026-01-01T00:00:00Z",
  DeviceEuis: [{ eui: "eui-1" }],
};

const readingsUrl = "http://data.test/readings/:eui";
const configHistoryUrl = "http://api.test/configSnapshot/history";
const firmwareHistoryUrl = "http://api.test/device/firmware/history";

const history: ConfigHistoryItem[] = [
  {
    id: "h1",
    name: "ph-sensor",
    config: { ph: 7.2 },
    active: true,
    createdAt: "2026-01-01T00:00:00Z",
    deactivatedAt: null,
    sensorDriverId: "driver-1",
  },
];

const firmware: FirmwareHistoryItem[] = [
  {
    version: "1.2.3",
    installedAt: "2026-01-02T00:00:00Z",
    createdAt: "2026-01-02T00:00:00Z",
  },
];

describe("DeviceTelemetry", () => {
  // The component fetches its own range-scoped markers (and as-at state), so
  // every render needs the history endpoints stubbed.
  beforeEach(() => {
    server.use(
      http.get(configHistoryUrl, () =>
        HttpResponse.json({ dataloggerConfigs: [], sensorConfigs: history }),
      ),
      http.get(firmwareHistoryUrl, () => HttpResponse.json(firmware)),
    );
  });

  it("prompts for an EUI when none is registered", () => {
    renderWithProviders(
      <DeviceTelemetry device={{ ...device, DeviceEuis: [] }} />,
    );
    expect(screen.getByText("No EUI registered")).toBeInTheDocument();
  });

  it("renders series controls and markers", async () => {
    server.use(
      http.get(readingsUrl, () =>
        HttpResponse.json([
          { timestamp: "2026-01-01T00:30:00Z", temperature: 4, ph: 7 },
          { timestamp: "2026-01-01T01:30:00Z", temperature: 5, ph: 7.1 },
        ]),
      ),
    );

    renderWithProviders(<DeviceTelemetry device={device} />);

    expect(await screen.findByRole("button", { name: "temperature" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ph" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1h" })).toBeInTheDocument();

    // Marker list from the range-scoped history + firmware queries.
    expect(await screen.findByText("ph-sensor")).toBeInTheDocument();
    expect(screen.getByText("firmware v1.2.3")).toBeInTheDocument();
  });

  it("toggles a series off", async () => {
    const user = userEvent.setup();
    server.use(
      http.get(readingsUrl, () =>
        HttpResponse.json([{ timestamp: "2026-01-01T00:30:00Z", temperature: 4 }]),
      ),
    );

    renderWithProviders(<DeviceTelemetry device={device} />);

    const toggle = await screen.findByRole("button", { name: "temperature" });
    await user.click(toggle);
    expect(toggle).toHaveClass("line-through");
  });

  it("shows the config and firmware in effect when a marker is clicked", async () => {
    const user = userEvent.setup();
    server.use(
      http.get(readingsUrl, () =>
        HttpResponse.json([{ timestamp: "2026-01-01T00:30:00Z", temperature: 4 }]),
      ),
      http.get(configHistoryUrl, () =>
        HttpResponse.json({
          dataloggerConfigs: [],
          sensorConfigs: [
            {
              id: "h1",
              name: "ph-sensor",
              config: { ph: 7.2 },
              active: true,
              createdAt: "2026-01-01T00:00:00Z",
              deactivatedAt: null,
              sensorDriverId: "driver-1",
            },
          ],
        }),
      ),
      http.get(firmwareHistoryUrl, () =>
        HttpResponse.json([
          {
            version: "1.2.3",
            installedAt: "2026-01-02T00:00:00Z",
            createdAt: "2026-01-02T00:00:00Z",
            contextName: "ctx",
          },
        ]),
      ),
    );

    renderWithProviders(<DeviceTelemetry device={device} />);

    await user.click(await screen.findByText("firmware v1.2.3"));
    expect(await screen.findByText(/In effect at/)).toBeInTheDocument();
    expect(await screen.findByText(/"ph": 7.2/)).toBeInTheDocument();
    expect(screen.getByText(/Firmware:/)).toBeInTheDocument();
    expect(screen.getByText("v1.2.3")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear" }));
    await waitFor(() =>
      expect(screen.queryByText(/In effect at/)).not.toBeInTheDocument(),
    );
  });

  it("shows an empty state when the window has no readings", async () => {
    server.use(
      http.get(readingsUrl, () => HttpResponse.json([])),
      http.get(configHistoryUrl, () =>
        HttpResponse.json({ dataloggerConfigs: [], sensorConfigs: [] }),
      ),
      http.get(firmwareHistoryUrl, () => HttpResponse.json([])),
    );

    renderWithProviders(<DeviceTelemetry device={device} />);

    expect(
      await screen.findByText("No readings in this window"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/No config or firmware changes recorded/),
    ).toBeInTheDocument();
  });

  it("surfaces data-api errors", async () => {
    server.use(
      http.get(readingsUrl, () => new HttpResponse(null, { status: 500 })),
    );

    renderWithProviders(<DeviceTelemetry device={device} />);

    expect(
      await screen.findByText(/Could not load telemetry/),
    ).toBeInTheDocument();
  });
});
