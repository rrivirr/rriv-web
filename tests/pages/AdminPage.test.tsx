import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { AdminPage } from "@/pages/AdminPage";
import { renderWithProviders } from "../helpers/render";
import { server } from "../helpers/server";

const api = "http://api.test";

const metrics = {
  generatedAt: "2026-01-01T00:00:00Z",
  health: "degraded",
  authSync: {
    byStatus: { pending: 1, synced: 2, failed: 1 },
    total: 4,
    oldestFailedSeconds: 30,
    stuckPendingSeconds: null,
    inSyncPercent: 50,
  },
  queue: {
    name: "rriv-sync",
    available: true,
    total: 1,
    byState: {},
    oldestQueuedSeconds: null,
  },
  dlq: { name: "rriv-dlq", available: true, depth: 0, byState: {} },
  notifications: { unread: 0 },
  recentFailures: [],
};

const row = {
  id: "r1",
  resourceType: "context",
  resourceId: "c1",
  status: "failed",
  attempts: 2,
  lastError: { message: "timed out" },
  lastJobId: null,
  version: 3,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T01:00:00Z",
};

const me = (isAdmin: boolean) =>
  http.get(`${api}/account/me`, () =>
    HttpResponse.json({
      id: "1",
      email: "ada@rriv.org",
      firstName: "Ada",
      lastName: "L",
      isAdmin,
    }),
  );

function baseHandlers() {
  server.use(
    http.get(`${api}/admin/auth-sync`, () =>
      HttpResponse.json({ items: [row], total: 1 }),
    ),
    http.get(`${api}/admin/metrics`, () => HttpResponse.json(metrics)),
    http.get(`${api}/admin/admins`, () => HttpResponse.json([])),
  );
}

describe("AdminPage", () => {
  it("blocks non-admins", async () => {
    server.use(me(false));
    baseHandlers();
    renderWithProviders(<AdminPage />);
    expect(await screen.findByText("Not authorized")).toBeInTheDocument();
  });

  it("shows a spinner while checking permissions", () => {
    server.use(http.get(`${api}/account/me`, () => new Promise(() => {})));
    baseHandlers();
    renderWithProviders(<AdminPage />);
    expect(screen.getByRole("status")).toHaveTextContent("Checking permissions…");
  });

  it("renders metrics and failed syncs, and retries", async () => {
    const user = userEvent.setup();
    const posts: string[] = [];
    server.use(
      me(true),
      http.post(`${api}/admin/auth-sync/context/c1/resync`, ({ request }) => {
        posts.push(new URL(request.url).pathname);
        return new HttpResponse(null, { status: 204 });
      }),
      http.post(`${api}/admin/auth-sync/resync-failed`, () =>
        HttpResponse.json({ count: 3 }),
      ),
    );
    baseHandlers();

    renderWithProviders(<AdminPage />);

    expect(await screen.findByText("failed")).toBeInTheDocument();
    expect(screen.getByText("context:c1")).toBeInTheDocument();
    expect(screen.getByText(/2 attempt/)).toBeInTheDocument();
    expect(screen.getByText(/"message":"timed out"/)).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("DLQ (rriv-dlq)")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(posts).toContain("/admin/auth-sync/context/c1/resync"),
    );

    await user.click(screen.getByRole("button", { name: "Retry all failed" }));
    expect(
      await screen.findByText("Re-queued 3 resource(s)."),
    ).toBeInTheDocument();
  });

  it("explains each metric tile with a tooltip", async () => {
    server.use(me(true));
    baseHandlers();

    renderWithProviders(<AdminPage />);

    // The six tiles each expose a tooltip describing what the number means.
    const tooltips = await screen.findAllByRole("tooltip");
    expect(tooltips).toHaveLength(6);
    expect(screen.getByText(/Share of tracked resources/)).toBeInTheDocument();
    expect(screen.getByText(/parked in the DLQ/)).toBeInTheDocument();
    expect(screen.getByText(/Dead-letter queue/)).toBeInTheDocument();
    expect(screen.getByText(/no queue backlog/)).toBeInTheDocument();

    // Each tile is associated with its tooltip for screen readers.
    const inSync = screen.getByText("In sync").closest("div");
    expect(inSync).toHaveAttribute("aria-describedby");
    const describedBy = inSync!.getAttribute("aria-describedby")!;
    expect(document.getElementById(describedBy)).toHaveAttribute(
      "role",
      "tooltip",
    );
  });

  it("shows an empty state with no rows", async () => {
    server.use(me(true));
    server.use(
      http.get(`${api}/admin/auth-sync`, () =>
        HttpResponse.json({ items: [], total: 0 }),
      ),
      http.get(`${api}/admin/metrics`, () => HttpResponse.json(metrics)),
      http.get(`${api}/admin/admins`, () => HttpResponse.json([])),
    );

    renderWithProviders(<AdminPage />);
    expect(await screen.findByText("Nothing to show")).toBeInTheDocument();
  });

  it("shows a query error", async () => {
    server.use(me(true));
    server.use(
      http.get(`${api}/admin/auth-sync`, () =>
        HttpResponse.json({ message: "nope" }, { status: 500 }),
      ),
      http.get(`${api}/admin/metrics`, () => HttpResponse.json(metrics)),
      http.get(`${api}/admin/admins`, () => HttpResponse.json([])),
    );

    renderWithProviders(<AdminPage />);
    expect(
      await screen.findByText("Could not load authorization syncs: nope"),
    ).toBeInTheDocument();
  });
});
