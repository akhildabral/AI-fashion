# ZAUQ — Frontend

A minimal SPA for the ZAUQ personal stylist: sign in, describe an occasion,
and get a generated look (image, outfit pieces, and rationale).

Built with **Vite + React + TypeScript**, **Tailwind CSS**, and **react-router-dom**.

## Getting started

```bash
pnpm install
pnpm dev
```

The dev server runs at http://localhost:5173 and proxies `/api` to the backend at
`http://localhost:3000` (configured in `vite.config.ts`). Start the backend
separately so API calls resolve.

## Scripts

| Command        | Description                                            |
| -------------- | ------------------------------------------------------ |
| `pnpm dev`     | Start the Vite dev server with the `/api` proxy.       |
| `pnpm build`   | Type-check (`tsc -b`) and produce a production build.  |
| `pnpm preview` | Preview the production build locally.                  |

## Configuration

Copy `.env.example` to `.env` to override defaults:

```bash
cp .env.example .env
```

- `VITE_API_URL` — API base URL. Defaults to `/api` (proxied in dev). Set an
  absolute URL if the backend is hosted elsewhere.

## API contract

All requests are under the `/api` base path.

- `POST /api/auth/register` `{ email, password }` → `201 { token, user }`
- `POST /api/auth/login` `{ email, password }` → `200 { token, user }`
- `GET /api/auth/me` (Bearer) → `200 { user }`
- `POST /api/generate` (Bearer) `{ occasion, gender }` → `200 { look }`

The JWT is stored in `localStorage` and attached as `Authorization: Bearer <token>`.
On app load the token is validated via `GET /api/auth/me`; a 401 clears it.

## Project structure

```
src/
  components/    Header, ProtectedRoute, AuthForm, LookCard, Spinner
  context/       Auth context, provider, and useAuth hook
  lib/           API client (api.ts) and shared types (types.ts)
  pages/         Login, Register, Stylist
  App.tsx        Routes
  main.tsx       Entry point
```
