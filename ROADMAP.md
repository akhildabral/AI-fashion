# AI Fashion — Product Roadmap

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
- [ ] **Style profile**: body type, sizes, skin tone/undertone, height, style vibe (e.g. minimal / streetwear / classic), budget band, colors to avoid.
- [ ] **Recommendation engine**: profile + occasion → LLM returns **structured** outfit JSON (top, bottom, shoes, accessories, palette) + a "why this works for you" rationale. Use OpenAI structured outputs, not free text.
- [ ] **Render**: generate one image per look via Flux, prompted from the structured outfit.
- [ ] **UI**: profile setup flow → occasion input → 2–3 look cards (image + items + reasoning) → save/favorite looks.
- [ ] Persist profiles and saved looks per user.

### Phase 2 — Virtual Try-On (the differentiator)
- [ ] User uploads a full-body photo (with consent + storage).
- [ ] Integrate a try-on model — evaluate **FASHN AI**, **IDM-VTON** (Replicate), or Google/Kling try-on APIs. Start with a hosted API, not self-hosted.
- [ ] Render Phase 1 looks onto the user's photo.
- [ ] Handle the hard parts: pose/lighting variance, garment segmentation, latency, failure fallback to the standard render.

### Phase 3 — Digital Wardrobe (retention engine)
- [ ] Upload closet items (photo per garment).
- [ ] Auto-tag with a vision model (type, color, pattern, formality, season).
- [ ] "Mix & match": generate outfits from *owned* items only.
- [ ] "What to wear today": factor in weather (real weather API) + calendar/occasion.

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
