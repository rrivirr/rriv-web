import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/AppShell";
import { renderWithProviders } from "../helpers/render";
import { server } from "../helpers/server";

const me = (isAdmin: boolean) =>
  http.get("http://api.test/account/me", () =>
    HttpResponse.json({
      id: "1",
      email: "ada@rriv.org",
      firstName: "Ada",
      lastName: "L",
      isAdmin,
    }),
  );

const unread = (n: number) =>
  http.get("http://api.test/notification", () =>
    HttpResponse.json({ items: [], total: n, unread: n }),
  );

const shell = (
  <Routes>
    <Route element={<AppShell />}>
      <Route path="/contexts" element={<p>Contexts outlet</p>} />
    </Route>
  </Routes>
);

const signedIn = {
  user: { profile: { name: "Ada Lovelace", email: "ada@rriv.org" } } as never,
};

describe("AppShell", () => {
  it("renders nav links and the outlet", async () => {
    server.use(me(false), unread(0));
    renderWithProviders(shell, { route: "/contexts", auth: signedIn });

    expect(screen.getByText("Contexts outlet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Contexts" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Devices" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Library" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Admin" })).not.toBeInTheDocument();
  });

  it("adds the admin link and unread badge", async () => {
    server.use(me(true), unread(5));
    renderWithProviders(shell, { route: "/contexts", auth: signedIn });

    expect(
      await screen.findByRole("link", { name: "Admin" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("5")).toBeInTheDocument();
  });

  it("opens the account menu, closes on Escape and signs out", async () => {
    server.use(me(false), unread(0));
    const user = userEvent.setup();
    const signout = vi.fn(async () => {});
    renderWithProviders(shell, {
      route: "/contexts",
      auth: { ...signedIn, signout },
    });

    const trigger = screen.getByRole("button", { name: /Ada Lovelace/ });
    await user.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByText("ada@rriv.org")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("menu")).not.toBeInTheDocument(),
    );

    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: "Sign out" }));
    expect(signout).toHaveBeenCalledTimes(1);
  });
});
