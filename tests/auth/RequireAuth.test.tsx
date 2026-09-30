import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";
import { AuthContext, type AuthContextValue } from "@/auth/AuthProvider";
import { RequireAuth } from "@/auth/RequireAuth";
import { makeAuth } from "../helpers/render";

const renderAt = (auth: Partial<AuthContextValue>, route = "/dashboard") =>
  render(
    <AuthContext.Provider value={makeAuth(auth)}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/login" element={<p>Login screen</p>} />
          <Route element={<RequireAuth />}>
            <Route path="/dashboard" element={<p>Dashboard</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );

describe("RequireAuth", () => {
  it("shows a spinner while the session is loading", () => {
    renderAt({ status: "loading" });
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("redirects unauthenticated users to /login", () => {
    renderAt({ status: "unauthenticated" });
    expect(screen.getByText("Login screen")).toBeInTheDocument();
  });

  it("renders the protected route when authenticated", () => {
    renderAt({ status: "authenticated" });
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });
});
