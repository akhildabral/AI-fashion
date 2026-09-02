# ZAUQ brand

The identity, as delivered (September 2026). The guide is `ZAUQ Brand Guide.pdf`;
the SVGs are the source (see `svg/README.txt` for the geometry, kerning and grounds).

How the app uses it:
- Header wordmark and the arch mark: live type and geometry in
  `frontend/src/components/Brand.tsx` (Playfair Display, kerned ZA .24em / AU .20em / UQ .16em;
  the mark is the arch with ذوق in Noto Nastaliq Urdu).
- Favicons, app icons, the social image, transparent wordmarks for email, and the mobile
  icons are rendered from the same geometry by `backend/scripts/brand-assets.ts`
  (needs the fonts in `backend/assets/fonts`; on a Mac, Playfair must also be installed
  as a user font for the renderer to see it).
- Share cards: `brandLine()` in `backend/src/services/share.service.ts`.

Grounds: dark #0B0A09 · light #F2EDE3 · neutral #D6CFC0 · gold #D8B26A.
Terracotta #A9563A is secondary, editorial only.
