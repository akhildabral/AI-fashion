# ZAUQ brand (V1.0 · September 2026)

The identity as delivered. Guide: `ZAUQ Brand Guide.pdf`. SVG sources under
`svg/` (see `svg/README.txt`): `geometry/` is production-ready pure paths;
`editable/` is live type — outline before shipping.

## Which mark, where (from the guide)

- **App header, web nav** → wordmark (`frontend/src/components/Brand.tsx`, Playfair, kerned ZA .24 / AU .20 / UQ .16)
- **App icon, every store** → **English icon** — arch + ZAUQ + gold rule (`zauq-icon-en-*`). Primary.
- **MENA / packaging / ceremonial** → **Arabic icon** — arch + ذوق + rule (`zauq-icon-ar-*`). Secondary.
- **Favicon, badge** → **solid gold arch** (`zauq-favicon-solid`). Filled, never outlined — a hairline greys out when downsampled.
- **Social avatar** → round solid, gold ground (`zauq-favicon-round`).
- **Email, documents** → wordmark.

Arch geometry: 1px optical hairline (never thickened), 3:4, corner radius =
half the arch width, feet 2–3px. Below 32px the outline becomes the solid fill.
Grounds: dark #0B0A09 · light #F2EDE3 · neutral #D6CFC0 · accent gold #D8B26A ·
terracotta #A9563A editorial only.

## Icons in the app

`backend/scripts/brand-icons.ts` regenerates the favicon + app icons from the
official PNGs in this folder — the English icon for the app icons, the solid
arch for the favicon:

```
cd backend && npx tsx scripts/brand-icons.ts
```

Outputs land in `frontend/public` (favicon-16/32/48, icon-192/512,
icon-maskable-512, apple-touch-icon) and `mobile/assets`.
