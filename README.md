# AI Fashion

A personal AI stylist: personalized outfit recommendations, rendered as images,
built on a persistent style profile. See [ROADMAP.md](ROADMAP.md) for the plan.

**Stack:** React (Vite + TS) · Express (TS) · Postgres (Docker) · Prisma · JWT auth · provider-agnostic AI (OpenAI / OpenRouter / Anthropic / Bedrock via the Vercel AI SDK)

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
cp ../.env.example .env      # then fill in AI_PROVIDER, AI_API_KEY, JWT_SECRET
pnpm install
pnpm prisma migrate dev      # apply migrations
pnpm dev                     # http://localhost:3000
```

Required env: `DATABASE_URL`, `JWT_SECRET`, and an AI provider — `AI_PROVIDER`
(`openai` | `openrouter` | `anthropic` | `bedrock` | `custom`) plus `AI_API_KEY`
(bedrock uses AWS credentials + `AWS_REGION` instead). All validated at boot.
`TEXT_MODEL` picks the chat/vision model in the provider's naming; image
generation (look rendering, try-on) is separately pluggable via `IMAGE_PROVIDER`:
the OpenAI `/images` API, any image-capable chat model (e.g. Gemini image via
OpenRouter), or `none` to disable cleanly. Anthropic/Bedrock host no image
generation — pair them with `IMAGE_PROVIDER=chat` + `IMAGE_API_KEY` if you want
images. See `.env.example` for the full matrix.
Other options: `IMAGE_QUALITY` (default `medium`), `LOOKS_PER_REQUEST` (default
`2`), `MATTING_ENABLED` (default `true` — clean-background cutouts for wardrobe
uploads via a local u2netp matting model, downloaded ~4.5 MB on first use;
pixel-preserving and free, unlike a generative edit), and `STORAGE_DRIVER`
(`local` disk by default, or `s3` for S3/R2/MinIO).

Wardrobe uploads are **asynchronous**: `POST /api/wardrobe` returns immediately with
`status: "processing"`; matting, LAB color-palette extraction, and vision tagging run
in a background job and the item flips to `ready` (clients poll the list). Tags carry
per-attribute confidence — low-confidence values are stored as `null` rather than
guessed. Deterministic reasoning attributes (`layerRole`, `warmthValue`,
`formalityScore`, from lookup tables) plus item `state` (clean / in-wash / packed /
lent-out / retired) feed a rules validator: LLM-proposed outfits are checked for layer
completeness, availability, weather sanity, formality-vs-event coherence, and repeat
avoidance against the wear log, then ranked.

Run backend tests with `pnpm test` (vitest; pure-logic units, no DB needed).

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
| GET/POST | `/api/wardrobe` | Bearer | List / add garments — one photo may hold several items (flat-lay, rack, or worn); each is detected, extracted, and tagged as its own item (async) |
| PATCH/DELETE | `/api/wardrobe/:id` | Bearer | Correct tags, set state / remove an item |
| POST | `/api/wardrobe/outfit` | Bearer | Mix & match from owned items (`eventType`, default `work`) |
| POST | `/api/wardrobe/today` | Bearer | Weather-based outfit for a city (`eventType`) |
| POST | `/api/wardrobe/pack` | Bearer | Travel packing: capsule + day plan + essentials for a trip |
| POST | `/api/wardrobe/:id/feedback` | Bearer | Inline correction (too formal, too warm, wrong color, don’t suggest) |
| POST | `/api/wardrobe/:id/resale-draft` | Bearer | Marketplace listing draft for reselling an item |
| POST | `/api/wardrobe/tryon` | Bearer | Try a set of owned items on the user's photo |
| GET/POST | `/api/outfits` | Bearer | Persist / list outfits (provenance, wear count) |
| GET/POST | `/api/quiz` | Bearer | Taste quiz: pairs / submit answers → style signals |
| GET/POST | `/api/wearlog` | Bearer | One-tap "wore it" log (weather snapshot via `location`) |
| DELETE | `/api/wearlog/:id` | Bearer | Remove a wear-log entry |
| GET | `/api/wearlog/insights` | Bearer | Per-item wear counts + wardrobe orphans |

## Notes

- The Postgres container maps host port **5433** (to avoid clashing with a local
  Postgres on 5432).
- `.env` files are gitignored. Never commit real keys.
