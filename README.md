# AI Fashion

A personal AI stylist: personalized outfit recommendations, rendered as images,
built on a persistent style profile. See [ROADMAP.md](ROADMAP.md) for the plan.

**Stack:** React (Vite + TS) · Express (TS) · Postgres (Docker) · Prisma · JWT auth · OpenAI (text + images)

## Project layout

```
backend/    Express + TypeScript API (auth, stylist recommendations)
frontend/   Vite + React + TypeScript SPA
docker-compose.yml   Postgres 16
```

## Quick start

### 1. Start Postgres

```bash
docker compose up -d
```

### 2. Backend

```bash
cd backend
cp ../.env.example .env      # then fill in OPENAI_API_KEY, NEBIUS_API_KEY, JWT_SECRET
pnpm install
pnpm prisma migrate dev      # apply migrations
pnpm dev                     # http://localhost:3000
```

Required env: `DATABASE_URL`, `JWT_SECRET`, `OPENAI_API_KEY`
(validated at boot — the server refuses to start if any are missing).
Optional: `IMAGE_MODEL` (default `gpt-image-1`), `IMAGE_QUALITY` (default `medium`),
`LOOKS_PER_REQUEST` (default `2`).

### 3. Frontend

```bash
cd frontend
pnpm install
pnpm dev                     # http://localhost:5173 (proxies /api → :3000)
```

## API (Phase 0)

| Method | Route | Auth | Purpose |
|---|---|---|---|
| GET | `/api/health` | – | Health check |
| POST | `/api/auth/register` | – | Create account → `{ token, user }` |
| POST | `/api/auth/login` | – | Log in → `{ token, user }` |
| GET | `/api/auth/me` | Bearer | Current user |
| POST | `/api/generate` | Bearer | Generate + persist outfit looks |
| GET | `/api/looks` | Bearer | List the user's saved looks |
| GET/PUT | `/api/profile` | Bearer | Read / update the style profile |
| POST | `/api/looks/:id/favorite` | Bearer | Favorite / unfavorite a look |
| DELETE | `/api/looks/:id` | Bearer | Delete a look |
| GET/POST/DELETE | `/api/photo` | Bearer | Manage the try-on body photo |
| POST | `/api/looks/:id/tryon` | Bearer | Render a look onto the user's photo |
| GET | `/api/tryons` | Bearer | List try-on results |

## Notes

- The Postgres container maps host port **5433** (to avoid clashing with a local
  Postgres on 5432).
- `.env` files are gitignored. Never commit real keys.
