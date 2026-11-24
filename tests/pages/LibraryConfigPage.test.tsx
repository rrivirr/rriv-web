import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";
import { LibraryConfigPage } from "@/pages/LibraryConfigPage";
import { renderWithProviders } from "../helpers/render";
import { server } from "../helpers/server";

const api = "http://api.test";

const page = (
  <Routes>
    <Route path="/library/:kind/:id" element={<LibraryConfigPage />} />
  </Routes>
);

const detail = {
  id: "l1",
  name: "ph-standard",
  description: "A reusable pH sensor config",
  isPublic: true,
  createdAt: "2026-01-01T00:00:00Z",
  Creator: { firstName: "Ada", lastName: "L" },
  SensorLibraryConfigVersion: [
    {
      version: 1,
      description: "initial",
      Creator: { firstName: "Ada", lastName: "L" },
      SensorConfig: {
        id: "s1",
        name: "ph",
        config: { ph: 7.2 },
        sensorDriverId: "driver-1",
      },
    },
  ],
};

describe("LibraryConfigPage", () => {
  it("rejects an unknown library kind", () => {
    renderWithProviders(page, { route: "/library/bogus/x1" });
    expect(screen.getByText("Unknown library")).toBeInTheDocument();
  });

  it("handles a 404", async () => {
    server.use(
      http.get(`${api}/sensor/libraryConfig/missing`, () =>
        HttpResponse.json({ message: "not found" }, { status: 404 }),
      ),
    );
    renderWithProviders(page, { route: "/library/sensor/missing" });
    expect(
      await screen.findByText("Configuration not available"),
    ).toBeInTheDocument();
  });

  it("links each version to the connect page, ready to apply", async () => {
    server.use(
      http.get(`${api}/sensor/libraryConfig/l1`, () => HttpResponse.json(detail)),
    );
    renderWithProviders(page, { route: "/library/sensor/l1" });
    expect(
      await screen.findByRole("link", { name: "Apply v1 to a device" }),
    ).toHaveAttribute("href", "/connect?apply=sensor%3Al1%3A1");
    expect(screen.getByRole("link", { name: "Copy v1 to a new config" })).toHaveAttribute(
      "href",
      "/library/new?copy=sensor:l1:1",
    );
  });

  it("renders the detail with its versions", async () => {
    server.use(
      http.get(`${api}/sensor/libraryConfig/l1`, () => HttpResponse.json(detail)),
    );

    renderWithProviders(page, { route: "/library/sensor/l1" });

    expect(
      await screen.findByRole("heading", { name: "ph-standard" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Public")).toBeInTheDocument();
    expect(screen.getByText("v1")).toBeInTheDocument();
    expect(screen.getByText(/driver driver-1/)).toBeInTheDocument();
    expect(screen.getByText(/"ph": 7.2/)).toBeInTheDocument();
  });

  it("shows a load error", async () => {
    server.use(
      http.get(`${api}/sensor/libraryConfig/l1`, () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );
    renderWithProviders(page, { route: "/library/sensor/l1" });
    expect(
      await screen.findByText("Could not load this configuration: boom"),
    ).toBeInTheDocument();
  });

  it("gives the owner edit, visibility and archive controls", async () => {
    const user = userEvent.setup();
    const patches: unknown[] = [];
    let archived = false;
    server.use(
      http.get(`${api}/sensor/libraryConfig/l1`, () =>
        HttpResponse.json({ ...detail, description: "field kit", isMine: true, isPublic: false }),
      ),
      http.patch(`${api}/sensor/libraryConfig/l1`, async ({ request }) => {
        patches.push(await request.json());
        return HttpResponse.json({ id: "l1" });
      }),
      http.delete(`${api}/sensor/libraryConfig/l1`, () => {
        archived = true;
        return new HttpResponse(null, { status: 204 });
      }),
      http.get(`${api}/sensor/libraryConfig`, () => HttpResponse.json([])),
    );
    renderWithProviders(page, { route: "/library/sensor/l1" });

    await user.click(await screen.findByRole("button", { name: "Make public" }));
    await waitFor(() => expect(patches).toContainEqual({ isPublic: true }));

    await user.click(screen.getByRole("button", { name: "Edit name and description" }));
    const name = screen.getByLabelText("Name");
    await user.clear(name);
    await user.type(name, "ph-field");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(patches).toContainEqual({ name: "ph-field", description: "field kit" }),
    );

    await user.click(screen.getByRole("button", { name: "Archive" }));
    await user.click(screen.getByRole("button", { name: "Archive it" }));
    await waitFor(() => expect(archived).toBe(true));
  });

  it("keeps an official config public and hides controls from others", async () => {
    server.use(
      http.get(`${api}/sensor/libraryConfig/l1`, () =>
        HttpResponse.json({ ...detail, isMine: true, isOfficial: true }),
      ),
    );
    const view = renderWithProviders(page, { route: "/library/sensor/l1" });
    expect(await screen.findByText("Official RRIV")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Make private" })).toBeDisabled();
    view.unmount();

    server.use(
      http.get(`${api}/sensor/libraryConfig/l1`, () => HttpResponse.json({ ...detail, isMine: false })),
    );
    renderWithProviders(page, { route: "/library/sensor/l1" });
    await screen.findByText("ph-standard");
    expect(screen.queryByRole("button", { name: /Make (public|private)/ })).not.toBeInTheDocument();
  });
});
