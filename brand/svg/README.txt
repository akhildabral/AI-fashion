ZAUQ — SVG assets
=================

GEOMETRY (fully portable, no dependencies)
  zauq-arch-gold / -cream / -ink .svg    the mirror mark, transparent ground, 3:4
  zauq-favicon-dark / -gold .svg         bare arch, 256px square

TYPE-BASED (reference Playfair Display + Noto Nastaliq Urdu)
  zauq-wordmark-*.svg        1200 x 300
  zauq-ceremonial-*.svg      1200 x 600, wordmark + rule
  zauq-icon-*.svg            1024 square, script mark
  zauq-mirror-*.svg          512 square, empty mirror
  zauq-lockup-*.svg          1600 x 400, mark + wordmark

  These embed a Google Fonts @import, so they render correctly in any
  browser. In Illustrator, Figma, or a print workflow the fonts must be
  installed locally -- or better: open the file once, select the text,
  and convert to outlines. Then the file is fully portable and the
  hairlines are safe at any size.

KERNING (baked into the tspans)
  ZA 0.24em   AU 0.20em   UQ 0.16em

STROKE
  The arch stroke is scaled with its viewBox. For sizes under 48px,
  redraw from the geometry instead of scaling: radius = half the width,
  feet radius 2-3px, proportion locked at 3:4.

GROUNDS
  dark #0B0A09   light #F2EDE3   neutral #D6CFC0   gold #D8B26A
