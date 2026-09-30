import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { LoginPage } from "@/pages/LoginPage";
import { renderWithProviders } from "../helpers/render";

describe("LoginPage", () => {
  it("redirects an authenticated user", () => {
    renderWithProviders(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/contexts" element={<p>Contexts page</p>} />
      </Routes>,
      { auth: { status: "authenticated" }, route: "/login" },
    );
    expect(screen.getByText("Contexts page")).toBeInTheDocument();
  });

  it("starts sign-in", async () => {
    const user = userEvent.setup();
    const signin = vi.fn(async () => {});
    renderWithProviders(<LoginPage />, {
      auth: { status: "unauthenticated", signin },
      route: "/login",
    });

    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(signin).toHaveBeenCalledTimes(1);
  });

  it("disables the button while loading", () => {
    renderWithProviders(<LoginPage />, {
      auth: { status: "loading" },
      route: "/login",
    });

    const disabled = screen
      .getAllByRole("button")
      .filter((button) => (button as HTMLButtonElement).disabled);
    expect(disabled).toHaveLength(1);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows a session error", () => {
    renderWithProviders(<LoginPage />, {
      auth: { status: "unauthenticated", error: "Unable to start sign-in." },
      route: "/login",
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Unable to start sign-in.",
    );
  });
});
