# RRIV web

React + Vite + TypeScript SPA for [RRIV](https://rriv.org). It authenticates
users against Keycloak (Authorization Code + PKCE) and consumes the existing
RRIV REST API. It ships a branded sign-in screen and an authenticated app
that reads live data from the API.

## Stack

| Concern      | Choice                                   |
| ------------ | ---------------------------------------- |
| UI           | React 19                                 |
| Build        | Vite 6                                   |
| Language     | TypeScript (strict)                      |
| Routing      | React Router v7 (`react-router`)         |
| Server state | TanStack Query v5 (set up, not yet used) |
| Styling      | Tailwind CSS v4 (`@tailwindcss/vite`)    |
| Auth         | oidc-client-ts (Code + PKCE)             |

## Prerequisites

- Node.js 20+ (developed on Node 24) and npm
- A running Keycloak instance
- The running RRIV API

Local defaults used by `.env.example`:

| Service   | URL                     |
| --------- | ----------------------- |
| Web (dev) | `http://localhost:5173` |
| Keycloak  | `http://localhost:8080` |
| RRIV API  | `http://localhost:3007` |

## Setup

```bash
npm install
cp .env.example .env
# edit .env if your URLs differ
npm run dev
```

Open <http://localhost:5173/login>.

### Environment variables

Vite only exposes variables prefixed with `VITE_` to client code, so all
variables keep that prefix. `src/config.ts` validates them at startup and
throws a readable error listing anything that is missing or not a valid URL.

| Variable                  | Required | Example                 |
| ------------------------- | -------- | ----------------------- |
| `VITE_RRIV_API_BASE_URL`  | yes      | `http://localhost:3007` |
| `VITE_KEYCLOAK_URL`       | yes      | `http://localhost:8080` |
| `VITE_KEYCLOAK_REALM`     | yes      | `master`                |
| `VITE_KEYCLOAK_CLIENT_ID` | yes      | `rriv-web`              |
| `VITE_DATA_API_URL`       | no       | `http://localhost:3010` |

The OIDC `authority` is derived, never hardcoded:
`${VITE_KEYCLOAK_URL}/realms/${VITE_KEYCLOAK_REALM}`.

## Keycloak client configuration

Create a **public** client so the SPA can use PKCE without shipping a secret.
These steps assume realm `master` (the local realm that issues tokens the RRIV
API trusts — the API's issuer is `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}`).

### Option A — Keycloak Admin console

1. Sign in to <http://localhost:8080/admin> → select realm **master**.
2. **Clients → Create client**
   - Client type: **OpenID Connect**
   - Client ID: `rriv-web`
   - Next
   - Client authentication: **Off** (public client)
   - Standard flow: **On**; Direct access grants: **Off**
   - Next → Save
3. **Settings** tab:
   - Valid redirect URIs: `http://localhost:5173/*`
   - Web origins: `http://localhost:5173`
4. **Advanced** tab:
   - Proof Key for Code Exchange Code Challenge Method (PKCE method): **S256**
   - Valid post logout redirect URIs: `http://localhost:5173/*`

## Library

The authenticated app browses the three published-config libraries the API
exposes — `sensor`, `datalogger` and `system` (configuration snapshots):

| Kind         | List / detail endpoints                                                      |
| ------------ | ---------------------------------------------------------------------------- |
| `sensor`     | `GET /sensor/libraryConfig`, `GET /sensor/libraryConfig/:id`                 |
| `datalogger` | `GET /datalogger/libraryConfig`, `GET /datalogger/libraryConfig/:id`         |
| `system`     | `GET /configSnapshot/libraryConfig`, `GET /configSnapshot/libraryConfig/:id` |

`/library` lists configs with search, scope (**My configs** / **Published**,
with an optional author filter when viewing published configs) and sort
controls. Each entry opens `/library/:kind/:id`, which shows the creator,
description and every published version with its config payload. A by-id
request only succeeds for the creator or for public configs.

Query parameters mirror the API (`search`, `name`, `isPublic`, `author`,
`limit`, `offset`, `order`, `orderBy`); `search` and `author` require 3–20
characters, and the API caps `offset` at 100.

## Telemetry

The device page shows telemetry from `data-api`
(`GET {VITE_DATA_API_URL}/readings/:eui`), rendered with **Recharts**, which is
loaded lazily so it does not bloat the main bundle.

- Series are **discovered at runtime**: a row is a flat object whose keys vary
  by board
- Rows are re-sorted by `timestamp` ascending (the API orders by insert time),
  and the EUI is tried as stored then lower/upper-case (the API matches exactly).
- The timeline overlays **config-change** and **firmware-change** markers.
  Clicking a point or marker shows the config in effect at that time, resolved
  from `GET /configSnapshot/history`.

## Theming (dark / light)

- `ThemeProvider` (`src/theme/`) stores the choice in `localStorage`
  (`rriv-theme`), defaults to the OS `prefers-color-scheme`, and follows OS
  changes until the user makes an explicit choice.
- Semantic tokens (`--color-bg`, `--color-surface`, `--color-fg`,
  `--color-fg-muted`, `--color-border`, `--color-accent`, …) are defined in
  `src/index.css`; the `.light` block overrides the dark defaults. Components
  use token utilities (`bg-bg`, `text-fg`, `border-border`) instead of raw
  colours.
- `index.html` applies the theme before first paint to avoid a flash.

## Architecture notes

- **`src/config.ts`** is the single place env values are read and validated.
  Components never touch `import.meta.env` or hardcode URLs/realms/client IDs.
- **`src/auth/userManager.ts`** is the only module that configures OIDC.
- **`src/api/client.ts`** resolves the token via the auth context on **every**
  call (`getAccessToken()`); it is never cached at module scope, so a silent
  refresh cannot leave a stale token behind.
- **Routes:** see the table above; the authenticated routes are protected by
  `RequireAuth` and rendered inside `AppShell`.
- **`src/api/contexts.ts` / `devices.ts` / `configs.ts`** wrap the read
  endpoints in TanStack Query hooks; the UI only ever calls `useApiClient()`,
  never `fetch` directly.
- **`src/api/library.ts`** wraps the three library endpoints (list + detail),
  normalises creator relations and exposes the pagination/filter params.
- **Components:** `AppShell`, `PublicShell`, `SiteFooter`, `ThemeToggle`, plus
  reusable `SectionCard`, `Badge`, `Skeleton`, `EmptyState`, `JsonBlock` and
  `QueryError`.

### Auth flow

1. `/login` → **Sign in** → `signinRedirect()`.
2. Keycloak authenticates and redirects to `/callback`.
3. `CallbackPage` calls `signinRedirectCallback()`, stores the session, and
   redirects to `/contexts`.
4. `automaticSilentRenew` refreshes tokens via the hidden `/silent-renew`
   iframe. On `localhost`, the SPA (5173) and Keycloak (8080) are same-site, so
   the iframe is not blocked by third-party-cookie rules.

## Scripts

```bash
npm run dev        # start the dev server on http://localhost:5173
npm run build      # type-check (tsc --noEmit) then build to dist/
npm run preview    # serve the production build
npm run typecheck  # type-check only
```

## Troubleshooting

| Symptom                                    | Cause / fix                                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------------------- |
| `Realm does not exist`                     | `VITE_KEYCLOAK_REALM` is wrong. Locally only `master` exists.                         |
| `Invalid parameter: redirect_uri`          | Add the exact origin (`http://localhost:5173/*`) to the client's Valid redirect URIs. |
| `Missing required environment variable(s)` | `.env` is absent or incomplete. Copy `.env.example`.                                  |
| CORS error / `OPTIONS` 401 in the console  | API CORS not set up                                                                   |
