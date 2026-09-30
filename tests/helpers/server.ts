import { setupServer } from "msw/node";

/** MSW server; per-test handlers are added with `server.use(...)`. */
export const server = setupServer();
