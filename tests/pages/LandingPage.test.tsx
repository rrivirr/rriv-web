import { screen } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";
import { LandingPage } from "@/pages/LandingPage";
import { renderWithProviders } from "../helpers/render";

describe("LandingPage", () => {
  it("shows a spinner while the session loads", () => {
    renderWithProviders(<LandingPage />, { auth: { status: "loading" } });
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("redirects an authenticated user to the dashboard", () => {
    renderWithProviders(
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/contexts" element={<p>Contexts page</p>} />
      </Routes>,
      { auth: { status: "authenticated" }, route: "/" },
    );
    expect(screen.getByText("Contexts page")).toBeInTheDocument();
  });

  it("renders the marketing content for visitors", () => {
    renderWithProviders(<LandingPage />, { auth: { status: "unauthenticated" } });

    expect(screen.getByRole("heading", { name: /river is at/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Built for watersheds" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Create account/ })).toHaveAttribute(
      "href",
      "/signup",
    );
  });
});
