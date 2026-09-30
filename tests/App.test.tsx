import { render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "@/App";
import { AuthContext, type AuthContextValue } from "@/auth/AuthProvider";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { createTestQueryClient, makeAuth } from "./helpers/render";
import { server } from "./helpers/server";

function renderApp(path: string, auth?: Partial<AuthContextValue>) {
  window.history.pushState({}, "", path);
  return render(
    <ThemeProvider>
      <AuthContext.Provider value={makeAuth(auth)}>
        <QueryClientProvider client={createTestQueryClient()}>
          <App />
        </QueryClientProvider>
      </AuthContext.Provider>
    </ThemeProvider>,
  );
}

afterEach(() => {
  window.history.pushState({}, "", "/");
});

describe("App routing", () => {
  it("serves the public landing page at /", () => {
    renderApp("/", { status: "unauthenticated" });
    expect(
      screen.getByRole("heading", { name: /river is at/i }),
    ).toBeInTheDocument();
  });

  it("serves the login screen at /login", () => {
    renderApp("/login", { status: "unauthenticated" });
    expect(screen.getByText("Continue to your RRIV dashboard")).toBeInTheDocument();
  });

  it("redirects unknown paths to the landing page", () => {
    renderApp("/does-not-exist", { status: "unauthenticated" });
    expect(
      screen.getByRole("heading", { name: /river is at/i }),
    ).toBeInTheDocument();
  });

  it("renders the authenticated shell for /contexts", async () => {
    server.use(
      http.get("http://api.test/account/me", () =>
        HttpResponse.json({
          id: "1",
          email: "ada@rriv.org",
          firstName: "Ada",
          lastName: "L",
          isAdmin: false,
        }),
      ),
      http.get("http://api.test/notification", () =>
        HttpResponse.json({ items: [], total: 0, unread: 0 }),
      ),
      http.get("http://api.test/context", () => HttpResponse.json([])),
    );

    renderApp("/contexts", { status: "authenticated" });

    expect(screen.getByRole("link", { name: "Devices" })).toBeInTheDocument();
    expect(await screen.findByText("No contexts found")).toBeInTheDocument();
  });
});
