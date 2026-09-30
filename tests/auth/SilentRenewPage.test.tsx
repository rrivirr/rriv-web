import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signinSilentCallback: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/auth/userManager", () => ({ userManager: mocks }));

import { SilentRenewPage } from "@/auth/SilentRenewPage";

describe("SilentRenewPage", () => {
  it("hands the response back and renders nothing", () => {
    const { container } = render(<SilentRenewPage />);
    expect(mocks.signinSilentCallback).toHaveBeenCalledTimes(1);
    expect(container).toBeEmptyDOMElement();
  });

  it("swallows renew errors", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.signinSilentCallback.mockRejectedValueOnce(new Error("nope"));

    render(<SilentRenewPage />);

    await vi.waitFor(() => expect(spy).toHaveBeenCalled());
    spy.mockRestore();
  });
});
