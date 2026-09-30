import type { ReactElement, ReactNode } from "react";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { AuthContext, type AuthContextValue } from "@/auth/AuthProvider";
import { ThemeProvider } from "@/theme/ThemeProvider";

/** A signed-in auth context; override fields per test. */
export const makeAuth = (
  overrides: Partial<AuthContextValue> = {},
): AuthContextValue => ({
  user: null,
  status: "authenticated",
  error: null,
  signin: async () => {},
  signout: async () => {},
  getAccessToken: async () => "test-token",
  ...overrides,
});

export const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

/** Wrapper for `renderHook`: auth context + a fresh query client. */
export const hookWrapper = (queryClient = createTestQueryClient()) =>
  ({ children }: { children: ReactNode }) => (
    <AuthContext.Provider value={makeAuth()}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </AuthContext.Provider>
  );

export interface RenderWithProvidersOptions {
  auth?: Partial<AuthContextValue>;
  route?: string;
  queryClient?: QueryClient;
}

export const renderWithProviders = (
  ui: ReactElement,
  options: RenderWithProvidersOptions = {},
) => {
  const auth = makeAuth(options.auth);
  const queryClient = options.queryClient ?? createTestQueryClient();

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <ThemeProvider>
      <AuthContext.Provider value={auth}>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[options.route ?? "/"]}>
            {children}
          </MemoryRouter>
        </QueryClientProvider>
      </AuthContext.Provider>
    </ThemeProvider>
  );

  return { auth, queryClient, ...render(ui, { wrapper: Wrapper }) };
};
