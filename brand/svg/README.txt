ZAUQ — SVG ASSETS
=================

The set is split in two, because a wordmark is type and an arch is geometry.


geometry/   PRODUCTION-READY. NO DEPENDENCIES.
------------------------------------------------
  zauq-arch-gold / -cream / -ink .svg        the mirror mark, transparent ground
  zauq-mark-arch-<ground>-1024.svg           app icon, bare mark
  zauq-favicon-<ground>-256.svg              favicon, badge

  Pure paths. These render identically everywhere — in an <img>, as a
  favicon, in an app-icon slot, in Illustrator, on a laser cutter.
  Stroke is proportional to arch width at a fixed 1:104 ratio, so every
  arch in the system carries the same optical hairline at any size.
  Grounds: dark #0B0A09, light #F2EDE3, neutral #D6CFC0, gold #D8B26A.


editable/   LIVE TYPE. OUTLINE BEFORE USE.
------------------------------------------------
  zauq-wordmark-<ground>.svg                 1200 x 300
  zauq-wordmark-transparent-<ink>.svg        1200 x 300, no ground
  zauq-ceremonial-<ground>.svg               1200 x 600, wordmark + rule
  zauq-icon-script-<ground>-1024.svg         script mark, app icon
  zauq-mirror-<ground>-512.svg               empty mirror
  zauq-lockup-<ground>.svg                   1600 x 400, mark + wordmark

  These contain real <text>, referencing Playfair Display and Noto
  Nastaliq Urdu by name. IMPORTANT: an SVG used as an image cannot load
  external fonts, so these files fall back to a system serif in an <img>
  tag, a favicon slot, or any app icon — and the Nastaliq ذوق in
  particular becomes a different letterform. Do not ship them as-is.

  Workflow: install both fonts, open the file in Illustrator/Figma,
  select the text, convert to outlines, save. The result is portable and
  belongs in geometry/. Until then, use the PNGs in /assets for anything
  that ships.

  Kerning is already baked into the tspans:  ZA 0.24em  AU 0.20em  UQ 0.16em


STILL OUTSTANDING
------------------------------------------------
The wordmark should be redrawn as bespoke vectors rather than outlined
Playfair, and the ذوق commissioned as true nastaliq calligraphy. Both
then live in geometry/ as final artwork.
