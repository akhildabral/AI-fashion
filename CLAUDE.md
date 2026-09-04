# ZAUQ

Invite-only AI stylist. Web app in `frontend/` (Vite + React + Tailwind), mobile app in `mobile/` (Expo Router), shared code in `packages/shared`, API in `backend/`.

## Design system is law

`brand/zauq-design-system/` (also loaded as the `zauq-design` skill) is the single source of truth for every visual decision on web and mobile. It is exported from Claude Design; treat it as read-only in this repo and change it in Claude Design, then re-sync.

Before any UI work, read `brand/zauq-design-system/readme.md` and the relevant `tokens/*.css` and `guidelines/*.html`. The web token layer (`frontend/src/index.css`, `frontend/tailwind.config.js`) and the mobile token layer (`mobile/src/design/*`) must match the values in `tokens/`. When they disagree, the design system wins and the app is fixed.

Non-negotiables from the system: one accent (brass), 3px radius everywhere except the arch, no resting shadows, no icon library or emoji, control heights 44/36/32, Bodoni Moda at weight 500 for display, Archivo for UI, tracked uppercase labels above Bodoni lines, dark theme is the native register, the niche stays light in both themes.

## Working rules

- Never commit `__pycache__`; `brand/` and the design system are committed.
- Production deploys from `main` via CI to the VPS; deploys never touch the database.
- Test data only in the dev database.
