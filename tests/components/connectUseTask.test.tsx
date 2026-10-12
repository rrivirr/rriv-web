import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useTask } from "@/components/connect/ui";

describe("useTask", () => {
  it("clears busy and reports the result under StrictMode's double mount (enabled in tests/setup.ts)", async () => {
    const { result } = renderHook(() => useTask());

    await act(() =>
      result.current.run("apply", async () => ({ tone: "success", message: "Applied." })),
    );

    expect(result.current.busy).toBeNull();
    expect(result.current.feedback).toEqual({ tone: "success", message: "Applied." });
  });

  it("reports failures under StrictMode", async () => {
    const { result } = renderHook(() => useTask());

    await act(() =>
      result.current.run("apply", async () => {
        throw new Error("board said no");
      }),
    );

    expect(result.current.busy).toBeNull();
    expect(result.current.feedback).toEqual({ tone: "danger", message: "board said no" });
  });

  it("ignores results after a real unmount", async () => {
    const { result, unmount } = renderHook(() => useTask());
    let finish!: () => void;
    const pending = result.current.run(
      "apply",
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    unmount();
    finish();
    await expect(pending).resolves.toBeUndefined();
  });
});
