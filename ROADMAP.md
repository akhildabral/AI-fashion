# ZAUQ — Product Roadmap

> An AI stylist that knows *you*: personalized outfit recommendations, rendered on your own body, built from your real wardrobe, and shoppable.

Status: **rebuild in progress** · Stack: **Node/Express backend + React frontend**

---

## 1. Vision

A personal AI stylist. Tell it about yourself once; from then on it recommends
outfits tailored to your body, taste, and budget — shows them *on you* — helps
you build looks from clothes you already own, and lets you buy what you don't.

Four capabilities, one product:

1. **Personal AI Stylist** — the brain. Personalized looks + reasoning.
2. **Virtual Try-On** — see recommendations on your own photo.
3. **Digital Wardrobe** — catalog your closet; AI mixes & matches.
4. **Shoppable** — recommendations link to real, buyable products.

We build them **incrementally**. Everything hangs off the style profile, so that
comes first.

---

## 2. Where it stands today (the old spike)

- **Frontend:** empty. No UI exists.
- **Backend:** one endpoint (`POST /generate`) → occasion + gender → GPT text
  description → Flux image.
- **Works:** the basic "LLM describes an outfit → image model renders it" loop.
- **Broken / fake, to discard:**
  - Google Trends is never actually called (a function is stringified into the prompt).
  - The generated image URL is `console.log`'d but never returned to the client.
  - `graph.js` is an abandoned LangChain scrap (references `z`/Zod without importing).
- **No** accounts, database, persistence, or tests.

Verdict: ~5% of a product. Keep the OpenAI→Flux idea; rebuild everything else.

---

## 3. The MVP cut (be ruthless)

**MVP = Phase 0 + Phase 1.** A logged-in user creates a style profile and gets
personalized outfit looks with images and reasoning that persist across sessions.

Explicitly **NOT** in the MVP: try-on, wardrobe, shopping, social, trends.
Those are the roadmap — not the first shippable thing.

---

## 4. Phased roadmap

### Phase 0 — Foundation (unglamorous, non-negotiable)
Turn the spike into an app that can hold users and data.

- [x] Initialize git + `.gitignore`.
- [x] Postgres 16 via `docker-compose`, with `.env.example`.
- [x] React frontend scaffold (Vite + React + TypeScript + Tailwind).
- [x] Rework Express backend into TypeScript: routed, zod-validated, centralized error handling, env validated at boot.
- [x] Prisma ORM + first migration (`init`) against the Docker Postgres (`User`, `StyleProfile`, `Look`).
- [x] User accounts (register / login / me) via JWT + bcrypt — verified end to end.
- [x] Fix the image pipeline: outfit generation now **returns** the image URL and persists the look; structured-output outfit JSON.
- [x] Delete `graph.js` and the fake trends code.

**Phase 0 complete.** ✅ Next: Phase 1 (style profile setup + personalized recommendations).

### Phase 1 — Personal AI Stylist (the MVP)
- [x] **Style profile**: body type, sizes, skin tone, height, style vibe, budget band, colors to avoid. CRUD with merge-on-update semantics (`GET`/`PUT /api/profile`).
- [x] **Recommendation engine**: profile + occasion → LLM returns **structured** outfit JSON (top, bottom, outerwear, footwear, accessories, palette) + a personalized "why this works for you" rationale. Uses OpenAI structured outputs.
- [x] **Render**: one Flux image per look, rendered concurrently.
- [x] **Multiple looks per request** (`LOOKS_PER_REQUEST`, default 2) to control image cost.
- [x] **UI**: onboarding gate → profile setup → occasion input → look grid → favorite/delete + a "My Looks" history page.
- [x] Persist profiles and every generated look per user; favorite (`POST /api/looks/:id/favorite`) and delete (`DELETE /api/looks/:id`), owner-scoped.

**Phase 1 code complete.** ✅ Backend endpoints verified end to end (auth, profile merge, favorite, ownership scoping, delete). Live AI generation is blocked only by an **out-of-credits OpenAI account** — the request reaches OpenAI and the error surfaces cleanly; add credits to run it.

### Phase 2 — Virtual Try-On (the differentiator)
- [x] Photo upload with consent gate + local-disk storage (`POST`/`GET`/`DELETE /api/photo`); replacing a photo cleans up the old file.
- [x] Local-disk storage layer (`/api/uploads/*`), also used to persist generated images — **fixes the earlier base64-in-DB bloat**.
- [x] Try-on via **OpenAI `gpt-image-1` image editing** (renders a saved look onto the user's photo). Structured behind one service function so a dedicated VTON API (FASHN / Replicate IDM-VTON) can be swapped in without touching callers.
- [x] `POST /api/looks/:id/tryon` + `GET /api/tryons`; results persisted (`TryOn` model), owner-scoped.
- [x] UI: photo manager (consent), "Try it on" on look cards, a try-on modal with slow-render state, and a `/tryons` gallery.
- [x] Graceful fallbacks: 400 if no photo, clean error surfacing on generation failure.

**Phase 2 complete.** ✅ Verified end to end (upload → try-on render → serve → list → delete). Note: try-on fidelity is AI re-rendering, not pixel-exact garment transfer — swap in a dedicated VTON model for higher fidelity when desired.

### Phase 3 — Digital Wardrobe (retention engine)
- [x] Upload closet items (photo per garment) → `POST /api/wardrobe`, stored on disk.
- [x] Auto-tag with a vision model (category, subtype, color, pattern, formality, season, material) via gpt-4o-mini structured output; user can correct tags (`PATCH /api/wardrobe/:id`).
- [x] "Mix & match": `POST /api/wardrobe/outfit` assembles outfits from *owned* items only, referenced by id (hallucinated ids filtered out).
- [x] "What to wear today": `POST /api/wardrobe/today` pulls real weather via **Open-Meteo** (free, no key) and picks weather-appropriate outfits.
- [x] UI: wardrobe grid with editable tag cards, add-item uploader, and mix-&-match / today panels with a weather summary.

**Phase 3 complete.** ✅ Verified end to end (upload → tag → correct → mix & match → weather-based suggestion → delete). Mostly free/cheap to run — vision tagging + text + a free weather API.

**Enhancements (post-Phase 3):**
- [x] **Background cleanup on upload** — wardrobe photos are re-rendered onto a clean studio background (product-catalog look) via gpt-image edit, in parallel with tagging. Toggle with `WARDROBE_CLEAN_BG` (default on); falls back to the original photo if cleanup fails.
- [x] **Try-on for suggested outfits** — `POST /api/wardrobe/tryon` renders the user's photo wearing a set of their own garments using the actual item images (multi-image edit) for higher fidelity. Surfaced as a "Try it on" button on each mix-&-match / today suggestion; results join the `/tryons` gallery.

---

## The four capabilities — status

1. **Personal AI Stylist** — ✅ Phase 1
2. **Virtual Try-On** — ✅ Phase 2
3. **Digital Wardrobe** — ✅ Phase 3
4. **Shoppable** — ⬜ Phase 4 (next)

### Phase 4 — Shoppable (business model)
- [ ] Match recommended items to real products (Google Shopping via SerpAPI, retailer APIs, or affiliate networks like LTK/Amazon PA-API).
- [ ] Product cards with price + buy link.
- [ ] Affiliate tracking → revenue.

---

## 5. Recommended architecture

Keeping Node backend + React frontend, optimized for a small team shipping fast.

| Layer | Recommendation | Why |
|---|---|---|
| Frontend | Vite + React + TypeScript, Tailwind | Fast, typed, good DX |
| Backend | Express (existing) + TypeScript, zod validation | Evolve what's there; type the seams |
| Database | **Postgres 16 in Docker** (`docker-compose`) | Self-hosted, portable, no vendor lock-in |
| DB access | Prisma or Drizzle ORM + migrations | Typed queries, versioned schema |
| Auth | Self-hosted: **JWT + bcrypt** in Express | No third-party auth dependency |
| Image storage | Docker volume now → **MinIO (S3-compatible)** later | Self-hosted object storage, also in Docker |
| LLM reasoning | OpenAI `gpt-4o` / `gpt-4o-mini`, **structured outputs** | Reliable outfit JSON, not free text |
| Text-to-image | Flux (via Nebius, already wired) | Already working |
| Try-on (Phase 2) | Hosted API first (FASHN / Replicate IDM-VTON) | Avoid GPU ops early |
| Secrets | `.env` (validated at boot); never commit | `.env` currently holds live keys — rotate them |

**Immediate hygiene:** the repo's `.env` contains live API keys. Rotate the
OpenAI and Nebius keys and make sure `.env` is gitignored before this goes anywhere.

---

## 6. Data model sketch (Phase 0–1)

```
users            (id, email, created_at)              # via Supabase Auth
style_profiles   (user_id, body_type, height, sizes, skin_tone,
                  style_vibe, budget_band, avoid_colors, ...)
looks            (id, user_id, occasion, outfit_json, rationale,
                  image_url, created_at)
saved_looks      (user_id, look_id, saved_at)
# Phase 3+
wardrobe_items   (id, user_id, image_url, type, color, tags, ...)
```

---

## 7. Open decisions / risks

- **Try-on model choice** — quality vs. cost vs. latency. Needs a bake-off in Phase 2.
- **Image cost** — every recommendation generates images; cache aggressively, consider limits/tiers.
- **Photo privacy** — user body photos are sensitive PII. Consent, storage, and deletion policy required before Phase 2.
- **Structured recommendations** — nail the outfit JSON schema early; everything downstream (render, try-on, shopping match) depends on it.

---

## 8. Suggested next step

Start **Phase 0**: scaffold the React frontend + TypeScript backend, stand up
Supabase (auth + DB + storage), and rebuild `/generate` into a real, persisted,
image-returning recommendation endpoint.
