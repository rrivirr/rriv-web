import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { parseSettingValue } from "@/components/library/SettingsEditor";
import { LibraryNewPage } from "@/pages/LibraryNewPage";
import { renderWithProviders } from "../helpers/render";
import { server } from "../helpers/server";

const api = "http://api.test";

const page = (
  <Routes>
    <Route path="/library/new" element={<LibraryNewPage />} />
    <Route path="/library/:kind/:id" element={<p>Created page</p>} />
  </Routes>
);

const drivers = () => [
  http.get(`${api}/sensor/driver`, () =>
    HttpResponse.json([
      {
        id: "sd",
        name: "generic",
        validation: { type: "object", properties: { wait_time: { type: "number" } } },
      },
    ]),
  ),
  http.get(`${api}/datalogger/driver`, () =>
    HttpResponse.json([{ id: "dd", name: "rriv", validation: { type: "object" } }]),
  ),
];

describe("parseSettingValue", () => {
  it("types numbers, booleans and JSON, and keeps other text", () => {
    expect(parseSettingValue("15")).toBe(15);
    expect(parseSettingValue("true")).toBe(true);
    expect(parseSettingValue('{"a":1}')).toEqual({ a: 1 });
    expect(parseSettingValue("SITE-A")).toBe("SITE-A");
  });
});

describe("LibraryNewPage", () => {
  it("creates a sensor config from scratch", async () => {
    const user = userEvent.setup();
    const created = vi.fn();
    server.use(
      ...drivers(),
      http.post(`${api}/sensor/libraryConfig`, async ({ request }) => {
        created(await request.json());
        return HttpResponse.json({ id: "new1", name: "ph-probe" }, { status: 201 });
      }),
    );
    renderWithProviders(page, { route: "/library/new?kind=sensor" });

    const create = screen.getByRole("button", { name: "Create library config" });
    expect(create).toBeDisabled();

    await user.type(screen.getByLabelText("Name"), "ph-probe");
    await user.type(screen.getByLabelText(/Sensor name/), "ph01");
    // Type is required for a sensor.
    expect(screen.getByText("Sensor: a sensor type is required.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Type"), "ph");
    // A setting the driver schema suggests, typed as a number.
    await user.type(screen.getByLabelText("Sensor: new setting name"), "wait_time");
    await user.type(screen.getByLabelText("Sensor: new setting value"), "5");
    await user.click(screen.getByRole("button", { name: "Add setting" }));
    await user.type(screen.getByLabelText("Firmware version (optional)"), "1.4.0");

    await user.click(create);
    expect(await screen.findByText("Created page")).toBeInTheDocument();
    expect(created).toHaveBeenCalledWith({
      name: "ph-probe",
      firmwareVersion: "1.4.0",
      sensorName: "ph01",
      config: { type: "ph", wait_time: 5 },
    });
  });

  it("builds a whole-device config with sensors, editable as JSON", async () => {
    const user = userEvent.setup();
    const created = vi.fn();
    const patched = vi.fn();
    server.use(
      ...drivers(),
      http.post(`${api}/configSnapshot/libraryConfig`, async ({ request }) => {
        created(await request.json());
        return HttpResponse.json({ id: "sys1", name: "station" }, { status: 201 });
      }),
      http.patch(`${api}/configSnapshot/libraryConfig/sys1`, async ({ request }) => {
        patched(await request.json());
        return HttpResponse.json({ id: "sys1" });
      }),
    );
    renderWithProviders(page, { route: "/library/new" });

    await user.type(screen.getByLabelText("Name"), "station");
    const datalogger = screen.getByRole("group", { name: "Datalogger settings" });
    await user.click(within(datalogger).getByRole("button", { name: "JSON" }));
    const json = within(datalogger).getByLabelText("Datalogger JSON");
    await user.clear(json);
    await user.click(json);
    await user.paste('{"site_name":"SITE-A","sleep_interval":15}');

    await user.click(screen.getByRole("button", { name: "Add sensor" }));
    await user.type(screen.getByLabelText(/Sensor 1 name/), "temp01");
    const sensor = screen.getByRole("group", { name: "Sensor 1 settings" });
    await user.type(within(sensor).getByLabelText("Type"), "ds18b20");
    await user.click(screen.getByLabelText("Make it public"));

    await user.click(screen.getByRole("button", { name: "Create library config" }));
    expect(await screen.findByText("Created page")).toBeInTheDocument();
    expect(created).toHaveBeenCalledWith({
      name: "station",
      datalogger: { site_name: "SITE-A", sleep_interval: 15 },
      sensors: [{ type: "ds18b20", name: "temp01" }],
    });
    expect(patched).toHaveBeenCalledWith({ isPublic: true });
  });

  it("starts from an independent copy of a version", async () => {
    const user = userEvent.setup();
    const created = vi.fn();
    server.use(
      ...drivers(),
      http.get(`${api}/datalogger/libraryConfig/dl1`, () =>
        HttpResponse.json({
          id: "dl1",
          name: "shared-dl",
          isPublic: true,
          createdAt: "2026-01-01T00:00:00Z",
          DataloggerLibraryConfigVersion: [
            { version: 2, firmwareVersion: "1.5.0", DataloggerConfig: { id: "c", name: "datalogger", config: { sleep_interval: 30 } } },
          ],
        }),
      ),
      http.post(`${api}/datalogger/libraryConfig`, async ({ request }) => {
        created(await request.json());
        return HttpResponse.json({ id: "dl9", name: "my-dl" }, { status: 201 });
      }),
    );
    renderWithProviders(page, { route: "/library/new?copy=datalogger:dl1:2" });

    expect(await screen.findByText(/Starting from a copy of shared-dl v2/)).toBeInTheDocument();
    const interval = await screen.findByLabelText("Sleep interval");
    expect(interval).toHaveValue(30);
    expect(screen.getByLabelText("What it configures")).toBeDisabled();
    expect(screen.getByLabelText("Firmware version (optional)")).toHaveValue("1.5.0");

    await user.clear(interval);
    await user.type(interval, "60");
    await user.type(screen.getByLabelText("Name"), "my-dl");
    await user.click(screen.getByRole("button", { name: "Create library config" }));
    await waitFor(() =>
      expect(created).toHaveBeenCalledWith({
        name: "my-dl",
        firmwareVersion: "1.5.0",
        config: { sleep_interval: 60 },
      }),
    );
  });

  it("shows why the API refused it", async () => {
    const user = userEvent.setup();
    server.use(
      ...drivers(),
      http.post(`${api}/datalogger/libraryConfig`, () =>
        HttpResponse.json({ message: "invalid datalogger config received" }, { status: 422 }),
      ),
    );
    renderWithProviders(page, { route: "/library/new?kind=datalogger" });
    await user.type(screen.getByLabelText("Name"), "dl-bad");
    await user.click(screen.getByRole("button", { name: "Create library config" }));
    expect(await screen.findByText("invalid datalogger config received")).toBeInTheDocument();
  });
});
