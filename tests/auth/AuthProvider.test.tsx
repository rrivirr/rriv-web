import { useState } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { User } from "oidc-client-ts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const listeners: Record<string, (...args: unknown[]) => void> = {};
  const events = {
    addUserLoaded: (cb: (...args: unknown[]) => void) => {
      listeners.userLoaded = cb;
    },
    removeUserLoaded: vi.fn(),
    addUserUnloaded: (cb: (...args: unknown[]) => void) => {
      listeners.userUnloaded = cb;
    },
    removeUserUnloaded: vi.fn(),
    addAccessTokenExpired: (cb: (...args: unknown[]) => void) => {
      listeners.expired = cb;
    },
    removeAccessTokenExpired: vi.fn(),
    addSilentRenewError: (cb: (...args: unknown[]) => void) => {
      listeners.silentRenewError = cb;
    },
    removeSilentRenewError: vi.fn(),
  };
  return {
    listeners,
    userManager: {
      getUser: vi.fn(),
      signinRedirect: vi.fn(),
      signoutRedirect: vi.fn(),
      signinSilent: vi.fn(),
      events,
    },
  };
});

vi.mock("@/auth/userManager", () => ({ userManager: mocks.userManager }));

import { AuthProvider } from "@/auth/AuthProvider";
import { useAuth } from "@/auth/useAuth";

const user = (expired: boolean): User =>
  ({ expired, access_token: "tok-1", profile: {} }) as unknown as User;

function Consumer() {
  const auth = useAuth();
  const [token, setToken] = useState<string | null | undefined>(undefined);

  return (
    <div>
      <span data-testid="status">{auth.status}</span>
      <span data-testid="error">{auth.error ?? ""}</span>
      <span data-testid="token">{token === undefined ? "unset" : String(token)}</span>
      <button type="button" onClick={() => void auth.signin()}>
        signin
      </button>
      <button type="button" onClick={() => void auth.signout()}>
        signout
      </button>
      <button
        type="button"
        onClick={() => void auth.getAccessToken().then(setToken)}
      >
        token
      </button>
    </div>
  );
}

const renderProvider = () =>
  render(
    <AuthProvider>
      <Consumer />
    </AuthProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AuthProvider", () => {
  it("becomes authenticated for a valid stored user", async () => {
    mocks.userManager.getUser.mockResolvedValue(user(false));
    renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("authenticated"),
    );
  });

  it("becomes unauthenticated without a user", async () => {
    mocks.userManager.getUser.mockResolvedValue(null);
    renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated"),
    );
  });

  it("becomes unauthenticated when getUser rejects", async () => {
    mocks.userManager.getUser.mockRejectedValue(new Error("nope"));
    renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated"),
    );
  });

  it("reacts to loaded/unloaded/expired events", async () => {
    mocks.userManager.getUser.mockResolvedValue(null);
    renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated"),
    );

    act(() => mocks.listeners.userLoaded?.(user(false)));
    expect(screen.getByTestId("status")).toHaveTextContent("authenticated");

    act(() => mocks.listeners.userUnloaded?.());
    expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated");

    act(() => mocks.listeners.userLoaded?.(user(false)));
    act(() => mocks.listeners.expired?.());
    expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated");

    act(() => mocks.listeners.silentRenewError?.(new Error("boom")));
    expect(screen.getByTestId("error")).toHaveTextContent(
      "Session renewal failed: boom",
    );
  });

  it("starts sign-in and surfaces a failure", async () => {
    mocks.userManager.getUser.mockResolvedValue(null);
    const user1 = userEvent.setup();
    mocks.userManager.signinRedirect.mockRejectedValueOnce(new Error("denied"));
    renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated"),
    );

    await user1.click(screen.getByRole("button", { name: "signin" }));
    await waitFor(() =>
      expect(screen.getByTestId("error")).toHaveTextContent("denied"),
    );
  });

  it("signs out and surfaces a failure", async () => {
    mocks.userManager.getUser.mockResolvedValue(null);
    const user1 = userEvent.setup();
    mocks.userManager.signoutRedirect.mockRejectedValue(
      new Error("cannot sign out"),
    );
    renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated"),
    );

    await user1.click(screen.getByRole("button", { name: "signout" }));
    await waitFor(() =>
      expect(screen.getByTestId("error")).toHaveTextContent("cannot sign out"),
    );
  });

  it("returns the token for a live session", async () => {
    mocks.userManager.getUser.mockResolvedValue(user(false));
    const user1 = userEvent.setup();
    renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("authenticated"),
    );

    await user1.click(screen.getByRole("button", { name: "token" }));
    await waitFor(() => expect(screen.getByTestId("token")).toHaveTextContent("tok-1"));
  });

  it("silently renews an expired token", async () => {
    mocks.userManager.getUser.mockResolvedValue(user(true));
    mocks.userManager.signinSilent.mockResolvedValue(user(false));
    const user1 = userEvent.setup();
    renderProvider();

    await user1.click(screen.getByRole("button", { name: "token" }));
    await waitFor(() => expect(screen.getByTestId("token")).toHaveTextContent("tok-1"));
    expect(mocks.userManager.signinSilent).toHaveBeenCalled();
  });

  it("returns null when silent renewal fails", async () => {
    mocks.userManager.getUser.mockResolvedValue(user(true));
    mocks.userManager.signinSilent.mockRejectedValue(new Error("expired"));
    const user1 = userEvent.setup();
    renderProvider();

    await user1.click(screen.getByRole("button", { name: "token" }));
    await waitFor(() => expect(screen.getByTestId("token")).toHaveTextContent("null"));
  });

  it("returns null without a user", async () => {
    mocks.userManager.getUser.mockResolvedValue(null);
    const user1 = userEvent.setup();
    renderProvider();

    await user1.click(screen.getByRole("button", { name: "token" }));
    await waitFor(() => expect(screen.getByTestId("token")).toHaveTextContent("null"));
  });
});
