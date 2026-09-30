import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";
import {
  AddDeviceToContext,
  ContextHeaderActions,
  ContextSharing,
} from "@/components/ContextControls";
import type { Context, Device } from "@/api/types";
import { renderWithProviders } from "../helpers/render";
import { server } from "../helpers/server";

const context: Context = {
  id: "c1",
  name: "well-a",
  startedAt: "2026-01-01T00:00:00Z",
  endedAt: null,
  Account: { id: "me", email: "me@rriv.org" },
};

describe("ContextHeaderActions", () => {
  it("renders nothing when not owned", () => {
    const { container } = renderWithProviders(
      <ContextHeaderActions context={context} owned={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renames a context", async () => {
    const user = userEvent.setup();
    let body: unknown;
    server.use(
      http.patch("http://api.test/context/c1", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ ...context, name: "well-b" });
      }),
    );

    renderWithProviders(<ContextHeaderActions context={context} owned />);

    await user.click(screen.getByRole("button", { name: "Rename" }));
    const input = screen.getByLabelText("Context name");
    await user.clear(input);
    await user.type(input, "well-b");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(body).toEqual({ name: "well-b" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Rename" })).toBeInTheDocument(),
    );
  });

  it("cancels a rename", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ContextHeaderActions context={context} owned />);

    await user.click(screen.getByRole("button", { name: "Rename" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Rename" })).toBeInTheDocument();
  });

  it("ends a context", async () => {
    const user = userEvent.setup();
    let body: unknown;
    server.use(
      http.patch("http://api.test/context/c1", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ ...context, endedAt: "2026-02-01T00:00:00Z" });
      }),
    );

    renderWithProviders(<ContextHeaderActions context={context} owned />);
    await user.click(screen.getByRole("button", { name: "End context" }));

    await waitFor(() => expect(body).toEqual({ end: true }));
  });

  it("confirms deletion and navigates away", async () => {
    const user = userEvent.setup();
    let method = "";
    server.use(
      http.delete("http://api.test/context/c1", ({ request }) => {
        method = request.method;
        return HttpResponse.json({ ...context });
      }),
    );

    renderWithProviders(
      <Routes>
        <Route
          path="/"
          element={<ContextHeaderActions context={context} owned />}
        />
        <Route path="/contexts" element={<p>Contexts page</p>} />
      </Routes>,
      { route: "/" },
    );

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(method).toBe("DELETE"));
    expect(await screen.findByText("Contexts page")).toBeInTheDocument();
  });

  it("surfaces update errors", async () => {
    const user = userEvent.setup();
    server.use(
      http.patch("http://api.test/context/c1", () =>
        HttpResponse.json({ message: "cannot end" }, { status: 409 }),
      ),
    );

    renderWithProviders(<ContextHeaderActions context={context} owned />);
    await user.click(screen.getByRole("button", { name: "End context" }));

    expect(await screen.findByText("cannot end")).toBeInTheDocument();
  });
});

describe("ContextSharing", () => {
  it("renders nothing when not owned", () => {
    const { container } = renderWithProviders(
      <ContextSharing contextId="c1" owned={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("lists recipients and shares by email", async () => {
    const user = userEvent.setup();
    let body: unknown;
    server.use(
      http.get("http://api.test/context/c1/share", () =>
        HttpResponse.json([{ id: "a1", email: "editor@rriv.org" }]),
      ),
      http.post("http://api.test/context/c1/share", async ({ request }) => {
        body = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderWithProviders(<ContextSharing contextId="c1" owned />);

    expect(await screen.findByText("editor@rriv.org")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Recipient email"), "new@rriv.org");
    await user.click(screen.getByRole("button", { name: "Share" }));

    await waitFor(() => expect(body).toEqual({ email: "new@rriv.org" }));
  });

  it("shows the empty recipients note", async () => {
    server.use(
      http.get("http://api.test/context/c1/share", () => HttpResponse.json([])),
    );
    renderWithProviders(<ContextSharing contextId="c1" owned />);
    expect(
      await screen.findByText("Not shared with anyone yet."),
    ).toBeInTheDocument();
  });

  it("surfaces share errors", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("http://api.test/context/c1/share", () => HttpResponse.json([])),
      http.post("http://api.test/context/c1/share", () =>
        HttpResponse.json({ message: "no such account" }, { status: 404 }),
      ),
    );

    renderWithProviders(<ContextSharing contextId="c1" owned />);
    await user.type(screen.getByLabelText("Recipient email"), "x@y.z");
    await user.click(screen.getByRole("button", { name: "Share" }));

    expect(await screen.findByText("no such account")).toBeInTheDocument();
  });
});

describe("AddDeviceToContext", () => {
  const available: Device = {
    id: "d1",
    serialNumber: "S1",
    uniqueName: "logger-a",
    createdAt: "2026-01-01T00:00:00Z",
  };

  it("explains when there are no candidates", async () => {
    server.use(
      http.get("http://api.test/device", () =>
        HttpResponse.json([
          {
            ...available,
            DeviceContext: [
              { assignedDeviceName: "x", Context: { id: "c1", name: "well-a" } },
            ],
          },
        ]),
      ),
    );

    renderWithProviders(<AddDeviceToContext contextId="c1" />);
    expect(
      await screen.findByText(/No unassigned devices available/),
    ).toBeInTheDocument();
  });

  it("adds a device to the context", async () => {
    const user = userEvent.setup();
    let body: unknown;
    server.use(
      http.get("http://api.test/device", () => HttpResponse.json([available])),
      http.post("http://api.test/context/c1/device/d1", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ id: "dc1" }, { status: 201 });
      }),
    );

    renderWithProviders(<AddDeviceToContext contextId="c1" />);
    await screen.findByLabelText("Device");
    await user.selectOptions(screen.getByLabelText("Device"), "d1");
    await user.type(screen.getByLabelText("Assigned name"), "upstream");
    await user.click(screen.getByRole("button", { name: "Add device" }));

    await waitFor(() =>
      expect(body).toEqual({ assignedDeviceName: "upstream" }),
    );
  });
});
