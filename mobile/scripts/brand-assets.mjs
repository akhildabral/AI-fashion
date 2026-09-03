// Derives the phone app's brand images from the official PNGs in /brand.
// The deliverables are painted on their grounds (dark #0B0A09, light
// #F2EDE3); the app draws them on its own bone, so the flat ground is
// knocked out to transparency (edge pixels keep their anti-aliasing by
// un-blending against the ground) and the margins are trimmed. Nothing is
// redrawn: every remaining pixel is the artwork's own.
//
//   node mobile/scripts/brand-assets.mjs        (run from the repo root)
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const sharp = require(resolve('backend/node_modules/sharp'))

const SRC = resolve('brand')
const OUT = resolve('mobile/assets/brand')
mkdirSync(OUT, { recursive: true })

const GROUNDS = { dark: [11, 10, 9], light: [242, 237, 227] }
// The inks each ground carries: the mark's stroke (gold) and its type.
const INKS = { dark: [[216, 178, 106], [242, 237, 227]], light: [[216, 178, 106], [11, 10, 9]] }

const JOBS = [
  ['zauq-icon-ar-dark', 'mark-script-cream', 'dark'],
  ['zauq-icon-ar-light', 'mark-script-ink', 'light'],
  ['zauq-icon-en-dark', 'mark-word-cream', 'dark'],
  ['zauq-icon-en-light', 'mark-word-ink', 'light'],
  ['zauq-mirror-dark', 'mark-mirror-cream', 'dark'],
  ['zauq-wordmark-dark', 'wordmark-cream', 'dark'],
  ['zauq-wordmark-light', 'wordmark-ink', 'light'],
  ['zauq-lockup-dark', 'lockup-cream', 'dark'],
  ['zauq-lockup-light', 'lockup-ink', 'light'],
  ['zauq-ceremonial-dark', 'ceremonial-cream', 'dark'],
  ['zauq-ceremonial-light', 'ceremonial-ink', 'light'],
]

function unblend(p, g, inks) {
  // Pick the ink this pixel is heading toward, then recover its coverage.
  let best = null
  for (const f of inks) {
    let a = 0
    for (let c = 0; c < 3; c++) {
      const span = f[c] - g[c]
      if (Math.abs(span) < 24) continue
      a = Math.max(a, (p[c] - g[c]) / span)
    }
    a = Math.min(1, Math.max(0, a))
    if (!best || a > best.a) best = { a, f }
  }
  if (!best || best.a < 0.02) return [0, 0, 0, 0]
  const { a, f } = best
  const col = [0, 1, 2].map((c) => Math.round(Math.min(255, Math.max(0, (p[c] - g[c] * (1 - a)) / a))))
  return [...(a > 0.98 ? col : f), Math.round(a * 255)]
}

for (const [src, out, ground] of JOBS) {
  const { data, info } = await sharp(`${SRC}/${src}.png`).raw().toBuffer({ resolveWithObject: true })
  const ch = info.channels
  const rgba = Buffer.alloc(info.width * info.height * 4)
  for (let i = 0, o = 0; i < data.length; i += ch, o += 4) {
    const [r, g, b, a] = unblend([data[i], data[i + 1], data[i + 2]], GROUNDS[ground], INKS[ground])
    rgba[o] = r
    rgba[o + 1] = g
    rgba[o + 2] = b
    rgba[o + 3] = a
  }
  const img = await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
    .trim({ threshold: 1 })
    .png()
    .toBuffer()
  const meta = await sharp(img).metadata()
  await sharp(img).toFile(`${OUT}/${out}.png`)
  console.log(`${out}.png ${meta.width}x${meta.height}`)
}
