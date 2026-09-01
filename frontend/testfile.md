# AI Fashion — Project Analysis

## What It Is

A personal AI stylist platform that generates personalized outfit recommendations, renders them on the user's body via virtual try-on, and helps build looks from a real wardrobe. Three platforms (web, mobile, API) sharing a single backend.

## Tech Stack

| Layer | Stack |
|---|---|
| Backend | Node.js + Express + TypeScript, PostgreSQL (Prisma ORM), OpenAI APIs |
| Web Frontend | React 18 + Vite + Tailwind CSS |
| Mobile App | Expo (React Native) |

## Features

### Authentication & Onboarding
- Email/password registration and login (JWT, 7-day expiry)
- Onboarding gate — forces profile setup before accessing the app

### Style Profile
- Body type, height, sizes, skin tone, style vibe, budget band, colors to avoid
- Merge-update semantics (partial updates allowed)

### AI Outfit Generation (Phase 1)
- User inputs occasion + gender
- GPT-4o-mini generates 2–4 structured outfits (top, bottom, outerwear, footwear, accessories, color palette, rationale)
- Each outfit rendered as an image via OpenAI gpt-image-1
- Favorites, history, and delete functionality

### Virtual Try-On (Phase 2)
- Upload a body photo (with consent gate)
- OpenAI image editing API composites the outfit onto the user's photo (~30–40s render)
- Try-on gallery — all results persisted and browsable
- Works for both AI-generated looks and wardrobe outfit suggestions

### Digital Wardrobe (Phase 3)
- Photo upload of owned garments with async processing pipeline:
  - Background removal (ONNX u2netp matting)
  - Clean studio background re-render
  - Color palette extraction (LAB color space)
  - Vision-based auto-tagging (category, subtype, color, pattern, formality, season, material)
  - Confidence scores with null for low-confidence fields
  - Deterministic attribute derivation (warmth/TOG, layer role, formality score)
- Tag correction by users
- Item state tracking (clean, in-wash, packed, lent-out, retired)

### Mix & Match Outfit Suggestions
- Suggests outfits from owned items only, filtered by event type
- Deterministic validator checks: layer completeness, weather sanity, formality coherence, repeat avoidance
- Violations → hard rejection; warnings → ranking penalty

### Weather-Aware "Today" Outfits
- Pulls real weather from Open-Meteo (free, no API key)
- Filters wardrobe by season + warmth bands for current conditions

### Wear Logging
- Tracks what was worn, when, and for what event type
- Weather snapshot captured at log time
- Insights endpoint — per-item wear counts + orphan item detection

## What It Does Well

- **Hybrid reasoning architecture** — LLM proposes, deterministic validator gates. Creative outfit suggestions are hard-checked against rules for warmth, formality, layer completeness, and repeat avoidance before reaching users.
- **Clean separation of concerns** — controllers, services, routes, middleware properly isolated.
- **TypeScript throughout** all three platforms with Zod validation at API boundaries.
- **Storage abstraction** — swapping from local disk to S3/R2 requires only a config change.
- **Async wardrobe processing** with bounded concurrency — returns immediately, processes in background.
- **Pragmatic choices** — Open-Meteo (free), ONNX for local matting, confidence-aware tagging.
- **Feature completeness** — profile → generation → try-on → wardrobe → mix & match → weather → wear logging → insights. A real product loop.

## What It Does Poorly

- **JWT in localStorage** — vulnerable to XSS. No refresh tokens (abrupt logout after 7 days).
- **No rate limiting** on auth endpoints.
- **In-process job queue** — if the server crashes mid-job, work is lost. No persistence, no retries.
- **Heavy OpenAI dependency** — generation, try-on, tagging, and background cleanup all go through OpenAI. Expensive, slow, and a single point of failure.
- **Try-on quality** — generic image editing API produces mediocre results compared to dedicated VTON models (IDM-VTON, FASHN). This is the most important feature and it under-delivers.
- **No tests where it matters** — only pure-logic utilities tested. Zero integration, API, or frontend tests.
- **Missing production basics** — no structured logging, no meaningful health checks, no CORS config for production.
- **Mobile app adds little** — mirrors web 1:1 without leveraging native capabilities (no push notifications, no offline, no background sync).

## Overall Assessment

The strongest aspect is the hybrid reasoning architecture. The weakest aspects are operational maturity and try-on quality. It's a well-architected prototype that demonstrates solid engineering judgment, but would need significant hardening before handling real users. The core product bet (personalized outfits grounded in a real wardrobe with weather and wear history) is compelling — execution needs to focus on making the try-on feature excellent and adding retention mechanics (daily push notifications, friction-free wear logging) before expanding further.

### Recommended Priorities
1. Replace try-on with a dedicated VTON model
2. Drop the mobile app until the core product proves out
3. Add push/email notifications for daily outfit suggestions
4. Add integration tests for the API layer
5. Implement proper auth (HttpOnly cookies, refresh tokens, rate limiting)
