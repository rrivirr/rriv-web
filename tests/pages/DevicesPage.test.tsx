import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { DevicesPage } from "@/pages/DevicesPage";
import type { Device } from "@/api/types";
import { renderWithProviders } from "../helpers/render";
import { server } from "../helpers/server";

const devicesUrl = "http://api.test/device";

const boundDevice: Device = {
  id: "d1",
  serialNumber: "S1",
  uniqueName: "logger-a",
  createdAt: "2026-01-01T00:00:00Z",
  DeviceEuis: [{ eui: "eui-1" }],
  DeviceContext: [
    { assignedDeviceName: "upstream", Context: { id: "c1", name: "well-a" } },
  ],
};

describe("DevicesPage", () => {
  it("lists devices", async () => {
    server.use(http.get(devicesUrl, () => HttpResponse.json([boundDevice])));
    renderWithProviders(<DevicesPage />);

    expect(await screen.findByText("logger-a")).toBeInTheDocument();
    expect(screen.getByText("well-a · upstream")).toBeInTheDocument();
    expect(screen.getByText("eui-1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /logger-a/ })).toHaveAttribute(
      "href",
      "/devices/d1",
    );
  });

  it("shows an empty state", async () => {
    server.use(http.get(devicesUrl, () => HttpResponse.json([])));
    renderWithProviders(<DevicesPage />);
    expect(await screen.findByText("No devices found")).toBeInTheDocument();
  });

  it("shows an error", async () => {
    server.use(
      http.get(devicesUrl, () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );
    renderWithProviders(<DevicesPage />);
    expect(
      await screen.findByText("Could not load devices: boom"),
    ).toBeInTheDocument();
  });

  it("binds a device", async () => {
    const user = userEvent.setup();
    let path = "";
    server.use(
      http.get(devicesUrl, () => HttpResponse.json([])),
      http.post(`${devicesUrl}/:serial/bind`, ({ request }) => {
        path = new URL(request.url).pathname;
        return HttpResponse.json(boundDevice);
      }),
    );

    renderWithProviders(<DevicesPage />);
    await screen.findByText("No devices found");

    await user.click(screen.getByRole("button", { name: "Bind device" }));
    await user.type(screen.getByLabelText("Serial number"), "S1");
    await user.click(screen.getByRole("button", { name: "Bind" }));

    await waitFor(() => expect(path).toBe("/device/S1/bind"));
  });

  it("searches devices", async () => {
    const user = userEvent.setup();
    const searches: string[] = [];
    server.use(
      http.get(devicesUrl, ({ request }) => {
        searches.push(new URL(request.url).search);
        return HttpResponse.json([]);
      }),
    );

    renderWithProviders(<DevicesPage />);
    await screen.findByText("No devices found");

    await user.type(screen.getByLabelText("Search devices"), "logger");
    await user.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() =>
      expect(searches.some((search) => search.includes("search=logger"))).toBe(
        true,
      ),
    );
  });

  it("paginates and resets to the first page on search", async () => {
    const user = userEvent.setup();
    const offsets: string[] = [];
    server.use(
      http.get(devicesUrl, ({ request }) => {
        const url = new URL(request.url);
        offsets.push(url.searchParams.get("offset") ?? "0");
        const start = Number(url.searchParams.get("offset") ?? 0);
        return HttpResponse.json(
          Array.from({ length: 24 }, (_, index) => ({
            ...boundDevice,
            id: `d${start + index}`,
            serialNumber: `S${start + index}`,
            uniqueName: `logger-${start + index}`,
          })),
        );
      }),
    );

    renderWithProviders(<DevicesPage />);
    expect(await screen.findByText("logger-0")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(offsets).toContain("24"));

    await user.click(screen.getByRole("button", { name: "Previous" }));
    await waitFor(() =>
      expect(screen.getByText("logger-0")).toBeInTheDocument(),
    );
  });
});
