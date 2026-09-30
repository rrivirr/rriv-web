import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signinRedirectCallback: vi.fn(),
}));

vi.mock("@/auth/userManager", () => ({ userManager: mocks }));

import { CallbackPage } from "@/auth/CallbackPage";

const renderCallback = () =>
  render(
    <MemoryRouter initialEntries={["/callback"]}>
      <Routes>
        <Route path="/callback" element={<CallbackPage />} />
        <Route path="/contexts" element={<p>Contexts</p>} />
        <Route path="/login" element={<p>Login</p>} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CallbackPage", () => {
  it("shows a spinner while completing", () => {
    mocks.signinRedirectCallback.mockReturnValue(new Promise(() => {}));
    renderCallback();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("navigates to /contexts on success", async () => {
    mocks.signinRedirectCallback.mockResolvedValue(undefined);
    renderCallback();
    await waitFor(() =>
      expect(screen.getByText("Contexts")).toBeInTheDocument(),
    );
  });

  it("renders the error card when the exchange fails", async () => {
    mocks.signinRedirectCallback.mockRejectedValue(new Error("bad code"));
    renderCallback();

    expect(await screen.findByText("Sign-in failed")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("bad code");
    expect(screen.getByRole("link", { name: "Back to sign in" })).toBeInTheDocument();
  });
});
