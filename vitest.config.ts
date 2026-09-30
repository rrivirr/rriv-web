import { mergeConfig } from "vite";
import { defineConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      setupFiles: ["tests/setup.ts"],
      include: ["tests/**/*.test.{ts,tsx}"],
      env: {
        VITE_RRIV_API_BASE_URL: "http://api.test",
        VITE_DATA_API_URL: "http://data.test",
        VITE_KEYCLOAK_URL: "http://keycloak.test",
        VITE_KEYCLOAK_REALM: "test",
        VITE_KEYCLOAK_CLIENT_ID: "rriv-web",
      },
      coverage: {
        provider: "v8",
        reporter: ["text", "lcov"],
        include: ["src/**/*.{ts,tsx}"],
        exclude: [
          "src/**/*.d.ts",
          "src/vite-env.d.ts",
          "src/main.tsx",
          "src/assets/**",
        ],
        thresholds: {
          lines: 88,
          statements: 88,
          functions: 85,
          branches: 72,
        },
      },
    },
  }),
);
