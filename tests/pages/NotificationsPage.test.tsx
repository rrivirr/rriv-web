import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { NotificationsPage } from "@/pages/NotificationsPage";
import { renderWithProviders } from "../helpers/render";
import { server } from "../helpers/server";

const notificationsUrl = "http://api.test/notification";

const row = {
  id: "n1",
  type: "AUTH_SYNC_FAILED",
  title: "Permissions failed to sync",
  body: "Context could not be synced.",
  resourceType: "context",
  resourceId: "c1",
  readAt: null,
  createdAt: new Date().toISOString(),
};

describe("NotificationsPage", () => {
  it("lists notifications and marks one read", async () => {
    const user = userEvent.setup();
    let markedId = "";
    server.use(
      http.get(notificationsUrl, () =>
        HttpResponse.json({ items: [row], total: 1, unread: 1 }),
      ),
      http.post(`${notificationsUrl}/:id/read`, ({ params }) => {
        markedId = String(params.id);
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderWithProviders(<NotificationsPage />);

    expect(
      await screen.findByText("Permissions failed to sync"),
    ).toBeInTheDocument();
    expect(screen.getByText("New")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Mark read" }));

    await waitFor(() => expect(markedId).toBe("n1"));
  });

  it("shows an empty state when there are none", async () => {
    server.use(
      http.get(notificationsUrl, () =>
        HttpResponse.json({ items: [], total: 0, unread: 0 }),
      ),
    );

    renderWithProviders(<NotificationsPage />);

    expect(await screen.findByText("No notifications")).toBeInTheDocument();
  });
});
