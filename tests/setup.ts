import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
// jsdom has no canvas; the readings chart (uPlot) draws on one.
import "vitest-canvas-mock";
import { server } from "./helpers/server";

// Match src/main.tsx: StrictMode mounts, unmounts and remounts every
// component in development. (Wrapping in <StrictMode> in a test doesn't
// double-run effects; this option does.)
configure({ reactStrictMode: true });

// jsdom does not implement matchMedia; the theme provider depends on it.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

// The readings chart resizes with its box.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));

afterEach(() => {
  server.resetHandlers();
  cleanup();
});

afterAll(() => server.close());
